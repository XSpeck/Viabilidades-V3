import { describe, expect, it } from "vitest";
import type { CaboRede } from "../cabosRede";
import type { CaixaRede } from "../caixasRede";
import { calcularSinal } from "../sinalRede";
import { cadastroDe, desligarRede, ligarRede, mapaDaCaixa, montarUnifilarRede, moverCordao } from "../unifilarRede";

const el = (codigo: string, nome: string, tipo: CaixaRede["tipo"], extra: Partial<CaixaRede> = {}): CaixaRede =>
  ({ id: codigo, chave: `PT:${codigo}`, codigo, nome, tipo, portas: [], ...extra });
const cabo = (cod: string, caminho: string[], capacidade = 12): CaboRede => ({
  id: cod, chave: cod, nome: `${capacidade} FO [${cod}]`, capacidade, fibras: [],
  caminho: caminho.map((c) => `PT:${c}`), trechos: caminho.slice(1).map(() => ({ pontos: [], metros: 100 })),
});
const CORD = "1 FO [CB-000001]", A = "12 FO [CB-000002]", B = "12 FO [CB-000003]";

function rede() {
  const caixas = [
    el("1", "OLT", "olt", { cordoes: [{ porta: "0/1/1", para: { cabo: CORD, fibra: 1 } }] }),
    el("2", "DIO", "dio", { adaptadores: [{ n: 3, de: { cabo: CORD, fibra: 1 }, para: { cabo: A, fibra: 3 } }] }),
    el("3", "HUB", "hub", { splitters: [{ id: "s1", relacao: "1:8", entrada: { fibra: { cabo: A, fibra: 3 } }, portas: [] }] }),
    el("4", "CTO", "cto"),
  ];
  const cabos = [cabo("CB-000001", ["1", "2"], 1), cabo("CB-000002", ["2", "3"]), cabo("CB-000003", ["3", "4"])];
  return { caixas, cabos };
}

describe("Unifilar na rede livre", () => {
  it("o cabo que chega aceso é 'chega' e o que sai da HUB é 'sai'", () => {
    const { caixas, cabos } = rede();
    const s = calcularSinal(caixas, cabos);
    const m = mapaDaCaixa("PT:3", cabos, s);
    const mod = montarUnifilarRede(m, cadastroDe(caixas[2]), s, () => "x");
    expect(mod.cabos.map((c) => `${c.lado}:${c.chave}`).sort()).toEqual(["chega:CB-000002", "sai:CB-000003"]);
    expect(mod.cabos.find((c) => c.chave === "CB-000002")!.sinal.has(3)).toBe(true);
  });

  it("ligar a perna no cabo da CTO acende a CTO; desligar apaga, e o cabo continua lá", () => {
    const { caixas, cabos } = rede();
    const s0 = calcularSinal(caixas, cabos);
    const m = mapaDaCaixa("PT:3", cabos, s0);
    const r = ligarRede(cadastroDe(caixas[2]), { k: "porta", spl: "s1", porta: 1 }, { k: "fibra", lado: "sai", cabo: B, fibra: 5 }, m);
    expect(typeof r).toBe("object");
    const hub = { ...caixas[2], ...(r as object) };
    const s1 = calcularSinal([caixas[0], caixas[1], hub, caixas[3]], cabos);
    expect(s1.caixas.has("PT:4")).toBe(true);
    const mod = montarUnifilarRede(mapaDaCaixa("PT:3", cabos, s1), cadastroDe(hub), s1, () => "x");
    const perna = mod.ligacoes.find((l) => l.tipo === "perna")!;
    const solto = desligarRede(cadastroDe(hub), perna, mapaDaCaixa("PT:3", cabos, s1));
    const s2 = calcularSinal([caixas[0], caixas[1], { ...hub, ...solto }, caixas[3]], cabos);
    expect(s2.caixas.has("PT:4")).toBe(false);
    expect(mapaDaCaixa("PT:4", cabos, s2).cabos).toHaveLength(1);
  });

  it("DIO: o cordão muda de adaptador e a fibra que sai acompanha", () => {
    const { caixas } = rede();
    const r = moverCordao(cadastroDe(caixas[1]), 3, 7);
    expect(r).toMatchObject({ adaptadores: [{ n: 7, de: { cabo: CORD }, para: { cabo: A, fibra: 7 } }] });
  });
});
