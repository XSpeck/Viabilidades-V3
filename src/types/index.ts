export type UserNivel = 1 | 2;

export interface AppUser {
  uid: string;
  nome: string;
  login: string;
  nivel: UserNivel;
}

export type TipoInstalacao = "FTTH" | "Prédio" | "Condomínio";

export type StatusViabilizacao =
  | "pendente"
  | "em_auditoria"
  | "aprovado"
  | "rejeitado"
  | "utp"
  | "finalizado";

export type StatusPredio =
  | "aguardando_dados"
  | "pronto_auditoria"
  | "agendado"
  | "estruturado"
  | "rejeitado";

export interface Viabilizacao {
  id: string;
  usuario: string;
  nome_cliente?: string;
  plus_code_cliente: string;
  tipo_instalacao: TipoInstalacao;
  urgente: boolean;
  status: StatusViabilizacao;
  auditor_responsavel?: string;
  auditado_por?: string;
  status_predio?: StatusPredio;
  status_busca?: string;
  predio_ftta?: string;
  andar_predio?: string;
  bloco_predio?: string;
  // FTTH
  cto_numero?: string;
  portas_disponiveis?: number;
  menor_rx?: string;
  distancia_cliente?: string;
  localizacao_caixa?: string;
  // FTTA
  cdoi?: string;
  media_rx?: string;
  // Agendamento
  nome_sindico?: string;
  contato_sindico?: string;
  nome_cliente_predio?: string;
  contato_cliente_predio?: string;
  apartamento?: string;
  obs_agendamento?: string;
  data_visita?: string;
  periodo_visita?: string;
  tecnico_responsavel?: string;
  tecnologia_predio?: string;
  giga?: boolean;
  historico_reagendamento?: string;
  data_agendamento?: string;
  status_agendamento?: string;
  checklist_previsita?: {
    sindico_avisado?: boolean;
    portaria_informada?: boolean;
    acesso_confirmado?: boolean;
    data_confirmada?: boolean;
    equipamento_separado?: boolean;
  };
  // Motivo
  motivo_rejeicao?: string;
  observacoes?: string;
  // Timestamps
  data_solicitacao?: string;
  data_auditoria?: string;
  data_finalizacao?: string;
  data_solicitacao_predio?: string;
}

export interface PredioAtendido {
  id: string;
  condominio: string;
  tecnologia: string;
  localizacao: string;
  observacao?: string;
  estruturado_por: string;
  viabilizacao_id: string;
  giga?: boolean;
  data_estruturacao?: string;
}

export interface PredioSemViabilidade {
  id: string;
  condominio: string;
  localizacao: string;
  observacao: string;
  registrado_por: string;
  data_registro?: string;
}
