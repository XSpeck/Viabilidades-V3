import { describe, expect, it } from "vitest";
import { decisaoDoAuditor, ehResultadoFinal, ordenarResultados, podeMexerNaFila, resultadoVencido, statusDe, vistaDoPedido } from "../statusViabilizacao";
import type { Viabilizacao } from "@/types";

const v = (x: Partial<Viabilizacao>): Viabilizacao =>
  ({ id: "1", usuario: "Ana", plus_code_cliente: "583G8J3G+WGV", tipo_instalacao: "FTTH", urgente: false, status: "pendente", ...x }) as Viabilizacao;

describe("statusDe", () => {
  it("na fila e em análise", () => {
    expect(statusDe(v({})).rotulo).toBe("Na fila");
    expect(statusDe(v({ status: "em_auditoria" })).rotulo).toBe("Em análise");
    expect(statusDe(v({ status: "em_auditoria", revisao_tipo: "reaberto" })).chave).toBe("correcao");
  });

  it("devolvida pede ação, contestação não", () => {
    expect(statusDe(v({ status: "em_revisao", revisao_tipo: "devolvido" })).acao).toBeTruthy();
    expect(statusDe(v({ status: "em_revisao", revisao_tipo: "contestado" })).acao).toBeUndefined();
  });

  // O módulo de agendamento está desligado (lib/modulos.ts): a etapa antiga de instalação é ignorada
  it("sem o módulo, etapa antiga de agendamento vira aprovado", () => {
    const casa = statusDe(v({ status: "aprovado", status_instalacao: "aguardando_proposta" }));
    expect(casa.rotulo).toBe("Aprovado");
    expect(casa.acao).toBeUndefined();
    expect(statusDe(v({ status: "aprovado", status_instalacao: "agendado" })).rotulo).toBe("Aprovado");
    expect(statusDe(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "estruturado", status_instalacao: "aguardando_proposta" })).chave).toBe("estruturado");
    expect(vistaDoPedido({ status_instalacao: "instalado" as const }).status_instalacao).toBe("instalado");
  });

  it("visita agendada tem nome próprio", () => {
    expect(statusDe(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "agendado" })).rotulo).toBe("Visita agendada");
  });

  it("dados do síndico ou do responsável", () => {
    expect(statusDe(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "aguardando_dados" })).acao).toContain("síndico");
    expect(statusDe(v({ status: "aprovado", tipo_instalacao: "Condomínio", status_predio: "aguardando_dados" })).acao).toContain("responsável");
  });

  it("finalizados contam como terminaram", () => {
    const f = { status: "finalizado" as const, data_finalizacao: "2026-11-01" };
    expect(statusDe(v({ ...f, status_instalacao: "instalado" })).rotulo).toBe("Instalado");
    expect(statusDe(v({ ...f, motivo_rejeicao: "Atendemos UTP" })).rotulo).toBe("UTP");
    expect(statusDe(v({ ...f, motivo_rejeicao: "Sem CTO" })).rotulo).toBe("Sem viabilidade");
    expect(statusDe(v({ ...f, motivo_desistencia: "Cancelado pelo atendente" })).rotulo).toBe("Cancelado");
    expect(statusDe(v({ ...f, motivo_desistencia: "Desistência do cliente" })).rotulo).toBe("Desistência");
  });
});

describe("ordenarResultados", () => {
  it("quem precisa de ação vem primeiro, depois o mais novo", () => {
    const lista = [
      v({ id: "a", data_solicitacao: "2026-11-20" }),
      v({ id: "b", data_solicitacao: "2026-11-10", status: "em_revisao", revisao_tipo: "devolvido" }),
      v({ id: "c", data_solicitacao: "2026-11-21" }),
    ];
    expect(ordenarResultados(lista).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
});

describe("podeMexerNaFila", () => {
  it("só pendente e sem auditor", () => {
    expect(podeMexerNaFila(v({}))).toBe(true);
    expect(podeMexerNaFila(v({ auditor_responsavel: "Carlos" }))).toBe(false);
    expect(podeMexerNaFila(v({ status: "em_auditoria" }))).toBe(false);
  });
});

describe("depois de finalizado", () => {
  const f = { status: "finalizado" as const, data_finalizacao: "2026-11-21" };
  it("aprovado continua Aprovado para o atendente", () => {
    expect(statusDe(v({ ...f, cto_numero: "2009.01.N" })).rotulo).toBe("Aprovado");
    expect(statusDe(v({ ...f })).rotulo).toBe("Finalizado");
  });
  it("decisão do auditor", () => {
    expect(decisaoDoAuditor(v({ ...f, cto_numero: "2009.01.N" })).rotulo).toBe("Aprovado");
    expect(decisaoDoAuditor(v({ ...f, motivo_rejeicao: "Atendemos UTP" })).rotulo).toBe("UTP");
    expect(decisaoDoAuditor(v({ status: "em_auditoria", tipo_instalacao: "Prédio", status_predio: "pronto_auditoria" })).rotulo).toBe("Pediu estrutura");
    expect(decisaoDoAuditor(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "estruturado" })).rotulo).toBe("Estruturado");
    expect(decisaoDoAuditor(v({ status: "rejeitado", tipo_instalacao: "Prédio", status_predio: "rejeitado", motivo_rejeicao: "Edifício sem viabilidade: x" })).rotulo).toBe("Sem viabilidade");
  });
});

describe("resultado vencido (7 dias)", () => {
  const agora = Date.parse("2026-11-21T12:00:00Z");
  it("aprovado há 10 dias sai da lista; há 3 dias fica", () => {
    expect(resultadoVencido(v({ status: "aprovado", cto_numero: "X", data_auditoria: "2026-11-11T10:00:00Z" }), agora)).toBe(true);
    expect(resultadoVencido(v({ status: "aprovado", cto_numero: "X", data_auditoria: "2026-11-18T10:00:00Z" }), agora)).toBe(false);
  });
  it("estruturado conta pela data da estrutura", () => {
    expect(resultadoVencido(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "estruturado", data_auditoria: "2026-10-01T10:00:00Z", data_estruturacao: "2026-11-20T10:00:00Z" }), agora)).toBe(false);
  });
  it("pedido em andamento nunca vence", () => {
    expect(ehResultadoFinal(v({ status: "em_auditoria" }))).toBe(false);
    expect(resultadoVencido(v({ status: "em_revisao", revisao_tipo: "devolvido", data_auditoria: "2026-10-01T10:00:00Z" }), agora)).toBe(false);
    expect(resultadoVencido(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "aguardando_dados", data_auditoria: "2026-10-01T10:00:00Z" }), agora)).toBe(false);
  });
});
