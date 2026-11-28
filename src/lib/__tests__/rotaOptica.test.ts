// Testes dos cálculos da Rota Óptica (potência, sub-rotas, metragem/OTDR, certificação, cabos e árvore).
// Rodar: npm test
import { describe, expect, it } from "vitest";
import { CALCULO_PADRAO, calcularPotencias, entradaPotencia, type ElementoRota, type RotaOptica } from "../rotaOptica";
import { acumuladoDaRota, localizarRompimento, trechosDaRota } from "../rompimento";
import { analisarLeitura, eventosEsperados } from "../certificacao";
import { chaveCabo, codigoDoCabo, comCodigo, proximoCodigoCabo, semCodigo } from "../cabosRede";
import { montarArvoresPon } from "../arvorePon";

const CABO_72 = "72 FO ASO · DIO → HUB [CB-000001]";
const CABO_06 = "06 FO ASO · HUB → Ed. Teste [CB-000004]";

const OLT: ElementoRota = { nome: "OLT", tipo: "olt", porta: "PL 0 - Porta 6", potencia_saida: 6, lat: -28.68, lon: -49.37 };
const DIO: ElementoRota = { nome: "DIO", tipo: "dio", codigo: "100001", cabo_entrada: "Cordão OLT → DIO", fibra_entrada: 1, distancia_m: 3, lat: -28.68, lon: -49.3701 };
const HUB: ElementoRota = { nome: "HUB", tipo: "hub", codigo: "100002", cabo_entrada: CABO_72, fibra_entrada: 14, distancia_m: 1000, splitter: "1:8", lat: -28.685, lon: -49.37 };
const PREDIO: ElementoRota = { nome: "Ed. Teste", tipo: "predio", codigo: "PREDIO-abc", cabo_entrada: CABO_06, distancia_m: 100, lat: -28.686, lon: -49.37 };
const CDOI: ElementoRota = { nome: "AND 3", tipo: "cdoi", codigo: "100005", cabo_entrada: CABO_06, fibra_entrada: 2, distancia_m: 11, splitter: "1:8", lat: -28.686, lon: -49.37 };

const rota = (id: string, elementos: ElementoRota[], extra: Partial<RotaOptica> = {}): RotaOptica => ({
  id, nome: id, origem: "manual", elementos, trechos: [], calculo_potencia: CALCULO_PADRAO, ...extra,
});

// caminhos completos, como o sinal monta (cada um da OLT até onde a luz termina), com a potência calculada
const comPot = (r: RotaOptica): RotaOptica => {
  const ps = calcularPotencias(r.elementos.map((e) => entradaPotencia(e)), 6, CALCULO_PADRAO);
  return { ...r, elementos: r.elementos.map((e, i) => (i === 0 ? e : { ...e, potencia_entrada: ps[i].entrada, potencia_saida: ps[i].saida })) };
};
const tronco = comPot(rota("tronco", [OLT, DIO, HUB]));
const montadas = [
  comPot(rota("tronco", [OLT, DIO, HUB])),
  comPot(rota("predio", [OLT, DIO, { ...HUB, fibra_saida: 2 }, { ...PREDIO, fibra_entrada: 2 }])),
  comPot(rota("cdoi", [OLT, DIO, { ...HUB, fibra_saida: 2 }, { ...PREDIO, fibra_entrada: 2 }, CDOI])),
];
const porId = (id: string) => montadas.find((r) => r.id === id)!;

describe("potência", () => {
  it("desconta fibra, fusão, conector do DIO e splitter", () => {
    const p = calcularPotencias([OLT, DIO, HUB].map((e) => entradaPotencia(e)), 6, CALCULO_PADRAO);
    expect(p[1].entrada).toBeCloseTo(5.4, 2); // conector 0,5 + fusão 0,1
    expect(p[2].entrada).toBeCloseTo(4.95, 2); // 1 km × 0,35 + fusão 0,1
    expect(p[2].saida).toBeCloseTo(-5.65, 2); // 1:8 = 10,5 dB + fusão de saída 0,1 (primário fundido, sem conector)
  });

  it("entrada do prédio não tem perda", () => {
    const r = porId("predio");
    const hub = r.elementos[2], pred = r.elementos[3];
    // só os 100 m de fibra (0,035 dB; a potência é arredondada a 2 casas em cada caixa)
    expect(pred.potencia_entrada! - hub.potencia_saida!).toBeCloseTo(-0.03, 2);
  });

  it("meia porta: HUB com 1:2 antes do primário e saída pela outra perna", () => {
    expect(entradaPotencia({ ...HUB, meia_porta: true }).perda_splitter).toBeCloseTo(3.7 + 10.5, 2);
    expect(entradaPotencia({ ...HUB, meia_porta: true, via_meia_porta: true }).perda_splitter).toBeCloseTo(3.7, 2);
  });
});

describe("metragem e rompimento (OTDR)", () => {
  it("reservas: 15 m na HUB, nada na OLT e no DIO", () => {
    const t = trechosDaRota(tronco);
    expect(t[1]).toMatchObject({ i: 2, metros: 1000, resIni: 0, resFim: 15 });
    expect(acumuladoDaRota(tronco)).toEqual([0, 3, 1003]);
  });

  it("acha o ponto no cabo, na reserva e além do fim", () => {
    expect(localizarRompimento(tronco, 1, "ponta", 500).tipo).toBe("tracado");
    expect(localizarRompimento(tronco, 1, "ponta", 995)).toMatchObject({ tipo: "reserva", reservaDe: 2 });
    expect(localizarRompimento(tronco, 1, "ponta", 2000).tipo).toBe("alem");
  });
});

describe("certificação", () => {
  const esperados = eventosEsperados(tronco, 1, "ponta", 1310);
  const loc = (d: number) => localizarRompimento(tronco, 1, "ponta", d);

  it("eventos esperados: lançamento e o splitter da HUB", () => {
    expect(esperados.map((e) => e.tipo)).toEqual(["lancamento", "splitter"]);
    expect(esperados[1]).toMatchObject({ distancia: 1000, esperado: 10.6, limite: 11.1 });
  });

  it("classifica a leitura: caixa ok, perda fora de caixa e fim antes do esperado", () => {
    const a = analisarLeitura(tronco, esperados, [
      { distancia: 1000, perda: 10.7 },
      { distancia: 500, perda: 0.3 },
      { distancia: 600, fim: true },
    ], loc, (s) => s);
    expect(a.map((x) => x.situacao)).toEqual(["ok", "fora", "fora"]);
    expect(a[0].onde).toBe("Na caixa HUB");
    expect(a[1].onde).toContain("No cabo entre DIO e HUB");
    expect(a[2].detalhe).toContain("termina");
  });

  it("entrada do prédio não vira evento", () => {
    expect(eventosEsperados(porId("cdoi"), 1, "ponta", 1310).some((e) => e.elemento.tipo === "predio")).toBe(false);
  });
});

describe("código do cabo", () => {
  it("o código é a identidade do cabo", () => {
    expect(chaveCabo(CABO_72)).toBe("CB-000001");
    expect(chaveCabo("72 fo aso · outro nome [CB-000001]")).toBe("CB-000001");
    expect(codigoDoCabo("sem código")).toBeNull();
  });

  it("nome com e sem código, e o próximo código livre", () => {
    expect(comCodigo("Cabo X", "CB-000003")).toBe("Cabo X [CB-000003]");
    expect(semCodigo("Cabo X [CB-000003]")).toBe("Cabo X");
    expect(proximoCodigoCabo(["a [CB-000002]", "CB-000009", "sem"])).toBe("CB-000010");
  });
});

describe("árvore", () => {
  it("pontas só onde a fibra termina (tronco e cabo do prédio não contam)", () => {
    const [arv] = montarArvoresPon(montadas, []);
    expect(arv.raiz.pontas).toBe(1);
  });
});
