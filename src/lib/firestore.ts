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
  writeBatch,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { enqueueNotificacao } from "./notificacoes";
import { deleteFotos } from "./cloudinary";
import type {
  Viabilizacao,
  PredioAtendido,
  PredioSemViabilidade,
  StatusViabilizacao,
  TipoInstalacao,
  MensagemViabilizacao,
  DemandaRede,
  BairroRede,
  StatusDemanda,
  PrioridadeDemanda,
  NotaAtividade,
} from "@/types";

// =====================
// Session cache — evita releituras a cada navegação
// =====================
const CACHE_TTL      = 5  * 60 * 1000; // 5 min  — queries filtradas
const CACHE_TTL_LONG = 15 * 60 * 1000; // 15 min — full scans (relatorios)

function getCached<T>(key: string, ttl = CACHE_TTL): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > ttl) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache<T>(key: string, data: T): void {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function bustCache(...keys: string[]): void {
  try { keys.forEach((k) => sessionStorage.removeItem(k)); } catch {}
}

// getViabilizacoesRelatorio cacheia por intervalo de datas (chave dinâmica) — não dá
// pra invalidar por nome exato, então limpamos qualquer entrada de relatório em cache.
function bustCacheRelatorios(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("viab_relatorio_")) sessionStorage.removeItem(key);
    }
  } catch {}
}

export function bustCacheAuditoria()    { bustCache("viab_audit_v1"); }
export function bustCacheResultados()   { bustCache("viab_user_v1"); }
export function bustCacheAgenda()       { bustCache("viab_agendamentos_v1", "viab_demandas_agendadas_v1"); }
export function bustCacheAgendaTecnica(){ bustCache("viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1"); }
export function bustCacheAnaliseRede()  { bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1"); }

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

// Normaliza DemandaRede: migra dados antigos com tecnico (string) para tecnicos (array)
function fromFirestoreDemanda(doc: { id: string; data(): Record<string, unknown> }): DemandaRede {
  const raw = fromFirestore<Record<string, unknown>>(doc);
  if (!raw.tecnicos && raw.tecnico) {
    raw.tecnicos = [raw.tecnico];
  }
  return raw as unknown as DemandaRede;
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
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
  void enqueueNotificacao(ref.id, "nova_viabilizacao");
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
  const cached = getCached<Viabilizacao[]>("viab_audit_v1");
  if (cached) return cached;
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
  const result = items
    .filter((v) => v.status_predio !== "agendado")
    .sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1;
    });
  setCache("viab_audit_v1", result);
  return result;
}

// Base compartilhada entre getViabilizacoesUsuario e getViabilizacoesHistorico
// — uma única query por sessão, cache de 5 min.
async function _fetchViabilizacoesUsuario(ids: string[]): Promise<Viabilizacao[]> {
  const cached = getCached<Viabilizacao[]>("viab_user_v1");
  if (cached) return cached;
  const q = query(collection(db, "viabilizacoes"), where("usuario", "in", ids));
  const snap = await getDocs(q);
  const data = snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .sort((a, b) => (a.data_solicitacao ?? "") > (b.data_solicitacao ?? "") ? -1 : 1);
  setCache("viab_user_v1", data);
  return data;
}

export async function getViabilizacoesUsuario(usernames: string[]): Promise<Viabilizacao[]> {
  const ids = [...new Set(usernames.filter(Boolean))];
  const all = await _fetchViabilizacoesUsuario(ids);
  return all.filter((v) => !v.data_finalizacao);
}

export async function getViabilizacoesHistorico(usernames: string[]): Promise<Viabilizacao[]> {
  const ids = [...new Set(usernames.filter(Boolean))];
  return _fetchViabilizacoesUsuario(ids);
}

export async function getAgendamentos(): Promise<Viabilizacao[]> {
  const cached = getCached<Viabilizacao[]>("viab_agendamentos_v1");
  if (cached) return cached;
  const q = query(
    collection(db, "viabilizacoes"),
    where("status_predio", "==", "agendado")
  );
  const snap = await getDocs(q);
  const data = snap.docs
    .map((d) => fromFirestore<Viabilizacao>(d))
    .filter((v) => v.status_agendamento === "pendente")
    .sort((a, b) => (a.data_visita ?? "") < (b.data_visita ?? "") ? -1 : 1);
  setCache("viab_agendamentos_v1", data);
  return data;
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
  await updateDoc(ref, { ...clean, status_atualizado_em: new Date().toISOString() });
  bustCache(
    "viab_all_viabilizacoes_v1",
    "viab_user_v1",
    "viab_instalacoes_pendentes_v1",
    "viab_instalacoes_arquivadas_v1",
    "viab_audit_v1",
    "viab_agendamentos_v1",
  );
  bustCacheRelatorios();
}

export async function pegarViabilizacao(id: string, auditor: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "em_auditoria",
    auditor_responsavel: auditor,
  });
}

export async function devolverViabilizacao(id: string): Promise<void> {
  await updateDoc(doc(db, "viabilizacoes", id), {
    status: "pendente",
    auditor_responsavel: null,
    status_atualizado_em: new Date().toISOString(),
  });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_agendamentos_v1");
}

export async function deleteViabilizacao(id: string): Promise<void> {
  await deleteDoc(doc(db, "viabilizacoes", id));
  await excluirDemandaEstrutura(id);
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
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
  void enqueueNotificacao(id, "aprovado");
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
  void enqueueNotificacao(id, "aprovado");
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
  void enqueueNotificacao(id, "rejeitado");
}

export async function marcarUTP(id: string, auditadoPor: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "utp",
    motivo_rejeicao: "Atendemos UTP",
    auditado_por: auditadoPor,
    data_auditoria: new Date().toISOString(),
  });
  await iniciarAgendamentoInstalacao(id);
  void enqueueNotificacao(id, "utp");
}

export async function finalizarViabilizacao(id: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "finalizado" as StatusViabilizacao,
    data_finalizacao: new Date().toISOString(),
  });
}

export async function arquivarPorDesistencia(id: string, obs?: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "finalizado" as StatusViabilizacao,
    motivo_desistencia: obs?.trim() || "Desistência do cliente",
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

// ─── Espelho em Análise de Rede das visitas de estruturação ────────
// Mantém uma demanda em "demandas_rede" sincronizada com o ciclo de vida
// da visita de estruturação de prédio/condomínio, só para visibilidade
// unificada — a origem e a agenda continuam sendo a própria Viabilizacao.
//
// Usa um ID determinístico (derivado do id da viabilização) em vez de
// addDoc: evita duplicar a demanda-espelho em chamadas concorrentes, já
// que o create-or-update roda dentro de uma transação sobre essa mesma
// referência. O fallback por query cobre espelhos legados criados com
// addDoc (ID aleatório) antes dessa mudança.
function mirrorDemandaId(viabilizacaoId: string): string {
  return `estrutura_${viabilizacaoId}`;
}

async function resolveDemandaEstruturaRef(viabilizacaoId: string) {
  const detRef = doc(db, "demandas_rede", mirrorDemandaId(viabilizacaoId));
  const detSnap = await getDoc(detRef);
  if (detSnap.exists()) return detRef;
  const legacySnap = await getDocs(query(collection(db, "demandas_rede"), where("viabilizacao_id", "==", viabilizacaoId)));
  return legacySnap.empty ? detRef : legacySnap.docs[0].ref;
}

async function sincronizarDemandaEstrutura(
  viabilizacaoId: string,
  info: {
    tecnico?: string;
    dataAgendamento: string;
    periodoAgendamento: string;
    predio?: string;
    localizacao?: string;
    obs?: string;
    criadoPor?: string;
    urgente?: boolean;
  }
): Promise<void> {
  const ref = await resolveDemandaEstruturaRef(viabilizacaoId);
  const tecnicos = info.tecnico ? [info.tecnico] : [];
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      tx.update(ref, stripUndefined({
        tecnicos,
        data_agendamento: info.dataAgendamento,
        periodo_agendamento: info.periodoAgendamento,
        status: "agendada" as StatusDemanda,
      }));
    } else {
      tx.set(ref, stripUndefined({
        tecnicos,
        tipo: "Estruturação de Rede",
        local: info.localizacao,
        prioridade: (info.urgente ? "alta" : "media") as PrioridadeDemanda,
        descricao: `Estruturação de rede — ${info.predio ?? "Prédio"}${info.obs ? `\n${info.obs}` : ""}`,
        status: "agendada" as StatusDemanda,
        criado_por: info.criadoPor ?? "Sistema",
        data_criacao: new Date().toISOString(),
        data_agendamento: info.dataAgendamento,
        periodo_agendamento: info.periodoAgendamento,
        viabilizacao_id: viabilizacaoId,
      }));
    }
  });
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

async function concluirDemandaEstrutura(viabilizacaoId: string, obs?: string): Promise<void> {
  const ref = await resolveDemandaEstruturaRef(viabilizacaoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, stripUndefined({
    status: "concluida" as StatusDemanda,
    data_conclusao: new Date().toISOString(),
    obs_conclusao: obs,
  }));
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

// Cascade ao excluir a viabilização — evita órfão preso em Análise de Rede
// (sem "Excluir"/"Cancelar" disponíveis para demandas-espelho na UI).
async function excluirDemandaEstrutura(viabilizacaoId: string): Promise<void> {
  const ref = await resolveDemandaEstruturaRef(viabilizacaoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await deleteDoc(ref);
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
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
  historicoAnterior?: string,
  contexto?: { predio?: string; localizacao?: string; criadoPor?: string; urgente?: boolean }
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
  await sincronizarDemandaEstrutura(id, {
    tecnico: dados.tecnico_responsavel,
    dataAgendamento: dados.data_visita,
    periodoAgendamento: dados.periodo_visita,
    predio: contexto?.predio,
    localizacao: contexto?.localizacao,
    obs: dados.obs_agendamento,
    criadoPor: contexto?.criadoPor,
    urgente: contexto?.urgente,
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
// Nota: chamado pelo cliente (role "usuario", sem permissão de escrita direta em demandas_rede) —
// o espelho em Análise de Rede é sincronizado via rota de API com Admin SDK (bypassa a regra do Firestore).
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
  void sincronizarDemandaEstruturaViaApi(id);
}

// O servidor lê o resto direto do documento (data/período/técnico já confirmados
// pelo updateViabilizacao acima) — o corpo da requisição não carrega esses campos
// para não depender de dados vindos do client em uma rota que roda com Admin SDK.
async function sincronizarDemandaEstruturaViaApi(viabilizacaoId: string): Promise<void> {
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    await fetch("/api/demandas-rede/sincronizar-estrutura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, viabilizacaoId }),
    });
  } catch {
    // Falha na sincronização não deve travar a confirmação do agendamento pelo cliente.
  }
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
    status_atualizado_em: new Date().toISOString(),
  });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
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
  await sincronizarDemandaEstrutura(id, {
    tecnico: novoTecnico,
    dataAgendamento: novaData,
    periodoAgendamento: novoPeriodo,
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
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
  await updateViabilizacao(id, {
    status: "aprovado" as StatusViabilizacao,
    status_predio: "estruturado",
    status_agendamento: "concluido",
    data_estruturacao: new Date().toISOString(),
  });
  await concluirDemandaEstrutura(id, dados.observacao);
  void enqueueNotificacao(id, "aprovado");
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
  bustCache("viab_predios_sem_viab_v1", "viab_predios_sem_viab_viabilizacoes_v1");
  // 2. Atualizar viabilização
  await updateViabilizacao(id, {
    status: "rejeitado",
    status_predio: "rejeitado",
    motivo_rejeicao: `Edifício sem viabilidade: ${observacao}`,
    data_auditoria: new Date().toISOString(),
    auditado_por: registradoPor,
  });
  await concluirDemandaEstrutura(id, `Sem viabilidade: ${observacao}`);
  void enqueueNotificacao(id, "rejeitado");
}

// =====================
// Agendamento Técnico (Instalação FTTH)
// =====================

// Retorna instalações ativas — FTTH + FTTA aprovação direta (sem visita estrutural) + UTP
export async function getInstalacoesPendentes(): Promise<Viabilizacao[]> {
  const cached = getCached<Viabilizacao[]>("viab_instalacoes_pendentes_v1");
  if (cached) return cached;
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
  const result = items
    .filter((v) => ["proposta_enviada", "aguardando_confirmacao", "agendado", "instalado"].includes(v.status_instalacao ?? ""))
    .filter((v) => !v.data_finalizacao)
    .sort((a, b) => (a.data_solicitacao ?? "") < (b.data_solicitacao ?? "") ? -1 : 1);
  setCache("viab_instalacoes_pendentes_v1", result);
  return result;
}

// Dispara quando FTTH é aprovado — habilita o usuário a propor data
export async function iniciarAgendamentoInstalacao(id: string): Promise<void> {
  await updateViabilizacao(id, { status_instalacao: "aguardando_proposta" });
}

// Usuário propõe data/período/obs ao setor de agendamento
export async function enviarPropostaInstalacao(
  id: string,
  dados: { proposta_data: string; proposta_periodo: string; proposta_obs?: string },
  historicoAnterior?: string,
  agChegouEmExistente?: string
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
    ...(!agChegouEmExistente ? { ag_chegou_em: new Date().toISOString() } : {}),
  });
  void enqueueNotificacao(id, "proposta_enviada");
}

// Setor de agendamento confirma (com ou sem alteração)
// Se confirmou sem alteração → agendado direto
// Se alterou data/período → aguarda confirmação do usuário
export async function confirmarAgendamentoTecnico(
  id: string,
  dados: { agendamento_data: string; agendamento_periodo: string; agendamento_obs?: string },
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
      data_instalacao: dados.agendamento_data,
      periodo_instalacao: dados.agendamento_periodo,
      historico_agendamento: historico,
    });
    void enqueueNotificacao(id, "agendado");
  } else {
    await updateViabilizacao(id, {
      status_instalacao: "aguardando_confirmacao",
      agendamento_data: dados.agendamento_data,
      agendamento_periodo: dados.agendamento_periodo,
      ...(dados.agendamento_obs !== undefined ? { agendamento_obs: dados.agendamento_obs } : {}),
      historico_agendamento: historico,
    });
    void enqueueNotificacao(id, "aguardando_confirmacao");
  }
}

// Usuário confirma a proposta do agendamento (com alterações)
export async function confirmarPropostaUsuario(
  id: string,
  dados: { agendamento_data: string; agendamento_periodo: string },
  historicoAnterior?: string
): Promise<void> {
  const historico = `${historicoAnterior ?? ""}\nUsuário confirmou ${dados.agendamento_data} ${dados.agendamento_periodo}`;
  await updateViabilizacao(id, {
    status_instalacao: "agendado",
    data_instalacao: dados.agendamento_data,
    periodo_instalacao: dados.agendamento_periodo,
    historico_agendamento: historico,
  });
  void enqueueNotificacao(id, "agendado");
}

export async function atribuirTecnicoInstalacao(id: string, tecnico: string): Promise<void> {
  await updateViabilizacao(id, { tecnico_instalacao: tecnico });
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
  void enqueueNotificacao(id, "instalado");
}

// Desfaz o "marcar como instalado" feito por engano, voltando para agendado
export async function desfazerInstalado(id: string): Promise<void> {
  await updateViabilizacao(id, { status_instalacao: "agendado" });
}

// Arquivadas da Agenda Técnica: FTTH + FTTA direto
export async function getInstalacoesArquivadas(): Promise<Viabilizacao[]> {
  const cached = getCached<Viabilizacao[]>("viab_instalacoes_arquivadas_v1");
  if (cached) return cached;
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "FTTH"), where("status", "==", "finalizado"))),
    getDocs(query(collection(db, "viabilizacoes"), where("tipo_instalacao", "==", "Prédio"), where("status", "==", "finalizado"))),
  ]);
  const items = [
    ...snap1.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !!v.status_instalacao),
    ...snap2.docs.map((d) => fromFirestore<Viabilizacao>(d)).filter((v) => !!v.status_instalacao && !v.status_predio),
  ];
  const result = items.sort((a, b) => ((b.data_finalizacao ?? b.data_solicitacao ?? "") > (a.data_finalizacao ?? a.data_solicitacao ?? "") ? 1 : -1));
  setCache("viab_instalacoes_arquivadas_v1", result);
  return result;
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
  void enqueueNotificacao(id, "contestacao");
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

// Auditor reabre uma viabilidade já aprovada por engano, para corrigir os dados.
// Desfaz também o agendamento de instalação que já tenha sido iniciado a partir dela.
export async function reabrirAprovacao(
  id: string,
  motivo: string,
  auditorNome: string,
  mensagensAnteriores?: MensagemViabilizacao[]
): Promise<void> {
  const nova: MensagemViabilizacao = { de: auditorNome, tipo: "auditoria", texto: motivo, data: new Date().toISOString() };
  await updateDoc(doc(db, "viabilizacoes", id), {
    status: "em_auditoria",
    revisao_tipo: "reaberto",
    status_anterior: "aprovado",
    mensagens: [...(mensagensAnteriores ?? []), nova],
    status_instalacao: deleteField(),
    proposta_data: deleteField(),
    proposta_periodo: deleteField(),
    proposta_obs: deleteField(),
    agendamento_data: deleteField(),
    agendamento_periodo: deleteField(),
    agendamento_tecnico: deleteField(),
    agendamento_obs: deleteField(),
    data_instalacao: deleteField(),
    periodo_instalacao: deleteField(),
    tecnico_instalacao: deleteField(),
    historico_agendamento: deleteField(),
    status_atualizado_em: new Date().toISOString(),
  });
  bustCache(
    "viab_all_viabilizacoes_v1", "viab_user_v1", "viab_instalacoes_pendentes_v1",
    "viab_instalacoes_arquivadas_v1", "viab_audit_v1", "viab_agendamentos_v1",
  );
  bustCacheRelatorios();
  void enqueueNotificacao(id, "reaberto");
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
  const cached = getCached<PredioAtendido[]>("viab_predios_atendidos_v1");
  if (cached) return cached;
  const q = query(collection(db, "predios_atendidos"), orderBy("data_estruturacao", "desc"));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => fromFirestore<PredioAtendido>(d));
  setCache("viab_predios_atendidos_v1", data);
  return data;
}

export async function createPredioAtendido(
  data: Omit<PredioAtendido, "id" | "data_estruturacao">
): Promise<void> {
  await addDoc(collection(db, "predios_atendidos"), {
    ...stripUndefined(data as Record<string, unknown>),
    data_estruturacao: serverTimestamp(),
  });
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
}

export async function updatePredioAtendido(
  id: string,
  data: Partial<Omit<PredioAtendido, "id">>
): Promise<void> {
  await updateDoc(doc(db, "predios_atendidos", id), stripUndefined(data as Record<string, unknown>));
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
}

export async function deletePredioAtendido(id: string): Promise<void> {
  await deleteDoc(doc(db, "predios_atendidos", id));
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
}

export async function batchImportViabilizacoes(
  items: Viabilizacao[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    items.slice(i, i + CHUNK).forEach((item) => {
      const { id, ...data } = item;
      const ref = doc(db, "viabilizacoes", id);
      batch.set(ref, stripUndefined(data as Record<string, unknown>));
    });
    await batch.commit();
    onProgress?.(Math.min(i + CHUNK, items.length), items.length);
  }
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
}

export async function deleteAllPrediosAtendidos(): Promise<void> {
  const snap = await getDocs(collection(db, "predios_atendidos"));
  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
}

export async function batchCreatePrediosAtendidos(
  items: Omit<PredioAtendido, "id" | "data_estruturacao">[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    items.slice(i, i + CHUNK).forEach((item) => {
      const ref = doc(collection(db, "predios_atendidos"));
      batch.set(ref, { ...stripUndefined(item as Record<string, unknown>), data_estruturacao: serverTimestamp() });
    });
    await batch.commit();
    onProgress?.(Math.min(i + CHUNK, items.length), items.length);
  }
  bustCache("viab_predios_atendidos_v1", "viab_predios_estruturados_v1");
}

export async function getPrediosSemViabilidade(): Promise<PredioSemViabilidade[]> {
  const cached = getCached<PredioSemViabilidade[]>("viab_predios_sem_viab_v1");
  if (cached) return cached;
  const q = query(
    collection(db, "predios_sem_viabilidade"),
    orderBy("data_registro", "desc")
  );
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => fromFirestore<PredioSemViabilidade>(d));
  setCache("viab_predios_sem_viab_v1", data);
  return data;
}

export async function createPredioSemViabilidade(
  data: Omit<PredioSemViabilidade, "id" | "data_registro">
): Promise<void> {
  await addDoc(collection(db, "predios_sem_viabilidade"), {
    ...stripUndefined(data as Record<string, unknown>),
    data_registro: serverTimestamp(),
  });
  bustCache("viab_predios_sem_viab_v1", "viab_predios_sem_viab_viabilizacoes_v1");
}

export async function updatePredioSemViabilidade(
  id: string,
  data: Partial<Omit<PredioSemViabilidade, "id">>
): Promise<void> {
  await updateDoc(doc(db, "predios_sem_viabilidade", id), stripUndefined(data as Record<string, unknown>));
  bustCache("viab_predios_sem_viab_v1", "viab_predios_sem_viab_viabilizacoes_v1");
}

export async function deletePredioSemViabilidade(id: string): Promise<void> {
  await deleteDoc(doc(db, "predios_sem_viabilidade", id));
  bustCache("viab_predios_sem_viab_v1", "viab_predios_sem_viab_viabilizacoes_v1");
}

// =====================
// Relatórios
// =====================

export async function getAllViabilizacoes(): Promise<Viabilizacao[]> {
  const cached = getCached<Viabilizacao[]>("viab_all_viabilizacoes_v1", CACHE_TTL_LONG);
  if (cached) return cached;
  const snap = await getDocs(collection(db, "viabilizacoes"));
  const data = snap.docs.map((d) => fromFirestore<Viabilizacao>(d));
  setCache("viab_all_viabilizacoes_v1", data);
  return data;
}

export async function getViabilizacoesRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<Viabilizacao[]> {
  const cacheKey = `viab_relatorio_${dataInicio}_${dataFim}_v1`;
  const cached = getCached<Viabilizacao[]>(cacheKey);
  if (cached) return cached;

  const fim = dataFim + "T23:59:59";

  // Query 1: auditadas no período (aprovadas, rejeitadas, utp)
  const qAuditoria = query(
    collection(db, "viabilizacoes"),
    where("data_auditoria", ">=", dataInicio),
    where("data_auditoria", "<=", fim)
  );
  // Query 2: finalizadas/instaladas no período cujo audit foi antes do período
  const qFinalizacao = query(
    collection(db, "viabilizacoes"),
    where("data_finalizacao", ">=", dataInicio),
    where("data_finalizacao", "<=", fim)
  );

  const [snap1, snap2] = await Promise.all([getDocs(qAuditoria), getDocs(qFinalizacao)]);
  const seen = new Set<string>();
  const data: Viabilizacao[] = [];
  for (const d of [...snap1.docs, ...snap2.docs]) {
    if (!seen.has(d.id)) { seen.add(d.id); data.push(fromFirestore<Viabilizacao>(d)); }
  }
  setCache(cacheKey, data);
  return data;
}

export async function getPrediosAtendidosRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<PredioAtendido[]> {
  const cacheKey = `viab_atendidos_relatorio_${dataInicio}_${dataFim}_v1`;
  const cached = getCached<PredioAtendido[]>(cacheKey);
  if (cached) return cached;
  const q = query(
    collection(db, "predios_atendidos"),
    where("data_estruturacao", ">=", Timestamp.fromDate(new Date(dataInicio))),
    where("data_estruturacao", "<=", Timestamp.fromDate(new Date(dataFim + "T23:59:59"))),
    orderBy("data_estruturacao", "desc")
  );
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => fromFirestore<PredioAtendido>(d));
  setCache(cacheKey, data);
  return data;
}

export async function getPrediosSemViabilidadeRelatorio(
  dataInicio: string,
  dataFim: string
): Promise<PredioSemViabilidade[]> {
  const cacheKey = `viab_sem_viab_relatorio_${dataInicio}_${dataFim}_v1`;
  const cached = getCached<PredioSemViabilidade[]>(cacheKey);
  if (cached) return cached;
  const q = query(
    collection(db, "predios_sem_viabilidade"),
    where("data_registro", ">=", Timestamp.fromDate(new Date(dataInicio))),
    where("data_registro", "<=", Timestamp.fromDate(new Date(dataFim + "T23:59:59"))),
    orderBy("data_registro", "desc")
  );
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => fromFirestore<PredioSemViabilidade>(d));
  setCache(cacheKey, data);
  return data;
}

export async function arquivarViabilizacao(id: string): Promise<void> {
  await updateViabilizacao(id, {
    status: "finalizado",
    data_finalizacao: new Date().toISOString(),
  });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
}

export { deleteViabilizacao as excluirViabilizacao };

export async function atualizarObsAgendamento(id: string, obs: string): Promise<void> {
  await updateDoc(doc(db, "viabilizacoes", id), { obs_agendamento: obs });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1", "viab_agendamentos_v1");
}

// =====================
// Demandas de Rede
// =====================

export async function getDemandas(): Promise<DemandaRede[]> {
  const cached = getCached<DemandaRede[]>("viab_demandas_rede_v1");
  if (cached) return cached;
  const q = query(collection(db, "demandas_rede"), orderBy("data_criacao", "desc"));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => fromFirestoreDemanda(d));
  setCache("viab_demandas_rede_v1", data);
  return data;
}

export async function createDemanda(data: Omit<DemandaRede, "id">): Promise<void> {
  await addDoc(collection(db, "demandas_rede"), stripUndefined(data as Record<string, unknown>));
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

export async function updateDemanda(id: string, data: Partial<DemandaRede>): Promise<void> {
  const payload = stripUndefined(data as Record<string, unknown>);
  if (Array.isArray(data.foto_urls) && data.foto_urls.length === 0) payload.foto_urls = deleteField();
  await updateDoc(doc(db, "demandas_rede", id), payload);
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

export async function agendarDemanda(id: string, data: string, periodo: string): Promise<void> {
  await updateDemanda(id, { status: "agendada", data_agendamento: data, periodo_agendamento: periodo });
}

export async function continuarDemanda(
  id: string, dataAnterior: string, novaData: string, periodo: string, por: string,
): Promise<void> {
  const nota: NotaAtividade = {
    texto: `Serviço iniciado em ${formatDateBR(dataAnterior)} — continua em ${formatDateBR(novaData)}.`,
    por,
    data: new Date().toISOString(),
  };
  await updateDoc(doc(db, "demandas_rede", id), {
    status: "em_andamento",
    data_agendamento: novaData,
    periodo_agendamento: periodo,
    notas_atividade: arrayUnion(nota),
  });
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1");
}

function formatDateBR(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

export async function concluirDemanda(id: string, obs?: string): Promise<void> {
  await updateDemanda(id, {
    status: "concluida",
    data_conclusao: new Date().toISOString(),
    obs_conclusao: obs ?? undefined,
  });
}

export async function getDemandasAgendadas(): Promise<DemandaRede[]> {
  const cached = getCached<DemandaRede[]>("viab_demandas_agendadas_v1");
  if (cached) return cached;
  const q = query(collection(db, "demandas_rede"), where("status", "in", ["agendada", "em_andamento"]));
  const snap = await getDocs(q);
  const data = snap.docs
    .map((d) => fromFirestoreDemanda(d))
    // Espelhos de visita de estruturação já aparecem na Agenda como item de Viabilização — evita duplicidade
    .filter((d) => !d.viabilizacao_id)
    .sort((a, b) => {
      if ((a.data_agendamento ?? "") !== (b.data_agendamento ?? ""))
        return (a.data_agendamento ?? "") < (b.data_agendamento ?? "") ? -1 : 1;
      const periodoOrder = (p?: string) => p === "Manhã" ? 0 : p === "Tarde" ? 1 : p === "Noturno" ? 2 : 3;
      return periodoOrder(a.periodo_agendamento) - periodoOrder(b.periodo_agendamento);
    });
  setCache("viab_demandas_agendadas_v1", data);
  return data;
}

export async function avancarStatusDemanda(demanda: DemandaRede, obs?: string): Promise<void> {
  if (demanda.status !== "agendada" && demanda.status !== "em_andamento") return;
  await concluirDemanda(demanda.id, obs);
}

export async function deleteDemanda(id: string, fotoUrls?: string[]): Promise<void> {
  if (fotoUrls && fotoUrls.length > 0) await deleteFotos(fotoUrls);
  await deleteDoc(doc(db, "demandas_rede", id));
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

export async function getDemandasArquivadas(): Promise<DemandaRede[]> {
  const cached = getCached<DemandaRede[]>("viab_demandas_arquivadas_v1");
  if (cached) return cached;
  const q = query(collection(db, "demandas_rede"), where("status", "==", "arquivada"));
  const snap = await getDocs(q);
  const data = snap.docs
    .map((d) => fromFirestoreDemanda(d))
    .sort((a, b) =>
      (b.data_conclusao ?? b.data_criacao) > (a.data_conclusao ?? a.data_criacao) ? 1 : -1
    );
  setCache("viab_demandas_arquivadas_v1", data);
  return data;
}

export async function arquivarDemanda(id: string): Promise<void> {
  await updateDemanda(id, { status: "arquivada" });
}

export async function desarquivarDemanda(id: string): Promise<void> {
  await updateDemanda(id, { status: "concluida" });
}

export async function reabrirDemanda(id: string): Promise<void> {
  await updateDoc(doc(db, "demandas_rede", id), {
    status: "aberta",
    data_agendamento: deleteField(),
    periodo_agendamento: deleteField(),
    data_conclusao: deleteField(),
    obs_conclusao: deleteField(),
  });
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1", "viab_demandas_arquivadas_v1");
}

export async function editarInfoDemanda(
  id: string,
  data: Pick<DemandaRede, "tipo" | "prioridade" | "descricao" | "local" | "tecnicos">,
): Promise<void> {
  await updateDoc(doc(db, "demandas_rede", id), stripUndefined(data as Record<string, unknown>));
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1");
}

export async function addNotaDemanda(id: string, texto: string, por: string): Promise<void> {
  const nota: NotaAtividade = { texto, por, data: new Date().toISOString() };
  await updateDoc(doc(db, "demandas_rede", id), { notas_atividade: arrayUnion(nota) });
  bustCache("viab_demandas_rede_v1", "viab_demandas_agendadas_v1");
}

export async function addNotaVisita(id: string, texto: string, por: string): Promise<void> {
  const nota: NotaAtividade = { texto, por, data: new Date().toISOString() };
  await updateDoc(doc(db, "viabilizacoes", id), { notas_visita: arrayUnion(nota) });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1", "viab_agendamentos_v1");
}

export async function deletarTrajeto(id: string): Promise<void> {
  await updateDoc(doc(db, "viabilizacoes", id), {
    trajeto_cabo: deleteField(),
    trajeto_expira_em: deleteField(),
  });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
}

export async function salvarTrajeto(id: string, pontos: [number, number][]): Promise<void> {
  const expira = new Date();
  expira.setDate(expira.getDate() + 7);
  await updateDoc(doc(db, "viabilizacoes", id), {
    trajeto_cabo: pontos.map(([lat, lon]) => ({ lat, lon })),
    trajeto_expira_em: expira.toISOString(),
  });
  bustCache("viab_all_viabilizacoes_v1", "viab_user_v1", "viab_audit_v1", "viab_instalacoes_pendentes_v1", "viab_instalacoes_arquivadas_v1");
}

// =====================
// Bairros de Rede
// =====================

export async function getBairros(): Promise<BairroRede[]> {
  const cached = getCached<BairroRede[]>("viab_bairros_rede_v1");
  if (cached) return cached;
  const q = query(collection(db, "bairros_rede"), orderBy("nome", "asc"));
  const snap = await getDocs(q);
  const data = snap.docs.map((d) => ({ id: d.id, nome: d.data().nome as string }));
  setCache("viab_bairros_rede_v1", data);
  return data;
}

export async function createBairro(nome: string): Promise<void> {
  await addDoc(collection(db, "bairros_rede"), { nome: nome.trim() });
  bustCache("viab_bairros_rede_v1");
}

export async function renameBairro(id: string, nome: string): Promise<void> {
  await updateDoc(doc(db, "bairros_rede", id), { nome: nome.trim() });
  bustCache("viab_bairros_rede_v1");
}

export async function deleteBairro(id: string): Promise<void> {
  await deleteDoc(doc(db, "bairros_rede", id));
  bustCache("viab_bairros_rede_v1");
}
