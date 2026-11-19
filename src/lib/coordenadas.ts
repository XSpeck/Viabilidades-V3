// =====================
// Leitura de coordenadas digitadas ou coladas:
//   "-28.69170, -49.34236" · "-28,69170 -49,34236" · "28°41'30.1\"S 49°20'32.5\"W"
//   links do Google Maps (…/@-28.69,-49.34,17z · …?q=-28.69,-49.34)
// =====================

export interface Coordenada {
  lat: number;
  lon: number;
}

function valida(lat: number, lon: number): Coordenada | null {
  if (!isFinite(lat) || !isFinite(lon)) return null;
  // Aceita invertido (lon, lat) quando só assim faz sentido
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Converte o texto em coordenada; null se não reconhecer. */
export function lerCoordenada(texto: string): Coordenada | null {
  const t = texto.trim();
  if (!t) return null;

  // Links do Google Maps
  const link = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? t.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (link) return valida(num(link[1]), num(link[2]));

  // Graus, minutos e segundos: 28°41'30.1"S 49°20'32.5"W (minutos/segundos opcionais)
  const dms = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')\s*)?([NSLOEW])/gi)];
  if (dms.length >= 2) {
    const conv = (m: RegExpMatchArray) => {
      const v = num(m[1]) + (m[2] ? num(m[2]) / 60 : 0) + (m[3] ? num(m[3]) / 3600 : 0);
      return /[SOW]/i.test(m[4]) ? -v : v;
    };
    const a = dms[0], b = dms[1];
    const aLat = /[NS]/i.test(a[4]);
    return valida(conv(aLat ? a : b), conv(aLat ? b : a));
  }

  // Decimais: com ponto, ou com vírgula decimal separados por espaço/;
  const nums = t.match(/-?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length === 2) return valida(num(nums[0]), num(nums[1]));
  // "-28,69170, -49,34236" vira 4 pedaços inteiros: junta de dois em dois
  const inteiros = t.match(/-?\d+/g);
  if (inteiros && inteiros.length === 4 && /,/.test(t)) {
    return valida(num(`${inteiros[0]}.${inteiros[1]}`), num(`${inteiros[2]}.${inteiros[3]}`));
  }
  return null;
}

export function formatarCoordenada(c: Coordenada): string {
  return `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`;
}
