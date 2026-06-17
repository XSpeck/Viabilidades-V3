import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { haversineDistance } from "./ctos";
import { plusCodeToCoords } from "./pluscode";
import type { Viabilizacao } from "@/types";

const CACHE_KEY = "viab_predios_estruturados_v1";
const CACHE_TTL = 5 * 60 * 1000;

export interface PredioEstruturado {
  id: string;
  predio_ftta: string;
  plus_code_cliente: string;
  tipo_instalacao: string;
  data_auditoria: string | undefined;
  lat?: number;
  lon?: number;
}

function getCache(): PredioEstruturado[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: PredioEstruturado[]; ts: number };
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function setCache(data: PredioEstruturado[]): void {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function bustPrediosCache(): void {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

export async function getPrediosEstruturados(): Promise<PredioEstruturado[]> {
  const cached = getCache();
  if (cached) return cached;

  const snap = await getDocs(
    query(collection(db, "viabilizacoes"), where("status_predio", "==", "estruturado"))
  );
  const data: PredioEstruturado[] = snap.docs
    .flatMap((d) => {
      const v = d.data() as Viabilizacao;
      if (!v.predio_ftta || !v.plus_code_cliente) return [];
      const p: PredioEstruturado = {
        id: d.id,
        predio_ftta: v.predio_ftta,
        plus_code_cliente: v.plus_code_cliente,
        tipo_instalacao: v.tipo_instalacao,
        data_auditoria: v.data_auditoria,
      };
      return [p];
    });

  setCache(data);
  return data;
}

// Normaliza nome: lowercase, sem acento, sem palavras genéricas
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
  // Contém um ao outro
  if (na.includes(nb) || nb.includes(na)) return true;
  // Palavras em comum (mínimo 2 palavras significativas)
  const wordsA = new Set(na.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 2));
  const common = [...wordsA].filter((w) => wordsB.has(w));
  return common.length >= 2;
}

export interface MatchPredio {
  predio: PredioEstruturado;
  distancia: number;    // metros
  porNome: boolean;
  porProximidade: boolean;
}

const DIST_THRESHOLD = 120; // metros

export async function findPredioEstruturado(
  plusCode: string,
  nomePredio?: string
): Promise<MatchPredio | null> {
  const predios = await getPrediosEstruturados();
  if (predios.length === 0) return null;

  // Resolve coordenadas do plus code atual
  let lat: number, lon: number;
  try {
    const coords = await plusCodeToCoords(plusCode);
    lat = coords.lat;
    lon = coords.lon;
  } catch {
    return null;
  }

  // Resolve coordenadas de todos os prédios estruturados (lazy, em paralelo)
  const prediosComCoords = await Promise.all(
    predios.map(async (p) => {
      try {
        const c = await plusCodeToCoords(p.plus_code_cliente);
        return { ...p, lat: c.lat, lon: c.lon };
      } catch {
        return { ...p, lat: undefined, lon: undefined };
      }
    })
  );

  let best: MatchPredio | null = null;

  for (const p of prediosComCoords) {
    const porNome = nomePredio ? nomeSimilar(nomePredio, p.predio_ftta) : false;
    const distancia = p.lat != null && p.lon != null
      ? haversineDistance(lat, lon, p.lat, p.lon)
      : Infinity;
    const porProximidade = distancia <= DIST_THRESHOLD;

    if (!porNome && !porProximidade) continue;

    // Prioriza o match mais próximo
    if (!best || distancia < best.distancia) {
      best = { predio: p, distancia, porNome, porProximidade };
    }
  }

  return best;
}
