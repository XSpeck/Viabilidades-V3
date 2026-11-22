import { describe, expect, it } from "vitest";
import { aplicarNaRota, rotasComCabo, rotasComCaixa, trocarCaixaNoCabo } from "../compartilhados";
import type { RotaOptica } from "../rotaOptica";

const rota = (id: string, extra: Partial<RotaOptica> = {}): RotaOptica => ({
  id, nome: id, origem: "manual",
  elementos: [
    { nome: "OLT2_DC", tipo: "olt", porta: "PL 06 - Porta 00", lat: 0, lon: 0 },
    { nome: "DIO 72 Portas", tipo: "dio", codigo: "100001", lat: 0, lon: 0, cabo_entrada: "Cordão OLT2_DC → DIO 72 Portas", fibra_entrada: 1 },
    { nome: "HUB 1", tipo: "hub", codigo: "100002", lat: 1, lon: 1, cabo_entrada: "72 FO ASO · DIO 72 Portas → HUB 1 [CB-000001]", fibra_entrada: 14 },
  ],
  trechos: [{ nome: "x", pontos: [{ lat: 0, lon: 0 }, { lat: 0.5, lon: 0.5 }, { lat: 1, lon: 1 }], ate: 2 }],
  ...extra,
});

describe("compartilhados", () => {
  it("acha a caixa e o cabo nas outras rotas", () => {
    const rede = [rota("a"), rota("b")];
    expect(rotasComCaixa("PT:100002", rede).map((r) => r.id)).toEqual(["a", "b"]);
    expect(rotasComCabo("qualquer nome [CB-000001]", rede)).toHaveLength(2);
  });

  it("sub-rota não conta o tronco herdado", () => {
    const sub = rota("s", { pai: { rota_id: "a", chave: "PT:100002" }, tronco: 3 });
    expect(rotasComCaixa("PT:100002", [sub])).toHaveLength(0);
  });

  it("renomear a caixa leva o nome do cabo junto", () => {
    expect(trocarCaixaNoCabo("72 FO ASO · DIO 72 Portas → HUB 1 [CB-000001]", "HUB 1", "HUB 0/6/2")).toBe("72 FO ASO · DIO 72 Portas → HUB 0/6/2 [CB-000001]");
    const r = aplicarNaRota(rota("a"), [{ tipo: "caixa", chave: "PT:100002", nomeVelho: "HUB 1", nome: "HUB 0/6/2" }])!;
    expect(r.elementos[2].nome).toBe("HUB 0/6/2");
    expect(r.elementos[2].cabo_entrada).toContain("→ HUB 0/6/2 [CB-000001]");
  });

  it("mover a caixa move a ponta do trecho", () => {
    const r = aplicarNaRota(rota("a"), [{ tipo: "caixa", chave: "PT:100002", nomeVelho: "HUB 1", lat: 2, lon: 2 }])!;
    expect(r.elementos[2].lat).toBe(2);
    expect(r.trechos[0].pontos.at(-1)).toEqual({ lat: 2, lon: 2 });
    expect(r.trechos[0].pontos[1]).toEqual({ lat: 0.5, lon: 0.5 });
  });

  it("renomear cabo mantém o código", () => {
    const r = aplicarNaRota(rota("a"), [{ tipo: "cabo", codigo: "CB-000001", nome: "72 FO Tronco Centro" }])!;
    expect(r.elementos[2].cabo_entrada).toBe("72 FO Tronco Centro [CB-000001]");
    expect(aplicarNaRota(rota("a"), [{ tipo: "cabo", codigo: "CB-000099", nome: "x" }])).toBeNull();
  });
});
