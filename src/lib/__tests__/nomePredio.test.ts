import { describe, expect, it } from "vitest";
import { distanciaEdicao, nomeSimilar, normalizarNome } from "../nomePredio";

describe("normalizarNome", () => {
  it("tira acento, pontuação e prefixos", () => {
    expect(normalizarNome("Ed. Lignito")).toBe("lignito");
    expect(normalizarNome("Residencial São João")).toBe("sao joao");
    expect(normalizarNome("Edifício Mont-Blanc")).toBe("mont blanc");
  });
});

describe("distanciaEdicao", () => {
  it("conta letra a mais, a menos, trocada e invertida", () => {
    expect(distanciaEdicao("lignito", "lignitto")).toBe(1);
    expect(distanciaEdicao("lignito", "ligito")).toBe(1);
    expect(distanciaEdicao("lignito", "lignuto")).toBe(1);
    expect(distanciaEdicao("lignito", "lingito")).toBe(1);
  });
});

describe("nomeSimilar", () => {
  it("acha com prefixo diferente", () => {
    expect(nomeSimilar("Edificio Lignito", "Ed. Lignito")).toBe(true);
  });
  it("aceita erro pequeno de digitação", () => {
    expect(nomeSimilar("Lignitto", "Ed. Lignito")).toBe(true);
    expect(nomeSimilar("Mont Blanc", "Monblanc")).toBe(true);
    expect(nomeSimilar("Residencial Sao Joao", "Res. São João")).toBe(true);
    expect(nomeSimilar("Jardim das Flores", "Jardin das Flores")).toBe(true);
  });
  it("não confunde nomes diferentes", () => {
    expect(nomeSimilar("Lignito", "Mont Blanc")).toBe(false);
    expect(nomeSimilar("Ed. Aurora", "Ed. Amora")).toBe(false);
    expect(nomeSimilar("Ed. Sol", "Ed. Mar")).toBe(false);
    expect(nomeSimilar("Jardim das Flores", "Jardim das Palmeiras")).toBe(false);
  });
  it("nome vazio nunca casa", () => {
    expect(nomeSimilar("", "Ed. Lignito")).toBe(false);
    expect(nomeSimilar("Ed.", "Ed. Lignito")).toBe(false);
  });
});
