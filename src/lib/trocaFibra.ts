// =====================
// Troca de fibra: um núcleo só para todas as telas.
//
// Regra: a fibra vale no trecho inteiro do cabo. Trocar a fibra numa ponta (no Unifilar, no editor da rota,
// no "Trocar fibra", no adaptador do DIO ou no prédio) muda as rotas que usam o trecho e as caixas das duas
// pontas do cabo (fusão, entrada de splitter, perna). O cabo que só passa por caixas (ou entra inteiro num
// prédio) leva a fibra junto.
//
// Tudo vira um PlanoTroca (rotas e caixas que mudam), que a tela mostra para conferir e grava de uma vez.
// =====================
import { chaveElemento } from "./arvorePon";
import { chaveCabo } from "./cabosRede";
import type { PontaFibra, SplitterCaixa } from "./caixasRede";
import { inicioProprio } from "./compartilhados";
import type { ElementoRota, RotaOptica, TrechoCabo } from "./rotaOptica";
import { donoDoElemento } from "./subRotas";
import type { CadastroLigacoes, Lado } from "./unifilar";

const mesmaFibra = (a: PontaFibra, b: PontaFibra) => chaveCabo(a.cabo) === chaveCabo(b.cabo) && a.fibra === b.fibra;
const nomeCabo = (cabo: string) => cabo.split(" [")[0];

// ---------------------------------------------------------------------------------------------
// Cadastro de uma caixa
// ---------------------------------------------------------------------------------------------

/**
 * Troca fibras de um cabo no cadastro da caixa (lado "chega": o que entra na caixa; "sai": o que sai dela).
 * Várias trocas de uma vez (F1↔F3) não passam uma por cima da outra. Fibra que seguia uma regra cor com cor
 * vira exceção, para continuar indo para o mesmo lugar.
 */
export function trocarFibrasNoCadastro(c: CadastroLigacoes, cabo: string, lado: Lado, mapa: Map<number, number>): CadastroLigacoes {
  const k = chaveCabo(cabo);
  const nova = (p?: PontaFibra) => (p && chaveCabo(p.cabo) === k && mapa.has(p.fibra) ? { cabo: p.cabo, fibra: mapa.get(p.fibra)! } : undefined);
  const emendas = c.emendas.map((m) => (lado === "chega" ? (nova(m.de) ? { ...m, de: nova(m.de)! } : m) : nova(m.para) ? { ...m, para: nova(m.para)! } : m));
  // regra cor com cor deste cabo: a fibra nova leva a exceção (a antiga ia pela regra)
  const regra = c.regras_emenda.find((r) => chaveCabo(lado === "chega" ? r.de : r.para) === k);
  if (regra) {
    for (const [de, para] of mapa) {
      const temAvulsa = c.emendas.some((m) => { const p = lado === "chega" ? m.de : m.para; return chaveCabo(p.cabo) === k && p.fibra === de; });
      if (temAvulsa) continue;
      emendas.push(lado === "chega"
        ? { de: { cabo, fibra: para }, para: { cabo: regra.para, fibra: de } }
        : { de: { cabo: regra.de, fibra: de }, para: { cabo, fibra: para } });
    }
  }
  return {
    ...c,
    emendas,
    splitters: c.splitters.map((s) => ({
      ...s,
      entrada: lado === "chega" && nova(s.entrada.fibra) ? { fibra: nova(s.entrada.fibra)! } : s.entrada,
      portas: lado === "sai" ? s.portas.map((p) => { const n = nova(p.saida); return n ? { ...p, saida: n, descricao: `F${n.fibra} · ${n.cabo}` } : p; }) : s.portas,
    })),
  };
}

/** Por onde sai o sinal que chega em `chegada`, pelo cadastro (fusão, regra cor com cor ou perna escolhida) */
function saidaNoCadastro(c: CadastroLigacoes, chegada: PontaFibra, porta?: { spl: string; porta: number }): PontaFibra | undefined {
  if (porta) return c.splitters.find((x) => x.id === porta.spl)?.portas.find((p) => p.numero === porta.porta)?.saida;
  const av = c.emendas.find((m) => mesmaFibra(m.de, chegada));
  if (av) return av.para;
  const g = c.regras_emenda.find((r) => chaveCabo(r.de) === chaveCabo(chegada.cabo));
  return g ? { cabo: g.para, fibra: chegada.fibra } : undefined;
}

/** O splitter de 1º nível de onde vem uma porta (sobe pelo 2º nível) */
function raizDoSplitter(c: CadastroLigacoes, id: string): SplitterCaixa | undefined {
  let s = c.splitters.find((x) => x.id === id);
  for (let g = 0; s?.entrada.splitter && g < 10; g++) s = c.splitters.find((x) => x.id === s!.entrada.splitter!.id);
  return s;
}

/** A porta de splitter que leva à fibra que sai */
function portaQueLeva(c: CadastroLigacoes, saida: PontaFibra): { spl: string; porta: number } | undefined {
  for (const s of c.splitters) for (const p of s.portas) if (p.saida && mesmaFibra(p.saida, saida)) return { spl: s.id, porta: p.numero };
  return undefined;
}

/** De que fibra que chega vem o sinal que sai em `saida`, pelo cadastro (fusão, regra ou splitter) */
function entradaNoCadastro(c: CadastroLigacoes, saida: PontaFibra): PontaFibra | undefined {
  const pt = portaQueLeva(c, saida);
  if (pt) return raizDoSplitter(c, pt.spl)?.entrada.fibra;
  const av = c.emendas.find((m) => mesmaFibra(m.para, saida));
  if (av) return av.de;
  const g = c.regras_emenda.find((r) => chaveCabo(r.para) === chaveCabo(saida.cabo));
  if (g && !c.emendas.some((m) => mesmaFibra(m.de, { cabo: g.de, fibra: saida.fibra }))) return { cabo: g.de, fibra: saida.fibra };
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Plano de troca
// ---------------------------------------------------------------------------------------------

/** Uma troca que aparece na revisão */
export interface MudancaRota {
  rota: RotaOptica;
  /** "sai": a fibra que sai da caixa editada; "chega": a que entra nela */
  sentido: Lado;
  de: PontaFibra;
  para: PontaFibra;
  /** Caixas onde o cabo só passa e que levam a fibra nova junto */
  seguem: string[];
  /** Caixa da outra ponta do cabo */
  ponta: string;
}

/** Na caixa da outra ponta do cabo: a fibra `de` vira `para` */
export interface TrocaNaPonta { chave: string; nome: string; cabo: string; lado: Lado; de: number; para: number; /** rotas (donas) que levam a esta troca */ rotas: string[] }

export interface PlanoTroca {
  /** Rotas donas com os elementos e trechos novos (montadas) */
  rotas: Map<string, RotaOptica>;
  /** O que mostrar na revisão */
  mudancas: MudancaRota[];
  /** O que muda nas caixas das pontas dos cabos */
  pontas: TrocaNaPonta[];
  /** Trocas que mudariam o caminho (cabo que vai para outra caixa): só no mapa da rota */
  bloqueadas: { rota: RotaOptica; motivo: string }[];
}

const planoVazio = (): PlanoTroca => ({ rotas: new Map(), mudancas: [], pontas: [], bloqueadas: [] });

function juntarPonta(pontas: TrocaNaPonta[], pc: TrocaNaPonta) {
  const ja = pontas.find((x) => x.chave === pc.chave && chaveCabo(x.cabo) === chaveCabo(pc.cabo) && x.lado === pc.lado && x.de === pc.de);
  if (!ja) { pontas.push(pc); return; }
  for (const id of pc.rotas) if (!ja.rotas.includes(id)) ja.rotas.push(id);
}

/**
 * Aplica as trocas das pontas nos cadastros. Só as que vêm de rotas escolhidas (ou todas, sem filtro);
 * várias trocas no mesmo cabo de uma caixa vão juntas (F1↔F3 sem atropelar).
 */
export function caixasDoPlano(
  pontas: TrocaNaPonta[],
  cadastroDe: (chave: string) => CadastroLigacoes | undefined,
  base: Map<string, CadastroLigacoes> = new Map(),
  rotasMarcadas?: Set<string>,
): Map<string, CadastroLigacoes> {
  const grupos = new Map<string, { chave: string; cabo: string; lado: Lado; mapa: Map<number, number> }>();
  for (const pt of pontas) {
    if (rotasMarcadas && !pt.rotas.some((id) => rotasMarcadas.has(id))) continue;
    const k = `${pt.chave}|${chaveCabo(pt.cabo)}|${pt.lado}`;
    const g = grupos.get(k) ?? { chave: pt.chave, cabo: pt.cabo, lado: pt.lado, mapa: new Map<number, number>() };
    g.mapa.set(pt.de, pt.para);
    grupos.set(k, g);
  }
  const out = new Map(base);
  for (const g of grupos.values()) {
    const atual = out.get(g.chave) ?? cadastroDe(g.chave);
    if (!atual) continue;
    const novo = trocarFibrasNoCadastro(atual, g.cabo, g.lado, g.mapa);
    // caixa sem nada neste cabo (só passa) não entra no plano
    if (out.has(g.chave) || JSON.stringify(novo) !== JSON.stringify(atual)) out.set(g.chave, novo);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pela caixa (Unifilar): o cadastro mudou → rotas e pontas
// ---------------------------------------------------------------------------------------------

/**
 * Depois de mudar o cadastro de uma caixa (`antes` → `depois`): as rotas cujo sinal agora sai ou entra por
 * outra fibra, e o que muda na caixa da outra ponta de cada cabo. Cabo que vai para outra caixa não muda o
 * caminho sozinho (fica em `bloqueadas`). Cada elemento muda na rota dona dele (a mãe, quando é tronco).
 */
export function planoPelaCaixa(chave: string, rotas: RotaOptica[], antes: CadastroLigacoes, depois: CadastroLigacoes): PlanoTroca {
  const plano = planoVazio();
  const novos = new Map<string, ElementoRota[]>();
  const trechosNovos = new Map<string, TrechoCabo[]>();
  const feitas = new Set<string>();
  /** Caixa de onde sai e onde chega cada cabo (pelas rotas) */
  const pontasCabo = new Map<string, [string, string]>();
  for (const r of rotas) r.elementos.forEach((e, i) => { if (i > 0 && e.cabo_entrada && !pontasCabo.has(chaveCabo(e.cabo_entrada))) pontasCabo.set(chaveCabo(e.cabo_entrada), [chaveElemento(r.elementos[i - 1]), chaveElemento(e)]); });
  const dono = (r: RotaOptica, k: number) => donoDoElemento(r, k, rotas);
  /** Muda o elemento k da rota (na rota dona dele) */
  const mexer = (r: RotaOptica, k: number, f: (e: ElementoRota) => void) => {
    const d = dono(r, k);
    const els = novos.get(d.id) ?? d.elementos.map((x) => ({ ...x }));
    if (els[k]) f(els[k]);
    novos.set(d.id, els);
    return d;
  };

  /** A fibra que sai desta caixa (elemento i → i+1) passou de `de` para `para` */
  function naSaida(r: RotaOptica, i: number, de: PontaFibra, para: PontaFibra) {
    const prox = r.elementos[i + 1];
    const mesmoCabo = chaveCabo(para.cabo) === chaveCabo(de.cabo);
    const pt = pontasCabo.get(chaveCabo(para.cabo));
    if (!mesmoCabo && (!pt || pt[0] !== chave || pt[1] !== chaveElemento(prox))) {
      plano.bloqueadas.push({ rota: dono(r, i + 1), motivo: `${nomeCabo(para.cabo)} não vai para ${prox.nome}: para mudar o caminho, edite a rota no mapa.` });
      return;
    }
    mexer(r, i, (x) => { if (x.fibra_saida === de.fibra) x.fibra_saida = para.fibra; if (x.cabo_saida && chaveCabo(x.cabo_saida) === chaveCabo(de.cabo)) x.cabo_saida = para.cabo; });
    const d = mexer(r, i + 1, (x) => { x.cabo_entrada = para.cabo; x.fibra_entrada = para.fibra; });
    const seguem: string[] = [];
    let fim = i + 1;
    if (mesmoCabo) {
      // o cabo segue passando direto: a fibra nova vai junto até onde ele termina
      for (let j = i + 2; j < r.elementos.length; j++) {
        const x = r.elementos[j];
        if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(de.cabo) || x.fibra_entrada !== de.fibra) break;
        mexer(r, j - 1, (y) => { if (y.fibra_saida === de.fibra) y.fibra_saida = para.fibra; });
        mexer(r, j, (y) => { y.fibra_entrada = para.fibra; });
        seguem.push(x.nome);
        fim = j;
      }
      const cx = r.elementos[fim];
      juntarPonta(plano.pontas, { chave: chaveElemento(cx), nome: cx.nome, cabo: de.cabo, lado: "chega", de: de.fibra, para: para.fibra, rotas: [d.id] });
    } else {
      // outro cabo entre as mesmas duas caixas: o trecho no mapa passa a ser dele
      trechosNovos.set(d.id, (trechosNovos.get(d.id) ?? d.trechos).map((t) => (t.ate === i + 1 ? { ...t, nome: para.cabo } : t)));
    }
    plano.mudancas.push({ rota: d, sentido: "sai", de, para, seguem, ponta: r.elementos[fim].nome });
  }

  /** A fibra que entra nesta caixa (elemento i) passou de `de` para `para` */
  function naEntrada(r: RotaOptica, i: number, de: PontaFibra, para: PontaFibra) {
    if (chaveCabo(para.cabo) !== chaveCabo(de.cabo)) {
      plano.bloqueadas.push({ rota: dono(r, i), motivo: `a entrada passou para ${nomeCabo(para.cabo)}, que não é o cabo por onde a rota chega: para mudar o caminho, edite a rota no mapa.` });
      return;
    }
    // volta pelo cabo enquanto ele só passa pelas caixas de trás
    let ini = i;
    for (let j = i - 1; j >= 1; j--) {
      const x = r.elementos[j];
      if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(de.cabo) || x.fibra_entrada !== de.fibra) break;
      ini = j;
    }
    const passam: string[] = [];
    for (let j = ini; j <= i; j++) {
      mexer(r, j, (x) => { x.fibra_entrada = para.fibra; });
      mexer(r, j - 1, (x) => { if (x.fibra_saida === de.fibra) x.fibra_saida = para.fibra; });
      if (j < i) passam.push(r.elementos[j].nome);
    }
    const cx = r.elementos[ini - 1];
    juntarPonta(plano.pontas, { chave: chaveElemento(cx), nome: cx.nome, cabo: de.cabo, lado: "sai", de: de.fibra, para: para.fibra, rotas: [dono(r, i).id] });
    plano.mudancas.push({ rota: dono(r, i), sentido: "chega", de, para, seguem: passam, ponta: cx.nome });
  }

  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada || !e.fibra_entrada) return;
      const chegada = { cabo: e.cabo_entrada, fibra: e.fibra_entrada };
      const prox = r.elementos[i + 1];
      // a rota pode terminar nesta caixa (CTO, CDOI): aí só a fibra que entra conta
      const saiHoje = prox?.cabo_entrada && prox.fibra_entrada ? { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada } : undefined;

      // a fibra que sai: pelo splitter (a perna que levava a rota) ou pela fusão
      if (saiHoje) {
        const porta = portaQueLeva(antes, saiHoje);
        const pelaPorta = !!porta || antes.splitters.some((s) => !!s.entrada.fibra && mesmaFibra(s.entrada.fibra, chegada));
        const velho = pelaPorta ? (porta ? saiHoje : undefined) : saidaNoCadastro(antes, chegada);
        const novo = pelaPorta ? (porta ? saidaNoCadastro(depois, chegada, porta) : undefined) : saidaNoCadastro(depois, chegada);
        const k = `s|${dono(r, i + 1).id}|${i + 1}`;
        if (novo && !(velho && mesmaFibra(velho, novo)) && !mesmaFibra(novo, saiHoje) && !feitas.has(k)) {
          feitas.add(k);
          naSaida(r, i, saiHoje, novo);
        }
      }

      // a fibra que entra: o que alimenta a saída desta rota, ou o splitter que a recebia (pelo código)
      let veio = saiHoje ? entradaNoCadastro(antes, saiHoje) : undefined;
      let vem = saiHoje ? entradaNoCadastro(depois, saiHoje) : undefined;
      if (!vem) {
        const spl = antes.splitters.find((x) => !!x.entrada.fibra && mesmaFibra(x.entrada.fibra, chegada));
        const ent = spl ? depois.splitters.find((x) => x.id === spl.id)?.entrada.fibra : undefined;
        if (ent) { veio = chegada; vem = ent; }
      }
      const k = `c|${dono(r, i).id}|${i}`;
      if (vem && !mesmaFibra(vem, chegada) && (!veio || mesmaFibra(veio, chegada)) && !feitas.has(k)) {
        feitas.add(k);
        naEntrada(r, i, chegada, vem);
      }
    });
  }

  for (const [id, elementos] of novos) {
    const r = rotas.find((x) => x.id === id)!;
    plano.rotas.set(id, { ...r, elementos, trechos: trechosNovos.get(id) ?? r.trechos });
  }
  // a própria caixa não é "outra ponta"
  plano.pontas = plano.pontas.filter((p) => p.chave !== chave);
  return plano;
}

// ---------------------------------------------------------------------------------------------
// Pelas rotas (editor da rota, Trocar fibra, adaptador do DIO, prédio): a rota mudou → pontas
// ---------------------------------------------------------------------------------------------

/**
 * Fibra trocada numa rota: o que muda nas caixas das pontas de cada trecho. O trecho é comparado pelas
 * mesmas duas caixas e o mesmo cabo; para trás, o cabo atravessa as caixas onde só passa e o prédio
 * (que recebe o cabo inteiro), até a caixa de onde ele sai.
 */
export function pontasDaRota(antes: ElementoRota[], depois: ElementoRota[], rotaId = ""): TrocaNaPonta[] {
  const pontas: TrocaNaPonta[] = [];
  for (let i = 1; i < depois.length; i++) {
    const e = depois[i], a = depois[i - 1];
    if (!e.cabo_entrada || !e.fibra_entrada || e.tipo === "predio") continue;
    const j = antes.findIndex((x, k) => k > 0 && chaveElemento(x) === chaveElemento(e) && chaveElemento(antes[k - 1]) === chaveElemento(a));
    const v = j > 0 ? antes[j] : undefined;
    if (!v?.cabo_entrada || !v.fibra_entrada || chaveCabo(v.cabo_entrada) !== chaveCabo(e.cabo_entrada) || v.fibra_entrada === e.fibra_entrada) continue;
    const de = v.fibra_entrada, para = e.fibra_entrada;
    // caixa de onde o cabo sai: volta pelas que ele só atravessa (mesmo cabo, mesma fibra) e pelo prédio
    let s = j;
    while (s - 1 >= 1) {
      const x = antes[s - 1];
      if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(e.cabo_entrada) || (x.fibra_entrada !== de && x.tipo !== "predio")) break;
      s--;
    }
    const origem = antes[s - 1];
    juntarPonta(pontas, { chave: chaveElemento(origem), nome: origem.nome, cabo: e.cabo_entrada, lado: "sai", de, para, rotas: [rotaId] });
    juntarPonta(pontas, { chave: chaveElemento(e), nome: e.nome, cabo: e.cabo_entrada, lado: "chega", de, para, rotas: [rotaId] });
  }
  return pontas;
}

/** Rotas mudadas (antes → depois, pelo id): as trocas nas pontas de todas elas */
export function planoPelasRotas(antes: RotaOptica[], depois: RotaOptica[]): PlanoTroca {
  const plano = planoVazio();
  for (const r of depois) {
    const v = antes.find((x) => x.id === r.id);
    if (!v) continue;
    plano.rotas.set(r.id, r);
    for (const pt of pontasDaRota(v.elementos, r.elementos, r.id)) juntarPonta(plano.pontas, pt);
  }
  return plano;
}

// ---------------------------------------------------------------------------------------------
// Trocar fibra (várias rotas de um cabo de uma vez)
// ---------------------------------------------------------------------------------------------

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
      if (trechos.has(chaveTrecho(r.elementos[i - 1], r.elementos[i]))) { out.push({ rota: r, trecho: chaveTrecho(r.elementos[i - 1], r.elementos[i]) }); break; }
    }
  }
  return out;
}

/** Troca a fibra nos trechos escolhidos da parte própria da rota. null se nada mudou. */
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
