export interface Cto {
  name: string;
  lat: number;
  lon: number;
  tipo?: "CTO" | "CDOI";
}

export interface RouteResult {
  distance: number;       // metros (rota real ou linha reta)
  distanceWithBuffer: number; // metros + 50m de sobra
  duration: number;       // segundos
  geometry: [number, number][]; // [lat, lon] para Leaflet
  isStraightLine: boolean;
  warningMsg?: string;
}

export interface CtoWithRoute extends Cto {
  straightDistance: number; // linha reta em metros
  route?: RouteResult;
}

// =====================
// Haversine (linha reta)
// =====================
/** O que muda ao trocar a base de CTOs pela de um arquivo novo (comparação por nome) */
export interface DiferencaCtos {
  novas: string[];
  removidas: string[];
  /** mesmo nome, mas mudou de lugar (mais de 10 m) */
  movidas: string[];
  iguais: number;
}

export function compararCtos(atuais: Cto[], novas: Cto[]): DiferencaCtos {
  const porNome = new Map(atuais.map((c) => [c.name, c]));
  const nomesNovos = new Set(novas.map((c) => c.name));
  const d: DiferencaCtos = { novas: [], removidas: [], movidas: [], iguais: 0 };
  for (const c of novas) {
    const antes = porNome.get(c.name);
    if (!antes) d.novas.push(c.name);
    else if (haversineDistance(antes.lat, antes.lon, c.lat, c.lon) > 10) d.movidas.push(c.name);
    else d.iguais++;
  }
  for (const c of atuais) if (!nomesNovos.has(c.name)) d.removidas.push(c.name);
  return d;
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

// =====================
// Parse KML
// =====================
export function parseCtoKml(kmlText: string): Cto[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");
  const placemarks = doc.querySelectorAll("Placemark");
  const ctos: Cto[] = [];

  placemarks.forEach((p) => {
    const name = p.querySelector("name")?.textContent?.trim() ?? "CTO";
    const isCdoi = name.toUpperCase().startsWith("CDOI");

    const coordsEl = p.querySelector("coordinates");
    if (!coordsEl?.textContent) return;

    const parts = coordsEl.textContent.trim().split(",");
    if (parts.length < 2) return;

    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) return;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

    ctos.push({ name, lat, lon, tipo: isCdoi ? "CDOI" : "CTO" });
  });

  return ctos;
}

// =====================
// Firestore — importar e buscar CTOs
// =====================

const CTOS_DOC = "ctos_data/all";

export async function importCtosToFirestore(
  ctos: Cto[],
  onProgress?: (done: number, total: number) => void,
  importadoPor?: string
): Promise<void> {
  const { db } = await import("./firebase");
  const { doc, setDoc } = await import("firebase/firestore");

  onProgress?.(0, ctos.length);
  await setDoc(doc(db, CTOS_DOC), {
    ctos,
    total: ctos.length,
    atualizado_em: new Date().toISOString(),
    ...(importadoPor ? { importado_por: importadoPor } : {}),
  });
  onProgress?.(ctos.length, ctos.length);
}

// =====================
// Buscar CTOs (Firestore + cache sessionStorage)
// =====================
const SESSION_KEY = "viab_ctos_v3";

export async function getCtosFromFirestore(): Promise<Cto[]> {
  const { db } = await import("./firebase");
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, CTOS_DOC));
  if (!snap.exists()) return [];
  return (snap.data().ctos as Cto[]) ?? [];
}

/** Total e última importação (quem e quando) */
export async function infoCtosNoFirestore(): Promise<{ total: number; atualizado_em?: string; importado_por?: string }> {
  const { db } = await import("./firebase");
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, CTOS_DOC));
  if (!snap.exists()) return { total: 0 };
  const x = snap.data();
  return { total: (x.total as number) ?? 0, atualizado_em: x.atualizado_em as string | undefined, importado_por: x.importado_por as string | undefined };
}

export async function countCtosInFirestore(): Promise<number> {
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      const parsed: Cto[] = JSON.parse(cached);
      if (parsed.length > 0) return parsed.length;
    }
  } catch {}
  const { db } = await import("./firebase");
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, CTOS_DOC));
  if (!snap.exists()) return 0;
  return (snap.data().total as number) ?? 0;
}

export async function getCtos(): Promise<Cto[]> {
  // Cache de sessão
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      const parsed: Cto[] = JSON.parse(cached);
      if (parsed.length > 0) return parsed;
    }
  } catch {}

  // Buscar do Firestore
  const ctos = await getCtosFromFirestore();
  if (ctos.length === 0) throw new Error("Nenhuma CTO encontrada. Importe o arquivo KML na página de Administração.");

  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctos)); } catch {}
  return ctos;
}

// =====================
// Encontrar CTOs próximas
// =====================
export function findNearestCtos(
  clientLat: number,
  clientLon: number,
  ctos: Cto[],
  radiusM: number
): CtoWithRoute[] {
  return ctos
    .map((cto) => ({
      ...cto,
      straightDistance: haversineDistance(clientLat, clientLon, cto.lat, cto.lon),
    }))
    .filter((c) => c.straightDistance <= radiusM)
    .sort((a, b) => a.straightDistance - b.straightDistance);
}

// =====================
// Rota OSRM (a pé)
// =====================
export async function getWalkingRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  straightLineM: number
): Promise<RouteResult> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/foot/` +
      `${startLon},${startLat};${endLon},${endLat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`OSRM retornou ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM sem rota");

    const route = data.routes[0];
    const distance: number = route.distance;

    // Verificação de sanidade: se rota > 5x linha reta, provável erro de dado
    let warningMsg: string | undefined;
    if (distance > straightLineM * 5) {
      warningMsg = `⚠️ Rota OSRM (${formatDistance(distance)}) muito longa vs linha reta (${formatDistance(straightLineM)}). Usando linha reta.`;
      return buildStraightLine(startLat, startLon, endLat, endLon, straightLineM, warningMsg);
    }

    // Converter coordenadas GeoJSON [lon, lat] → Leaflet [lat, lon]
    const geometry: [number, number][] = route.geometry.coordinates.map(
      ([lon, lat]: [number, number]) => [lat, lon]
    );

    return {
      distance,
      distanceWithBuffer: distance + 50,
      duration: route.duration,
      geometry,
      isStraightLine: false,
    };
  } catch (e) {
    const msg = `⚠️ Rota real indisponível (${e instanceof Error ? e.message : "timeout"}). Distância em linha reta.`;
    return buildStraightLine(startLat, startLon, endLat, endLon, straightLineM, msg);
  }
}

function buildStraightLine(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  distance: number,
  warningMsg: string
): RouteResult {
  return {
    distance,
    distanceWithBuffer: distance + 50,
    duration: 0,
    geometry: [[startLat, startLon], [endLat, endLon]],
    isStraightLine: true,
    warningMsg,
  };
}

// =====================
// Calcular rotas em paralelo
// =====================
export async function calculateRoutes(
  clientLat: number,
  clientLon: number,
  ctos: CtoWithRoute[],
  maxCtos = 8
): Promise<CtoWithRoute[]> {
  const top = ctos.slice(0, maxCtos);

  const results = await Promise.allSettled(
    top.map((cto) =>
      getWalkingRoute(clientLat, clientLon, cto.lat, cto.lon, cto.straightDistance)
    )
  );

  return top
    .map((cto, i) => {
      const result = results[i];
      return {
        ...cto,
        route: result.status === "fulfilled" ? result.value : undefined,
      };
    })
    .sort((a, b) => {
      const da = a.route?.distance ?? a.straightDistance;
      const db = b.route?.distance ?? b.straightDistance;
      return da - db;
    });
}
