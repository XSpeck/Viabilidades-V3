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
  /** Tipo de cabo do cadastro de equipamentos (define capacidade e fibras por tubo) */
  tipo_id?: string;
  /** Só as fibras anotadas à mão (as demais seguem as rotas ou ficam livres) */
  fibras: FibraCabo[];
  obs?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export const CAPACIDADES = [2, 4, 6, 12, 24, 36, 48, 72, 96, 144, 288] as const;
/** Capacidades que podem ser cadastradas à mão (inclui 1 fibra: flat e cordão). A estimativa automática usa CAPACIDADES. */
export const CAPACIDADES_CADASTRO = [1, ...CAPACIDADES] as const;

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Código fixo do cabo, gravado no fim do nome: "72 FO ASO · DIO → HUB [CB-000123]" */
export function codigoDoCabo(nome?: string): string | null {
  if (!nome) return null;
  const m = nome.match(/\[(CB-\d{6})\]/) ?? nome.trim().match(/^(CB-\d{6})$/);
  return m ? m[1] : null;
}

/** Nome do cabo sem o código */
export function semCodigo(nome: string): string {
  return nome.replace(/\s*\[CB-\d{6}\]\s*$/, "").trim();
}

/** Nome com o código no fim */
export function comCodigo(rotulo: string, codigo: string): string {
  return `${semCodigo(rotulo)} [${codigo}]`;
}

/** Próximo código livre (CB-000001, CB-000002…) olhando os nomes de cabo já usados */
export function proximoCodigoCabo(nomes: string[], extra = 0): string {
  const usados = nomes.map((n0) => codigoDoCabo(n0)).filter((c): c is string => !!c).map((c) => parseInt(c.slice(3), 10));
  return `CB-${String(Math.max(0, ...usados) + 1 + extra).padStart(6, "0")}`;
}

/** Identidade do cabo: o código, quando tem; senão o nome (cabos antigos e importados) */
export function chaveCabo(nome: string): string {
  return codigoDoCabo(nome) ?? normalizar(nome);
}

export function idCabo(chave: string): string {
  return chave.replace(/[\/#?\[\]*.\s:]+/g, "_").slice(0, 300);
}

/** Menor capacidade padrão que comporta a maior fibra usada. */
export function capacidadeSugerida(maiorFibra: number): number {
  return CAPACIDADES.find((c) => c >= maiorFibra) ?? Math.ceil(maiorFibra / 12) * 12;
}

/** Capacidade de cada cabo: a cadastrada ou, se não houver, estimada pela maior fibra usada nas rotas. */
export function capacidadesDosCabos(
  cabos: CaboRede[],
  uso: Map<string, { nome: string; fibras: Map<number, UsoFibra[]> }>
): Map<string, number> {
  const m = new Map<string, number>();
  uso.forEach((v, k) => m.set(k, capacidadeSugerida(Math.max(1, ...v.fibras.keys()))));
  cabos.forEach((c) => { if (c.capacidade) m.set(c.chave, c.capacidade); });
  return m;
}

/** Uma rota passando por uma fibra de um cabo, entre dois elementos. */
export interface UsoFibra {
  rotaId: string;
  rotaNome: string;
  de: string;
  para: string;
  /** Sub-rota passando no tronco herdado da rota-mãe (aparece recolhida embaixo da mãe) */
  herdado?: boolean;
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
      else lista.push({ rotaId: r.id, rotaNome: r.nome, de, para: e.nome, ...(r.pai && r.tronco && i < r.tronco ? { herdado: true } : {}) });
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
      tipo_id: data.tipo_id || undefined,
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
    tipo_id: dados.tipo_id ?? "",
    fibras,
    obs: dados.obs?.trim() ?? "",
    atualizado_por: dados.atualizado_por ?? "",
  };
  await setDoc(doc(db, COLECAO, id), { ...registro, atualizado_em: serverTimestamp() });
  return {
    id,
    ...registro,
    capacidade: registro.capacidade || undefined,
    tipo_id: registro.tipo_id || undefined,
    obs: registro.obs || undefined,
    atualizado_em: new Date().toISOString(),
  };
}

export async function excluirCabo(id: string): Promise<void> {
  const { doc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
}
