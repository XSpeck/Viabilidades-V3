// =====================
// Diagrama interno das caixas (HUB, CTO, caixa de emenda), preenchido à mão na árvore PON.
// Uma caixa é identificada pela mesma chave usada para juntar rotas (código PT ou nome),
// então vale para todas as rotas que passam por ela.
// =====================

export type StatusPorta = "livre" | "cliente" | "ramal";

export const STATUS_PORTA_LABEL: Record<StatusPorta, string> = {
  livre: "Livre",
  cliente: "Cliente",
  ramal: "Ramal (vai para outra caixa)",
};

export interface PortaCaixa {
  numero: number;
  status: StatusPorta;
  /** Nome/código do cliente ou da caixa de destino */
  descricao?: string;
}

export interface CaixaRede {
  id: string;
  chave: string;
  nome: string;
  /** "1:8", "1:16"... vazio quando a caixa não tem splitter */
  splitter?: string;
  portas: PortaCaixa[];
  obs?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export const SPLITTERS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"] as const;

export function totalPernas(splitter?: string): number | null {
  const m = splitter?.match(/1\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Ajusta a lista de portas ao tamanho do splitter, mantendo o que já foi marcado. */
export function portasPara(splitter: string | undefined, atuais: PortaCaixa[] = []): PortaCaixa[] {
  const total = totalPernas(splitter) ?? 0;
  return Array.from({ length: total }, (_, i) => atuais.find((p) => p.numero === i + 1) ?? { numero: i + 1, status: "livre" as const });
}

/** Id de documento seguro para o Firestore a partir da chave da caixa. */
export function idCaixa(chave: string): string {
  return chave.replace(/[\/#?\[\]*.\s:]+/g, "_").slice(0, 300);
}

export interface ResumoPortas {
  total: number;
  clientes: number;
  ramais: number;
  livres: number;
}

export function resumoPortas(caixa: CaixaRede | undefined): ResumoPortas | null {
  const total = totalPernas(caixa?.splitter);
  if (!caixa || total === null) return null;
  const portas = portasPara(caixa.splitter, caixa.portas);
  const clientes = portas.filter((p) => p.status === "cliente").length;
  const ramais = portas.filter((p) => p.status === "ramal").length;
  return { total, clientes, ramais, livres: total - clientes - ramais };
}

// =====================
// Firestore (coleção caixas_rede)
// =====================
const COLECAO = "caixas_rede";

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarCaixas(): Promise<CaixaRede[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      chave: data.chave ?? d.id,
      nome: data.nome ?? "",
      splitter: data.splitter || undefined,
      portas: Array.isArray(data.portas) ? data.portas : [],
      obs: data.obs || undefined,
      atualizado_por: data.atualizado_por,
      atualizado_em: isoDe(data.atualizado_em),
    } as CaixaRede;
  });
}

export async function salvarCaixa(dados: Omit<CaixaRede, "id" | "atualizado_em">): Promise<CaixaRede> {
  const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const id = idCaixa(dados.chave);
  const portas = portasPara(dados.splitter, dados.portas).map((p) =>
    p.descricao?.trim() ? { numero: p.numero, status: p.status, descricao: p.descricao.trim() } : { numero: p.numero, status: p.status }
  );
  const registro = {
    chave: dados.chave,
    nome: dados.nome,
    splitter: dados.splitter ?? "",
    portas,
    obs: dados.obs?.trim() ?? "",
    atualizado_por: dados.atualizado_por ?? "",
  };
  await setDoc(doc(db, COLECAO, id), { ...registro, atualizado_em: serverTimestamp() });
  return { id, ...registro, splitter: registro.splitter || undefined, obs: registro.obs || undefined, atualizado_em: new Date().toISOString() };
}
