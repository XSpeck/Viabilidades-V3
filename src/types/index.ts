export type UserNivel = 1 | 2;
export type UserCargo = "adm" | "auditor" | "agendamento" | "usuario";

export interface AppUser {
  uid: string;
  nome: string;
  login: string;
  nivel: UserNivel;
  cargo?: UserCargo;
}

export type TipoInstalacao = "FTTH" | "Prédio" | "Condomínio";

export type StatusViabilizacao =
  | "pendente"
  | "em_auditoria"
  | "em_revisao"
  | "aprovado"
  | "rejeitado"
  | "utp"
  | "finalizado";

export interface MensagemViabilizacao {
  de: string;
  tipo: "auditoria" | "contestacao" | "resposta";
  texto: string;
  data: string;
}

export type StatusPredio =
  | "aguardando_dados"
  | "pronto_auditoria"
  | "proposta_visita"
  | "agendado"
  | "estruturado"
  | "rejeitado";

export type StatusInstalacao =
  | "aguardando_proposta"       // usuário precisa propor data/período
  | "proposta_enviada"          // usuário enviou, aguardando agendamento analisar
  | "aguardando_confirmacao"    // agendamento alterou, usuário precisa confirmar
  | "agendado"                  // ambos concordaram
  | "instalado";                // instalação concluída, pronto para arquivar

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
  // Comum FTTH/FTTA
  olt?: string;
  // Agendamento
  nome_sindico?: string;
  contato_sindico?: string;
  nome_cliente_predio?: string;
  contato_cliente_predio?: string;
  apartamento?: string;
  obs_agendamento?: string;
  data_preferencia_visita?: string;
  periodo_preferencia_visita?: string;
  proposta_visita_data?: string;
  proposta_visita_periodo?: string;
  proposta_visita_tecnico?: string;
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
  // Agendamento técnico (instalação FTTH)
  status_instalacao?: StatusInstalacao;
  // Proposta do usuário
  proposta_data?: string;
  proposta_periodo?: string;
  proposta_obs?: string;
  // Resposta do setor de agendamento
  agendamento_data?: string;
  agendamento_periodo?: string;
  agendamento_tecnico?: string;
  agendamento_obs?: string;
  // Valores confirmados (definidos quando ambos concordam)
  data_instalacao?: string;
  periodo_instalacao?: string;
  tecnico_instalacao?: string;
  // Histórico de negociação
  historico_agendamento?: string;
  historico_visita?: string;
  // Motivo
  motivo_rejeicao?: string;
  observacoes?: string;
  // Revisão / Contestação
  mensagens?: MensagemViabilizacao[];
  revisao_tipo?: "devolvido" | "contestado";
  status_anterior?: StatusViabilizacao;
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

export const TECNICOS_REDE = ["Eduardo", "Ulisses", "Zilli", "Andre"] as const;
export type TecnicoRede = typeof TECNICOS_REDE[number];

export type StatusDemanda    = "aberta" | "em_andamento" | "concluida";
export type PrioridadeDemanda = "baixa" | "media" | "alta" | "urgente";

export interface DemandaRede {
  id: string;
  tecnico: TecnicoRede;
  tipo: string;
  local?: string;
  prioridade: PrioridadeDemanda;
  descricao: string;
  status: StatusDemanda;
  criado_por: string;
  data_criacao: string;
  data_conclusao?: string;
  obs_conclusao?: string;
}
