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
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Viabilizacao,
  PredioAtendido,
  PredioSemViabilidade,
  StatusViabilizacao,
} from "@/types";

// =====================
// Helpers
// =====================

// Remove campos undefined/null antes de enviar ao Firestore
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
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
  const q = query(
    collection(db, "viabilizacoes"),
    where("status", "==", "em_auditoria"),
    where("auditor_responsavel", "==", auditorNome)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
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
    obs_agendamento?: string;
  }
): Promise<void> {
  await updateViabilizacao(id, {
    status_predio: "pronto_auditoria",
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
  }
): Promise<void> {
  await updateViabilizacao(id, {
    status_predio: "agendado",
    status_agendamento: "pendente",
    data_agendamento: new Date().toISOString(),
    ...dados,
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
  // 1. Registrar em predios_atendidos
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
  // 2. Atualizar viabilização
  await updateViabilizacao(id, {
    status: "finalizado" as StatusViabilizacao,
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
