// =====================
// Cabos: capacidade e o que vai em cada fibra.
// O uso das fibras vem automaticamente das rotas salvas (cabo + fibra de cada trecho);
// o ADM completa à mão o resto (fibras reservadas, rompidas, usadas por algo fora das rotas).
// =====================
import type { RotaOptica } from "./rotaOptica";

export type StatusFibra = "livre" | "uso" | "reservada" | "rompida";

export const STATUS_FIBRA_LABEL: Record<StatusFibra, string> = {
  livre: "Livre",
  uso: "Em uso",
  reservada: "Reservada",
  rompida: "Rompida",
};

export interface FibraCabo {
  numero: number;
  status: StatusFibra;
  descricao?: string;
}

export interface CaboRede {
  id: string;
  chave: string;
  nome: string;
  capacidade?: number;
  /** Só as fibras anotadas à mão (as demais seguem as rotas ou ficam livres) */
  fibras: FibraCabo[];
  obs?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export const CAPACIDADES = [2, 4, 6, 12, 24, 36, 48, 72, 96, 144, 288] as const;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function chaveCabo(nome: string): string {
  return normalizar(nome);
}

export function idCabo(chave: string): string {
  return chave.replace(/[\/#?\[\]*.\s:]+/g, "_").slice(0, 300);
}

/** Menor capacidade padrão que comporta a maior fibra usada. */
export function capacidadeSugerida(maiorFibra: number): number {
  return CAPACIDADES.find((c) => c >= maiorFibra) ?? Math.ceil(maiorFibra / 12) * 12;
}

/** Uma rota passando por uma fibra de um cabo, entre dois elementos. */
export interface UsoFibra {
  rotaId: string;
  rotaNome: string;
  de: string;
  para: string;
}

/**
 * Cruza todas as rotas salvas: para cada cabo, quais fibras são usadas e por quais rotas.
 * O trecho entre o elemento i-1 e i usa o cabo/fibra de chegada do elemento i.
 */
export function usoDasFibras(rotas: RotaOptica[]): Map<string, { nome: string; fibras: Map<number, UsoFibra[]> }> {
  const mapa = new Map<string, { nome: string; fibras: Map<number, UsoFibra[]> }>();
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || !e.cabo_entrada || !e.fibra_entrada) return;
      const k = chaveCabo(e.cabo_entrada);
      const cabo = mapa.get(k) ?? { nome: e.cabo_entrada, fibras: new Map<number, UsoFibra[]>() };
      const lista = cabo.fibras.get(e.fibra_entrada) ?? [];
      const de = r.elementos[i - 1].nome;
      // Mesma rota pode passar por várias caixas no mesmo cabo/fibra: junta num trecho só (primeira → última)
      const existente = lista.find((u) => u.rotaId === r.id);
      if (existente) existente.para = e.nome;
      else lista.push({ rotaId: r.id, rotaNome: r.nome, de, para: e.nome });
      cabo.fibras.set(e.fibra_entrada, lista);
      mapa.set(k, cabo);
    });
  }
  return mapa;
}

// =====================
// Firestore (coleção cabos_rede)
// =====================
const COLECAO = "cabos_rede";

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarCabos(): Promise<CaboRede[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      chave: data.chave ?? d.id,
      nome: data.nome ?? "",
      capacidade: typeof data.capacidade === "number" && data.capacidade > 0 ? data.capacidade : undefined,
      fibras: Array.isArray(data.fibras) ? data.fibras : [],
      obs: data.obs || undefined,
      atualizado_por: data.atualizado_por,
      atualizado_em: isoDe(data.atualizado_em),
    } as CaboRede;
  });
}

export async function salvarCabo(dados: Omit<CaboRede, "id" | "atualizado_em">): Promise<CaboRede> {
  const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const id = idCabo(dados.chave);
  // Guarda só fibras com algo anotado
  const fibras = dados.fibras
    .filter((f) => f.status !== "livre" || f.descricao?.trim())
    .map((f) => (f.descricao?.trim() ? { numero: f.numero, status: f.status, descricao: f.descricao.trim() } : { numero: f.numero, status: f.status }));
  const registro = {
    chave: dados.chave,
    nome: dados.nome,
    capacidade: dados.capacidade ?? 0,
    fibras,
    obs: dados.obs?.trim() ?? "",
    atualizado_por: dados.atualizado_por ?? "",
  };
  await setDoc(doc(db, COLECAO, id), { ...registro, atualizado_em: serverTimestamp() });
  return {
    id,
    ...registro,
    capacidade: registro.capacidade || undefined,
    obs: registro.obs || undefined,
    atualizado_em: new Date().toISOString(),
  };
}
