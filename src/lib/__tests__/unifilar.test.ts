import { describe, expect, it } from "vitest";
import { trocarPortaDio, caminhoNaCaixa, completarPelasRotas, corComCor, desligar, idPonto, ligar, montarUnifilar, rotasDaFibra, tipoEntre, type CadastroLigacoes } from "../unifilar";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const A = "24 FO ASO · HUB → CEO 3 [CB-000006]";
const B = "12 FO ASO · CEO 3 → CEO 2 [CB-000007]";
const el = (nome: string, tipo: ElementoRota["tipo"], codigo: string, extra: Partial<ElementoRota> = {}): ElementoRota => ({ nome, tipo, codigo, ...extra });
const rota = (id: string, fA: number, fB: number): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [],
  elementos: [el("OLT", "olt", "", { porta: "PL 06 - Porta 02" }), el("HUB", "hub", "1", { cabo_entrada: "x", fibra_entrada: 1, passagem: true }),
    el("CEO 3", "ceo", "12", { cabo_entrada: A, fibra_entrada: fA }), el("CEO 2", "ceo", "13", { cabo_entrada: B, fibra_entrada: fB })],
});
const vazio: CadastroLigacoes = { emendas: [], regras_emenda: [], splitters: [] };

describe("unifilar", () => {
  it("monta as pontas dos cabos e sugere a fusão que a rota tem", () => {
    const m = montarUnifilar("PT:12", [rota("a", 6, 1)], undefined);
    expect(m.cabos.map((c) => `${c.lado}:${c.chave}`).sort()).toEqual(["chega:CB-000006", "sai:CB-000007"]);
    expect(m.ligacoes).toHaveLength(1);
    expect(m.ligacoes[0]).toMatchObject({ tipo: "fusao", origem: "rota" });
    expect(m.cabos.find((c) => c.lado === "chega")!.sinal.get(6)).toEqual(["a"]);
  });

  it("mesma fibra no mesmo cabo = passa direto", () => {
    const r: RotaOptica = { ...rota("p", 6, 6), elementos: [...rota("p", 6, 6).elementos.slice(0, 3), el("CEO 2", "ceo", "13", { cabo_entrada: A, fibra_entrada: 6 })] };
    expect(montarUnifilar("PT:12", [r], undefined).ligacoes[0].tipo).toBe("passa");
  });

  it("ligar fibra com fibra grava a emenda e troca a anterior", () => {
    const a = { k: "fibra" as const, lado: "chega" as const, cabo: A, fibra: 6 };
    const c1 = ligar(vazio, a, { k: "fibra", lado: "sai", cabo: B, fibra: 1 }) as CadastroLigacoes;
    expect(c1.emendas).toEqual([{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 1 } }]);
    const c2 = ligar(c1, { k: "fibra", lado: "sai", cabo: B, fibra: 2 }, a) as CadastroLigacoes;
    expect(c2.emendas).toEqual([{ de: { cabo: A, fibra: 6 }, para: { cabo: B, fibra: 2 } }]);
    const m = montarUnifilar("PT:12", [rota("a", 6, 1)], { ...c2 });
    expect(m.ligacoes.filter((l) => l.origem === "cadastro")).toHaveLength(1);
    expect(desligar(c2, m.ligacoes.find((l) => l.origem === "cadastro")!).emendas).toHaveLength(0);
  });

  it("splitter: fibra na entrada, porta na fibra que sai, 2º nível e validações", () => {
    const c0: CadastroLigacoes = { ...vazio, splitters: [{ id: "s1", relacao: "1:2", entrada: {}, portas: [] }, { id: "s2", relacao: "1:8", entrada: {}, portas: [] }] };
    const c1 = ligar(c0, { k: "fibra", lado: "chega", cabo: A, fibra: 3 }, { k: "entrada", spl: "s1" }) as CadastroLigacoes;
    expect(c1.splitters[0].entrada.fibra).toEqual({ cabo: A, fibra: 3 });
    const c2 = ligar(c1, { k: "porta", spl: "s1", porta: 1 }, { k: "entrada", spl: "s2" }) as CadastroLigacoes;
    expect(c2.splitters[1].entrada.splitter).toEqual({ id: "s1", porta: 1 });
    const c3 = ligar(c2, { k: "fibra", lado: "sai", cabo: B, fibra: 4 }, { k: "porta", spl: "s1", porta: 2 }) as CadastroLigacoes;
    expect(c3.splitters[0].portas.find((p) => p.numero === 2)).toMatchObject({ status: "ramal", saida: { cabo: B, fibra: 4 } });
    expect(typeof tipoEntre({ k: "entrada", spl: "s1" }, { k: "porta", spl: "s1", porta: 1 })).toBe("string");
    expect(tipoEntre({ k: "entrada", spl: "s1" }, { k: "porta", spl: "s1", porta: 1 })).not.toBe("nivel2");
    expect(typeof ligar(c0, { k: "fibra", lado: "sai", cabo: B, fibra: 1 }, { k: "entrada", spl: "s1" })).toBe("string");
  });

  it("cor com cor e o caminho laranja dentro da caixa", () => {
    const c = corComCor(vazio, A, B);
    const m = montarUnifilar("PT:12", [], c);
    expect(m.ligacoes.filter((l) => l.origem === "regra")).toHaveLength(12);
    const cam = caminhoNaCaixa(m, { k: "fibra", lado: "chega", cabo: A, fibra: 5 });
    expect(cam.has(idPonto({ k: "fibra", lado: "sai", cabo: B, fibra: 5 }))).toBe(true);
    expect(cam.has(idPonto({ k: "fibra", lado: "sai", cabo: B, fibra: 6 }))).toBe(false);
  });

  it("rotas da fibra com a sequência inteira", () => {
    const r = rotasDaFibra([rota("a", 6, 1), rota("b", 7, 2)], A, 6);
    expect(r.map((x) => x.rota.id)).toEqual(["a"]);
    expect(r[0].passos.map((p) => p.nome)).toEqual(["OLT", "HUB", "CEO 3", "CEO 2"]);
  });
});

describe("montar splitters pelas rotas", () => {
  const C4 = "04 FO ASO · CEO 1 → HUB X [CB-000008]";
  const P1 = "06 FO ASO · HUB X → Ed. Um [CB-000011]";
  const hubRota = (id: string, porta: string, fibra: number, cauda: ElementoRota[]): RotaOptica => ({
    id, nome: id, origem: "manual", trechos: [],
    elementos: [el("OLT", "olt", "", { porta }), el("HUB X", "hub", "15", { cabo_entrada: C4, fibra_entrada: fibra, splitter: "1:8" }), ...cauda],
  });
  it("um splitter por porta PON, com entrada e pernas para o prédio", () => {
    const a = hubRota("062", "PL 06 - Porta 02", 3, [el("Ed. Um", "predio", "PREDIO-1", { cabo_entrada: P1 }), el("CDOI 1", "cdoi", "20", { cabo_entrada: P1, fibra_entrada: 1 }), el("CDOI 2", "cdoi", "21", { cabo_entrada: P1, fibra_entrada: 2 })]);
    const b = hubRota("215", "PL 02 - Porta 15", 4, []);
    const r = completarPelasRotas("PT:15", [a, b], { emendas: [], regras_emenda: [], splitters: [{ id: "s1", relacao: "1:8", entrada: {}, portas: [] }] });
    expect(r.ed.splitters).toHaveLength(2);
    expect(r.ed.splitters[0].entrada.fibra).toEqual({ cabo: C4, fibra: 3 });
    expect(r.ed.splitters[1].entrada.fibra).toEqual({ cabo: C4, fibra: 4 });
    expect(r.pernas).toBe(2);
    expect(r.ed.splitters[0].portas.filter((p) => p.saida).map((p) => p.saida!.fibra)).toEqual([1, 2]);
    // rodar de novo não muda nada
    expect(completarPelasRotas("PT:15", [a, b], r.ed).ed).toBe(r.ed);
  });
});

describe("OLT e DIO no unifilar", () => {
  const COR = "Cordão 0/2/15 OLT2 → DIO 04";
  const C72 = "72 FO ASO · DIO 04 → HUB [CB-000005]";
  const r: RotaOptica = {
    id: "r", nome: "0/2/15", origem: "manual", trechos: [],
    elementos: [el("OLT2", "olt", "", { porta: "PL 02 - Porta 15" }), el("DIO 04", "dio", "100008", { cabo_entrada: COR, fibra_entrada: 1, porta: "Porta 13" }), el("HUB", "hub", "9", { cabo_entrada: C72, fibra_entrada: 13 })],
  };
  it("OLT: porta PON ligada no cordão que sai", () => {
    const m = montarUnifilar("N:OLT2", [r], undefined);
    expect(m.ligacoes).toHaveLength(1);
    expect(m.ligacoes[0]).toMatchObject({ tipo: "cordao", a: { k: "pon", porta: "PL 02 - Porta 15" } });
    expect(m.cabos[0].outraChave).toBe("PT:100008");
  });
  it("DIO: cordão → adaptador 13 → fibra 13 do cabo que sai", () => {
    const m = montarUnifilar("PT:100008", [r], undefined);
    expect(m.ligacoes.map((l) => l.tipo)).toEqual(["dio", "dio"]);
    const cam = caminhoNaCaixa(m, { k: "fibra", lado: "chega", cabo: COR, fibra: 1 });
    expect(cam.has(idPonto({ k: "fibra", lado: "sai", cabo: C72, fibra: 13 }))).toBe(true);
  });
  it("trocar a porta do DIO muda a porta e a fibra seguinte", () => {
    const n = trocarPortaDio(r, "PT:100008", 20)!;
    expect(n[1].porta).toBe("Porta 20");
    expect(n[2].fibra_entrada).toBe(20);
  });
});
