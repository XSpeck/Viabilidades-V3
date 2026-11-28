import { describe, expect, it } from "vitest";
import { completarPelasRotas, propagarNasRotas, trocarFibraNoCadastro, trocarFibrasNoCadastro, trocasNasPontas, type CadastroLigacoes } from "../unifilar";
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

describe("a fibra que entra e a outra ponta do cabo", () => {
  // OLT → CEO 9 → (cabo A) → HUB 12 → (cabo B) → CDOI 13
  const hub = (fA: number): RotaOptica => ({
    id: "h", nome: "0/6/2", origem: "manual", trechos: [],
    elementos: [
      el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }),
      el("CEO 9", "ceo", "9", { cabo_entrada: "x", fibra_entrada: 1 }),
      el("HUB", "hub", "12", { cabo_entrada: A, fibra_entrada: fA, splitter: "1:8" }),
      el("CDOI", "cdoi", "13", { cabo_entrada: B, fibra_entrada: 1 }),
    ],
  });
  const spl = (fEnt: number) => [{ id: "s1", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: fEnt } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }] }];

  it("entrada do splitter da F03 para a F01: a rota chega pela F01 e a CEO de trás passa a alimentar a F01", () => {
    const { mudancas, pontas, bloqueadas } = propagarNasRotas("PT:12", [hub(3)], cad({ splitters: spl(3) }), cad({ splitters: spl(1) }));
    expect(bloqueadas).toHaveLength(0);
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toMatchObject({ sentido: "chega", ponta: "CEO 9" });
    expect(mudancas[0].elementos[2].fibra_entrada).toBe(1);
    expect(pontas).toEqual([expect.objectContaining({ chave: "PT:9", lado: "sai", de: 3, para: 1 })]);
  });

  it("a outra ponta do cabo que sai recebe a fibra nova", () => {
    const antes = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }] });
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 5 } }] });
    const { pontas } = propagarNasRotas("PT:12", [rota("r", 6, 1)], antes, depois);
    // o cabo B passa direto pela CEO 2 e termina na CEO 1
    expect(pontas).toEqual([expect.objectContaining({ chave: "PT:14", lado: "chega", de: 1, para: 5 })]);
  });

  it("trocar a fibra no cadastro da outra ponta: fusão e splitter", () => {
    const c = cad({
      emendas: [{ de: { cabo: "Z", fibra: 2 }, para: { cabo: A, fibra: 3 } }],
      splitters: [{ id: "s", relacao: "1:8", entrada: { fibra: { cabo: B, fibra: 1 } }, portas: [] }],
    });
    expect(trocarFibraNoCadastro(c, A, "sai", 3, 1).emendas[0].para.fibra).toBe(1);
    expect(trocarFibraNoCadastro(c, B, "chega", 1, 5).splitters[0].entrada.fibra?.fibra).toBe(5);
  });
});

describe("não monta splitter repetido", () => {
  it("rota na F03, mas a perna dela já sai de um splitter na F01: não cria outro", () => {
    const r: RotaOptica = {
      id: "h", nome: "h", origem: "manual", trechos: [],
      elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("HUB", "hub", "12", { cabo_entrada: A, fibra_entrada: 3, splitter: "1:8" }), el("CDOI", "cdoi", "13", { cabo_entrada: B, fibra_entrada: 1 })],
    };
    const c = cad({ splitters: [{ id: "r33", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 1 } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }] }] });
    expect(completarPelasRotas("PT:12", [r], c).splitters).toBe(0);
  });
});

describe("CTO onde a rota termina", () => {
  const cto: RotaOptica = {
    id: "c", nome: "CTO 3", origem: "manual", trechos: [],
    elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("CEO 9", "ceo", "9", { cabo_entrada: "x", fibra_entrada: 1 }), el("CTO 3", "cto", "47", { cabo_entrada: A, fibra_entrada: 1, splitter: "1:8" })],
  };
  const spl = (f: number) => [{ id: "r11", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: f } }, portas: [] }];
  it("splitter da F01 para a F02: a rota passa a chegar pela F02 e a CEO de trás acompanha", () => {
    const { mudancas, pontas } = propagarNasRotas("PT:47", [cto], cad({ splitters: spl(1) }), cad({ splitters: spl(2) }));
    expect(mudancas[0]).toMatchObject({ sentido: "chega" });
    expect(mudancas[0].elementos[2].fibra_entrada).toBe(2);
    expect(pontas[0]).toMatchObject({ chave: "PT:9", lado: "sai", de: 1, para: 2 });
  });
  it("se a rota não mudou (desmarcada), não monta outro splitter na F01", () => {
    expect(completarPelasRotas("PT:47", [cto], cad({ splitters: spl(2) })).splitters).toBe(0);
  });
});

describe("várias trocas no mesmo cabo (prédio)", () => {
  it("F1↔F3 ao mesmo tempo sem uma passar por cima da outra", () => {
    const c = cad({ splitters: [{ id: "s", relacao: "1:8", entrada: {}, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }, { numero: 2, status: "ramal" as const, saida: { cabo: B, fibra: 3 } }] }] });
    const n = trocarFibrasNoCadastro(c, B, "sai", new Map([[1, 3], [3, 1]]));
    expect(n.splitters[0].portas.map((p) => p.saida?.fibra)).toEqual([3, 1]);
  });
});

describe("cabo do prédio: as pernas seguem as CDOIs", () => {
  it("perna na fibra nominal do prédio sai; entra a da CDOI", () => {
    const P = "06 FO ASO · HUB → Ed. N [CB-000009]";
    const mae: RotaOptica = { id: "m", nome: "Rota Ed. N", origem: "manual", trechos: [], elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("HUB", "hub", "15", { cabo_entrada: A, fibra_entrada: 3, splitter: "1:8" }), el("Ed. N", "predio", "PREDIO-x", { cabo_entrada: P, fibra_entrada: 1 })] };
    const sub: RotaOptica = { id: "s", nome: "AND-T", origem: "manual", trechos: [], pai: { rota_id: "m", chave: "PT:PREDIO-x" }, tronco: 3, elementos: [...mae.elementos, el("AND-T", "cdoi", "16", { cabo_entrada: P, fibra_entrada: 3 })] };
    const c = cad({ splitters: [{ id: "r33", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 3 } }, portas: [{ numero: 1, status: "livre" as const }, { numero: 2, status: "ramal" as const, saida: { cabo: P, fibra: 1 } }] }] });
    const r = completarPelasRotas("PT:15", [mae, sub], c);
    const saidas = r.ed.splitters[0].portas.filter((p) => p.saida).map((p) => p.saida!.fibra);
    expect(saidas).toEqual([3]);
  });
});

describe("editor da rota: a fibra trocada leva as caixas das pontas", () => {
  it("F02 → F01 no cabo da HUB até a CTO: a HUB sai pela F01 e a CTO recebe na F01", () => {
    const C27 = "02 FO · HUB 1 → CTO 4 [CB-000027]";
    const antes = [el("HUB 1", "hub", "46"), el("CTO 4", "cto", "48", { cabo_entrada: C27, fibra_entrada: 2 })];
    const depois = [el("HUB 1", "hub", "46"), el("CTO 4", "cto", "48", { cabo_entrada: C27, fibra_entrada: 1 })];
    const t = trocasNasPontas(antes, depois);
    expect(t.map((x) => `${x.chave} ${x.lado} ${[...x.mapa].join(";")}`)).toEqual(["PT:46 sai 2,1", "PT:48 chega 2,1"]);
  });
});
