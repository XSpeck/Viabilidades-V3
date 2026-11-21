import type { ElementoRota, RotaOptica } from "./rotaOptica";
import { chaveElemento } from "./arvorePon";

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
  /** CDOI ainda sem rota: cabo planejado (só para o desenho) */
  cabo?: string;
  /** Fibra que chega na CDOI (do cabo da entrada, ou planejada) */
  fibra?: number;
  /** Entrada do prédio de onde vem a fibra: id da rota que leva o cabo até o prédio */
  entrada?: string;
  /** Sub-rota desta CDOI (criada e mantida pelo prédio) */
  rota_id?: string;
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
    pontos: p.pontos.map((o) => ({ id: o.id, chave: o.chave, nome: o.nome.trim(), bloco: o.bloco, andar: o.andar, atende_de: o.atende_de, atende_ate: o.atende_ate, ...(o.splitter ? { splitter: o.splitter } : {}), ...(o.cabo ? { cabo: o.cabo } : {}), ...(o.fibra ? { fibra: o.fibra } : {}), ...(o.entrada ? { entrada: o.entrada } : {}), ...(o.rota_id ? { rota_id: o.rota_id } : {}) })),
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

// =====================
// Agrupador na árvore: as CDOIs de um prédio ficam "dentro" de um nó Prédio
// =====================
export const CODIGO_PREDIO = "PREDIO-";

/** O elemento é o nó agrupador de um prédio (criado só para exibir a árvore)? */
export function idPredioDoElemento(e: { tipo: string; codigo?: string }): string | null {
  return e.tipo === "predio" && e.codigo?.startsWith(CODIGO_PREDIO) ? e.codigo.slice(CODIGO_PREDIO.length) : null;
}

/**
 * Para a árvore: antes da primeira CDOI de um prédio em cada rota entra o nó do prédio (mesmo cabo, mesma distância),
 * e a CDOI fica logo depois dele, a 0 m. Assim todas as rotas que chegam no prédio se juntam num nó só.
 * Não altera a potência (o prédio é neutro) nem os dados salvos.
 */
export function rotasComPredios(rotas: RotaOptica[], predios: PredioRede[]): RotaOptica[] {
  if (!predios.length) return rotas;
  const doPredio = new Map<string, PredioRede>();
  predios.forEach((p) => p.chaves.forEach((k) => doPredio.set(k, p)));
  return rotas.map((r) => {
    let mudou = false;
    const els: ElementoRota[] = [];
    r.elementos.forEach((e, i) => {
      const p = i > 0 ? doPredio.get(chaveElemento(e)) : undefined;
      const jaDentro = els.some((x) => x.codigo === `${CODIGO_PREDIO}${p?.id}`);
      if (p && !jaDentro) {
        mudou = true;
        els.push({
          nome: p.nome,
          tipo: "predio",
          codigo: `${CODIGO_PREDIO}${p.id}`,
          lat: e.lat,
          lon: e.lon,
          cabo_entrada: e.cabo_entrada,
          fibra_entrada: e.fibra_entrada,
          distancia_m: e.distancia_m,
          potencia_entrada: e.potencia_entrada,
          potencia_saida: e.potencia_entrada,
        });
        els.push({ ...e, distancia_m: 0 });
        return;
      }
      els.push(e);
    });
    return mudou ? { ...r, elementos: els } : r;
  });
}
