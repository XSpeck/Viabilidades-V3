// =====================
// Rede livre: gravação dos elementos e cabos desenhados no mapa e a limpeza para começar do zero.
// As rotas (rotas_opticas) não são mais lidas; ficam como cópia de segurança.
// =====================

import { chaveCabo, type CaboRede, type TrechoCaboRede } from "./cabosRede";
import type { CaixaRede, PontaFibra } from "./caixasRede";
import { comprimentoTracado, distanciaMetros } from "./rotaOptica";

/** Coleções do que está desenhado (as rotas antigas não entram: ficam como cópia) */
export const COLECOES_REDE = ["caixas_rede", "cabos_rede", "predios_rede"] as const;

/** Quantos documentos tem em cada coleção da rede */
export async function contarRedeDesenhada(): Promise<Record<(typeof COLECOES_REDE)[number], number>> {
  const { collection, getCountFromServer } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const out = {} as Record<(typeof COLECOES_REDE)[number], number>;
  for (const c of COLECOES_REDE) out[c] = (await getCountFromServer(collection(db, c))).data().count;
  return out;
}

/** Apaga tudo o que está desenhado (elementos, cabos, prédios), em lotes. As rotas antigas ficam. */
export async function apagarRedeDesenhada(): Promise<number> {
  const { collection, getDocs, writeBatch } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  let total = 0;
  for (const c of COLECOES_REDE) {
    const snap = await getDocs(collection(db, c));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await lote.commit();
    }
    total += snap.docs.length;
  }
  return total;
}


type Pt = { lat: number; lon: number };

/**
 * A caixa sem nada ligado no cabo (cabo apagado ou que deixou de passar por ela). null = nada mudou.
 * Emendas, entradas de splitter, pernas, cordões e adaptadores daquele cabo saem.
 */
export function caixaSemCabo(c: CaixaRede, chave: string): CaixaRede | null {
  const deste = (p?: PontaFibra) => !!p && chaveCabo(p.cabo) === chave;
  const emendas = (c.emendas ?? []).filter((m) => !deste(m.de) && !deste(m.para));
  const regras = (c.regras_emenda ?? []).filter((g) => chaveCabo(g.de) !== chave && chaveCabo(g.para) !== chave);
  const splitters = (c.splitters ?? []).map((s) => ({
    ...s,
    entrada: deste(s.entrada.fibra) ? {} : s.entrada,
    portas: s.portas.map((p) => (deste(p.saida) ? { numero: p.numero, status: p.status === "cliente" ? p.status : ("livre" as const), ...(p.status === "cliente" ? { cliente_id: p.cliente_id, descricao: p.descricao } : {}) } : p)),
  }));
  const cordoes = (c.cordoes ?? []).filter((x) => !deste(x.para));
  const adaptadores = (c.adaptadores ?? []).map((a) => ({ n: a.n, ...(deste(a.de) ? {} : a.de ? { de: a.de } : {}), ...(deste(a.para) ? {} : a.para ? { para: a.para } : {}) })).filter((a) => a.de || a.para);
  const novo: CaixaRede = { ...c, emendas, regras_emenda: regras, splitters, cordoes, adaptadores };
  return JSON.stringify(novo) === JSON.stringify(c) ? null : novo;
}

/** Metros de um trecho: da caixa de antes, pelas curvas, até a de depois */
export function metrosDoTrecho(a: Pt | undefined, pontos: Pt[], b: Pt | undefined): number {
  return Math.round(comprimentoTracado([...(a ? [a] : []), ...pontos, ...(b ? [b] : [])]));
}

/** Distância de um ponto a um segmento (metros, aproximado no plano) */
function distSegmento(p: Pt, a: Pt, b: Pt): number {
  const kx = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lon * kx, ay = a.lat, bx = b.lon * kx, by = b.lat, px = p.lon * kx, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return distanciaMetros(p, { lat: (ay + t * dy), lon: (ax + t * dx) / kx });
}

/**
 * Uma caixa nova colocada em cima do trecho t do cabo: o cabo passa a passar por ela.
 * O traçado do trecho se parte no segmento mais perto do clique.
 */
export function cortarTrechoNaCaixa(c: CaboRede, t: number, nova: CaixaRede & Pt, elDe: Map<string, CaixaRede>): CaboRede {
  const caminho = [...(c.caminho ?? [])];
  const trechos: TrechoCaboRede[] = [...(c.trechos ?? caminho.slice(1).map(() => ({ pontos: [] })))];
  const a = elDe.get(caminho[t]), b = elDe.get(caminho[t + 1]);
  const pa = a?.lat !== undefined && a.lon !== undefined ? { lat: a.lat, lon: a.lon } : undefined;
  const pb = b?.lat !== undefined && b.lon !== undefined ? { lat: b.lat, lon: b.lon } : undefined;
  const pts = trechos[t]?.pontos ?? [];
  const linha = [...(pa ? [pa] : []), ...pts, ...(pb ? [pb] : [])];
  let melhor = 0, dist = Infinity;
  for (let i = 0; i + 1 < linha.length; i++) {
    const d = distSegmento(nova, linha[i], linha[i + 1]);
    if (d < dist) { dist = d; melhor = i; }
  }
  // pontos do meio antes e depois do corte (linha[0] é a caixa de antes)
  const k = pa ? melhor : melhor + 1;
  const antes = pts.slice(0, k), depois = pts.slice(k);
  const pn = { lat: nova.lat, lon: nova.lon };
  caminho.splice(t + 1, 0, nova.chave);
  trechos.splice(t, 1,
    { pontos: antes, metros: metrosDoTrecho(pa, antes, pn) },
    { pontos: depois, metros: metrosDoTrecho(pn, depois, pb) },
  );
  return { ...c, caminho, trechos };
}

/** Recalcula os metros dos trechos do cabo que encostam na caixa (ela foi arrastada) */
export function caboComCaixaMovida(c: CaboRede, chave: string, elDe: Map<string, CaixaRede>): CaboRede | null {
  const i = c.caminho?.indexOf(chave) ?? -1;
  if (i < 0 || !c.caminho) return null;
  const pos = (k: string) => { const e = elDe.get(k); return e?.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : undefined; };
  const trechos = (c.trechos ?? c.caminho.slice(1).map((): TrechoCaboRede => ({ pontos: [] }))).map((tr, t) =>
    t === i - 1 || t === i ? { ...tr, metros: tr.mesmo_poste ? 0 : metrosDoTrecho(pos(c.caminho![t]), tr.pontos, pos(c.caminho![t + 1])) } : tr,
  );
  return { ...c, trechos };
}

/** Próximo código livre para um elemento novo (100001, 100002…), olhando os que já existem */
export function proximoCodigoElemento(codigos: (string | undefined)[], extra = 0): string {
  const nums = codigos.map((c) => (c && /^\d+$/.test(c.trim()) ? parseInt(c.trim(), 10) : 0));
  return String(Math.max(100000, ...nums) + 1 + extra);
}
