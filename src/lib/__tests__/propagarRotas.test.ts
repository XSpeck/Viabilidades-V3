import { describe, expect, it } from "vitest";
import { propagarNasRotas, type CadastroLigacoes } from "../unifilar";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const A = "24 FO ASO · HUB → CEO 3 [CB-000006]";
const B = "12 FO ASO · CEO 3 → CEO 2 [CB-000007]";
const B2 = "04 FO ASO · CEO 3 → CEO 2 [CB-000009]";
const C = "06 FO ASO · CEO 3 → CTO 9 [CB-000010]";
const el = (nome: string, tipo: ElementoRota["tipo"], codigo: string, extra: Partial<ElementoRota> = {}): ElementoRota => ({ nome, tipo, codigo, ...extra });
// OLT → HUB → CEO 3 → CEO 2 → CEO 1 (o cabo B segue passando pela CEO 2 até a CEO 1)
const rota = (id: string, fA: number, fB: number): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [
    el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }),
    el("HUB", "hub", "1", { cabo_entrada: "x", fibra_entrada: 1, passagem: true }),
    el("CEO 3", "ceo", "12", { cabo_entrada: A, fibra_entrada: fA }),
    el("CEO 2", "ceo", "13", { cabo_entrada: B, fibra_entrada: fB }),
    el("CEO 1", "ceo", "14", { cabo_entrada: B, fibra_entrada: fB }),
  ],
});
const cad = (x: Partial<CadastroLigacoes>): CadastroLigacoes => ({ emendas: [], regras_emenda: [], splitters: [], ...x });

describe("emenda nova muda a rota dali pra frente", () => {
  it("troca de fibra no mesmo cabo: muda a chegada e segue pelas caixas onde o cabo só passa", () => {
    const antes = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }] });
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 5 } }] });
    const { mudancas, bloqueadas } = propagarNasRotas("PT:12", [rota("r", 6, 1)], antes, depois);
    expect(bloqueadas).toHaveLength(0);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0].elementos[3].fibra_entrada).toBe(5);
    expect(mudancas[0].elementos[4].fibra_entrada).toBe(5);
    expect(mudancas[0].seguem).toEqual(["CEO 1"]);
  });
  it("rota que só passava (sem emenda no cadastro) ganha a emenda nova", () => {
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 3 } }] });
    const { mudancas } = propagarNasRotas("PT:12", [rota("r", 6, 1)], cad({}), depois);
    expect(mudancas[0].elementos[3].fibra_entrada).toBe(3);
  });
  it("o que a mudança não mexeu fica igual", () => {
    const igual = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 9 } }] });
    expect(propagarNasRotas("PT:12", [rota("r", 6, 1)], igual, igual).mudancas).toHaveLength(0);
  });
  it("outro cabo para a mesma caixa: muda o cabo e o nome do trecho", () => {
    const r2: RotaOptica = { ...rota("s", 2, 2), elementos: [...rota("s", 2, 2).elementos.slice(0, 3), el("CEO 2", "ceo", "13", { cabo_entrada: B2, fibra_entrada: 2 })] };
    const r = { ...rota("r", 6, 1), trechos: [{ nome: B, pontos: [], ate: 3 }] };
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B2, fibra: 4 } }] });
    const { mudancas } = propagarNasRotas("PT:12", [r, r2], cad({}), depois);
    const m = mudancas.find((x) => x.rota.id === "r")!;
    expect(m.elementos[3]).toMatchObject({ cabo_entrada: B2, fibra_entrada: 4 });
    expect(m.elementos[4].fibra_entrada).toBe(1);
    expect(m.rota.trechos[0].nome).toBe(B2);
  });
  it("cabo que vai para outra caixa: não muda sozinha", () => {
    const outra: RotaOptica = { ...rota("t", 1, 1), elementos: [...rota("t", 1, 1).elementos.slice(0, 3), el("CTO 9", "cto", "20", { cabo_entrada: C, fibra_entrada: 1 })] };
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: C, fibra: 2 } }] });
    const { mudancas, bloqueadas } = propagarNasRotas("PT:12", [rota("r", 6, 1), outra], cad({}), depois);
    expect(mudancas.filter((m) => m.rota.id === "r")).toHaveLength(0);
    expect(bloqueadas.map((b) => b.rota.id)).toContain("r");
  });
  it("perna do splitter levada para outra fibra: a sub-rota que saía por ela acompanha", () => {
    const hub: RotaOptica = {
      id: "h", nome: "h", origem: "manual", trechos: [],
      elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("CEO 3", "hub", "12", { cabo_entrada: A, fibra_entrada: 6 }), el("CEO 2", "cdoi", "13", { cabo_entrada: B, fibra_entrada: 1 })],
    };
    const spl = (f: number) => [{ id: "s1", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 6 } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: f } }] }];
    const { mudancas } = propagarNasRotas("PT:12", [hub], cad({ splitters: spl(1) }), cad({ splitters: spl(7) }));
    expect(mudancas[0].elementos[2].fibra_entrada).toBe(7);
  });
});
