// =====================
// Situação de uma viabilização vista por quem pediu: um nome, uma cor e, quando for o caso,
// a ação que o atendente precisa fazer. Usado pelos números, filtros, cartões e histórico.
// =====================
import type { Viabilizacao } from "@/types";
import { MODULOS } from "./modulos";

export type ChaveStatus =
  | "fila" | "analise" | "correcao" | "devolvida" | "contestado"
  | "aprovado" | "sem_viab" | "utp"
  | "ag_dados" | "ag_visita" | "confirmar_visita" | "visita_agendada" | "estruturado"
  | "propor_inst" | "proposta_enviada" | "confirmar_inst" | "inst_agendada" | "instalado"
  | "finalizado";

export type GrupoStatus = "analise" | "aprovado" | "sem_viab" | "predio" | "finalizado";

export interface StatusInfo {
  chave: ChaveStatus;
  rotulo: string;
  /** Classes do selo (fundo + texto) */
  cor: string;
  grupo: GrupoStatus;
  /** Preenchido quando o atendente precisa fazer algo */
  acao?: string;
}

const AZUL = "bg-blue-100 text-blue-700";
const VERDE = "bg-green-100 text-green-700";
const LARANJA = "bg-orange-100 text-orange-700";
const AMARELO = "bg-yellow-100 text-yellow-800";
const VERMELHO = "bg-red-100 text-red-700";
const ROXO = "bg-purple-100 text-purple-700";
const CINZA = "bg-gray-100 text-gray-600";

export const ehUtp = (v: Pick<Viabilizacao, "status" | "motivo_rejeicao">) =>
  v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP";

export const ehCancelado = (v: Pick<Viabilizacao, "motivo_desistencia">) =>
  !!v.motivo_desistencia?.startsWith("Cancelado pelo");

/** Como o pedido terminou (para o histórico) */
function fim(v: Viabilizacao): StatusInfo {
  const base = { chave: "finalizado" as const, grupo: "finalizado" as const };
  if (v.status_instalacao === "instalado") return { ...base, rotulo: "Instalado", cor: VERDE };
  if (v.status_predio === "estruturado") return { ...base, rotulo: "Estruturado", cor: VERDE };
  if (ehUtp(v)) return { ...base, rotulo: "UTP", cor: ROXO };
  if (v.motivo_rejeicao) return { ...base, rotulo: "Sem viabilidade", cor: VERMELHO };
  if (ehCancelado(v)) return { ...base, rotulo: "Cancelado", cor: CINZA };
  if (v.motivo_desistencia) return { ...base, rotulo: "Desistência", cor: LARANJA };
  return { ...base, rotulo: "Finalizado", cor: CINZA };
}

export function statusDe(v: Viabilizacao): StatusInfo {
  const cond = v.tipo_instalacao === "Condomínio";
  if (v.status === "finalizado" || v.data_finalizacao) return fim(v);

  // Conversa com o auditor vem antes de tudo
  if (v.status === "em_revisao") {
    return v.revisao_tipo === "contestado"
      ? { chave: "contestado", rotulo: "Contestação enviada", cor: AZUL, grupo: "analise" }
      : { chave: "devolvida", rotulo: "Devolvida", cor: LARANJA, grupo: "analise", acao: "O auditor pediu uma correção" };
  }
  if (v.status === "em_auditoria" && v.revisao_tipo === "reaberto") {
    return { chave: "correcao", rotulo: "Em correção", cor: AMARELO, grupo: "analise" };
  }

  // Instalação (inclusive depois do prédio estruturado)
  switch (v.status_instalacao) {
    case "aguardando_proposta": return { chave: "propor_inst", rotulo: "Propor data", cor: LARANJA, grupo: "aprovado", acao: "Informe a data para a instalação" };
    case "proposta_enviada": return { chave: "proposta_enviada", rotulo: "Proposta enviada", cor: AMARELO, grupo: "aprovado" };
    case "aguardando_confirmacao": return { chave: "confirmar_inst", rotulo: "Confirmar data", cor: LARANJA, grupo: "aprovado", acao: "Confirme a nova data da instalação" };
    case "agendado": return { chave: "inst_agendada", rotulo: "Instalação agendada", cor: VERDE, grupo: "aprovado" };
    case "instalado": return { chave: "instalado", rotulo: "Instalado", cor: AZUL, grupo: "aprovado", acao: "Instalação concluída: arquive o pedido" };
  }

  // Estrutura do prédio / condomínio
  switch (v.status_predio) {
    case "aguardando_dados": return { chave: "ag_dados", rotulo: "Dados pendentes", cor: LARANJA, grupo: "predio", acao: `Preencha os dados do ${cond ? "responsável" : "síndico"}` };
    case "pronto_auditoria": return { chave: "ag_visita", rotulo: MODULOS.agendamento ? "Aguardando visita" : "Com a equipe de rede", cor: AZUL, grupo: "predio" };
    case "proposta_visita": return { chave: "confirmar_visita", rotulo: "Confirmar visita", cor: LARANJA, grupo: "predio", acao: "Confirme a data da visita técnica" };
    case "agendado": return { chave: "visita_agendada", rotulo: "Visita agendada", cor: VERDE, grupo: "predio" };
    case "estruturado": return { chave: "estruturado", rotulo: "Estruturado", cor: VERDE, grupo: "aprovado", acao: "Estrutura pronta: dê ciência" };
  }

  switch (v.status) {
    case "pendente": return { chave: "fila", rotulo: "Na fila", cor: CINZA, grupo: "analise" };
    case "em_auditoria": return { chave: "analise", rotulo: "Em análise", cor: AZUL, grupo: "analise" };
    case "aprovado": return { chave: "aprovado", rotulo: "Aprovado", cor: VERDE, grupo: "aprovado" };
    case "rejeitado": return { chave: "sem_viab", rotulo: "Sem viabilidade", cor: VERMELHO, grupo: "sem_viab" };
    case "utp": return { chave: "utp", rotulo: "UTP", cor: ROXO, grupo: "sem_viab" };
    default: return { chave: "analise", rotulo: v.status, cor: CINZA, grupo: "analise" };
  }
}

/** Ordem dos filtros por situação (só aparecem os que têm pedido) */
export const ORDEM_CHAVES: ChaveStatus[] = [
  "fila", "analise", "correcao", "devolvida", "contestado",
  "aprovado", "propor_inst", "proposta_enviada", "confirmar_inst", "inst_agendada", "instalado",
  "ag_dados", "ag_visita", "confirmar_visita", "visita_agendada", "estruturado",
  "sem_viab", "utp",
];

/** Quem precisa de ação primeiro; depois o mais recente */
export function ordenarResultados(lista: Viabilizacao[]): Viabilizacao[] {
  return [...lista].sort((a, b) => {
    const xa = statusDe(a).acao ? 0 : 1;
    const xb = statusDe(b).acao ? 0 : 1;
    if (xa !== xb) return xa - xb;
    return (b.data_solicitacao ?? "").localeCompare(a.data_solicitacao ?? "");
  });
}

/** O pedido ainda está na fila, sem auditor: o atendente pode corrigir ou cancelar */
export const podeMexerNaFila = (v: Viabilizacao) => v.status === "pendente" && !v.auditor_responsavel && !v.status_predio && !v.data_finalizacao;
