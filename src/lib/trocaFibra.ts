// =====================
// Trocar a fibra de um cabo em várias rotas de uma vez (ex.: a F06 rompeu e passou para a F08).
// Escolhe-se em quais trechos do cabo e quais rotas mudam; o resto fica como está.
// =====================
import { chaveElemento } from "./arvorePon";
import { chaveCabo } from "./cabosRede";
import { inicioProprio } from "./compartilhados";
import type { ElementoRota, RotaOptica, TrechoCabo } from "./rotaOptica";

/** Um trecho do cabo (entre duas caixas) onde a fibra é usada */
export interface TrechoFibra {
  /** "PT:100013>PT:100014" */
  chave: string;
  de: string;
  para: string;
  /** Rotas que usam a fibra aqui como parte delas */
  rotas: string[];
  /** Sub-rotas que só passam aqui pelo tronco herdado (vão junto com a mãe) */
  herdadas: string[];
}

const chaveTrecho = (a: ElementoRota, b: ElementoRota) => `${chaveElemento(a)}>${chaveElemento(b)}`;

/** Elementos i (da parte própria da rota) que chegam por este cabo nesta fibra */
function indicesNaFibra(r: RotaOptica, caboChave: string, fibra: number): number[] {
  const ini = Math.max(1, inicioProprio(r));
  const out: number[] = [];
  for (let i = ini; i < r.elementos.length; i++) {
    const e = r.elementos[i];
    if (e.cabo_entrada && e.fibra_entrada === fibra && chaveCabo(e.cabo_entrada) === caboChave) out.push(i);
  }
  return out;
}

/** Trechos do cabo onde a fibra aparece, na ordem em que surgem nas rotas */
export function trechosDaFibra(rotas: RotaOptica[], caboChave: string, fibra: number): TrechoFibra[] {
  const m = new Map<string, TrechoFibra>();
  for (const r of rotas) {
    const ini = inicioProprio(r);
    r.elementos.forEach((e, i) => {
      if (i === 0 || !e.cabo_entrada || e.fibra_entrada !== fibra || chaveCabo(e.cabo_entrada) !== caboChave) return;
      const k = chaveTrecho(r.elementos[i - 1], e);
      const t = m.get(k) ?? { chave: k, de: r.elementos[i - 1].nome, para: e.nome, rotas: [], herdadas: [] };
      const lista = i >= ini ? t.rotas : t.herdadas;
      if (!lista.includes(r.id)) lista.push(r.id);
      m.set(k, t);
    });
  }
  return [...m.values()];
}

/** Rotas fora do grupo que já usam a fibra nova em algum dos trechos escolhidos */
export function conflitosTroca(rotas: RotaOptica[], caboChave: string, nova: number, trechos: Set<string>, movidas: Set<string>): { rota: RotaOptica; trecho: string }[] {
  const out: { rota: RotaOptica; trecho: string }[] = [];
  for (const r of rotas) {
    if (movidas.has(r.id)) continue;
    // sub-rota de uma rota movida: o tronco dela muda junto
    if (r.pai && movidas.has(r.pai.rota_id)) continue;
    for (const i of indicesNaFibra(r, caboChave, nova)) {
      const k = chaveTrecho(r.elementos[i - 1], r.elementos[i]);
      if (trechos.has(k)) { out.push({ rota: r, trecho: k }); break; }
    }
  }
  return out;
}

/**
 * Troca a fibra nos trechos escolhidos da parte própria da rota (a chegada no elemento i e a saída
 * do elemento i-1). Devolve os elementos e trechos novos, ou null se nada mudou.
 */
export function trocarFibraNaRota(r: RotaOptica, caboChave: string, velha: number, nova: number, trechos: Set<string>): { elementos: ElementoRota[]; trechos: TrechoCabo[] } | null {
  const elementos = r.elementos.map((e) => ({ ...e }));
  let mudou = false;
  for (const i of indicesNaFibra(r, caboChave, velha)) {
    if (!trechos.has(chaveTrecho(r.elementos[i - 1], r.elementos[i]))) continue;
    elementos[i].fibra_entrada = nova;
    const ant = elementos[i - 1];
    if (ant.fibra_saida === velha && (!ant.cabo_saida || chaveCabo(ant.cabo_saida) === caboChave)) ant.fibra_saida = nova;
    mudou = true;
  }
  return mudou ? { elementos, trechos: r.trechos } : null;
}
