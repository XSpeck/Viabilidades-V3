import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { deleteFotos } from "./cloudinary";
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
  data_servico: string;
  observacoes: string;
  foto_urls?: string[];
  reenviado_de?: string;
}): Promise<void> {
  const { foto_urls, reenviado_de, ...resto } = data;
  const payload: Record<string, unknown> = {
    ...resto,
    status: "pendente_auditoria",
    criado_em: new Date().toISOString(),
  };
  if (foto_urls) payload.foto_urls = foto_urls;
  if (reenviado_de) payload.reenviado_de = reenviado_de;
  await addDoc(collection(db, "servicos_financeiro"), payload);
}

/** Só deve ser chamado enquanto o servico ainda estiver "pendente_auditoria" (garantido pela UI). */
export async function updateServicoFinanceiro(
  id: string,
  data: {
    tipo_servico_id: string;
    tipo_servico_nome: string;
    valor: number;
    cliente: string;
    data_servico: string;
    foto_urls: string[];
    observacoes: string;
  }
): Promise<void> {
  await updateDoc(doc(db, "servicos_financeiro", id), {
    tipo_servico_id: data.tipo_servico_id,
    tipo_servico_nome: data.tipo_servico_nome,
    valor: data.valor,
    cliente: data.cliente,
    data_servico: data.data_servico,
    foto_urls: data.foto_urls.length > 0 ? data.foto_urls : deleteField(),
    observacoes: data.observacoes.trim(),
  });
}

export async function deleteServicoFinanceiro(id: string, fotoUrls?: string[]): Promise<void> {
  if (fotoUrls && fotoUrls.length > 0) await deleteFotos(fotoUrls);
  await deleteDoc(doc(db, "servicos_financeiro", id));
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

export async function listServicosPagos(): Promise<ServicoFinanceiro[]> {
  const q = query(collection(db, "servicos_financeiro"), where("status", "==", "pago"));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ServicoFinanceiro))
    .sort((a, b) => (b.pago_em ?? "").localeCompare(a.pago_em ?? ""));
}

export async function atualizarNumeroOS(id: string, numeroOS: string): Promise<void> {
  const valor = numeroOS.trim();
  await updateDoc(doc(db, "servicos_financeiro", id), valor ? { numero_os: valor } : { numero_os: deleteField() });
}

const STATUS_LABEL_CURTO: Record<string, string> = {
  pendente_auditoria: "pendente",
  aprovado: "aprovado",
  rejeitado: "rejeitado",
  pago: "pago",
};

/** Usa transação para evitar que dois auditores sobrescrevam a decisão um do outro ao processar o mesmo serviço em paralelo. */
export async function auditarServico(
  id: string,
  status: "aprovado" | "rejeitado",
  auditorUid: string,
  auditorNome: string,
  nota?: string
): Promise<void> {
  const ref = doc(db, "servicos_financeiro", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Serviço não encontrado — pode ter sido excluído.");
    const statusAtual = snap.data().status as string;
    if (statusAtual !== "pendente_auditoria") {
      throw new Error(`Este serviço já foi auditado por outro usuário (status atual: ${STATUS_LABEL_CURTO[statusAtual] ?? statusAtual}).`);
    }
    const updates: Record<string, unknown> = {
      status,
      auditado_por: auditorUid,
      auditado_por_nome: auditorNome,
      data_auditoria: new Date().toISOString(),
    };
    if (status === "rejeitado" && nota) updates.motivo_rejeicao = nota;
    if (status === "aprovado" && nota) updates.observacao_auditoria = nota;
    tx.update(ref, updates);
  });
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
