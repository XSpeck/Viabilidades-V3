// Tipos espelhados de src/types/index.ts — manter sincronizado manualmente

export type StatusViabilizacao =
  | "pendente"
  | "em_auditoria"
  | "em_revisao"
  | "aprovado"
  | "rejeitado"
  | "utp"
  | "finalizado";

export type StatusInstalacao =
  | "aguardando_proposta"
  | "proposta_enviada"
  | "aguardando_confirmacao"
  | "agendado"
  | "instalado";

export type EquipeUsuario =
  | "comercial_mf"
  | "comercial"
  | "atendimento"
  | "comercial_gmarx";

export interface Viabilizacao {
  id: string;
  usuario: string;
  nome_cliente?: string;
  tipo_instalacao: string;
  urgente: boolean;
  status: StatusViabilizacao;
  status_instalacao?: StatusInstalacao;
  auditor_responsavel?: string;
  cto_numero?: string;
  portas_disponiveis?: number;
  motivo_rejeicao?: string;
  data_instalacao?: string;
  periodo_instalacao?: string;
  tecnico_instalacao?: string;
  agendamento_data?: string;
  agendamento_periodo?: string;
  agendamento_tecnico?: string;
  data_solicitacao?: string;
}
