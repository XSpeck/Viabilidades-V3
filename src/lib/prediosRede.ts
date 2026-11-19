// =====================
// Prédios verticais da rede (FTTA): blocos, andares e onde ficam as CDOIs.
// Cada CDOI é ligada pela mesma chave das rotas (código PT ou nome), então o prédio
// se conecta sozinho à rede: a fibra que chega da rua e os cabos entre blocos vêm das rotas salvas.
// =====================

export interface BlocoPredio {
  id: string;
  nome: string;
  /** Andares acima do térreo */
  andares: number;
  /** Subsolos (garagem) */
  subsolos: number;
  /** Apartamentos por andar (só para o desenho e a contagem) */
  aptos: number;
}

export interface PontoPredio {
  id: string;
  /** Chave do elemento nas rotas (PT:<código> ou N:<nome>); vazio quando a CDOI ainda não está em rota */
  chave: string;
  nome: string;
  /** id do bloco */
  bloco: string;
  /** 0 = térreo, 1.. = andares, -1.. = subsolos */
  andar: number;
  /** Faixa de andares atendidos por esta CDOI */
  atende_de: number;
  atende_ate: number;
  /** Splitter da CDOI ("1:8", "1:16"…) quando ainda não está no diagrama da caixa nem na rota */
  splitter?: string;
  /** CDOI ainda sem rota: cabo e fibra planejados (só para o desenho) */
  cabo?: string;
  fibra?: number;
}

export interface PredioRede {
  id: string;
  nome: string;
  endereco?: string;
  blocos: BlocoPredio[];
  pontos: PontoPredio[];
  /** Chaves das CDOIs (para achar o prédio de uma caixa) */
  chaves: string[];
  obs?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export function novoId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function rotuloAndar(a: number): string {
  if (a === 0) return "Térreo";
  if (a < 0) return `Subsolo ${-a}`;
  return `${a}º andar`;
}

export function rotuloAndarCurto(a: number): string {
  if (a === 0) return "T";
  if (a < 0) return `S${-a}`;
  return `${a}º`;
}

/** Andares de um bloco, de baixo para cima (subsolos, térreo, andares) */
export function andaresDoBloco(b: BlocoPredio): number[] {
  const r: number[] = [];
  for (let a = -b.subsolos; a <= b.andares; a++) r.push(a);
  return r;
}

export function predioNovo(nome: string, chave: string, nomeCdoi: string): PredioRede {
  const bloco: BlocoPredio = { id: novoId(), nome: "Bloco A", andares: 10, subsolos: 0, aptos: 4 };
  return {
    id: "",
    nome,
    blocos: [bloco],
    pontos: [{ id: novoId(), chave, nome: nomeCdoi, bloco: bloco.id, andar: 0, atende_de: 1, atende_ate: 10 }],
    chaves: chave ? [chave] : [],
  };
}

// =====================
// Firestore (coleção predios_rede)
// =====================
const COLECAO = "predios_rede";
let cache: PredioRede[] | null = null;

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarPredios(forcar = false): Promise<PredioRede[]> {
  if (cache && !forcar) return cache;
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  cache = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      nome: x.nome ?? "",
      endereco: x.endereco || undefined,
      blocos: Array.isArray(x.blocos) ? x.blocos : [],
      pontos: Array.isArray(x.pontos) ? x.pontos : [],
      chaves: Array.isArray(x.chaves) ? x.chaves : [],
      obs: x.obs || undefined,
      atualizado_por: x.atualizado_por,
      atualizado_em: isoDe(x.atualizado_em),
    } as PredioRede;
  });
  return cache;
}

export async function salvarPredio(p: PredioRede, usuario: string): Promise<PredioRede> {
  const { collection, doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const ref = p.id ? doc(db, COLECAO, p.id) : doc(collection(db, COLECAO));
  const registro = {
    nome: p.nome.trim(),
    endereco: p.endereco?.trim() ?? "",
    blocos: p.blocos.map((b) => ({ id: b.id, nome: b.nome.trim() || "Bloco", andares: b.andares, subsolos: b.subsolos, aptos: b.aptos })),
    pontos: p.pontos.map((o) => ({ id: o.id, chave: o.chave, nome: o.nome.trim(), bloco: o.bloco, andar: o.andar, atende_de: o.atende_de, atende_ate: o.atende_ate, ...(o.splitter ? { splitter: o.splitter } : {}), ...(o.cabo && o.fibra ? { cabo: o.cabo, fibra: o.fibra } : {}) })),
    chaves: [...new Set(p.pontos.map((o) => o.chave).filter(Boolean))],
    obs: p.obs?.trim() ?? "",
    atualizado_por: usuario,
  };
  await setDoc(ref, { ...registro, atualizado_em: serverTimestamp() });
  const salvo: PredioRede = { ...registro, id: ref.id, endereco: registro.endereco || undefined, obs: registro.obs || undefined, atualizado_em: new Date().toISOString() };
  cache = cache ? [...cache.filter((x) => x.id !== ref.id), salvo] : null;
  return salvo;
}

export async function excluirPredio(id: string): Promise<void> {
  const { doc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
  cache = cache ? cache.filter((x) => x.id !== id) : null;
}
