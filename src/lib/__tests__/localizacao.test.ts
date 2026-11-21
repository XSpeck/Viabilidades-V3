import { describe, expect, it } from "vitest";
import { formatarTelefone, interpretarLocalizacao, plusCodeCurto, semAcento } from "../localizacao";

describe("interpretarLocalizacao", () => {
  it("completa Plus Code curto perto da referência", () => {
    const r = interpretarLocalizacao("8j3g+wgv");
    expect(r?.plusCode).toBe("583G8J3G+WGV");
    expect(r?.origem).toBe("pluscode");
  });

  it("ignora a cidade depois do Plus Code", () => {
    expect(interpretarLocalizacao("8J3G+WGV Criciúma, SC")?.plusCode).toBe("583G8J3G+WGV");
  });

  it("mantém Plus Code completo", () => {
    expect(interpretarLocalizacao("583G8MC6+QP")?.plusCode).toBe("583G8MC6+QP");
  });

  it("lê coordenadas com ponto e com vírgula decimal", () => {
    const a = interpretarLocalizacao("-28.695133, -49.373710");
    const b = interpretarLocalizacao("-28,695133, -49,373710");
    const c = interpretarLocalizacao("-28.695133 -49.373710");
    const d = interpretarLocalizacao("-28,695133; -49,373710");
    for (const r of [a, b, c, d]) {
      expect(r?.lat).toBeCloseTo(-28.695133, 5);
      expect(r?.lon).toBeCloseTo(-49.37371, 5);
      expect(r?.plusCode).toContain("+");
    }
  });

  it("lê link do Google Maps", () => {
    const r = interpretarLocalizacao("https://www.google.com/maps/place/x/@-28.6951,-49.3737,17z");
    expect(r?.origem).toBe("link");
    expect(r?.lat).toBeCloseTo(-28.6951, 4);
  });

  it("recusa lixo e coordenadas fora do mundo", () => {
    expect(interpretarLocalizacao("rua tal 123")).toBeNull();
    expect(interpretarLocalizacao("-128.5, 10.2")).toBeNull();
    expect(interpretarLocalizacao("")).toBeNull();
  });
});

describe("auxiliares", () => {
  it("encurta o Plus Code perto da referência", () => {
    expect(plusCodeCurto("583G8J3G+WGV")).toBe("8J3G+WGV");
  });
  it("tira acentos", () => {
    expect(semAcento("Ed. João")).toBe("ed. joao");
  });
  it("formata telefone", () => {
    expect(formatarTelefone("48999998888")).toBe("(48) 99999-8888");
    expect(formatarTelefone("4833334444")).toBe("(48) 3333-4444");
  });
});
