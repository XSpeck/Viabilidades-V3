import { describe, expect, it } from "vitest";
import { corFibra, registrarCapacidadesCabos } from "../rotaOptica";

describe("cor própria do cabo", () => {
  it("cordão e pigtail são azul-turquesa; flat é cinza; o resto segue a cor da fibra", () => {
    registrarCapacidadesCabos(new Map(), new Map(), new Map([["CB-000050", "Flat"]]));
    expect(corFibra(1, "Cordão 0/6/2 OLT2_DC → DIO 05").nome).toBe("Azul-turquesa");
    expect(corFibra(1, "Pigtail DIO 05").nome).toBe("Azul-turquesa");
    expect(corFibra(1, "01 FO · CTO 3 → Casa [CB-000050]").nome).toBe("Cinza");
    expect(corFibra(1, "Cabo Flat 1F").nome).toBe("Cinza");
    expect(corFibra(1, "12 FO ASO · HUB 1 → CTO 4 [CB-000027]").nome).toBe("Verde");
  });
});
