import { describe, expect, it } from "vitest";
import { compararCtos } from "../ctos";

describe("compararCtos", () => {
  it("conta novas, removidas, movidas e iguais pelo nome", () => {
    const atuais = [
      { name: "A", lat: -28.68, lon: -49.37 },
      { name: "B", lat: -28.69, lon: -49.38 },
      { name: "C", lat: -28.70, lon: -49.39 },
    ];
    const novas = [
      { name: "A", lat: -28.68, lon: -49.37 },         // igual
      { name: "B", lat: -28.6905, lon: -49.38 },       // ~55 m: mudou de lugar
      { name: "D", lat: -28.71, lon: -49.40 },         // nova
    ];
    const d = compararCtos(atuais, novas);
    expect(d.iguais).toBe(1);
    expect(d.movidas).toEqual(["B"]);
    expect(d.novas).toEqual(["D"]);
    expect(d.removidas).toEqual(["C"]);
  });
});
