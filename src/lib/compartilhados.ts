// =====================
// Caixas e cabos compartilhados entre rotas: uma informação, um dono.
// A mesma caixa (código) ou o mesmo cabo (CB-…) em várias rotas só muda "em todas" ou é separado.
// =====================
import { chaveElemento } from "./arvorePon";
import { chaveCabo, codigoDoCabo, comCodigo, semCodigo } from "./cabosRede";
import type { ElementoRota, RotaOptica, TipoElementoRota, TrechoCabo } from "./rotaOptica";

/** Primeiro índice que é da própria rota (numa sub-rota montada, o começo é o tronco da mãe) */
export function inicioProprio(r: Pick<RotaOptica, "pai" | "tronco">): number {
  return r.pai && r.tronco ? r.tronco : 0;
}

/** Rotas (sem contar a que está aberta) que também têm esta caixa como dela */
export function rotasComCaixa(chave: string, rede: RotaOptica[]): RotaOptica[] {
  return rede.filter((r) => r.elementos.some((e, i) => i >= inicioProprio(r) && chaveElemento(e) === chave));
}

/** Rotas (sem contar a que está aberta) por onde passa este cabo */
export function rotasComCabo(cabo: string, rede: RotaOptica[]): RotaOptica[] {
  if (!cabo.trim()) return [];
  const k = chaveCabo(cabo);
  return rede.filter((r) => r.elementos.some((e, i) => i >= inicioProprio(r) && !!e.cabo_entrada?.trim() && chaveCabo(e.cabo_entrada) === k));
}

/** Parte curta do nome de uma caixa, a que entra no nome automático dos cabos */
export function nomeCurto(s0: string): string {
  return s0.split(" - ")[0].split(" / ")[0].trim();
}

/** Troca o nome curto da caixa dentro do nome de um cabo ("72 FO · DIO → HUB 1 [CB-…]") */
export function trocarCaixaNoCabo(cabo: string, nomeVelho: string, nomeNovo: string): string {
  const velho = nomeCurto(nomeVelho);
  const novo = nomeCurto(nomeNovo);
  if (!cabo || !velho || !novo || velho === novo) return cabo;
  const esc = velho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cabo
    .replace(`· ${velho} →`, `· ${novo} →`)
    .replace(new RegExp(`→ ${esc}(?=( \\(mesmo poste\\))?( \\[CB-\\d{6}\\])?$)`), `→ ${novo}`)
    .replace(new RegExp(`^Cordão ${esc} →`), `Cordão ${novo} →`);
}

/** Mudança feita com "Editar em todas as rotas" */
export type MudancaGlobal =
  | { tipo: "caixa"; chave: string; nomeVelho: string; nome?: string; tipoEl?: TipoElementoRota; lat?: number; lon?: number }
  | { tipo: "cabo"; codigo: string; nome: string };

/**
 * Aplica as mudanças numa rota montada (só na parte que é dela). Devolve os elementos e trechos
 * novos, ou null se nada mudou.
 */
export function aplicarNaRota(r: RotaOptica, mudancas: MudancaGlobal[]): { elementos: ElementoRota[]; trechos: TrechoCabo[] } | null {
  const ini = inicioProprio(r);
  let elementos = r.elementos.map((e) => ({ ...e }));
  let trechos = r.trechos.map((t) => ({ ...t, pontos: [...t.pontos] }));
  let mudou = false;
  for (const m of mudancas) {
    if (m.tipo === "cabo") {
      elementos = elementos.map((e, i) => {
        if (i < ini) return e;
        let x = e;
        if (codigoDoCabo(e.cabo_entrada) === m.codigo) { const v = comCodigo(m.nome, m.codigo); if (v !== e.cabo_entrada) { x = { ...x, cabo_entrada: v }; mudou = true; } }
        if (codigoDoCabo(e.cabo_saida) === m.codigo) { const v = comCodigo(m.nome, m.codigo); if (v !== e.cabo_saida) { x = { ...x, cabo_saida: v }; mudou = true; } }
        return x;
      });
      trechos = trechos.map((t) => (codigoDoCabo(t.nome) === m.codigo && t.nome !== comCodigo(m.nome, m.codigo) ? { ...t, nome: comCodigo(m.nome, m.codigo) } : t));
      continue;
    }
    const idx = elementos.map((e, i) => (i >= ini && chaveElemento(e) === m.chave ? i : -1)).filter((i) => i >= 0);
    // nome: a caixa e os nomes de cabo que levam o nome dela (o cabo pode passar por rotas sem a caixa)
    if (m.nome !== undefined && m.nome !== m.nomeVelho) {
      for (const i of idx) { elementos[i] = { ...elementos[i], nome: m.nome }; mudou = true; }
      elementos = elementos.map((e, i) => {
        if (i < ini) return e;
        const ce = e.cabo_entrada ? trocarCaixaNoCabo(e.cabo_entrada, m.nomeVelho, m.nome!) : e.cabo_entrada;
        const cs = e.cabo_saida ? trocarCaixaNoCabo(e.cabo_saida, m.nomeVelho, m.nome!) : e.cabo_saida;
        if (ce === e.cabo_entrada && cs === e.cabo_saida) return e;
        mudou = true;
        return { ...e, cabo_entrada: ce, cabo_saida: cs };
      });
      trechos = trechos.map((t) => { const v = trocarCaixaNoCabo(t.nome, m.nomeVelho, m.nome!); return v !== t.nome ? { ...t, nome: v } : t; });
    }
    if (!idx.length) continue;
    if (m.tipoEl !== undefined) {
      for (const i of idx) if (elementos[i].tipo !== m.tipoEl) { elementos[i] = { ...elementos[i], tipo: m.tipoEl }; mudou = true; }
    }
    // local: a caixa e as pontas dos trechos que chegam e saem dela
    if (m.lat !== undefined && m.lon !== undefined) {
      const p = { lat: m.lat, lon: m.lon };
      for (const i of idx) {
        elementos[i] = { ...elementos[i], lat: p.lat, lon: p.lon };
        trechos = trechos.map((t) => {
          if (t.ate === i && t.pontos.length) return { ...t, pontos: [...t.pontos.slice(0, -1), p] };
          if (t.ate === i + 1 && t.pontos.length) return { ...t, pontos: [p, ...t.pontos.slice(1)] };
          return t;
        });
      }
      mudou = true;
    }
  }
  return mudou ? { elementos, trechos } : null;
}

/** Nome de cabo com código novo (separar só nesta rota) */
export function caboComCodigoNovo(cabo: string, codigoNovo: string): string {
  return comCodigo(semCodigo(cabo), codigoNovo);
}
