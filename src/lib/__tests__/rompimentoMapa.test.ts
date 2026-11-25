import { describe, expect, it } from "vitest";
import { afetadasPeloCorte, maisPerto, trechoNoClique, trechosDaRede } from "../rompimento";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const CB = "24 FO ASO · HUB → CEO [CB-000002]";
const el = (nome: string, tipo: ElementoRota["tipo"], codigo: string, lon: number, extra: Partial<ElementoRota> = {}): ElementoRota => ({
  nome, tipo, codigo, lat: -28.68, lon, ...extra,
});
const rota = (id: string, fibra: number, cauda: ElementoRota[]): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [
    el("OLT", "olt", "", -49.380, { porta: `PL 06 - Porta 0${fibra}` }),
    el("HUB", "hub", "1", -49.375, { cabo_entrada: "Cordão", fibra_entrada: 1, passagem: true }),
    el("CEO", "ceo", "2", -49.370, { cabo_entrada: CB, fibra_entrada: fibra }),
    ...cauda,
  ],
});

describe("rompimento clicado no mapa", () => {
  const a = rota("a", 1, [el("CTO A", "cto", "10", -49.365, { cabo_entrada: "x", fibra_entrada: 1, splitter: "1:8" })]);
  const b = rota("b", 2, [
    el("CTO P", "cto", "11", -49.366, { cabo_entrada: "y", fibra_entrada: 2, passagem: true }),
    el("CDOI B", "cdoi", "12", -49.364, { cabo_entrada: "y", fibra_entrada: 2, splitter: "1:8" }),
  ]);
  const rede = trechosDaRede([a, b]);

  it("junta as rotas no mesmo trecho de cabo", () => {
    const t = rede.find((x) => x.cabo === CB)!;
    expect(t.usos.map((u) => u.rota.id)).toEqual(["a", "b"]);
  });

  it("acha o cabo perto do clique e projeta o ponto nele", () => {
    const r = trechoNoClique(rede, { lat: -28.6802, lon: -49.3725 })!;
    expect(r.trecho.cabo).toBe(CB);
    expect(r.metros).toBeLessThan(40);
    expect(r.ponto.lat).toBeCloseTo(-28.68, 5);
    expect(trechoNoClique(rede, { lat: -28.69, lon: -49.3725 })).toBeNull();
    expect(maisPerto([{ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 }], { lat: 0.0001, lon: 0.0005 }).ponto.lon).toBeCloseTo(0.0005, 6);
  });

  it("lista as CTOs e CDOIs que atendem depois do corte, de todas as rotas", () => {
    const t = rede.find((x) => x.cabo === CB)!;
    const r = afetadasPeloCorte(t);
    expect(r.caixas.map((c) => c.elemento.nome).sort()).toEqual(["CDOI B", "CTO A"]);
    expect(r.rotas).toHaveLength(2);
  });
});
