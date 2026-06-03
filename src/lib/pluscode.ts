// Utilitários de Plus Code — wrapper sobre open-location-code
// Usa a API pública do Google para conversão quando necessário

const REFERENCE_LAT = -28.6775;
const REFERENCE_LON = -49.3696;

// Regex de validação
const PLUS_CODE_REGEX = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$/;

export function validatePlusCode(code: string): boolean {
  return PLUS_CODE_REGEX.test(code.toUpperCase().trim());
}

// Converte Plus Code OU coordenadas "lat,lon" para { lat, lon }
export async function plusCodeToCoords(
  plusCode: string
): Promise<{ lat: number; lon: number }> {
  const input = plusCode.trim();

  // Detectar formato de coordenadas: "-28.648873,-49.210531"
  const coordMatch = input.match(/^(-?\d{1,3}\.?\d*),\s*(-?\d{1,3}\.?\d*)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
    throw new Error(`Coordenadas inválidas: ${input}`);
  }

  // Tratar como Plus Code
  const code = input.toUpperCase();

  // Fallback: usar open-location-code (instância local)
  const { OpenLocationCode } = await import("open-location-code");
  const olc = new OpenLocationCode();
  const resolved = olc.isFull(code) ? code : olc.recoverNearest(code, REFERENCE_LAT, REFERENCE_LON);
  const decoded = olc.decode(resolved);
  return {
    lat: (decoded.latitudeLo + decoded.latitudeHi) / 2,
    lon: (decoded.longitudeLo + decoded.longitudeHi) / 2,
  };
}

export function coordsToPlusCode(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// Converte "lat,lon" para Plus Code; retorna o valor original se já for Plus Code
export function locationToPlusCode(location: string): string {
  if (!location || location.includes("+")) return location;
  const parts = location.split(",");
  if (parts.length !== 2) return location;
  const lat = parseFloat(parts[0].trim());
  const lon = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lon)) return location;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenLocationCode } = require("open-location-code");
    return new OpenLocationCode().encode(lat, lon);
  } catch {
    return location;
  }
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
