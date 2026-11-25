import { describe, expect, it } from "vitest";
import { conflitosTroca, trechosDaFibra, trocarFibraNaRota } from "../trocaFibra";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const CB = "24 FO ASO · HUB → CTO [CB-000002]";
const el = (nome: string, codigo: string, fibra?: number, extra: Partial<ElementoRota> = {}): ElementoRota => ({
  nome, tipo: "ceo", codigo, ...(fibra ? { cabo_entrada: CB, fibra_entrada: fibra } : {}), ...extra,
});
const rota = (id: string, fibra: number, extra: Partial<RotaOptica> = {}): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [
    { nome: "OLT", tipo: "olt" },
    el("HUB", "1", undefined, { cabo_saida: CB, fibra_saida: fibra }),
    el("CEO A", "2", fibra, { cabo_saida: CB, fibra_saida: fibra }),
    el("CEO B", "3", fibra),
  ],
  ...extra,
});
const tudo = new Set(["PT:1>PT:2", "PT:2>PT:3"]);

describe("troca de fibra", () => {
  it("lista os trechos do cabo e as rotas de cada um", () => {
    const t = trechosDaFibra([rota("a", 6), rota("b", 6), rota("c", 7)], "CB-000002", 6);
    expect(t.map((x) => x.chave)).toEqual(["PT:1>PT:2", "PT:2>PT:3"]);
    expect(t[0].rotas).toEqual(["a", "b"]);
  });

  it("cabo inteiro: troca a chegada e a saída da caixa anterior", () => {
    const r = trocarFibraNaRota(rota("a", 6), "CB-000002", 6, 8, tudo)!;
    expect(r.elementos.map((e) => e.fibra_entrada)).toEqual([undefined, undefined, 8, 8]);
    expect(r.elementos[1].fibra_saida).toBe(8);
    expect(r.elementos[2].fibra_saida).toBe(8);
  });

  it("um trecho só: antes e depois a fibra continua", () => {
    const r = trocarFibraNaRota(rota("a", 6), "CB-000002", 6, 8, new Set(["PT:2>PT:3"]))!;
    expect(r.elementos[2].fibra_entrada).toBe(6);
    expect(r.elementos[3].fibra_entrada).toBe(8);
    expect(r.elementos[2].fibra_saida).toBe(8);
    expect(r.elementos[1].fibra_saida).toBe(6);
  });

  it("sub-rota não mexe no tronco herdado", () => {
    const sub = rota("s", 6, { pai: { rota_id: "a", chave: "PT:2" }, tronco: 3 });
    const r = trocarFibraNaRota(sub, "CB-000002", 6, 8, tudo)!;
    expect(r.elementos[2].fibra_entrada).toBe(6);
    expect(r.elementos[3].fibra_entrada).toBe(8);
    expect(trechosDaFibra([sub], "CB-000002", 6)[0].herdadas).toEqual(["s"]);
  });

  it("rota fora da troca ou sem a fibra não muda", () => {
    expect(trocarFibraNaRota(rota("c", 7), "CB-000002", 6, 8, tudo)).toBeNull();
  });

  it("conflito: fibra nova usada por rota que não vai junto", () => {
    const rs = [rota("a", 6), rota("outraPon", 8), rota("sub", 8, { pai: { rota_id: "a", chave: "PT:2" }, tronco: 3 })];
    const c = conflitosTroca(rs, "CB-000002", 8, tudo, new Set(["a"]));
    expect(c.map((x) => x.rota.id)).toEqual(["outraPon"]);
    expect(conflitosTroca(rs, "CB-000002", 8, new Set(), new Set(["a"]))).toHaveLength(0);
  });
});
