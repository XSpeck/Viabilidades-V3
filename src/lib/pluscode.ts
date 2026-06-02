// Utilitários de Plus Code — wrapper sobre open-location-code
// Usa a API pública do Google para conversão quando necessário

const REFERENCE_LAT = -28.6775;
const REFERENCE_LON = -49.3696;

// Regex de validação
const PLUS_CODE_REGEX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/;

export function validatePlusCode(code: string): boolean {
  return PLUS_CODE_REGEX.test(code.toUpperCase().trim());
}

// Converte Plus Code para coordenadas usando a API do Google Maps
export async function plusCodeToCoords(
  plusCode: string
): Promise<{ lat: number; lon: number }> {
  const code = plusCode.trim().toUpperCase();
  const full = code.includes("+") && code.split("+")[0].length >= 8
    ? code
    : `${code.split("+")[0].padStart(8, "0")}+${code.split("+")[1]}`;

  const url = `https://plus.codes/api?address=${encodeURIComponent(full)}&ekey=${process.env.NEXT_PUBLIC_PLUS_CODES_API_KEY || ""}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data?.plus_code?.geometry?.location) {
      return {
        lat: data.plus_code.geometry.location.lat,
        lon: data.plus_code.geometry.location.lng,
      };
    }
  } catch {
    // fallback: decodificação local básica
  }

  // Fallback: usar Open Location Code JS (importado dinamicamente)
  const olc = await import("open-location-code-typescript").catch(() => null);
  if (olc) {
    const resolved = olc.recoverNearest(code, REFERENCE_LAT, REFERENCE_LON);
    const decoded = olc.decode(resolved);
    return {
      lat: (decoded.latitudeLo + decoded.latitudeHi) / 2,
      lon: (decoded.longitudeLo + decoded.longitudeHi) / 2,
    };
  }

  throw new Error("Não foi possível converter o Plus Code.");
}

export function coordsToPlusCode(lat: number, lon: number): string {
  // Formato simples para exibição — idealmente usar a lib OLC
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}
