import { collection, doc, getDoc, getDocs, increment, setDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Coleções que quase não mudam e são lidas inteiras (prédios atendidos / sem viabilidade).
 *
 * Em vez de ler centenas de documentos a cada visita, guardamos a lista no aparelho
 * (localStorage) junto com um número de versão. O doc meta/versoes tem o número atual
 * de cada coleção: 1 leitura confere se a cópia local ainda vale. Toda gravação nessas
 * coleções chama marcarMudanca(), que sobe o número e força todos a baixar de novo.
 */
export type ColecaoVersionada = "predios_atendidos" | "predios_sem_viabilidade";

const PREFIXO = "vc_";
const META = doc(db, "meta", "versoes");
/** Confere a versão no máximo 1x por minuto (navegar entre telas não gasta leitura) */
const CONFERIR_MS = 60 * 1000;

let _versoes: { v: Record<string, number>; ts: number } | null = null;
const _memoria = new Map<string, { v: number; itens: Record<string, unknown>[] }>();

async function versaoAtual(colecao: ColecaoVersionada): Promise<number> {
  if (!_versoes || Date.now() - _versoes.ts > CONFERIR_MS) {
    const snap = await getDoc(META);
    _versoes = { v: (snap.exists() ? snap.data() : {}) as Record<string, number>, ts: Date.now() };
  }
  return Number(_versoes.v[colecao] ?? 0);
}

/** Timestamps viram texto ISO (para caber no localStorage e bater com o resto do app) */
function plano(id: string, data: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { id };
  for (const [k, val] of Object.entries(data)) o[k] = val instanceof Timestamp ? val.toDate().toISOString() : val;
  return o;
}

async function baixar(colecao: ColecaoVersionada) {
  const snap = await getDocs(collection(db, colecao));
  return snap.docs.map((d) => plano(d.id, d.data()));
}

/** Todos os documentos da coleção, da cópia local quando ela ainda está na versão atual */
export async function lerColecao<T>(colecao: ColecaoVersionada): Promise<T[]> {
  let v: number;
  try {
    v = await versaoAtual(colecao);
  } catch {
    // sem acesso ao doc de versão: lê direto (comportamento antigo)
    return (await baixar(colecao)) as T[];
  }
  const mem = _memoria.get(colecao);
  if (mem && mem.v === v) return mem.itens as T[];
  try {
    const raw = localStorage.getItem(PREFIXO + colecao);
    if (raw) {
      const salvo = JSON.parse(raw) as { v: number; itens: Record<string, unknown>[] };
      if (salvo.v === v && Array.isArray(salvo.itens)) {
        _memoria.set(colecao, salvo);
        return salvo.itens as T[];
      }
    }
  } catch {}
  // versão lida ANTES dos dados: se alguém gravar no meio, a próxima conferência baixa de novo
  const itens = await baixar(colecao);
  _memoria.set(colecao, { v, itens });
  try { localStorage.setItem(PREFIXO + colecao, JSON.stringify({ v, itens })); } catch {}
  return itens as T[];
}

/** Chamar depois de toda gravação na coleção: invalida a cópia de todo mundo */
export async function marcarMudanca(colecao: ColecaoVersionada): Promise<void> {
  _memoria.delete(colecao);
  _versoes = null;
  try { localStorage.removeItem(PREFIXO + colecao); } catch {}
  try { await setDoc(META, { [colecao]: increment(1) }, { merge: true }); } catch (e) { console.warn("Não foi possível marcar a versão de", colecao, e); }
}

/** Logout: apaga as cópias locais */
export function limparColecoesLocais(): void {
  _memoria.clear();
  _versoes = null;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIXO)) localStorage.removeItem(k);
    }
  } catch {}
}
