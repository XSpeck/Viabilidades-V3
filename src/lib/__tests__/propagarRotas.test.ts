import { describe, expect, it } from "vitest";
import { completarPelasRotas, type CadastroLigacoes } from "../unifilar";
import { caixasDoPlano, planoPelaCaixa, planoPelasRotas, pontasDaRota, trocarFibrasNoCadastro, type PlanoTroca } from "../trocaFibra";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const A = "24 FO ASO · HUB → CEO 3 [CB-000006]";
const B = "12 FO ASO · CEO 3 → CEO 2 [CB-000007]";
const B2 = "04 FO ASO · CEO 3 → CEO 2 [CB-000009]";
const C = "06 FO ASO · CEO 3 → CTO 9 [CB-000010]";
const P = "06 FO ASO · HUB → Ed. N [CB-000009]";
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
/** elementos novos da rota no plano */
const els = (p: PlanoTroca, id: string) => p.rotas.get(id)!.elementos;
const resumo = (p: PlanoTroca) => p.pontas.map((x) => `${x.chave} ${x.lado} ${x.de}>${x.para}`);

describe("pela caixa (Unifilar): a fibra que sai", () => {
  it("troca no mesmo cabo: muda a chegada e segue pelas caixas onde o cabo só passa", () => {
    const antes = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }] });
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 5 } }] });
    const p = planoPelaCaixa("PT:12", [rota("r", 6, 1)], antes, depois);
    expect(p.bloqueadas).toHaveLength(0);
    expect(p.mudancas).toHaveLength(1);
    expect(els(p, "r")[3].fibra_entrada).toBe(5);
    expect(els(p, "r")[4].fibra_entrada).toBe(5);
    expect(p.mudancas[0].seguem).toEqual(["CEO 1"]);
    // o cabo B termina na CEO 1: ela recebe a fibra nova
    expect(resumo(p)).toEqual(["PT:14 chega 1>5"]);
  });
  it("rota que só passava (sem emenda no cadastro) ganha a emenda nova", () => {
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 3 } }] });
    expect(els(planoPelaCaixa("PT:12", [rota("r", 6, 1)], cad({}), depois), "r")[3].fibra_entrada).toBe(3);
  });
  it("o que a mudança não mexeu fica igual", () => {
    const igual = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 9 } }] });
    expect(planoPelaCaixa("PT:12", [rota("r", 6, 1)], igual, igual).mudancas).toHaveLength(0);
  });
  it("outro cabo para a mesma caixa: muda o cabo e o nome do trecho", () => {
    const r2: RotaOptica = { ...rota("s", 2, 2), elementos: [...rota("s", 2, 2).elementos.slice(0, 3), el("CEO 2", "ceo", "13", { cabo_entrada: B2, fibra_entrada: 2 })] };
    const r = { ...rota("r", 6, 1), trechos: [{ nome: B, pontos: [], ate: 3 }] };
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B2, fibra: 4 } }] });
    const p = planoPelaCaixa("PT:12", [r, r2], cad({}), depois);
    expect(els(p, "r")[3]).toMatchObject({ cabo_entrada: B2, fibra_entrada: 4 });
    expect(els(p, "r")[4].fibra_entrada).toBe(1);
    expect(p.rotas.get("r")!.trechos[0].nome).toBe(B2);
  });
  it("cabo que vai para outra caixa: o Unifilar manda, a rota é cortada na caixa", () => {
    const outra: RotaOptica = { ...rota("t", 1, 1), elementos: [...rota("t", 1, 1).elementos.slice(0, 3), el("CTO 9", "cto", "20", { cabo_entrada: C, fibra_entrada: 1 })] };
    const depois = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: C, fibra: 2 } }] });
    const p = planoPelaCaixa("PT:12", [rota("r", 6, 1), outra], cad({}), depois);
    expect(p.cortes.map((c) => [c.rota.id, c.ate])).toEqual([["r", 2]]);
    expect(els(p, "r").map((e) => e.nome)).toEqual(["OLT", "HUB", "CEO 3"]);
  });
  it("fusão desligada: a rota passa a terminar na caixa", () => {
    const antes = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }] });
    const r = { ...rota("r", 6, 1), trechos: [{ nome: A, pontos: [], ate: 2 }, { nome: B, pontos: [], ate: 3 }] };
    const p = planoPelaCaixa("PT:12", [r], antes, cad({}));
    expect(p.cortes).toHaveLength(1);
    expect(p.cortes[0].apagar).toEqual([]);
    expect(els(p, "r")).toHaveLength(3);
    expect(p.rotas.get("r")!.trechos.map((t) => t.ate)).toEqual([2]);
  });
  it("perna desligada: a sub-rota que nascia na caixa é apagada (e as filhas dela)", () => {
    const base = rota("r", 6, 1);
    const tronco: RotaOptica = { ...base, elementos: base.elementos.slice(0, 3) };
    const sub: RotaOptica = { ...base, id: "sub", nome: "sub", pai: { rota_id: "r", chave: "PT:12" }, tronco: 3 };
    const neta: RotaOptica = { ...sub, id: "neta", nome: "neta", pai: { rota_id: "sub", chave: "PT:13" }, tronco: 4 };
    const spl = (comPerna: boolean) => [{ id: "s1", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 6 } }, portas: comPerna ? [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }] : [] }];
    const p = planoPelaCaixa("PT:12", [tronco, sub, neta], cad({ splitters: spl(true) }), cad({ splitters: spl(false) }));
    expect(p.cortes.map((c) => c.rota.id)).toEqual(["sub"]);
    expect(p.cortes[0].apagar.sort()).toEqual(["neta", "sub"]);
    expect(p.rotas.has("sub")).toBe(false);
  });
  it("perna do splitter levada para outra fibra: a sub-rota que saía por ela acompanha", () => {
    const hub: RotaOptica = {
      id: "h", nome: "h", origem: "manual", trechos: [],
      elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("CEO 3", "hub", "12", { cabo_entrada: A, fibra_entrada: 6 }), el("CEO 2", "cdoi", "13", { cabo_entrada: B, fibra_entrada: 1 })],
    };
    const spl = (f: number) => [{ id: "s1", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 6 } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: f } }] }];
    expect(els(planoPelaCaixa("PT:12", [hub], cad({ splitters: spl(1) }), cad({ splitters: spl(7) })), "h")[2].fibra_entrada).toBe(7);
  });
});

describe("pela caixa (Unifilar): a fibra que entra", () => {
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

  it("entrada do splitter da F03 para a F01: a rota chega pela F01 e a CEO de trás passa a mandar a F01", () => {
    const p = planoPelaCaixa("PT:12", [hub(3)], cad({ splitters: spl(3) }), cad({ splitters: spl(1) }));
    expect(p.bloqueadas).toHaveLength(0);
    expect(p.mudancas).toEqual([expect.objectContaining({ sentido: "chega", ponta: "CEO 9" })]);
    expect(els(p, "h")[2].fibra_entrada).toBe(1);
    expect(resumo(p)).toEqual(["PT:9 sai 3>1"]);
  });

  it("rota que termina na caixa (CTO): o splitter da F01 para a F02 leva a rota e a caixa de trás", () => {
    const cto: RotaOptica = {
      id: "c", nome: "CTO 3", origem: "manual", trechos: [],
      elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("CEO 9", "ceo", "9", { cabo_entrada: "x", fibra_entrada: 1 }), el("CTO 3", "cto", "47", { cabo_entrada: A, fibra_entrada: 1, splitter: "1:8" })],
    };
    const s = (f: number) => [{ id: "r11", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: f } }, portas: [] }];
    const p = planoPelaCaixa("PT:47", [cto], cad({ splitters: s(1) }), cad({ splitters: s(2) }));
    expect(p.mudancas[0]).toMatchObject({ sentido: "chega" });
    expect(els(p, "c")[2].fibra_entrada).toBe(2);
    expect(resumo(p)).toEqual(["PT:9 sai 1>2"]);
    // e o automático não monta outro splitter na F01 se a rota não mudar
    expect(completarPelasRotas("PT:47", [cto], cad({ splitters: s(2) })).splitters).toBe(0);
  });
});

describe("pelas rotas (editor, Trocar fibra, DIO, prédio): as pontas do cabo acompanham", () => {
  it("F02 → F01 no cabo da HUB até a CTO: a HUB manda a F01 e a CTO recebe na F01", () => {
    const C27 = "02 FO · HUB 1 → CTO 4 [CB-000027]";
    const antes = [el("HUB 1", "hub", "46"), el("CTO 4", "cto", "48", { cabo_entrada: C27, fibra_entrada: 2 })];
    const depois = [el("HUB 1", "hub", "46"), el("CTO 4", "cto", "48", { cabo_entrada: C27, fibra_entrada: 1 })];
    expect(pontasDaRota(antes, depois).map((x) => `${x.chave} ${x.lado} ${x.de}>${x.para}`)).toEqual(["PT:46 sai 2>1", "PT:48 chega 2>1"]);
  });
  it("CDOI do prédio: o cabo atravessa o prédio até a HUB; só caixa com cadastro muda", () => {
    const base = [el("OLT", "olt", ""), el("HUB", "hub", "15", { cabo_entrada: A, fibra_entrada: 3 }), el("Ed. N", "predio", "PREDIO-x", { cabo_entrada: P, fibra_entrada: 1 })];
    const r = (f: number): RotaOptica => ({ id: "s", nome: "AND-T", origem: "manual", trechos: [], elementos: [...base, el("AND-T", "cdoi", "16", { cabo_entrada: P, fibra_entrada: f })] });
    const p = planoPelasRotas([r(1)], [r(3)]);
    expect(resumo(p)).toEqual(["PT:15 sai 1>3", "PT:16 chega 1>3"]);
    const hub = cad({ splitters: [{ id: "r", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 3 } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: P, fibra: 1 } }] }] });
    const cx = caixasDoPlano(p.pontas, (k) => (k === "PT:15" ? hub : undefined));
    expect([...cx.keys()]).toEqual(["PT:15"]);
    expect(cx.get("PT:15")!.splitters[0].portas[0].saida?.fibra).toBe(3);
  });
  it("só as rotas marcadas levam as caixas", () => {
    const p = planoPelasRotas([rota("r", 6, 1)], [rota("r", 6, 4)]);
    const ceo = cad({ emendas: [{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }] });
    expect(caixasDoPlano(p.pontas, () => ceo, new Map(), new Set()).size).toBe(0);
    expect(caixasDoPlano(p.pontas, () => ceo, new Map(), new Set(["r"])).get("PT:12")!.emendas[0].para.fibra).toBe(4);
  });
});

describe("cadastro da caixa", () => {
  it("fusão e entrada de splitter trocam de fibra", () => {
    const c = cad({
      emendas: [{ de: { cabo: "Z", fibra: 2 }, para: { cabo: A, fibra: 3 } }],
      splitters: [{ id: "s", relacao: "1:8", entrada: { fibra: { cabo: B, fibra: 1 } }, portas: [] }],
    });
    expect(trocarFibrasNoCadastro(c, A, "sai", new Map([[3, 1]])).emendas[0].para.fibra).toBe(1);
    expect(trocarFibrasNoCadastro(c, B, "chega", new Map([[1, 5]])).splitters[0].entrada.fibra?.fibra).toBe(5);
  });
  it("F1↔F3 ao mesmo tempo sem uma passar por cima da outra", () => {
    const c = cad({ splitters: [{ id: "s", relacao: "1:8", entrada: {}, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }, { numero: 2, status: "ramal" as const, saida: { cabo: B, fibra: 3 } }] }] });
    expect(trocarFibrasNoCadastro(c, B, "sai", new Map([[1, 3], [3, 1]])).splitters[0].portas.map((p) => p.saida?.fibra)).toEqual([3, 1]);
  });
  it("regra cor com cor: a fibra nova vira exceção para o mesmo destino", () => {
    const n = trocarFibrasNoCadastro(cad({ regras_emenda: [{ de: A, para: B }] }), B, "sai", new Map([[2, 7]]));
    expect(n.emendas).toEqual([{ de: { cabo: A, fibra: 2 }, para: { cabo: B, fibra: 7 } }]);
  });
});

describe("automático da caixa", () => {
  it("rota na F03, mas a perna dela já sai de um splitter na F01: não cria outro", () => {
    const r: RotaOptica = {
      id: "h", nome: "h", origem: "manual", trechos: [],
      elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("HUB", "hub", "12", { cabo_entrada: A, fibra_entrada: 3, splitter: "1:8" }), el("CDOI", "cdoi", "13", { cabo_entrada: B, fibra_entrada: 1 })],
    };
    const c = cad({ splitters: [{ id: "r33", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 1 } }, portas: [{ numero: 1, status: "ramal" as const, saida: { cabo: B, fibra: 1 } }] }] });
    expect(completarPelasRotas("PT:12", [r], c).splitters).toBe(0);
  });
  it("cabo do prédio: perna na fibra nominal sai; entra a da CDOI", () => {
    const mae: RotaOptica = { id: "m", nome: "Rota Ed. N", origem: "manual", trechos: [], elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("HUB", "hub", "15", { cabo_entrada: A, fibra_entrada: 3, splitter: "1:8" }), el("Ed. N", "predio", "PREDIO-x", { cabo_entrada: P, fibra_entrada: 1 })] };
    const sub: RotaOptica = { id: "s", nome: "AND-T", origem: "manual", trechos: [], pai: { rota_id: "m", chave: "PT:PREDIO-x" }, tronco: 3, elementos: [...mae.elementos, el("AND-T", "cdoi", "16", { cabo_entrada: P, fibra_entrada: 3 })] };
    const c = cad({ splitters: [{ id: "r33", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 3 } }, portas: [{ numero: 1, status: "livre" as const }, { numero: 2, status: "ramal" as const, saida: { cabo: P, fibra: 1 } }] }] });
    const r = completarPelasRotas("PT:15", [mae, sub], c);
    expect(r.ed.splitters[0].portas.filter((p) => p.saida).map((p) => p.saida!.fibra)).toEqual([3]);
  });
});
