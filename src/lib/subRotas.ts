// =====================
// Sub-rotas: a rota principal é o tronco da porta (OLT → … → HUB); o que sai dali são sub-rotas.
// A sub-rota guarda só o que é dela: a caixa onde ramifica (1º elemento, só referência) e o que vem depois.
// Para as telas, cada sub-rota é "montada": tronco da rota-mãe até a caixa + o trecho dela.
// Meia porta: a HUB tem um 1:2 antes do primário; uma perna alimenta o primário dela e a outra
// segue (no mesmo cabo, em outra cor, ou noutro cabo) até a HUB da outra metade da porta.
// =====================

import { chaveElemento } from "./arvorePon";
import {
  calcularPotencias,
  CALCULO_PADRAO,
  perdaSplitter,
  type ElementoRota,
  type EntradaPotencia,
  type RotaOptica,
  type RotaOpticaInput,
  type TrechoCabo,
} from "./rotaOptica";

/** Perda do 1:2 da meia porta */
export const PERDA_MEIA_PORTA = perdaSplitter("1:2");

/** Entrada do cálculo de potência de um elemento (inclui o 1:2 da meia porta) */
export function entradaPotencia(e: ElementoRota, perdaModelo?: (id?: string) => number | undefined): EntradaPotencia {
  const base = { tipo: e.tipo, distancia_m: e.distancia_m };
  // sai pela outra perna do 1:2: só a perda do 1:2, sem o primário desta HUB
  if (e.via_meia_porta) return { ...base, splitter: "1:2 (meia porta)", perda_splitter: PERDA_MEIA_PORTA };
  const spl = e.passagem ? undefined : e.splitter || undefined;
  const p = spl ? perdaSplitter(spl, perdaModelo?.(e.splitter_modelo)) : undefined;
  if (e.tipo === "hub" && e.meia_porta) {
    return { ...base, splitter: spl ? `1:2 + ${spl}` : "1:2 (meia porta)", perda_splitter: PERDA_MEIA_PORTA + (p ?? 0) };
  }
  return { ...base, splitter: spl, perda_splitter: p };
}

/** Recalcula a potência de uma rota montada (quando o cálculo é automático) */
function comPotencias(r: RotaOptica, perdaModelo?: (id?: string) => number | undefined): RotaOptica {
  const calc = r.calculo_potencia ?? CALCULO_PADRAO;
  const tx = r.elementos[0]?.potencia_saida ?? r.elementos[0]?.potencia_entrada;
  if (!calc.auto || tx === undefined) return r;
  const ps = calcularPotencias(r.elementos.map((e) => entradaPotencia(e, perdaModelo)), tx, calc);
  return { ...r, elementos: r.elementos.map((e, i) => (i === 0 ? e : { ...e, potencia_entrada: ps[i].entrada, potencia_saida: ps[i].saida })) };
}

/** Posição da caixa de ramificação na rota-mãe montada (a última vez que ela aparece) */
function indiceAncora(elementos: ElementoRota[], chave: string): number {
  for (let k = elementos.length - 1; k >= 0; k--) if (chaveElemento(elementos[k]) === chave) return k;
  return -1;
}

/**
 * Monta todas as rotas: principais ficam como estão; sub-rotas ganham o tronco da mãe.
 * `tronco` = quantos elementos vieram da mãe (incluindo a caixa onde ramifica).
 */
export function montarRotas(cruas: RotaOptica[], perdaModelo?: (id?: string) => number | undefined): RotaOptica[] {
  const porId = new Map(cruas.map((r) => [r.id, r]));
  const prontas = new Map<string, RotaOptica>();
  const montar = (r: RotaOptica, visitando: Set<string>): RotaOptica => {
    const ja = prontas.get(r.id);
    if (ja) return ja;
    if (!r.pai) {
      // potência sempre recalculada pelos elementos (um splitter mudado depois não deixa a ponta desatualizada)
      const pronta = comPotencias(r, perdaModelo);
      prontas.set(r.id, pronta);
      return pronta;
    }
    const mae0 = porId.get(r.pai.rota_id);
    if (!mae0 || visitando.has(r.id)) {
      const orfa = { ...r, orfa: true };
      prontas.set(r.id, orfa);
      return orfa;
    }
    visitando.add(r.id);
    const mae = montar(mae0, visitando);
    const k = indiceAncora(mae.elementos, r.pai.chave);
    if (k < 0) {
      const orfa = { ...r, orfa: true };
      prontas.set(r.id, orfa);
      return orfa;
    }
    const proprios = r.elementos.slice(1);
    const ancora: ElementoRota = {
      ...mae.elementos[k],
      cabo_saida: proprios[0]?.cabo_entrada,
      fibra_saida: proprios[0]?.fibra_entrada,
      ...(r.pai.meia_porta ? { via_meia_porta: true } : {}),
    };
    const elementos = [...mae.elementos.slice(0, k), ancora, ...proprios];
    // traçado: o da mãe até a caixa + o da sub-rota (índices deslocados)
    const trechos: TrechoCabo[] = [
      ...mae.trechos.filter((t) => t.ate === undefined || t.ate <= k),
      ...r.trechos.map((t) => (t.ate !== undefined ? { ...t, ate: t.ate + k } : t)),
    ];
    const montada = comPotencias(
      { ...r, elementos, trechos, calculo_potencia: r.calculo_potencia ?? mae.calculo_potencia, tronco: k + 1 },
      perdaModelo
    );
    prontas.set(r.id, montada);
    return montada;
  };
  return cruas.map((r) => montar(r, new Set()));
}

/** Dono de um elemento de uma rota montada: a própria rota ou a mãe (se o elemento for do tronco) */
export function donoDoElemento(r: RotaOptica, k: number, todas: RotaOptica[]): RotaOptica {
  let atual = r;
  for (let guarda = 0; guarda < 20; guarda++) {
    if (!atual.pai || !atual.tronco || k >= atual.tronco) return atual;
    const mae = todas.find((x) => x.id === atual.pai!.rota_id);
    if (!mae) return atual;
    atual = mae;
  }
  return atual;
}

/**
 * O que vai para o banco de uma rota montada: a sub-rota perde o tronco
 * (fica a caixa de ramificação como 1º elemento) e o traçado volta aos índices dela.
 */
export function paraGravar(r: Pick<RotaOptica, "pai" | "tronco">, dados: RotaOpticaInput): RotaOpticaInput {
  const { tronco } = r;
  if (!r.pai) return { ...dados, pai: undefined };
  // sub-rota cuja caixa de ramificação sumiu da mãe: grava como está
  if (!tronco) return { ...dados, pai: r.pai };
  const corte = tronco - 1;
  const elementos = dados.elementos.slice(corte).map((e, i) => {
    if (i > 0) return e;
    // a caixa de ramificação é só referência: sem chegada, sem marcação de passagem pela meia porta
    const { via_meia_porta, cabo_entrada, fibra_entrada, distancia_m, ...resto } = e;
    void via_meia_porta; void cabo_entrada; void fibra_entrada; void distancia_m;
    return resto;
  });
  const trechos = dados.trechos
    .filter((t) => t.ate !== undefined && t.ate > corte)
    .map((t) => ({ ...t, ate: t.ate! - corte }));
  return { ...dados, elementos, trechos, pai: r.pai };
}

/** Sub-rotas que saem de uma rota (diretas) */
export function subRotasDe(id: string, todas: RotaOptica[]): RotaOptica[] {
  return todas.filter((x) => x.pai?.rota_id === id);
}

/** Ancestrais de uma rota (ids), da mãe para cima */
function ancestrais(r: RotaOptica, todas: RotaOptica[]): Set<string> {
  const ids = new Set<string>();
  let atual: RotaOptica | undefined = r;
  for (let guarda = 0; atual?.pai && guarda < 20; guarda++) {
    ids.add(atual.pai.rota_id);
    atual = todas.find((x) => x.id === atual!.pai!.rota_id);
  }
  return ids;
}

export interface CandidataSubRota {
  rota: RotaOptica;
  /** rota que fica com o tronco */
  dona: RotaOptica;
  /** índice da caixa onde ramifica */
  k: number;
}

/**
 * Rotas completas (antigas) que começam igual a outra rota: dá para virarem sub-rota.
 * Mesmo caminho = mesmas caixas, mesmo cabo e mesma fibra em cada trecho. A mais nova vira sub-rota da mais antiga.
 */
export function candidatasSubRota(todas: RotaOptica[], chaveCabo: (c: string) => string): CandidataSubRota[] {
  const mesmoTrecho = (a: ElementoRota, b: ElementoRota, j: number) =>
    chaveElemento(a) === chaveElemento(b) &&
    (j === 0 || ((a.cabo_entrada ? chaveCabo(a.cabo_entrada) : "") === (b.cabo_entrada ? chaveCabo(b.cabo_entrada) : "") && a.fibra_entrada === b.fibra_entrada));
  const maisAntiga = (a: RotaOptica, b: RotaOptica) => {
    const ta = a.criado_em ?? "", tb = b.criado_em ?? "";
    return ta !== tb ? ta < tb : a.id < b.id;
  };
  const saida: CandidataSubRota[] = [];
  for (const r of todas) {
    if (r.pai || r.elementos.length < 3) continue;
    let melhor: { m: RotaOptica; L: number } | null = null;
    for (const m of todas) {
      if (m.id === r.id || !maisAntiga(m, r)) continue;
      let L = 0;
      while (L < r.elementos.length && L < m.elementos.length && mesmoTrecho(r.elementos[L], m.elementos[L], L)) L++;
      // precisa ramificar depois da OLT e ter caixas próprias depois da ramificação
      if (L < 2 || L >= r.elementos.length) continue;
      if (!melhor || L > melhor.L || (L === melhor.L && maisAntiga(m, melhor.m))) melhor = { m, L };
    }
    if (!melhor) continue;
    const k = melhor.L - 1;
    const dona = donoDoElemento(melhor.m, k, todas);
    if (dona.id === r.id || ancestrais(dona, todas).has(r.id)) continue;
    saida.push({ rota: r, dona, k });
  }
  return saida;
}
