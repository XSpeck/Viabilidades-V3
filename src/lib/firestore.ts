import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  deleteField,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Viabilizacao,
  PredioAtendido,
  PredioSemViabilidade,
  StatusViabilizacao,
  TipoInstalacao,
  MensagemViabilizacao,
  DemandaRede,
  StatusDemanda,
  NotaAtividade,
} from "@/types";

// =====================
// Helpers
// =====================

// Remove campos undefined antes de enviar ao Firestore (null é válido — significa limpar o campo)
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

function fromFirestore<T>(doc: { id: string; data(): Record<string, unknown> }): T {
  const data = doc.data();
  // Converter Timestamps para ISO strings
  const converted: Record<string, unknown> = { id: doc.id };
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      converted[key] = value.toDate().toISOString();
    } else {
      converted[key] = value;
    }
  }
  return converted as T;
}

// =====================
// Viabilizações
// =====================

export async function createViabilizacao(
  data: Omit<Viabilizacao, "id" | "data_solicitacao">
): Promise<string> {
  const clean = stripUndefined(data as Record<string, unknown>);
  const ref = await addDoc(collection(db, "viabilizacoes"), {
    ...clean,
    data_solicitacao: serverTimestamp(),
  });
  return ref.id;
}

// Filtragem feita client-side para evitar índices compostos complexos

export async function getViabilizacoesPendentes(): Promise<Viabilizacao[]> {
  const q = query(
    collection(db, "viabilizacoes"),
    where("status", "==", "pendente")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => !v.auditor_responsavel && v.status_predio !== "agendado")
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1;
    });
}

export async function getViabilizacoesAuditor(auditorNome: string): Promise<Viabilizacao[]> {
  const [snap1, snap2] = await Promise.all([
    getDocs(query(
      collection(db, "viabilizacoes"),
      where("status", "==", "em_auditoria"),
      where("auditor_responsavel", "==", auditorNome)
    )),
    getDocs(query(
      collection(db, "viabilizacoes"),
      where("status", "==", "em_revisao"),
      where("auditor_responsavel", "==", auditorNome)
    )),
  ]);
  const items = [
    ...snap1.docs.map((d) => fromFirestore<Viabilizacao>(d)),
    ...snap2.docs
      .map((d) => fromFirestore<Viabilizacao>(d))
      .filter((v) => v.revisao_tipo === "contestado"),
  ];
  return items
    .filter((v) => v.status_predio !== "agendado")
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1;
    });
}

export async function getViabilizacoesUsuario(username: string): Promise<Viabilizacao[]> {
  const q = query(
    collection(db, "viabilizacoes"),
    where("usuario", "==", username)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => !v.data_finalizacao)
    .sort((a, b) => (a.data_solicitacao ?? "") > (b.data_solicitacao ?? "") ? -1 : 1);
}

export async function getViabilizacoesHistorico(username: string): Promise<Viabilizacao[]> {
  const q = query(
    collection(db, "viabilizacoes"),
    where("usuario", "==", username)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .sort((a, b) => (a.data_solicitacao ?? "") > (b.data_solicitacao ?? "") ? -1 : 1);
}

export async function getAgendamentos(): Promise<Viabilizacao[]> {
  const q = query(
    collection(db, "viabilizacoes"),
    where("status_predio", "==", "agendado")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => v.status_agendamento === "pendente")
    .sort((a, b) => (a.data_visita ?? "") < (b.data_visita ?? "") ? -1 : 1);
}

export async function getFtthPendenteBusca(): Promise<Viabilizacao[]> {
  const q = query(
    collection(db, "viabilizacoes"),
    where("tipo_instalacao", "==", "FTTH"),
    where("status", "==", "pendente")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => !v.status_busca)
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1;
    });
}

export async function updateViabilizacao(
  id: string,
  data: Partial<Viabilizacao>
): Promise<void> {
  const ref = doc(db, "viabilizacoes", id);
  const clean = stripUndefined(data as Record<string, unknown>);
  await updateDoc(ref, { ...clean });
}

export async function pegarViabilizacao(id: string, auditor: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "em_auditoria",
    auditor_responsavel: auditor,
  });
}

export async function devolverViabilizacao(id: string): Promise<void> {
  const ref = doc(db, "viabilizacoes", id);
  await updateDoc(ref, {
    status: "pendente",
    auditor_responsavel: null,
  });
}

export async function deleteViabilizacao(id: string): Promise<void> {
  await deleteDoc(doc(db, "viabilizacoes", id));
}

export async function aprovarFTTH(
  id: string,
  dados: {
    cto_numero: string;
    portas_disponiveis: number;
    menor_rx: string;
    distancia_cliente: string;
    localizacao_caixa: string;
    observacoes?: string;
    olt?: string;
    tipo_instalacao?: TipoInstalacao;
    nome_cliente?: string;
  },
  auditadoPor: string
): Promise<void> {
  await updateViabilizacao(id, {
    status: "aprovado",
    auditado_por: auditadoPor,
    data_auditoria: new Date().toISOString(),
    ...dados,
  });
}

export async function aprovarFTTA(
  id: string,
  dados: {
    cdoi: string;
    predio_ftta: string;
    portas_disponiveis: number;
    media_rx: string;
    observacoes?: string;
    olt?: string;
    tipo_instalacao?: TipoInstalacao;
    nome_cliente?: string;
  },
  auditadoPor: string
): Promise<void> {
  await updateViabilizacao(id, {
    status: "aprovado",
    auditado_por: auditadoPor,
    data_auditoria: new Date().toISOString(),
    ...dados,
  });
}

export async function rejeitarViabilizacao(
  id: string,
  motivo: string,
  auditadoPor: string
): Promise<void> {
  await updateViabilizacao(id, {
    status: "rejeitado",
    motivo_rejeicao: motivo,
    auditado_por: auditadoPor,
    data_auditoria: new Date().toISOString(),
  });
}

export async function marcarUTP(id: string, auditadoPor: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "utp",
    motivo_rejeicao: "Atendemos UTP",
    auditado_por: auditadoPor,
    data_auditoria: new Date().toISOString(),
  });
  await iniciarAgendamentoInstalacao(id);
}

export async function finalizarViabilizacao(id: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "finalizado" as StatusViabilizacao,
    data_finalizacao: new Date().toISOString(),
  });
}

export async function salvarCTOEscolhida(
  id: string,
  ctoData: { cto_numero: string; distancia_cliente: string; localizacao_caixa: string }
): Promise<void> {
  await updateViabilizacao(id, {
    status_busca: "cto_escolhida",
    ...ctoData,
  });
}

// =====================
// Prédios / Condomínios
// =====================

export async function solicitarViabilizacaoPredio(id: string): Promise<void> {
  await updateViabilizacao(id, {
    status_predio: "aguardando_dados",
    data_solicitacao_predio: new Date().toISOString(),
  });
}

export async function enviarDadosPredio(
  id: string,
  dados: {
    predio_ftta?: string;
    nome_sindico: string;
    contato_sindico: string;
    nome_cliente_predio: string;
    contato_cliente_predio: string;
    apartamento: string;
    data_preferencia_visita?: string;
    periodo_preferencia_visita?: string;
    obs_agendamento?: string;
  }
): Promise<void> {
  const entrada = dados.data_preferencia_visita
    ? `Usuário preferiu ${dados.data_preferencia_visita} ${dados.periodo_preferencia_visita ?? "Manhã"}`
    : "Usuário enviou dados do prédio";
  await updateViabilizacao(id, {
    status_predio: "pronto_auditoria",
    historico_visita: entrada,
    ...dados,
  });
}

export async function agendarVisita(
  id: string,
  dados: {
    data_visita: string;
    periodo_visita: string;
    tecnico_responsavel: string;
    tecnologia_predio: string;
    giga: boolean;
    obs_agendamento?: string;
  },
  historicoAnterior?: string
): Promise<void> {
  const entrada = `Auditor agendou ${dados.data_visita} ${dados.periodo_visita} — ${dados.tecnico_responsavel}`;
  const historico_visita = historicoAnterior ? `${historicoAnterior}\n${entrada}` : entrada;
  await updateViabilizacao(id, {
    status_predio: "agendado",
    status_agendamento: "pendente",
    data_agendamento: new Date().toISOString(),
    historico_visita,
    ...dados,
  });
}

// Auditor propõe nova data diferente da preferência do usuário → aguarda confirmação
export async function proporDataVisita(
  id: string,
  dados: {
    proposta_visita_data: string;
    proposta_visita_periodo: string;
    proposta_visita_tecnico?: string;
    tecnologia_predio: string;
    giga: boolean;
    obs_agendamento?: string;
  },
  historicoAnterior?: string
): Promise<void> {
  const entrada = `Auditor propôs ${dados.proposta_visita_data} ${dados.proposta_visita_periodo}`;
  const historico_visita = historicoAnterior ? `${historicoAnterior}\n${entrada}` : entrada;
  await updateViabilizacao(id, {
    status_predio: "proposta_visita",
    data_agendamento: new Date().toISOString(),
    historico_visita,
    ...dados,
  });
}

// Usuário confirma a proposta do auditor → agendado
export async function confirmarPropostaVisita(id: string, dados: {
  proposta_visita_data: string;
  proposta_visita_periodo: string;
  proposta_visita_tecnico?: string;
  tecnologia_predio?: string;
  giga?: boolean;
}, historicoAnterior?: string): Promise<void> {
  const entrada = `Usuário confirmou ${dados.proposta_visita_data} ${dados.proposta_visita_periodo}`;
  const historico_visita = historicoAnterior ? `${historicoAnterior}\n${entrada}` : entrada;
  await updateViabilizacao(id, {
    status_predio: "agendado",
    status_agendamento: "pendente",
    data_visita: dados.proposta_visita_data,
    periodo_visita: dados.proposta_visita_periodo,
    ...(dados.proposta_visita_tecnico ? { tecnico_responsavel: dados.proposta_visita_tecnico } : {}),
    data_agendamento: new Date().toISOString(),
    historico_visita,
  });
}

// Usuário recusa e contra-propõe nova data → volta para pronto_auditoria
export async function contraproporVisita(
  id: string,
  novaData: string,
  novoPeriodo: string,
  obs?: string,
  historicoAnterior?: string
): Promise<void> {
  const entrada = `Usuário contra-propôs ${novaData} ${novoPeriodo}`;
  const historico_visita = historicoAnterior ? `${historicoAnterior}\n${entrada}` : entrada;
  const ref = doc(db, "viabilizacoes", id);
  await updateDoc(ref, {
    status_predio: "pronto_auditoria",
    data_preferencia_visita: novaData,
    periodo_preferencia_visita: novoPeriodo,
    historico_visita,
    ...(obs !== undefined ? { obs_agendamento: obs } : {}),
    proposta_visita_data: deleteField(),
    proposta_visita_periodo: deleteField(),
    proposta_visita_tecnico: deleteField(),
  });
}

export async function reagendarVisita(
  id: string,
  novaData: string,
  novoPeriodo: string,
  novoTecnico: string,
  motivo?: string,
  dadosAtuais?: { data_visita?: string; periodo_visita?: string; tecnico_responsavel?: string }
): Promise<void> {
  let historico = "";
  if (dadosAtuais) {
    historico = `Reagendado de ${dadosAtuais.data_visita ?? "N/A"} ${dadosAtuais.periodo_visita ?? ""} (${dadosAtuais.tecnico_responsavel ?? "N/A"})`;
    if (motivo) historico += ` - Motivo: ${motivo}`;
  }
  await updateViabilizacao(id, {
    data_visita: novaData,
    periodo_visita: novoPeriodo,
    tecnico_responsavel: novoTecnico,
    data_agendamento: new Date().toISOString(),
    historico_reagendamento: historico,
  });
}

export async function finalizarEstruturado(
  id: string,
  dados: {
    condominio: string;
    tecnologia: string;
    localizacao: string;
    observacao: string;
    tecnico: string;
    giga: boolean;
  }
): Promise<void> {
  await addDoc(collection(db, "predios_atendidos"), {
    condominio: dados.condominio,
    tecnologia: dados.tecnologia,
    localizacao: dados.localizacao,
    observacao: dados.observacao,
    estruturado_por: dados.tecnico,
    viabilizacao_id: id,
    giga: dados.giga,
    data_estruturacao: serverTimestamp(),
  });
  await updateViabilizacao(id, {
    status: "aprovado" as StatusViabilizacao,
    status_predio: "estruturado",
    status_agendamento: "concluido",
  });
}

export async function rejeitarPredio(
  id: string,
  condominio: string,
  localizacao: string,
  observacao: string,
  registradoPor: string
): Promise<void> {
  // 1. Registrar sem viabilidade
  await addDoc(collection(db, "predios_sem_viabilidade"), {
    condominio,
    localizacao,
    observacao,
    registrado_por: registradoPor,
    data_registro: serverTimestamp(),
  });
  // 2. Atualizar viabilização
  await updateViabilizacao(id, {
    status: "rejeitado",
    status_predio: "rejeitado",
    motivo_rejeicao: `Edifício sem viabilidade: ${observacao}`,
    data_auditoria: new Date().toISOString(),
    auditado_por: registradoPor,
  });
}

// =====================
// Agendamento Técnico (Instalação FTTH)
// =====================

// Retorna instalações ativas — FTTH + FTTA aprovação direta (sem visita estrutural) + UTP
export async function getInstalacoesPendentes(): Promise<Viabilizacao[]> {
  const [snap1, snap2, snap3, snap4] = await Promise.all([
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "FTTH"), where("status", "==", "aprovado"))),
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "Prédio"), where("status", "==", "aprovado"))),
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "FTTH"), where("status", "==", "utp"))),
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "Prédio"), where("status", "==", "utp"))),
  ]);
  const items = [
    ...snap1.docs.map((d) => fromFirestore<Viabilizacao>(d)),
    // FTTA direto = sem visita estrutural (sem status_predio)
    ...snap2.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !v.status_predio),
    ...snap3.docs.map((d) => fromFirestore<Viabilizacao>(d)),
    ...snap4.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !v.status_predio),
  ];
  return items
    .filter((v) => ["proposta_enviada", "aguardando_confirmacao", "agendado", "instalado"].includes(v.status_instalacao ?? ""))
    .filter((v) => !v.data_finalizacao)
    .sort((a, b) => (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1);
}

// Retorna instalações FTTA/Cond via estrutura — gerenciadas na Agenda FTTA/UTP
export async function getInstalacoesAgendaFTTA(): Promise<Viabilizacao[]> {
  const q = query(collection(db, "viabilizacoes"), where("status_predio", "==", "estruturado"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => !!v.status_instalacao)
    .filter((v) => !v.data_finalizacao)
    .sort((a, b) => (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1);
}

// Dispara quando FTTH é aprovado — habilita o usuário a propor data
export async function iniciarAgendamentoInstalacao(id: string): Promise<void> {
  await updateViabilizacao(id, { status_instalacao: "aguardando_proposta" });
}

// Usuário propõe data/período/obs ao setor de agendamento
export async function enviarPropostaInstalacao(
  id: string,
  dados: { proposta_data: string; proposta_periodo: string; proposta_obs?: string },
  historicoAnterior?: string
): Promise<void> {
  const historico = historicoAnterior
    ? `${historicoAnterior}\nUsuário propôs ${dados.proposta_data} ${dados.proposta_periodo}`
    : `Usuário propôs ${dados.proposta_data} ${dados.proposta_periodo}`;
  await updateViabilizacao(id, {
    status_instalacao: "proposta_enviada",
    proposta_data: dados.proposta_data,
    proposta_periodo: dados.proposta_periodo,
    ...(dados.proposta_obs !== undefined ? { proposta_obs: dados.proposta_obs } : {}),
    historico_agendamento: historico,
  });
}

// Setor de agendamento confirma (com ou sem alteração)
// Se confirmou sem alteração → agendado direto
// Se alterou data/período → aguarda confirmação do usuário
export async function confirmarAgendamentoTecnico(
  id: string,
  dados: { agendamento_data: string; agendamento_periodo: string; agendamento_tecnico: string; agendamento_obs?: string },
  proposta: { proposta_data?: string; proposta_periodo?: string },
  historicoAnterior?: string
): Promise<void> {
  const alterou = dados.agendamento_data !== proposta.proposta_data
    || dados.agendamento_periodo !== proposta.proposta_periodo;

  const historico = historicoAnterior
    ? `${historicoAnterior}\nAgendamento confirmou ${dados.agendamento_data} ${dados.agendamento_periodo}${alterou ? " (alterado)" : ""}`
    : `Agendamento confirmou ${dados.agendamento_data} ${dados.agendamento_periodo}${alterou ? " (alterado)" : ""}`;

  if (!alterou) {
    await updateViabilizacao(id, {
      status_instalacao: "agendado",
      agendamento_data: dados.agendamento_data,
      agendamento_periodo: dados.agendamento_periodo,
      agendamento_tecnico: dados.agendamento_tecnico,
      data_instalacao: dados.agendamento_data,
      periodo_instalacao: dados.agendamento_periodo,
      tecnico_instalacao: dados.agendamento_tecnico,
      historico_agendamento: historico,
    });
  } else {
    await updateViabilizacao(id, {
      status_instalacao: "aguardando_confirmacao",
      agendamento_data: dados.agendamento_data,
      agendamento_periodo: dados.agendamento_periodo,
      agendamento_tecnico: dados.agendamento_tecnico,
      ...(dados.agendamento_obs !== undefined ? { agendamento_obs: dados.agendamento_obs } : {}),
      historico_agendamento: historico,
    });
  }
}

// Usuário confirma a proposta do agendamento (com alterações)
export async function confirmarPropostaUsuario(
  id: string,
  dados: { agendamento_data: string; agendamento_periodo: string; agendamento_tecnico: string },
  historicoAnterior?: string
): Promise<void> {
  const historico = `${historicoAnterior ?? ""}\nUsuário confirmou ${dados.agendamento_data} ${dados.agendamento_periodo}`;
  await updateViabilizacao(id, {
    status_instalacao: "agendado",
    data_instalacao: dados.agendamento_data,
    periodo_instalacao: dados.agendamento_periodo,
    tecnico_instalacao: dados.agendamento_tecnico,
    historico_agendamento: historico,
  });
}

// Setor reagenda instalação confirmada (sem necessidade de reconfirmação do usuário)
export async function reagendarInstalacao(
  id: string,
  dados: { data_instalacao: string; periodo_instalacao: string; tecnico_instalacao: string; motivo?: string },
  historicoAnterior?: string
): Promise<void> {
  const entrada = `Reagendado para ${dados.data_instalacao} ${dados.periodo_instalacao} — ${dados.tecnico_instalacao}${dados.motivo ? ` (${dados.motivo})` : ""}`;
  const historico = historicoAnterior ? `${historicoAnterior}\n${entrada}` : entrada;
  await updateViabilizacao(id, {
    data_instalacao: dados.data_instalacao,
    periodo_instalacao: dados.periodo_instalacao,
    tecnico_instalacao: dados.tecnico_instalacao,
    historico_agendamento: historico,
  });
}

// Setor marca como instalado após a visita técnica
export async function marcarInstalado(id: string): Promise<void> {
  await updateViabilizacao(id, { status_instalacao: "instalado" });
}

// Arquivadas da Agenda Técnica: FTTH + FTTA direto
export async function getInstalacoesArquivadas(): Promise<Viabilizacao[]> {
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "FTTH"), where("status", "==", "finalizado"))),
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "Prédio"), where("status", "==", "finalizado"))),
  ]);
  const items = [
    ...snap1.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !!v.status_instalacao),
    ...snap2.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !!v.status_instalacao && !v.status_predio),
  ];
  return items.sort((a, b) => ((b.data_finalizacao ?? b.data_solicitacao ?? "") > (a.data_finalizacao ?? a.data_solicitacao ?? "") ? 1 : -1));
}

// Arquivar (ambos os lados usam finalizarViabilizacao existente)

// =====================
// Revisão / Contestação
// =====================

export async function devolverComMensagem(
  id: string,
  mensagem: string,
  auditorNome: string,
  mensagensAnteriores?: MensagemViabilizacao[]
): Promise<void> {
  const nova: MensagemViabilizacao = { de: auditorNome, tipo: "auditoria", texto: mensagem, data: new Date().toISOString() };
  await updateViabilizacao(id, {
    status: "em_revisao" as StatusViabilizacao,
    revisao_tipo: "devolvido",
    mensagens: [...(mensagensAnteriores ?? []), nova],
  });
}

export async function contestarViabilizacao(
  id: string,
  mensagem: string,
  usuarioNome: string,
  statusAtual: StatusViabilizacao,
  mensagensAnteriores?: MensagemViabilizacao[]
): Promise<void> {
  const nova: MensagemViabilizacao = { de: usuarioNome, tipo: "contestacao", texto: mensagem, data: new Date().toISOString() };
  await updateViabilizacao(id, {
    status: "em_revisao" as StatusViabilizacao,
    revisao_tipo: "contestado",
    status_anterior: statusAtual,
    mensagens: [...(mensagensAnteriores ?? []), nova],
  });
}

export async function reenviarParaAuditoria(
  id: string,
  resposta: string,
  usuarioNome: string,
  mensagensAnteriores?: MensagemViabilizacao[]
): Promise<void> {
  const nova: MensagemViabilizacao = { de: usuarioNome, tipo: "resposta", texto: resposta, data: new Date().toISOString() };
  await updateViabilizacao(id, {
    status: "em_auditoria" as StatusViabilizacao,
    mensagens: [...(mensagensAnteriores ?? []), nova],
  });
}

export async function manterDecisaoContestacao(
  id: string,
  resposta: string,
  auditorNome: string,
  statusOriginal: StatusViabilizacao,
  mensagensAnteriores?: MensagemViabilizacao[]
): Promise<void> {
  const nova: MensagemViabilizacao = { de: auditorNome, tipo: "resposta", texto: resposta, data: new Date().toISOString() };
  await updateViabilizacao(id, {
    status: statusOriginal,
    mensagens: [...(mensagensAnteriores ?? []), nova],
  });
}

export async function revisarContestacao(id: string): Promise<void> {
  await updateViabilizacao(id, { status: "em_auditoria" as StatusViabilizacao });
}

export async function corrigirDadosViabilizacao(
  id: string,
  dados: { nome_cliente?: string; tipo_instalacao?: TipoInstalacao; plus_code_cliente?: string }
): Promise<void> {
  await updateViabilizacao(id, dados as Partial<Viabilizacao>);
}

// =====================
// Consultas (Home)
// =====================

export async function getPrediosAtendidos(): Promise<PredioAtendido[]> {
  const q = query(collection(db, "predios_atendidos"), orderBy("data_estruturacao", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore<PredioAtendido>(d));
}

export async function getPrediosSemViabilidade(): Promise<PredioSemViabilidade[]> {
  const q = query(
    collection(db, "predios_sem_viabilidade"),
    orderBy("data_registro", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore<PredioSemViabilidade>(d));
}

// =====================
// Relatórios
// =====================

export async function getAllViabilizacoes(): Promise<Viabilizacao[]> {
  const snap = await getDocs(collection(db, "viabilizacoes"));
  return snap.docs.map((d) => fromFirestore<Viabilizacao>(d));
}

export async function atualizarObsAgendamento(id: string, obs: string): Promise<void> {
  await updateDoc(doc(db, "viabilizacoes", id), { obs_agendamento: obs });
}

// =====================
// Demandas de Rede
// =====================

export async function getDemandas(): Promise<DemandaRede[]> {
  const q = query(collection(db, "demandas_rede"), orderBy("data_criacao", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => fromFirestore<DemandaRede>(d));
}

export async function createDemanda(data: Omit<DemandaRede, "id">): Promise<void> {
  await addDoc(collection(db, "demandas_rede"), stripUndefined(data as Record<string, unknown>));
}

export async function updateDemanda(id: string, data: Partial<DemandaRede>): Promise<void> {
  await updateDoc(doc(db, "demandas_rede", id), stripUndefined(data as Record<string, unknown>));
}

export async function agendarDemanda(id: string, data: string, periodo: string): Promise<void> {
  await updateDemanda(id, { status: "em_andamento", data_agendamento: data, periodo_agendamento: periodo });
}

export async function concluirDemanda(id: string, obs?: string): Promise<void> {
  await updateDemanda(id, {
    status: "concluida",
    data_conclusao: new Date().toISOString(),
    obs_conclusao: obs ?? undefined,
  });
}

export async function getDemandasAgendadas(): Promise<DemandaRede[]> {
  const q = query(collection(db, "demandas_rede"), where("status", "==", "em_andamento"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<DemandaRede>(d))
    .sort((a, b) => {
      if ((a.data_agendamento ?? "") !== (b.data_agendamento ?? ""))
        return (a.data_agendamento ?? "") < (b.data_agendamento ?? "") ? -1 : 1;
      return (a.periodo_agendamento === "Manhã" ? 0 : 1) - (b.periodo_agendamento === "Manhã" ? 0 : 1);
    });
}

export async function avancarStatusDemanda(demanda: DemandaRede, obs?: string): Promise<void> {
  if (demanda.status !== "em_andamento") return;
  await concluirDemanda(demanda.id, obs);
}

export async function deleteDemanda(id: string): Promise<void> {
  await deleteDoc(doc(db, "demandas_rede", id));
}

export async function editarInfoDemanda(
  id: string,
  data: Pick<DemandaRede, "tipo" | "prioridade" | "descricao" | "local">,
): Promise<void> {
  await updateDoc(doc(db, "demandas_rede", id), stripUndefined(data as Record<string, unknown>));
}

export async function addNotaDemanda(id: string, texto: string, por: string): Promise<void> {
  const nota: NotaAtividade = { texto, por, data: new Date().toISOString() };
  await updateDoc(doc(db, "demandas_rede", id), { notas_atividade: arrayUnion(nota) });
}

export async function addNotaVisita(id: string, texto: string, por: string): Promise<void> {
  const nota: NotaAtividade = { texto, por, data: new Date().toISOString() };
  await updateDoc(doc(db, "viabilizacoes", id), { notas_visita: arrayUnion(nota) });
}
