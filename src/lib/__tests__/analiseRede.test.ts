import { describe, expect, it } from "vitest";
import { analisarRede, faixaOcupacao, indicadores, nivelPotencia } from "../analiseRede";
import type { CaixaRede } from "../caixasRede";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const CB = "12 FO ASO · HUB → CTO [CB-000009]";
const rota = (id: string, porta: string, els: ElementoRota[], extra: Partial<RotaOptica> = {}): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [{ nome: "OLT1", tipo: "olt", porta, lat: 0, lon: 0 }, ...els],
  ...extra,
});
const hub: ElementoRota = { nome: "HUB 1", tipo: "hub", codigo: "1", lat: 0, lon: 0.01, cabo_entrada: "Cordão OLT1 → HUB 1", fibra_entrada: 1, distancia_m: 1000, splitter: "1:8" };
const cto = (fibra: number, pot: number, extra: Partial<ElementoRota> = {}): ElementoRota => ({
  nome: "CTO 1", tipo: "cto", codigo: "2", lat: 0, lon: 0.02, cabo_entrada: CB, fibra_entrada: fibra, distancia_m: 500, splitter: "1:8", potencia_saida: pot, ...extra,
});
const caixaCheia: CaixaRede = {
  id: "PT_2", chave: "PT:2", nome: "CTO 1", splitter: "1:8",
  portas: Array.from({ length: 8 }, (_, i) => ({ numero: i + 1, status: "cliente" as const })),
} as unknown as CaixaRede;

describe("análise da rede", () => {
  it("faixas de potência e de ocupação", () => {
    expect(nivelPotencia(-19)).toBe("otima");
    expect(nivelPotencia(-26)).toBe("limite");
    expect(nivelPotencia(-28)).toBe("abaixo");
    expect(nivelPotencia(undefined)).toBe("sem");
    expect(faixaOcupacao(8, 8)).toBe("cheia");
    expect(faixaOcupacao(7, 8)).toBe("alta");
    expect(faixaOcupacao(2, 8)).toBe("baixa");
  });

  it("CTO cheia e potência abaixo viram alertas críticos", () => {
    const a = analisarRede([rota("a", "PL 06 - Porta 00", [hub, cto(1, -28)])], [caixaCheia]);
    const c = a.caixas.find((x) => x.nome === "CTO 1")!;
    expect(c.ocupacao).toEqual({ total: 8, clientes: 8, ramais: 0, livres: 0 });
    expect(c.potPonta).toBe(-28);
    expect(c.alertas.map((x) => x.gravidade)).toEqual(["critico", "critico"]);
  });

  it("HUB sem splitter é alerta de cadastro; passagem não conta", () => {
    const sem = { ...hub, splitter: undefined };
    expect(analisarRede([rota("a", "PL 06 - Porta 00", [sem])], []).caixas.find((x) => x.nome === "HUB 1")!.alertas[0].gravidade).toBe("cadastro");
    expect(analisarRede([rota("a", "PL 06 - Porta 00", [{ ...sem, passagem: true }])], []).caixas.find((x) => x.nome === "HUB 1")!.alertas).toHaveLength(0);
  });

  it("cabo com 85% das fibras usadas vira atenção", () => {
    const rs = Array.from({ length: 11 }, (_, i) => rota(`r${i}`, `PL 06 - Porta ${i}`, [hub, cto(i + 1, -20)]));
    const cabo = analisarRede(rs, []).cabos.find((c) => c.nome === CB)!;
    expect(cabo.fibras).toHaveLength(11);
    expect(cabo.capacidade).toBe(12);
    expect(cabo.alertas[0].gravidade).toBe("atencao");
  });

  it("sem coordenada e PONs", () => {
    const a = analisarRede([rota("a", "PL 06 - Porta 00", [hub, cto(1, -20, { lat: undefined, lon: undefined })]), rota("b", "PL 02 - Porta 15", [hub])], []);
    expect(a.semCoordenada.map((x) => x.nome)).toEqual(["CTO 1"]);
    expect(a.pons).toHaveLength(2);
    expect(a.caixas.find((x) => x.nome === "HUB 1")!.pons).toHaveLength(2);
  });

  it("indicadores: km sem repetir o trecho e sem o cordão; portas e níveis", () => {
    const a = analisarRede([rota("a", "PL 06 - Porta 00", [hub, cto(1, -22)]), rota("b", "PL 06 - Porta 00", [hub, cto(1, -22)])], [caixaCheia]);
    const ind = indicadores(a.caixas, a.cabos);
    expect(ind.km).toBeCloseTo(0.5, 3);
    expect(ind.portas.total).toBe(8);
    expect(ind.niveis.boa).toBe(1);
    expect(ind.rotas).toBe(2);
  });

  it("CTO só de passagem não entra na conta de potência", () => {
    const a = analisarRede([rota("a", "PL 06 - Porta 00", [hub, cto(1, -22, { passagem: true, splitter: undefined, potencia_saida: undefined })])], []);
    expect(a.caixas.find((x) => x.nome === "CTO 1")!.atende).toBe(false);
    expect(indicadores(a.caixas, a.cabos).niveis.sem).toBe(0);
  });
});
