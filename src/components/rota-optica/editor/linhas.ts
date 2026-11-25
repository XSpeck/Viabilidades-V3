// =====================
// Editor de rota: a "linha" do formulário (cada caixa da rota enquanto está sendo editada) e as contas
// que não dependem da tela — coordenadas, distâncias pelo mapa, postes do KML, nomes automáticos.
// =====================
import { nivelPotencia } from "@/lib/analiseRede";
import {
  CALCULO_PADRAO,
  comprimentoTracado,
  distanciaMetros,
  reservaTrecho,
  type CalculoPotencia,
  type ElementoRota,
  type TipoElementoRota,
  type TrechoCabo,
} from "@/lib/rotaOptica";
import type { Ferramenta } from "../RotaEditorMapa";

export type Ponto = { lat: number; lon: number };

/** Linha do formulário: números ficam como texto até salvar. */
export interface Linha {
  nome: string;
  tipo: TipoElementoRota;
  codigo: string;
  cabo_entrada: string;
  fibra_entrada: string;
  cabo_saida: string;
  fibra_saida: string;
  distancia_m: string;
  /** Distância calculada pelo mapa (muda sozinha quando mexe no mapa) */
  dist_auto: boolean;
  potencia_entrada: string;
  potencia_saida: string;
  splitter: string;
  splitter_modelo: string;
  /** HUB só de passagem nesta rota (splitter de outra porta) */
  passagem: boolean;
  /** Trecho que chega é um link no mesmo poste (sem traçado e sem reserva) */
  mesmoPoste: boolean;
  equipamento_id: string;
  porta: string;
  coords: string;
  /** Postes do cabo no trecho que chega neste elemento */
  vertices: Ponto[];
  obs: string;
  /** Elemento Prédio (entrada do cabo): em que prédio o cabo chega (o prédio novo é criado ao salvar) */
  predio?: VinculoPredio;
  /** Posição deste elemento na rota salva (para salvar só ele) */
  orig?: number;
  /** HUB com meia porta (1:2 antes do primário) */
  meiaPorta?: boolean;
}

/** id vazio = prédio novo (criado ao salvar com este nome) */
export interface VinculoPredio {
  id: string;
  nome: string;
  /** id do bloco (prédio existente) ou nome do bloco (prédio novo) */
  bloco: string;
  andar: number;
}

export const s = (v?: number) => (v === undefined ? "" : String(v).replace(".", ","));
export const pad2 = (v: number) => String(v).padStart(2, "0");
export const fmtDbm = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} dBm`;
export const fmtCoord = (p: Ponto) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

export function paraLinha(e: ElementoRota, vertices: Ponto[] = []): Linha {
  return {
    nome: e.nome,
    tipo: e.tipo,
    codigo: e.codigo ?? "",
    cabo_entrada: e.cabo_entrada ?? "",
    fibra_entrada: s(e.fibra_entrada),
    cabo_saida: e.cabo_saida ?? "",
    fibra_saida: s(e.fibra_saida),
    distancia_m: s(e.distancia_m),
    dist_auto: e.distancia_m === undefined,
    potencia_entrada: s(e.potencia_entrada),
    potencia_saida: s(e.potencia_saida),
    splitter: e.splitter ?? "",
    splitter_modelo: e.splitter_modelo ?? "",
    passagem: !!e.passagem,
    meiaPorta: !!e.meia_porta,
    mesmoPoste: !!e.mesmo_poste,
    equipamento_id: e.equipamento_id ?? "",
    porta: e.porta ?? "",
    coords: e.lat !== undefined && e.lon !== undefined ? `${e.lat}, ${e.lon}` : "",
    vertices,
    obs: e.obs ?? "",
  };
}

export const linhaVazia = (tipo: TipoElementoRota = "ceo"): Linha => paraLinha({ nome: "", tipo });

export function n(v: string): number | undefined {
  const t = v.trim().replace(",", ".");
  if (!t) return undefined;
  const x = parseFloat(t);
  return isFinite(x) ? x : undefined;
}

export function parseCoords(v: string): { lat?: number; lon?: number; erro?: boolean } {
  const t = v.trim();
  if (!t) return {};
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return { erro: true };
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erro: true };
  return { lat, lon };
}

export function posDe(l: Linha): Ponto | null {
  const c = parseCoords(l.coords);
  return c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : null;
}

/** Comprimento pelo mapa do trecho que chega em ls[i] (anterior → postes → este). */
export function distMapa(ls: Linha[], i: number): number | null {
  if (i === 0) return null;
  const a = posDe(ls[i - 1]);
  const b = posDe(ls[i]);
  if (!a || !b) return null;
  return Math.round(comprimentoTracado([a, ...ls[i].vertices, b]));
}

/** Distância do trecho para o OTDR: traçado no mapa + reservas técnicas das duas caixas */
export function distTotal(ls: Linha[], i: number, c: Partial<CalculoPotencia>): number | null {
  const d = distMapa(ls, i);
  return d === null ? null : d + reservaTrecho(ls[i - 1]?.tipo, ls[i].tipo, c);
}

export function recalcular(ls: Linha[], c: Partial<CalculoPotencia> = CALCULO_PADRAO): Linha[] {
  return ls.map((l, i) => {
    if (!l.dist_auto) return l;
    const d = distTotal(ls, i, c);
    return d === null ? l : { ...l, distancia_m: String(d) };
  });
}

/** Índice do segmento (entre pts[j] e pts[j+1]) mais perto do ponto, em plano local. */
export function segmentoMaisPerto(pts: Ponto[], p: Ponto): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  let melhor = 0;
  let dMin = Infinity;
  for (let j = 0; j < pts.length - 1; j++) {
    const ax = pts[j].lon * k, ay = pts[j].lat, bx = pts[j + 1].lon * k, by = pts[j + 1].lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
    if (d < dMin) { dMin = d; melhor = j; }
  }
  return melhor;
}

export const normNome = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Postes do trecho i (anterior → i) tirados do traçado do KML: pedaço do cabo entre os pontos mais perto das duas caixas. */
export function verticesDoKml(els: ElementoRota[], i: number, kml: TrechoCabo[]): Ponto[] {
  const a = els[i - 1];
  const b = els[i];
  if (!a || !b || a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return [];
  const pa = { lat: a.lat, lon: a.lon };
  const pb = { lat: b.lat, lon: b.lon };
  const nomeCabo = normNome(b.cabo_entrada ?? "");
  let melhor: { score: number; pts: Ponto[] } | null = null;
  for (const t of kml) {
    if (t.pontos.length < 2) continue;
    let ia = 0, da = Infinity, ib = 0, db = Infinity;
    t.pontos.forEach((p, k) => {
      const d1 = distanciaMetros(pa, p);
      if (d1 < da) { da = d1; ia = k; }
      const d2 = distanciaMetros(pb, p);
      if (d2 < db) { db = d2; ib = k; }
    });
    if (da > 80 || db > 80 || ia === ib) continue;
    const score = da + db - (nomeCabo && normNome(t.nome) === nomeCabo ? 1000 : 0);
    if (!melhor || score < melhor.score) {
      const pts = ia < ib ? t.pontos.slice(ia + 1, ib) : t.pontos.slice(ib + 1, ia).reverse();
      melhor = { score, pts: pts.map((p) => ({ lat: p.lat, lon: p.lon })) };
    }
  }
  return melhor?.pts ?? [];
}

/** Tipo de elemento que a ferramenta coloca (null = Mover/Poste) */
export function tipoDaFerramenta(f: Ferramenta): TipoElementoRota | null {
  return f === "selecionar" || f === "poste" || f === "estacao" ? null : f;
}

export const PALETA: { t: TipoElementoRota; rot: string }[] = [
  { t: "olt", rot: "OLT" },
  { t: "dio", rot: "DIO" },
  { t: "ceo", rot: "CEO" },
  { t: "ct", rot: "CT" },
  { t: "hub", rot: "HUB" },
  { t: "cto", rot: "CTO" },
  { t: "predio", rot: "Prédio" },
  { t: "onu", rot: "Cliente" },
];

export const PREFIXO: Record<TipoElementoRota, string> = {
  olt: "OLT", dio: "DIO", ceo: "CEO", ct: "CT", hub: "HUB", cto: "CTO", cdoi: "CDOI", predio: "Prédio", onu: "Cliente", outro: "Ponto",
};

/** Parte curta do nome de um elemento, usada no nome automático do cabo ("24 FO ASO · HUB 1 → CTO 2") */
export function curtoNome(s0: string) {
  return s0.split(" - ")[0].split(" / ")[0].trim();
}

/** Depois de um splitter (HUB/CTO/CDOI) a fibra segue num cabo novo: não herda o cabo do trecho anterior */
export function herdaCabo(ant?: Linha): ant is Linha {
  return !!ant && ant.tipo !== "dio" && ((ant.tipo !== "hub" && ant.tipo !== "cto") || ant.passagem) && ant.tipo !== "cdoi";
}

/** Nome automático ("CDOI 3"): pula os nomes que já existem nesta rota e na rede */
export function nomeAuto(tipo: TipoElementoRota, ls: Linha[], outros: string[] = []): string {
  const qtd = ls.filter((l) => l.tipo === tipo).length;
  if (tipo === "olt" && qtd === 0) return "OLT";
  const usados = new Set([...ls.map((l) => l.nome), ...outros].map((x) => x.trim().toUpperCase()));
  let k = qtd + 1;
  while (usados.has(`${PREFIXO[tipo]} ${k}`.toUpperCase())) k++;
  return `${PREFIXO[tipo]} ${k}`;
}

/** Cor do texto pelo nível de potência (mesmos limites do Mapa da rede: lib/analiseRede.ts) */
export function nivelCor(v?: number) {
  return { otima: "text-emerald-600", boa: "text-lime-600", limite: "text-amber-600", abaixo: "text-red-600", sem: "text-slate-500" }[nivelPotencia(v)];
}
