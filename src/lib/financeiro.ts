import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  TipoServicoFinanceiro,
  ServicoFinanceiro,
  FechamentoPagamento,
} from "@/types";

// =====================
// Session cache
// =====================
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache<T>(key: string, data: T): void {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function bustCache(...keys: string[]): void {
  try { keys.forEach((k) => sessionStorage.removeItem(k)); } catch {}
}

// =====================
// Tipos de serviço (tabela de preços)
// =====================
const TIPOS_SERVICO_CACHE_KEY = "viab_tipos_servico_financeiro_v1";

export async function listTiposServico(): Promise<TipoServicoFinanceiro[]> {
  const cached = getCached<TipoServicoFinanceiro[]>(TIPOS_SERVICO_CACHE_KEY);
  if (cached) return cached;
  const q = query(collection(db, "tipos_servico_financeiro"), orderBy("nome", "asc"));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TipoServicoFinanceiro));
  setCache(TIPOS_SERVICO_CACHE_KEY, data);
  return data;
}

export async function createTipoServico(nome: string, valor: number): Promise<void> {
  await addDoc(collection(db, "tipos_servico_financeiro"), { nome: nome.trim(), valor, ativo: true });
  bustCache(TIPOS_SERVICO_CACHE_KEY);
}

export async function updateTipoServico(
  id: string,
  data: { nome?: string; valor?: number; ativo?: boolean }
): Promise<void> {
  await updateDoc(doc(db, "tipos_servico_financeiro", id), data);
  bustCache(TIPOS_SERVICO_CACHE_KEY);
}

export async function deleteTipoServico(id: string): Promise<void> {
  await deleteDoc(doc(db, "tipos_servico_financeiro", id));
  bustCache(TIPOS_SERVICO_CACHE_KEY);
}

// =====================
// Serviços prestados
// =====================
export async function criarServicoFinanceiro(data: {
  tecnico_uid: string;
  tecnico_nome: string;
  tipo_servico_id: string;
  tipo_servico_nome: string;
  valor: number;
  cliente: string;
  endereco: string;
  data_servico: string;
  foto_urls?: string[];
  observacoes?: string;
}): Promise<void> {
  await addDoc(collection(db, "servicos_financeiro"), {
    ...data,
    status: "pendente_auditoria",
    criado_em: new Date().toISOString(),
  });
}

export async function listServicosPorTecnico(uid: string): Promise<ServicoFinanceiro[]> {
  const q = query(collection(db, "servicos_financeiro"), where("tecnico_uid", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ServicoFinanceiro))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export async function listServicosPendentesAuditoria(): Promise<ServicoFinanceiro[]> {
  const q = query(collection(db, "servicos_financeiro"), where("status", "==", "pendente_auditoria"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ServicoFinanceiro))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export async function listServicosAuditadosPor(uid: string): Promise<ServicoFinanceiro[]> {
  const q = query(collection(db, "servicos_financeiro"), where("auditado_por", "==", uid));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ServicoFinanceiro))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
}

export async function listServicosAprovadosNaoPagos(): Promise<ServicoFinanceiro[]> {
  const q = query(collection(db, "servicos_financeiro"), where("status", "==", "aprovado"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ServicoFinanceiro))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export async function auditarServico(
  id: string,
  status: "aprovado" | "rejeitado",
  auditorUid: string,
  motivo?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    auditado_por: auditorUid,
    data_auditoria: new Date().toISOString(),
  };
  if (status === "rejeitado" && motivo) updates.motivo_rejeicao = motivo;
  await updateDoc(doc(db, "servicos_financeiro", id), updates);
}

// =====================
// Fechamento de pagamento mensal
// =====================
export async function fecharPagamentoMensal(params: {
  tecnico_uid: string;
  tecnico_nome: string;
  mes_referencia: string;
  servicos: { id: string; valorFinal: number }[];
  fechado_por: string;
}): Promise<void> {
  const { tecnico_uid, tecnico_nome, mes_referencia, servicos, fechado_por } = params;
  const batch = writeBatch(db);
  const fechamentoRef = doc(collection(db, "fechamentos_pagamento"));
  const total = servicos.reduce((sum, s) => sum + s.valorFinal, 0);
  const dataFechamento = new Date().toISOString();

  batch.set(fechamentoRef, {
    tecnico_uid,
    tecnico_nome,
    mes_referencia,
    total,
    servicos_ids: servicos.map((s) => s.id),
    fechado_por,
    data_fechamento: dataFechamento,
  } satisfies Omit<FechamentoPagamento, "id">);

  for (const s of servicos) {
    const servicoRef = doc(db, "servicos_financeiro", s.id);
    batch.update(servicoRef, {
      status: "pago",
      valor_ajustado: s.valorFinal,
      fechamento_id: fechamentoRef.id,
      pago_em: dataFechamento,
    });
  }

  await batch.commit();
}

export async function listFechamentos(tecnicoUid?: string): Promise<FechamentoPagamento[]> {
  const base = collection(db, "fechamentos_pagamento");
  const q = tecnicoUid ? query(base, where("tecnico_uid", "==", tecnicoUid)) : query(base, orderBy("data_fechamento", "desc"));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as FechamentoPagamento));
  return tecnicoUid ? data.sort((a, b) => b.data_fechamento.localeCompare(a.data_fechamento)) : data;
}
