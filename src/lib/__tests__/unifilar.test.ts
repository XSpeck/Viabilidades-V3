import { describe, expect, it } from "vitest";
import { caminhoNaCaixa, corComCor, desligar, idPonto, ligar, montarUnifilar, rotasDaFibra, tipoEntre, type CadastroLigacoes } from "../unifilar";
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
