export interface RedeEmpresa {
  empresa: string;
  cor: string;
  kml: string; // raw KML text
}

export interface LinhaRede {
  empresa: string;
  cor: string;
  linhas: [number, number][][]; // array de LineStrings [[lat,lon], ...]
}

// =====================
// Configs das empresas
// =====================
export const EMPRESAS: Record<string, { label: string; cor: string }> = {
  CELESC:        { label: "CELESC",        cor: "#ef4444" },
  CERMOFUL:      { label: "CERMOFUL",      cor: "#f97316" },
  CERTREL:       { label: "CERTREL",       cor: "#8b5cf6" },
  COOPERA:       { label: "COOPERA",       cor: "#22c55e" },
  "COOPER-COCAL":{ label: "COOPER-COCAL",  cor: "#ec4899" },
  COPERALIANCA:  { label: "COPERALIANÇA",  cor: "#3b82f6" },
  FORCALUZ:      { label: "FORÇALUZ",      cor: "#eab308" },
};

// =====================
// Parse KML → LineStrings
// =====================
export function parseRedeKml(kmlText: string): [number, number][][] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");
  const lineStrings = doc.querySelectorAll("LineString");
  const result: [number, number][][] = [];

  lineStrings.forEach((ls) => {
    const coordsEl = ls.querySelector("coordinates");
    if (!coordsEl?.textContent) return;

    const pontos: [number, number][] = [];
    coordsEl.textContent.trim().split(/\s+/).forEach((c) => {
      const parts = c.split(",");
      if (parts.length < 2) return;
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        pontos.push([lat, lon]);
      }
    });

    if (pontos.length >= 2) result.push(pontos);
  });

  return result;
}

// =====================
// Firestore — salvar
// =====================
export async function importRedeToFirestore(empresa: string, kmlText: string): Promise<void> {
  const { db } = await import("./firebase");
  const { doc, setDoc } = await import("firebase/firestore");

  const cor = EMPRESAS[empresa]?.cor ?? "#888888";
  await setDoc(doc(db, "redes_distribuidoras", empresa), {
    empresa,
    cor,
    kml: kmlText,
    atualizado_em: new Date().toISOString(),
  });
}

// =====================
// Firestore — buscar todas
// =====================
const SESSION_KEY = "viab_redes_v1";

export async function getRedes(): Promise<LinhaRede[]> {
  // Cache de sessão
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      const parsed: LinhaRede[] = JSON.parse(cached);
      if (parsed.length > 0) return parsed;
    }
  } catch {}

  const { db } = await import("./firebase");
  const { getDocs, collection } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, "redes_distribuidoras"));

  const redes: LinhaRede[] = snap.docs.map((d) => {
    const data = d.data() as RedeEmpresa;
    return {
      empresa: data.empresa,
      cor: data.cor,
      linhas: parseRedeKml(data.kml),
    };
  });

  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(redes)); } catch {}
  return redes;
}

export async function listRedesImportadas(): Promise<{ empresa: string; cor: string; atualizado_em: string }[]> {
  const { db } = await import("./firebase");
  const { getDocs, collection } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, "redes_distribuidoras"));
  return snap.docs.map((d) => {
    const data = d.data();
    return { empresa: data.empresa, cor: data.cor, atualizado_em: data.atualizado_em ?? "" };
  });
}
