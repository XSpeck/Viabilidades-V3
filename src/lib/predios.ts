import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { haversineDistance } from "./ctos";
import { plusCodeToCoords } from "./pluscode";
import type { Viabilizacao } from "@/types";

const CACHE_TTL = 5 * 60 * 1000;

// ─── Prédios estruturados ──────────────────────────────────────────

const CACHE_KEY_EST = "viab_predios_estruturados_v1";

export interface PredioEstruturado {
  id: string;
  predio_ftta: string;
  plus_code_cliente: string;
  tipo_instalacao: string;
  data_auditoria: string | undefined;
}

function getCacheEst(): PredioEstruturado[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_EST);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: PredioEstruturado[]; ts: number };
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY_EST); return null; }
    return data;
  } catch { return null; }
}

export function bustPrediosCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY_EST);
    sessionStorage.removeItem(CACHE_KEY_SEM);
  } catch {}
}

export async function getPrediosEstruturados(): Promise<PredioEstruturado[]> {
  const cached = getCacheEst();
  if (cached) return cached;
  const snap = await getDocs(
    query(collection(db, "viabilizacoes"), where("status_predio", "==", "estruturado"))
  );
  const data: PredioEstruturado[] = snap.docs.flatMap((d) => {
    const v = d.data() as Viabilizacao;
    if (!v.predio_ftta || !v.plus_code_cliente) return [];
    return [{ id: d.id, predio_ftta: v.predio_ftta, plus_code_cliente: v.plus_code_cliente, tipo_instalacao: v.tipo_instalacao, data_auditoria: v.data_auditoria }];
  });
  try { sessionStorage.setItem(CACHE_KEY_EST, JSON.stringify({ data, ts: Date.now() })); } catch {}
  return data;
}

// ─── Prédios sem viabilidade ───────────────────────────────────────

const CACHE_KEY_SEM = "viab_predios_sem_viab_viabilizacoes_v1";

export interface PredioSemViab {
  id: string;
  predio_ftta: string;
  plus_code_cliente: string;
  tipo_instalacao: string;
  motivo_rejeicao: string | undefined;
  data_auditoria: string | undefined;
}

function getCacheSem(): PredioSemViab[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_SEM);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: PredioSemViab[]; ts: number };
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY_SEM); return null; }
    return data;
  } catch { return null; }
}

export async function getPrediosSemViab(): Promise<PredioSemViab[]> {
  const cached = getCacheSem();
  if (cached) return cached;
  const snap = await getDocs(collection(db, "predios_sem_viabilidade"));
  const data: PredioSemViab[] = snap.docs.flatMap((d) => {
    const raw = d.data() as { condominio?: string; localizacao?: string; observacao?: string; data_registro?: string };
    if (!raw.condominio || !raw.localizacao) return [];
    return [{
      id: d.id,
      predio_ftta: raw.condominio,
      plus_code_cliente: raw.localizacao,
      tipo_instalacao: "Prédio",
      motivo_rejeicao: raw.observacao,
      data_auditoria: raw.data_registro,
    }];
  });
  try { sessionStorage.setItem(CACHE_KEY_SEM, JSON.stringify({ data, ts: Date.now() })); } catch {}
  return data;
}

// ─── Matching inteligente ──────────────────────────────────────────

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(residencial|condominio|edificio|res|cond|ed|bloco|bairro|vila|parque)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nomeSimilar(a: string, b: string): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  return [...wordsA].filter((w) => wordsB.has(w)).length >= 2;
}

const DIST_THRESHOLD = 120;      // metros — proximidade estrita
const DIST_NOME_MAX  = 500;      // metros — limite para aceitar match só por nome

async function resolverCoords(plusCode: string): Promise<{ lat: number; lon: number } | null> {
  try { return await plusCodeToCoords(plusCode); } catch { return null; }
}

// Genérico: recebe lista de registros com plus_code_cliente e predio_ftta
async function findBestMatch<T extends { plus_code_cliente: string; predio_ftta: string }>(
  registros: T[],
  plusCode: string,
  nomePredio?: string,
): Promise<{ registro: T; distancia: number; porNome: boolean; porProximidade: boolean } | null> {
  if (registros.length === 0) return null;

  const clienteCoords = await resolverCoords(plusCode);
  if (!clienteCoords) return null;

  const comCoords = await Promise.all(
    registros.map(async (r) => ({ ...r, coords: await resolverCoords(r.plus_code_cliente) }))
  );

  let best: { registro: T; distancia: number; porNome: boolean; porProximidade: boolean } | null = null;

  for (const r of comCoords) {
    const distancia = r.coords
      ? haversineDistance(clienteCoords.lat, clienteCoords.lon, r.coords.lat, r.coords.lon)
      : Infinity;
    const porProximidade = distancia <= DIST_THRESHOLD;
    // Nome similar só conta se a localização também for próxima (até 500m)
    const porNome = nomePredio ? (nomeSimilar(nomePredio, r.predio_ftta) && distancia <= DIST_NOME_MAX) : false;
    if (!porNome && !porProximidade) continue;
    if (!best || distancia < best.distancia) {
      best = { registro: r, distancia, porNome, porProximidade };
    }
  }

  return best;
}

export interface MatchPredio {
  predio: PredioEstruturado;
  distancia: number;
  porNome: boolean;
  porProximidade: boolean;
}

export interface MatchPredioSemViab {
  predio: PredioSemViab;
  distancia: number;
  porNome: boolean;
  porProximidade: boolean;
}

export async function findPredioEstruturado(plusCode: string, nomePredio?: string): Promise<MatchPredio | null> {
  const predios = await getPrediosEstruturados();
  const match = await findBestMatch(predios, plusCode, nomePredio);
  if (!match) return null;
  return { predio: match.registro, distancia: match.distancia, porNome: match.porNome, porProximidade: match.porProximidade };
}

export async function findPredioSemViab(plusCode: string, nomePredio?: string): Promise<MatchPredioSemViab | null> {
  const predios = await getPrediosSemViab();
  const match = await findBestMatch(predios, plusCode, nomePredio);
  if (!match) return null;
  return { predio: match.registro, distancia: match.distancia, porNome: match.porNome, porProximidade: match.porProximidade };
}
