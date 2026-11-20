// =====================
// Simulação de rompimento (OTDR): a partir de uma caixa da rota, andando para a ponta ou para a OLT,
// acha onde fica a distância medida — no traçado do cabo ou dentro da reserva técnica de uma caixa.
// A metragem de cada trecho já inclui as reservas (15 m por lado em CTO/CEO/CT/HUB, 2 m na CDOI).
// =====================
import { CALCULO_PADRAO, distanciaMetros, reservaTecnica, type CalculoPotencia, type RotaOptica } from "./rotaOptica";

type Ponto = { lat: number; lon: number };

export interface TrechoRota {
  /** índice do elemento onde o trecho chega (vai de i-1 até i) */
  i: number;
  /** metragem do trecho (com reservas) */
  metros: number;
  /** reserva enrolada na caixa de saída (i-1) e na de chegada (i) */
  resIni: number;
  resFim: number;
  /** traçado do cabo (do elemento i-1 ao i) */
  pts: Ponto[];
}

/** Trechos da rota com a metragem, as reservas e o traçado */
export function trechosDaRota(r: RotaOptica): TrechoRota[] {
  const c: Partial<CalculoPotencia> = r.calculo_potencia ?? CALCULO_PADRAO;
  const pos = (i: number): Ponto | null => {
    const e = r.elementos[i];
    return e?.lat !== undefined && e?.lon !== undefined ? { lat: e.lat, lon: e.lon } : null;
  };
  const out: TrechoRota[] = [];
  for (let i = 1; i < r.elementos.length; i++) {
    const e = r.elementos[i];
    const t = r.trechos.find((x) => x.ate === i);
    const a = pos(i - 1), b = pos(i);
    const pts = t?.pontos?.length ? t.pontos : a && b ? [a, b] : [];
    const tracado = pts.length > 1 ? pts.slice(1).reduce((s, p, k) => s + distanciaMetros(pts[k], p), 0) : 0;
    const resIni = reservaTecnica(r.elementos[i - 1].tipo, c);
    const resFim = reservaTecnica(e.tipo, c);
    const metros = e.distancia_m ?? Math.round(tracado + resIni + resFim);
    out.push({ i, metros, resIni, resFim, pts });
  }
  return out;
}

/** Metragem desde a OLT em cada elemento */
export function acumuladoDaRota(r: RotaOptica): number[] {
  const tr = trechosDaRota(r);
  const acc = [0];
  tr.forEach((t) => acc.push(acc[acc.length - 1] + t.metros));
  return acc;
}

/** Ponto a uma fração do traçado */
function pontoNoTracado(pts: Ponto[], frac: number): Ponto | null {
  if (pts.length === 0) return null;
  if (pts.length === 1) return pts[0];
  const total = pts.slice(1).reduce((s, p, k) => s + distanciaMetros(pts[k], p), 0);
  let alvo = Math.max(0, Math.min(1, frac)) * total;
  for (let k = 1; k < pts.length; k++) {
    const d = distanciaMetros(pts[k - 1], pts[k]);
    if (alvo <= d || k === pts.length - 1) {
      const f = d ? Math.min(1, alvo / d) : 0;
      return { lat: pts[k - 1].lat + (pts[k].lat - pts[k - 1].lat) * f, lon: pts[k - 1].lon + (pts[k].lon - pts[k - 1].lon) * f };
    }
    alvo -= d;
  }
  return pts[pts.length - 1];
}

export type Sentido = "ponta" | "olt";

export interface ResultadoRompimento {
  /** onde caiu */
  tipo: "tracado" | "reserva" | "alem" | "antes";
  /** trecho (índice do elemento de chegada) */
  trecho?: number;
  /** caixa de onde se conta (a última passada no sentido da medição) e a próxima */
  depoisDe?: number;
  antesDe?: number;
  /** metros depois da caixa "depoisDe", no sentido da medição */
  metrosDepois?: number;
  /** caixa em cuja reserva caiu */
  reservaDe?: number;
  /** ponto no mapa */
  ponto?: Ponto;
  /** metragem desde a OLT do ponto do rompimento */
  desdeOlt?: number;
  /** quanto passou do fim (além da ponta / antes da OLT) */
  sobra?: number;
}

/**
 * Onde fica a distância medida pelo OTDR ligado na caixa "ref", andando para a ponta ou para a OLT.
 */
export function localizarRompimento(r: RotaOptica, ref: number, sentido: Sentido, distancia: number): ResultadoRompimento {
  const tr = trechosDaRota(r);
  const acc = acumuladoDaRota(r);
  const total = acc[acc.length - 1];
  const alvoOlt = sentido === "ponta" ? acc[ref] + distancia : acc[ref] - distancia;
  if (alvoOlt > total) return { tipo: "alem", sobra: alvoOlt - total, desdeOlt: alvoOlt, depoisDe: r.elementos.length - 1 };
  if (alvoOlt < 0) return { tipo: "antes", sobra: -alvoOlt, desdeOlt: alvoOlt, depoisDe: 0 };
  // trecho que contém o ponto (de acc[i-1] a acc[i])
  let k = tr.findIndex((t) => alvoOlt <= acc[t.i] + 1e-6);
  if (k < 0) k = tr.length - 1;
  const t = tr[k];
  const ini = acc[t.i - 1];
  const dentro = alvoOlt - ini; // metros desde a caixa i-1, sentido OLT → ponta
  const tracado = Math.max(0, t.metros - t.resIni - t.resFim);
  // caixas no sentido da medição
  const depoisDe = sentido === "ponta" ? t.i - 1 : t.i;
  const antesDe = sentido === "ponta" ? t.i : t.i - 1;
  const metrosDepois = sentido === "ponta" ? dentro : t.metros - dentro;
  const base = { trecho: t.i, depoisDe, antesDe, metrosDepois, desdeOlt: alvoOlt };
  if (dentro <= t.resIni && t.resIni > 0) {
    return { ...base, tipo: "reserva", reservaDe: t.i - 1, ponto: t.pts[0] ?? undefined };
  }
  if (dentro >= t.metros - t.resFim && t.resFim > 0) {
    return { ...base, tipo: "reserva", reservaDe: t.i, ponto: t.pts[t.pts.length - 1] ?? undefined };
  }
  const frac = tracado ? (dentro - t.resIni) / tracado : 0.5;
  return { ...base, tipo: "tracado", ponto: pontoNoTracado(t.pts, frac) ?? undefined };
}
