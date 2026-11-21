// =====================
// Localização do cliente: um campo só que entende Plus Code, coordenadas (ponto ou vírgula
// decimal) e links do Google Maps. Sempre devolve o Plus Code completo, para não depender
// de cidade na hora de ler de volta.
// =====================
import { OpenLocationCode } from "open-location-code";

/** Ponto usado para completar Plus Code curto (ex.: 8J3G+WGV) */
export const REFERENCIA = { lat: -28.6775, lon: -49.3696 };

export interface LocalInterpretado {
  /** Plus Code completo (ex.: 583G8J3G+WGV) */
  plusCode: string;
  lat: number;
  lon: number;
  /** Como o texto foi lido */
  origem: "pluscode" | "coordenadas" | "link";
}

const olc = new OpenLocationCode();

const valido = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function deCoordenadas(lat: number, lon: number, origem: LocalInterpretado["origem"]): LocalInterpretado | null {
  if (!valido(lat, lon)) return null;
  return { plusCode: olc.encode(lat, lon, 10), lat, lon, origem };
}

const num = (s: string) => parseFloat(s.replace(",", "."));

/**
 * Lê o que o atendente colou ou digitou. Aceita:
 * - Plus Code completo ou curto, com ou sem a cidade depois ("8J3G+WGV Criciúma")
 * - "-28.695133, -49.373710", "-28,695133, -49,373710", "-28.69 -49.37", "-28,69; -49,37"
 * - link do Google Maps com "@lat,lon" ou "q=lat,lon"
 */
export function interpretarLocalizacao(texto: string): LocalInterpretado | null {
  const t = texto.trim();
  if (!t) return null;

  // link do Google Maps
  const link = t.match(/[@=](-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (link && /maps|goo\.gl|google/i.test(t)) return deCoordenadas(+link[1], +link[2], "link");

  // Plus Code (o resto do texto, como a cidade, é ignorado)
  const pc = t.toUpperCase().match(/(?:^|\s)([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3})(?=\s|,|$)/);
  if (pc) {
    const code = pc[1];
    if (olc.isFull(code)) {
      const d = olc.decode(code);
      return { plusCode: code, lat: d.latitudeCenter, lon: d.longitudeCenter, origem: "pluscode" };
    }
    if (olc.isShort(code)) {
      const cheio = olc.recoverNearest(code, REFERENCIA.lat, REFERENCIA.lon);
      const d = olc.decode(cheio);
      return { plusCode: cheio, lat: d.latitudeCenter, lon: d.longitudeCenter, origem: "pluscode" };
    }
    return null;
  }

  // Coordenadas: dois números, decimal com ponto ou vírgula
  const dec = String.raw`(-?\d{1,3}(?:[.,]\d+)?)`;
  const par =
    t.match(new RegExp(`^${dec}\\s*[;\\s]\\s*${dec}$`)) ?? // separador ; ou espaço
    t.match(new RegExp(`^(-?\\d{1,3}\\.\\d+)\\s*,\\s*(-?\\d{1,3}\\.\\d+)$`)) ?? // ponto decimal, vírgula separa
    t.match(new RegExp(`^(-?\\d{1,3},\\d+)\\s*,\\s*(-?\\d{1,3},\\d+)$`)); // vírgula decimal, vírgula separa
  if (par) return deCoordenadas(num(par[1]), num(par[2]), "coordenadas");
  return null;
}

/** Versão curta do Plus Code (perto da referência), para achar pedidos antigos gravados assim */
export function plusCodeCurto(plusCode: string): string {
  try {
    return olc.shorten(plusCode, REFERENCIA.lat, REFERENCIA.lon);
  } catch {
    return plusCode;
  }
}

/** Sem acento e minúsculo, para buscas */
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Só dígitos do telefone; formata (48) 99999-9999 */
export function formatarTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
