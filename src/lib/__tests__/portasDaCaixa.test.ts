import { describe, expect, it } from "vitest";
import { portasDaCaixa } from "../subRotas";
import type { ElementoRota, RotaOptica } from "../rotaOptica";

const hub = (extra: Partial<ElementoRota> = {}): ElementoRota => ({ nome: "HUB X", tipo: "hub", codigo: "15", splitter: "1:8", ...extra });
const rota = (id: string, porta: string, els: ElementoRota[], extra: Partial<RotaOptica> = {}): RotaOptica => ({
  id, nome: id, origem: "manual", trechos: [], elementos: [{ nome: "OLT", tipo: "olt", porta }, ...els], ...extra,
});

describe("portasDaCaixa", () => {
  it("HUB com splitter de duas portas: uma opção por porta", () => {
    const a = rota("062", "PL 06 - Porta 02", [hub({ fibra_entrada: 3 })]);
    const b = rota("215", "PL 02 - Porta 15", [{ nome: "CEO", tipo: "ceo", codigo: "9" }, hub({ fibra_entrada: 1 })]);
    const op = portasDaCaixa([a, b], "PT:15");
    expect(op.map((o) => o.dona.id).sort()).toEqual(["062", "215"]);
    expect(op.find((o) => o.dona.id === "215")!.i).toBe(2);
  });

  it("passagem não conta quando outra rota usa o splitter", () => {
    const a = rota("062", "PL 06 - Porta 02", [hub()]);
    const b = rota("060", "PL 06 - Porta 00", [hub({ passagem: true, splitter: undefined })]);
    expect(portasDaCaixa([a, b], "PT:15").map((o) => o.dona.id)).toEqual(["062"]);
  });

  it("sub-rota que só herda o tronco não vira opção a mais", () => {
    const a = rota("062", "PL 06 - Porta 02", [hub()]);
    const sub = rota("sub", "PL 06 - Porta 02", [hub(), { nome: "CDOI", tipo: "cdoi", codigo: "20" }], { pai: { rota_id: "062", chave: "PT:15" }, tronco: 2 });
    expect(portasDaCaixa([a, sub], "PT:15").map((o) => o.dona.id)).toEqual(["062"]);
  });
});
