import type { AppUser, Viabilizacao } from "@/types";

/** Quem está auditando (o id vai junto nas decisões para o histórico não depender do nome) */
export interface Auditor {
  nome: string;
  uid: string;
  adm: boolean;
}

/** O que toda parte do cartão recebe */
export interface PropsEtapa {
  v: Viabilizacao;
  auditor: Auditor;
  /** Avisa a página que algo foi gravado (mostra a mensagem no topo; a lista se atualiza sozinha) */
  onFeito: (msg: string) => void;
}

export type Tecnicos = AppUser[];

/** Motivos mais comuns de "Sem viabilidade" (ajudam a contar nos relatórios) */
export const MOTIVOS_SEM_VIAB = [
  "Sem CTO próxima",
  "CTO lotada",
  "Fora da área de cobertura",
  "Distância acima do limite",
  "Sinal (RX) fora do limite",
];

/** Limite de RX aceito sem aviso (dBm) */
export const RX_LIMITE = -27;

/** "-23,5" → -23.5; vazio/inválido → null */
export function lerRx(t: string): number | null {
  const n = parseFloat(t.replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Aviso do RX digitado (ou null se ok) */
export function avisoRx(t: string): string | null {
  const n = lerRx(t);
  if (n === null) return t.trim() ? "RX inválido." : null;
  if (n > 0) return "RX costuma ser negativo (ex.: -23,5).";
  if (n < RX_LIMITE) return `RX abaixo de ${RX_LIMITE} dBm: confira antes de viabilizar.`;
  return null;
}

export const STATUS_ANTERIOR: Record<string, string> = {
  rejeitado: "Sem viabilidade",
  utp: "UTP",
  aprovado: "Aprovado",
};
