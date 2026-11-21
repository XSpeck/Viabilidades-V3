import { describe, expect, it } from "vitest";
import { ordenarResultados, podeMexerNaFila, statusDe } from "../statusViabilizacao";
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

  it("instalação vence a estrutura do prédio", () => {
    const s = statusDe(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "estruturado", status_instalacao: "aguardando_proposta" }));
    expect(s.chave).toBe("propor_inst");
    expect(s.acao).toBeTruthy();
  });

  it("visita e instalação agendadas têm nomes diferentes", () => {
    expect(statusDe(v({ status: "aprovado", tipo_instalacao: "Prédio", status_predio: "agendado" })).rotulo).toBe("Visita agendada");
    expect(statusDe(v({ status: "aprovado", status_instalacao: "agendado" })).rotulo).toBe("Instalação agendada");
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
