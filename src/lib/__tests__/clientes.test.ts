import { describe, expect, it } from "vitest";
import { documentoValido, formatarCep, formatarDocumento, proximoCodigoCliente, type ClienteRede } from "../clientesRede";

describe("clientes", () => {
  it("valida CPF e CNPJ pelos dígitos verificadores", () => {
    expect(documentoValido("529.982.247-25")).toBe(true);
    expect(documentoValido("529.982.247-24")).toBe(false);
    expect(documentoValido("111.111.111-11")).toBe(false);
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("11.222.333/0001-80")).toBe(false);
    expect(documentoValido("123")).toBe(false);
  });

  it("formata documento e CEP", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCep("89160000")).toBe("89160-000");
  });

  it("próximo código livre", () => {
    const c = (codigo: string) => ({ id: codigo, nome: codigo, codigo }) as ClienteRede;
    expect(proximoCodigoCliente([])).toBe("CLI-000001");
    expect(proximoCodigoCliente([c("CLI-000004"), c("XPTO"), c("CLI-000002")])).toBe("CLI-000005");
  });
});
