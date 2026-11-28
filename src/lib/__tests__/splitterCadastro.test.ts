import { describe, expect, it } from "vitest";
import { splitterDoCadastro, type CaixaRede } from "../caixasRede";

const C4 = "04 FO ASO · CEO → HUB [CB-000009]";
const cx = (x: Partial<CaixaRede>): CaixaRede => ({ id: "1", chave: "PT:1", nome: "HUB", portas: [], ...x });

describe("splitter do cadastro (editor da rota trava o campo)", () => {
  it("HUB com um splitter por porta: pega o da fibra que chega", () => {
    const c = cx({
      splitters: [
        { id: "s2", relacao: "1:8", entrada: { fibra: { cabo: C4, fibra: 4 } }, portas: [] },
        { id: "s3", relacao: "1:16", modelo_id: "m16", entrada: { fibra: { cabo: C4, fibra: 3 } }, portas: [] },
        { id: "s4", relacao: "1:8", entrada: { splitter: { id: "s3", porta: 1 } }, portas: [] },
      ],
    });
    expect(splitterDoCadastro(c, C4, 3)).toEqual({ relacao: "1:16", modelo_id: "m16" });
    expect(splitterDoCadastro(c, C4, 4)?.relacao).toBe("1:8");
    expect(splitterDoCadastro(c, C4, 2)).toBeNull();
  });
  it("um splitter só: vale para a caixa", () => {
    expect(splitterDoCadastro(cx({ splitters: [{ id: "s1", relacao: "1:8", entrada: {}, portas: [] }] }), C4, 1)?.relacao).toBe("1:8");
  });
  it("cadastro antigo (splitter único) e caixa sem cadastro", () => {
    expect(splitterDoCadastro(cx({ splitter: "1:16" }))?.relacao).toBe("1:16");
    expect(splitterDoCadastro(undefined, C4, 1)).toBeNull();
    expect(splitterDoCadastro(cx({}), C4, 1)).toBeNull();
  });
});
