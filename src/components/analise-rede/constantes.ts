import type { PrioridadeDemanda } from "@/types";

export const MAX_FOTOS_DEMANDA = 4;

// ── Constantes ────────────────────────────────────────────
export const TIPOS_SERVICO = [
  "Troca de Splitter",
  "Melhoria de Sinal",
  "Lançamento de Fibra",
  "Manutenção CTO",
  "Readequação",
  "Mutirão",
  "Migração",
  "Outro",
];

export const PRIORIDADE_LABEL: Record<PrioridadeDemanda, string> = {
  baixa:   "Baixa",
  media:   "Média",
  alta:    "Alta",
  urgente: "Urgente",
};

export const PRIORIDADE_COLOR: Record<PrioridadeDemanda, string> = {
  baixa:   "bg-gray-100 text-gray-600",
  media:   "bg-blue-100 text-blue-700",
  alta:    "bg-orange-100 text-orange-700",
  urgente: "bg-red-100 text-red-700",
};

export const STATUS_LABEL: Record<string, string> = {
  aberta:       "🔴 Aberta",
  agendada:     "📅 Agendada",
  em_andamento: "🟡 Em andamento",
  concluida:    "✅ Concluída",
};

export const STATUS_COLOR: Record<string, string> = {
  aberta:       "bg-red-100 text-red-700",
  agendada:     "bg-indigo-100 text-indigo-700",
  em_andamento: "bg-yellow-100 text-yellow-700",
  concluida:    "bg-green-100 text-green-700",
};

/** Cor de cada técnico, sempre a mesma para o mesmo nome (sem lista fixa de nomes) */
export let ORDEM_TECNICOS: string[] = [];
const CORES_TECNICO = ["bg-blue-500", "bg-green-600", "bg-orange-500", "bg-purple-600", "bg-pink-500", "bg-teal-500", "bg-amber-500", "bg-sky-600", "bg-rose-600", "bg-lime-600"];
/** As mesmas cores em hex (para o mapa) */
const CORES_TECNICO_HEX = ["#3b82f6", "#16a34a", "#f97316", "#9333ea", "#ec4899", "#14b8a6", "#f59e0b", "#0284c7", "#e11d48", "#65a30d"];

function indiceTecnico(nome: string): number {
  const i = ORDEM_TECNICOS.indexOf(nome);
  if (i >= 0) return i % CORES_TECNICO.length;
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % CORES_TECNICO.length;
}
export const corTecnicoHex = (nome: string) => CORES_TECNICO_HEX[indiceTecnico(nome)];
/** A página informa a lista de técnicos: cada um ganha uma cor diferente, na ordem do cadastro */
export function registrarTecnicos(lista: string[]): void {
  ORDEM_TECNICOS = lista;
}
export function corTecnico(nome: string): string {
  return CORES_TECNICO[indiceTecnico(nome)];
}

// ── Prazos e ordem da lista ──────────────────────────────

/** "AAAA-MM-DD" de hoje, no fuso do navegador */
export function hojeIso(agora = new Date()): string {
  const d = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

/** Dias de atraso de uma demanda agendada/em andamento com data já passada (0 = em dia) */
export function diasAtraso(d: { status: string; data_agendamento?: string }, hoje: string): number {
  if (!d.data_agendamento || !["agendada", "em_andamento"].includes(d.status)) return 0;
  if (d.data_agendamento >= hoje) return 0;
  return Math.round((Date.parse(hoje) - Date.parse(d.data_agendamento)) / 86400000);
}

const PESO_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const PESO_PERIODO = (p?: string) => (p === "Manhã" ? 0 : p === "Tarde" ? 1 : p === "Noturno" ? 2 : 3);

/** Atrasadas → agendadas/em andamento por data → abertas por prioridade → concluídas (mais recente primeiro) */
export function ordenarDemandas<T extends { status: string; prioridade: string; data_criacao: string; data_agendamento?: string; periodo_agendamento?: string; data_conclusao?: string }>(lista: T[], hoje: string): T[] {
  const grupo = (d: T) => (diasAtraso(d, hoje) > 0 ? 0 : d.status === "agendada" || d.status === "em_andamento" ? 1 : d.status === "aberta" ? 2 : 3);
  return [...lista].sort((a, b) => {
    const ga = grupo(a), gb = grupo(b);
    if (ga !== gb) return ga - gb;
    if (ga <= 1) return (a.data_agendamento ?? "").localeCompare(b.data_agendamento ?? "") || PESO_PERIODO(a.periodo_agendamento) - PESO_PERIODO(b.periodo_agendamento);
    if (ga === 2) return (PESO_PRIORIDADE[a.prioridade] ?? 9) - (PESO_PRIORIDADE[b.prioridade] ?? 9) || a.data_criacao.localeCompare(b.data_criacao);
    return (b.data_conclusao ?? "").localeCompare(a.data_conclusao ?? "");
  });
}
