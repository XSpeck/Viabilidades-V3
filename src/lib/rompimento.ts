// =====================
// Simulação de rompimento (OTDR): a partir de uma caixa da rota, andando para a ponta ou para a OLT,
// acha onde fica a distância medida — no traçado do cabo ou dentro da reserva técnica de uma caixa.
// A metragem de cada trecho já inclui as reservas (15 m por lado em CTO/CEO/CT/HUB, 2 m na CDOI).
// =====================
import { CALCULO_PADRAO, distanciaMetros, reservaTecnica, tipoVisual, type CalculoPotencia, type ElementoRota, type RotaOptica } from "./rotaOptica";
import { chaveElemento } from "./arvorePon";
import { chaveCabo } from "./cabosRede";

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
    // link no mesmo poste (HUB → CTO ao lado): não tem rolo de reserva
    const resIni = e.mesmo_poste ? 0 : reservaTecnica(r.elementos[i - 1].tipo, c);
    const resFim = e.mesmo_poste ? 0 : reservaTecnica(e.tipo, c);
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

// =====================
// Rompimento clicado no mapa: o cabo mais perto do clique é cortado ali (todas as fibras dele),
// e tudo que vem depois desse trecho, em todas as rotas que passam por ele, fica sem sinal.
// =====================

/** Um trecho físico de cabo da rede (cabo + par de caixas), com as rotas que passam nele */
export interface TrechoRede {
  chave: string;
  cabo: string;
  de: ElementoRota;
  para: ElementoRota;
  pts: Ponto[];
  /** rota e índice do elemento onde o trecho chega nela */
  usos: { rota: RotaOptica; i: number }[];
}

export function trechosDaRede(rotas: RotaOptica[]): TrechoRede[] {
  const m = new Map<string, TrechoRede>();
  for (const r of rotas) {
    trechosDaRota(r).forEach((t) => {
      if (t.pts.length < 2) return;
      const a = r.elementos[t.i - 1], b = r.elementos[t.i];
      const cabo = b.cabo_entrada ?? "";
      const k = `${chaveCabo(cabo || `trecho${t.i}`)}|${[chaveElemento(a), chaveElemento(b)].sort().join("|")}`;
      const tr = m.get(k) ?? { chave: k, cabo, de: a, para: b, pts: t.pts, usos: [] };
      if (!tr.usos.some((u) => u.rota.id === r.id && u.i === t.i)) tr.usos.push({ rota: r, i: t.i });
      m.set(k, tr);
    });
  }
  return [...m.values()];
}

/** Ponto do traçado mais perto do clique (projeção num plano local, em metros) */
export function maisPerto(pts: Ponto[], p: Ponto): { ponto: Ponto; metros: number } {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320;
  const xy = (q: Ponto) => ({ x: q.lon * k, y: q.lat * 110540 });
  const P = xy(p);
  let melhor = { ponto: pts[0], metros: Infinity };
  for (let s = 0; s < pts.length - 1; s++) {
    const A = xy(pts[s]), B = xy(pts[s + 1]);
    const dx = B.x - A.x, dy = B.y - A.y;
    const t = Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / (dx * dx + dy * dy || 1)));
    const X = A.x + t * dx, Y = A.y + t * dy;
    const d = Math.hypot(P.x - X, P.y - Y);
    if (d < melhor.metros) melhor = { ponto: { lat: pts[s].lat + t * (pts[s + 1].lat - pts[s].lat), lon: pts[s].lon + t * (pts[s + 1].lon - pts[s].lon) }, metros: d };
  }
  return melhor;
}

/** Trecho de cabo mais perto do clique, até a tolerância (metros) */
export function trechoNoClique(trechos: TrechoRede[], p: Ponto, tolerancia = 40): { trecho: TrechoRede; ponto: Ponto; metros: number } | null {
  let melhor: { trecho: TrechoRede; ponto: Ponto; metros: number } | null = null;
  for (const t of trechos) {
    const mp = maisPerto(t.pts, p);
    if (mp.metros <= tolerancia && (!melhor || mp.metros < melhor.metros)) melhor = { trecho: t, ...mp };
  }
  return melhor;
}

/** Caixa de atendimento sem sinal: em quais rotas e portas PON ela atende */
export interface AfetadaCorte {
  chave: string;
  elemento: ElementoRota;
  rotas: RotaOptica[];
}

/** CTOs e CDOIs que atendem (não só passagem) depois do corte, em todas as rotas que passam no trecho */
export function afetadasPeloCorte(trecho: TrechoRede): { caixas: AfetadaCorte[]; rotas: RotaOptica[]; trechos: Set<string> } {
  const m = new Map<string, AfetadaCorte>();
  const trechosSem = new Set<string>();
  for (const { rota, i } of trecho.usos) {
    for (let j = i; j < rota.elementos.length; j++) {
      const e = rota.elementos[j];
      trechosSem.add(`${rota.id}|${j}`);
      const t = tipoVisual(e);
      if ((t !== "cto" && t !== "cdoi") || e.passagem) continue;
      const k = chaveElemento(e);
      const a = m.get(k) ?? { chave: k, elemento: e, rotas: [] };
      if (!a.rotas.includes(rota)) a.rotas.push(rota);
      m.set(k, a);
    }
  }
  return { caixas: [...m.values()], rotas: [...new Set(trecho.usos.map((u) => u.rota))], trechos: trechosSem };
}
