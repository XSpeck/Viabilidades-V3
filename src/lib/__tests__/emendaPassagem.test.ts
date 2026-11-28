import { describe, expect, it } from "vitest";
import { trocarFibrasNoCadastro } from "../trocaFibra";
import { ligar } from "../unifilar";

const CB = "06 FO ASO · CTO 1 → CTO 2 [CB-000025]";
const vazio = { splitters: [], regras_emenda: [], emendas: [] };

describe("fusão da fibra com ela mesma vira passagem", () => {
  it("na troca de fibra, a emenda que fica F4 → F4 no mesmo cabo sai do cadastro", () => {
    const c = { ...vazio, emendas: [{ de: { cabo: CB, fibra: 2 }, para: { cabo: CB, fibra: 4 } }] };
    const n = trocarFibrasNoCadastro(c, CB, "chega", new Map([[2, 4]]));
    expect(n.emendas).toEqual([]);
  });
  it("ligar a mesma fibra do mesmo cabo nos dois lados não grava fusão", () => {
    const r = ligar(vazio, { k: "fibra", lado: "chega", cabo: CB, fibra: 4 }, { k: "fibra", lado: "sai", cabo: CB, fibra: 4 });
    expect(typeof r === "string" ? r : r.emendas).toEqual([]);
  });
});
