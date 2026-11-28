import { describe, expect, it } from "vitest";
import type { CaboRede } from "../cabosRede";
import type { CaixaRede } from "../caixasRede";
import { calcularPotencias, CALCULO_PADRAO, reservaTrecho } from "../rotaOptica";
import { calcularSinal } from "../sinalRede";

// OLT ─cordão─ DIO ═CB1═ CEO ═CB2═ HUB ═CB3═ CTO (o CB3 passa pela CTO A e termina na CTO B)
const el = (codigo: string, nome: string, tipo: CaixaRede["tipo"], extra: Partial<CaixaRede> = {}): CaixaRede =>
  ({ id: codigo, chave: `PT:${codigo}`, codigo, nome, tipo, portas: [], ...extra });
const cabo = (cod: string, caminho: string[], metros: number[], capacidade = 12): CaboRede => ({
  id: cod, chave: cod, nome: `${capacidade} FO · ${cod} [${cod}]`, capacidade, fibras: [],
  caminho: caminho.map((c) => `PT:${c}`), trechos: metros.map((m) => ({ pontos: [], metros: m })),
});
const CORD = "Cordão [CB-000001]", CB1 = "[CB-000002]", CB2 = "[CB-000003]", CB3 = "[CB-000004]";
const spl = (id: string, relacao: string, entrada: CaixaRede["splitters"] extends (infer S)[] | undefined ? S extends { entrada: infer E } ? E : never : never, pernas: Record<number, { cabo: string; fibra: number; lado_cabo?: "ant" | "seg" }> = {}) => ({
  id, relacao, entrada,
  portas: Object.entries(pernas).map(([n, saida]) => ({ numero: +n, status: "ramal" as const, saida })),
});

function rede(extra: { hub?: Partial<CaixaRede>; ctoA?: Partial<CaixaRede>; olt?: Partial<CaixaRede> } = {}) {
  const elementos: CaixaRede[] = [
    el("1", "OLT", "olt", { cordoes: [{ porta: "0/1/1", para: { cabo: CORD, fibra: 1 } }], ...extra.olt }),
    el("2", "DIO", "dio", { adaptadores: [{ n: 5, de: { cabo: CORD, fibra: 1 }, para: { cabo: CB1, fibra: 5 } }] }),
    el("3", "CEO", "ceo", { emendas: [{ de: { cabo: CB1, fibra: 5 }, para: { cabo: CB2, fibra: 2 } }] }),
    el("4", "HUB", "hub", { splitters: [spl("s1", "1:8", { fibra: { cabo: CB2, fibra: 2 } }, { 1: { cabo: CB3, fibra: 3 } })], ...extra.hub }),
    el("5", "CTO A", "cto", { ...extra.ctoA }),
    el("6", "CTO B", "cto", { splitters: [spl("s1", "1:8", { fibra: { cabo: CB3, fibra: 3 } })] }),
  ];
  const cabos = [
    cabo("CB-000001", ["1", "2"], [3], 1),
    cabo("CB-000002", ["2", "3"], [1000]),
    cabo("CB-000003", ["3", "4"], [500]),
    cabo("CB-000004", ["4", "5", "6"], [200, 300]),
  ];
  cabos[0].nome = CORD; cabos[1].nome = `12 FO ${CB1}`; cabos[2].nome = `12 FO ${CB2}`; cabos[3].nome = `12 FO ${CB3}`;
  return { elementos, cabos };
}

describe("sinal da rede livre", () => {
  it("acende o caminho OLT → DIO → CEO → HUB → CTO A (passa) → CTO B", () => {
    const { elementos, cabos } = rede();
    const s = calcularSinal(elementos, cabos);
    expect(s.conflitos).toEqual([]);
    const ate = s.rotas.find((r) => r.elementos.at(-1)!.nome === "CTO B")!;
    expect(ate.elementos.map((e) => e.nome)).toEqual(["OLT", "DIO", "CEO", "HUB", "CTO A", "CTO B"]);
    expect(ate.elementos[4]).toMatchObject({ passagem: true, fibra_entrada: 3 });
    expect(ate.elementos[3]).toMatchObject({ splitter: "1:8", fibra_entrada: 2 });
    expect(s.caixas.get("PT:6")?.size).toBe(1);
  });

  it("potência igual à conta de sempre para o mesmo caminho", () => {
    const { elementos, cabos } = rede();
    const s = calcularSinal(elementos, cabos, { txDe: () => 6 });
    const r = s.rotas.find((x) => x.elementos.at(-1)!.nome === "CTO B")!;
    const tipos = ["olt", "dio", "ceo", "hub", "cto", "cto"] as const;
    const metros = [undefined, 3, 1000, 500, 200, 300];
    const esperado = calcularPotencias(
      tipos.map((tipo, k) => ({
        tipo,
        distancia_m: k ? metros[k]! + reservaTrecho(tipos[k - 1], tipo, CALCULO_PADRAO) : undefined,
        ...(k === 3 || k === 5 ? { splitter: "1:8", perda_splitter: 10.5 } : {}),
      })),
      6,
      CALCULO_PADRAO,
    );
    expect(r.elementos.map((e) => e.potencia_saida)).toEqual(esperado.map((p) => p.saida));
  });

  it("sangria: a CTO A liga a fibra que passa e a luz termina nela", () => {
    const { elementos, cabos } = rede({ ctoA: { splitters: [spl("s1", "1:8", { fibra: { cabo: CB3, fibra: 3, lado_cabo: "ant" } })] } });
    const s = calcularSinal(elementos, cabos);
    expect(s.rotas.some((r) => r.elementos.at(-1)!.nome === "CTO A")).toBe(true);
    expect(s.caixas.has("PT:6")).toBe(false);
  });

  it("splitter de 2º nível soma as duas perdas", () => {
    const hub = { splitters: [
      spl("s1", "1:2", { fibra: { cabo: CB2, fibra: 2 } }),
      spl("s2", "1:8", { splitter: { id: "s1", porta: 1 } }, { 1: { cabo: CB3, fibra: 3 } }),
    ] };
    const s = calcularSinal(...Object.values(rede({ hub })) as [CaixaRede[], CaboRede[]]);
    const r = s.rotas.find((x) => x.elementos.at(-1)!.nome === "CTO B")!;
    expect(r.elementos[3].splitter).toBe("1:2 + 1:8");
  });

  it("desligado: a caixa fica sem sinal, mas continua na rede", () => {
    const { elementos, cabos } = rede({ hub: { splitters: [spl("s1", "1:8", { fibra: { cabo: CB2, fibra: 2 } })] } });
    const s = calcularSinal(elementos, cabos);
    expect(s.caixas.has("PT:6")).toBe(false);
    expect(s.trechos.has("CB-000004|3|0")).toBe(false);
    expect(s.conflitos).toEqual([]);
  });

  it("duas PONs na mesma fibra: conflito", () => {
    const olt2 = el("9", "OLT 2", "olt", { cordoes: [{ porta: "0/1/2", para: { cabo: "[CB-000009]", fibra: 1 } }] });
    const ceo2 = el("8", "CEO 2", "ceo", { emendas: [{ de: { cabo: "[CB-000009]", fibra: 1 }, para: { cabo: CB2, fibra: 2, lado_cabo: "ant" } }] });
    const { elementos, cabos } = rede();
    const c9: CaboRede = { id: "9", chave: "CB-000009", nome: "[CB-000009]", capacidade: 1, fibras: [], caminho: ["PT:9", "PT:8"], trechos: [{ pontos: [], metros: 10 }] };
    // o CB2 passa pela CEO 2 antes de chegar na HUB
    const cb2 = cabos.find((c) => c.chave === "CB-000003")!;
    cb2.caminho = ["PT:3", "PT:8", "PT:4"];
    cb2.trechos = [{ pontos: [], metros: 200 }, { pontos: [], metros: 300 }];
    ceo2.emendas![0].para.lado_cabo = "seg";
    const s = calcularSinal([...elementos, olt2, ceo2], [...cabos, c9]);
    expect(s.conflitos.some((c) => c.tipo === "duas_pons")).toBe(true);
  });

  it("laço: a luz que volta para a fibra por onde passou", () => {
    const { elementos, cabos } = rede();
    // na CTO B, a fibra 3 que chega volta pela fibra 4 do mesmo cabo; na CTO A (meio), a 4 volta para a 3 de antes
    const ctoB = elementos.find((e) => e.nome === "CTO B")!;
    ctoB.splitters = [];
    ctoB.emendas = [{ de: { cabo: CB3, fibra: 3 }, para: { cabo: CB3, fibra: 4 } }];
    const hub = elementos.find((e) => e.nome === "HUB")!;
    hub.emendas = [{ de: { cabo: CB3, fibra: 4 }, para: { cabo: CB2, fibra: 2 } }];
    const s = calcularSinal(elementos, cabos);
    expect(s.conflitos.some((c) => c.tipo === "laco" || c.tipo === "duas_pons" || c.tipo === "contramao")).toBe(true);
  });
});

describe("rompimento", () => {
  it("cortar o trecho CEO → HUB apaga a HUB e tudo depois dela", () => {
    const { elementos, cabos } = rede();
    const s = calcularSinal(elementos, cabos, { cortes: new Set(["CB-000003|0"]) });
    expect(s.caixas.has("PT:3")).toBe(true);
    expect(s.caixas.has("PT:4")).toBe(false);
    expect(s.caixas.has("PT:6")).toBe(false);
  });
});
