import { describe, expect, it } from "vitest";
import { juntarArvores, montarArvoresPon } from "../arvorePon";
import type { RotaOptica } from "../rotaOptica";

const rota = (id: string, olt: string, porta: string, ctos: string[]): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [
    { nome: olt, tipo: "olt", porta },
    { nome: "DIO 01", tipo: "dio", codigo: "1" },
    ...ctos.map((c, i) => ({ nome: c, tipo: "cto" as const, codigo: `${10 + i}${id}` })),
  ],
});

describe("árvore de várias portas", () => {
  const arvores = montarArvoresPon([rota("a", "OLT2", "PL 06 - Porta 00", ["CTO A"]), rota("b", "OLT2", "PL 06 - Porta 02", ["CTO B", "CTO C"])]);

  it("uma porta só continua igual", () => {
    expect(juntarArvores([arvores[0]])).toBe(arvores[0]);
  });

  it("a OLT em cima e um ramo por porta, com ids únicos", () => {
    const j = juntarArvores(arvores);
    expect(j.raiz.elemento.nome).toBe("OLT2");
    expect(j.raiz.filhos.map((f) => f.elemento.nome)).toEqual(["PON 0/6/0", "PON 0/6/2"]);
    expect(j.raiz.filhos.every((f) => f.pon && f.profundidade === 1)).toBe(true);
    expect(new Set(j.nos.map((n) => n.id)).size).toBe(j.nos.length);
    expect(j.raiz.pontas).toBe(2);
    expect(j.rotas).toHaveLength(2);
    const dio = j.raiz.filhos[1].filhos[0];
    expect(dio.profundidade).toBe(2);
    expect(dio.pai).toBe(j.raiz.filhos[1]);
  });

  it("várias OLTs: raiz Seleção com as OLTs embaixo", () => {
    const outra = montarArvoresPon([rota("c", "OLT1", "PL 01 - Porta 01", ["CTO X"])]);
    const j = juntarArvores([...arvores, ...outra]);
    expect(j.raiz.elemento.nome).toBe("Seleção");
    expect(j.raiz.filhos.map((f) => f.elemento.nome).sort()).toEqual(["OLT1", "OLT2"]);
    expect(j.raiz.pontas).toBe(3);
  });
});
