// =====================
// Unifilar de uma caixa (estilo GeoGrid): os cabos que chegam e saem, os splitters e as ligações
// entre os pontos (fibra ↔ fibra, fibra → entrada do splitter, porta → fibra, porta → splitter).
// Monta pelo cadastro da caixa + o que as rotas dizem, e edita o cadastro (funções puras).
// =====================
import { chaveElemento } from "./arvorePon";
import { chaveCabo } from "./cabosRede";
import { portasPara, type CaixaRede, type EmendaCaixa, type PontaFibra, type SplitterCaixa } from "./caixasRede";
import { capacidadeDoCabo, capacidadeRegistrada, tipoVisual, type ElementoRota, type RotaOptica, type TipoElementoRota } from "./rotaOptica";

export type Lado = "chega" | "sai";

/** Um ponto de ligação dentro da caixa */
export type PontoUni =
  | { k: "fibra"; lado: Lado; cabo: string; fibra: number }
  | { k: "entrada"; spl: string }
  | { k: "porta"; spl: string; porta: number }
  /** porta PON da OLT ("PL 06 - Porta 02") */
  | { k: "pon"; porta: string }
  /** adaptador (porta) do DIO */
  | { k: "adaptador"; n: number };

/** cordao = porta PON → cordão que sai da OLT; dio = cordão → adaptador → fibra do cabo que sai (pelas rotas) */
export type TipoLigacao = "fusao" | "entrada" | "perna" | "nivel2" | "passa" | "cordao" | "dio";
export interface LigacaoUni {
  id: string;
  tipo: TipoLigacao;
  a: PontoUni;
  b: PontoUni;
  /** cadastro = gravado na caixa; regra = "cor com cor"; rota = só a rota diz (sugestão); passa = a fibra segue sem corte */
  origem: "cadastro" | "regra" | "rota";
}

/** Uma ponta de cabo na caixa (o mesmo cabo que passa aparece duas vezes: chega e sai) */
export interface CaboUni {
  id: string;
  nome: string;
  chave: string;
  lado: Lado;
  capacidade: number;
  /** fibras com sinal (usadas por rotas) e a rota de cada uma */
  sinal: Map<number, string[]>;
  /** caixa do outro lado do cabo (de onde vem / para onde vai) */
  outraPonta?: string;
  /** chave da caixa do outro lado (para abrir ela no unifilar da rede) */
  outraChave?: string;
}

export interface ModeloUnifilar {
  cabos: CaboUni[];
  ligacoes: LigacaoUni[];
}

export const idPonto = (p: PontoUni) =>
  p.k === "fibra" ? `f:${p.lado}:${chaveCabo(p.cabo)}:${p.fibra}`
    : p.k === "entrada" ? `e:${p.spl}`
      : p.k === "porta" ? `p:${p.spl}:${p.porta}`
        : p.k === "pon" ? `o:${p.porta}`
          : `a:${p.n}`;

/** Número da porta do DIO ("Porta 13" → 13) */
export const numeroPortaDio = (porta?: string) => { const m = porta?.match(/Porta\s*0*(\d+)/i); return m ? +m[1] : undefined; };
const idCabo = (cabo: string, lado: Lado) => `${lado}:${chaveCabo(cabo)}`;
const mesmaFibra = (a: PontaFibra, b: PontaFibra) => chaveCabo(a.cabo) === chaveCabo(b.cabo) && a.fibra === b.fibra;

/** Monta o unifilar da caixa `chave` com o cadastro `cad` e as rotas */
export function montarUnifilar(chave: string, rotas: RotaOptica[], cad: Partial<CaixaRede> | undefined): ModeloUnifilar {
  const cabos = new Map<string, CaboUni>();
  const garantir = (nome: string, lado: Lado, outra?: ElementoRota) => {
    const id = idCabo(nome, lado);
    const c = cabos.get(id) ?? { id, nome, chave: chaveCabo(nome), lado, capacidade: 0, sinal: new Map<number, string[]>(), outraPonta: outra?.nome, outraChave: outra ? chaveElemento(outra) : undefined };
    if (!c.outraPonta && outra) { c.outraPonta = outra.nome; c.outraChave = chaveElemento(outra); }
    cabos.set(id, c);
    return c;
  };
  const marcar = (c: CaboUni, f: number, rota: string) => { c.sinal.set(f, [...new Set([...(c.sinal.get(f) ?? []), rota])]); };

  // o que as rotas dizem: a fibra que chega e para onde ela segue
  type Passo = { de: PontaFibra; para?: PontaFibra; splitter: boolean; adaptador?: number };
  const passos: Passo[] = [];
  /** OLT: porta PON → cordão que sai */
  const cordoes: { porta: string; para: PontaFibra }[] = [];
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 && chaveElemento(e) === chave) {
        const prox = r.elementos[1];
        if (e.porta && prox?.cabo_entrada) {
          const cout = garantir(prox.cabo_entrada, "sai", prox);
          marcar(cout, prox.fibra_entrada ?? 1, r.nome);
          cordoes.push({ porta: e.porta, para: { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada ?? 1 } });
        }
        return;
      }
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada) return;
      const ant = r.elementos[i - 1];
      const prox = r.elementos[i + 1];
      const cin = garantir(e.cabo_entrada, "chega", ant);
      if (e.fibra_entrada) marcar(cin, e.fibra_entrada, r.nome);
      if (prox?.cabo_entrada) {
        const cout = garantir(prox.cabo_entrada, "sai", prox);
        if (prox.fibra_entrada) marcar(cout, prox.fibra_entrada, r.nome);
      }
      if (e.fibra_entrada) {
        passos.push({
          de: { cabo: e.cabo_entrada, fibra: e.fibra_entrada },
          para: prox?.cabo_entrada && prox.fibra_entrada ? { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada } : undefined,
          splitter: !e.passagem && !!(e.splitter || cad?.splitters?.length || cad?.splitter),
          adaptador: e.tipo === "dio" ? numeroPortaDio(e.porta) ?? prox?.fibra_entrada : undefined,
        });
      }
    });
  }
  // cabos que só o cadastro conhece
  (cad?.emendas ?? []).forEach((m) => { garantir(m.de.cabo, "chega"); garantir(m.para.cabo, "sai"); });
  (cad?.regras_emenda ?? []).forEach((g) => { garantir(g.de, "chega"); garantir(g.para, "sai"); });
  (cad?.splitters ?? []).forEach((s) => {
    if (s.entrada.fibra) garantir(s.entrada.fibra.cabo, "chega");
    s.portas.forEach((p) => { if (p.saida) garantir(p.saida.cabo, "sai"); });
  });

  // capacidade de cada ponta
  for (const c of cabos.values()) {
    const usadas = [...c.sinal.keys(), 1];
    // cadastro do cabo; senão o número do nome ("24 FO ASO"); senão o mínimo que cabe as fibras usadas
    const doNome = c.nome.match(/(?:^|\s)(\d{1,3})\s*(?:FO|F|FIBRAS)(?![A-Za-z])/i);
    const porNome = doNome ? +doNome[1] : undefined;
    c.capacidade = capacidadeRegistrada(c.nome) ?? (porNome && porNome >= Math.max(...usadas) ? porNome : capacidadeDoCabo(c.nome, Math.max(...usadas)));
  }

  const ligacoes: LigacaoUni[] = [];
  const add = (tipo: TipoLigacao, a: PontoUni, b: PontoUni, origem: LigacaoUni["origem"]) => {
    const id = `${tipo}|${idPonto(a)}|${idPonto(b)}`;
    if (!ligacoes.some((l) => l.id === id)) ligacoes.push({ id, tipo, a, b, origem });
  };
  const fib = (p: PontaFibra, lado: Lado): PontoUni => ({ k: "fibra", lado, cabo: p.cabo, fibra: p.fibra });

  // cadastro: avulsas valem por cima das regras
  const avulsas = cad?.emendas ?? [];
  for (const g of cad?.regras_emenda ?? []) {
    const n = Math.min(cabos.get(idCabo(g.de, "chega"))?.capacidade ?? 12, cabos.get(idCabo(g.para, "sai"))?.capacidade ?? 12);
    for (let f = 1; f <= n; f++) {
      const de = { cabo: g.de, fibra: f };
      if (avulsas.some((m) => mesmaFibra(m.de, de))) continue;
      add("fusao", fib(de, "chega"), fib({ cabo: g.para, fibra: f }, "sai"), "regra");
    }
  }
  avulsas.forEach((m) => add("fusao", fib(m.de, "chega"), fib(m.para, "sai"), "cadastro"));
  for (const s of cad?.splitters ?? []) {
    if (s.entrada.fibra) add("entrada", fib(s.entrada.fibra, "chega"), { k: "entrada", spl: s.id }, "cadastro");
    if (s.entrada.splitter) add("nivel2", { k: "porta", spl: s.entrada.splitter.id, porta: s.entrada.splitter.porta }, { k: "entrada", spl: s.id }, "cadastro");
    for (const p of s.portas) if (p.saida) add("perna", { k: "porta", spl: s.id, porta: p.numero }, fib(p.saida, "sai"), "cadastro");
  }

  // OLT: cada porta PON com o seu cordão
  for (const c of cordoes) add("cordao", { k: "pon", porta: c.porta }, fib(c.para, "sai"), "rota");

  // rotas: passa direto (mesmo cabo e fibra) e as fusões que o cadastro ainda não tem (sugestões)
  const ocupado = new Set(ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
  for (const p of passos) {
    // DIO: o cordão entra num adaptador e o adaptador é a fibra do cabo que sai (porta N = fibra N)
    if (p.adaptador) {
      add("dio", fib(p.de, "chega"), { k: "adaptador", n: p.adaptador }, "rota");
      if (p.para) add("dio", { k: "adaptador", n: p.adaptador }, fib(p.para, "sai"), "rota");
      continue;
    }
    if (!p.para) continue;
    if (mesmaFibra(p.de, p.para)) { add("passa", fib(p.de, "chega"), fib(p.para, "sai"), "rota"); continue; }
    if (p.splitter) continue;
    const a = fib(p.de, "chega"), b = fib(p.para, "sai");
    if (ocupado.has(idPonto(a)) || ocupado.has(idPonto(b))) continue;
    add("fusao", a, b, "rota");
  }
  return { cabos: [...cabos.values()], ligacoes };
}

// ---------- Edição do cadastro (funções puras) ----------

export interface CadastroLigacoes {
  emendas: EmendaCaixa[];
  regras_emenda: { de: string; para: string }[];
  splitters: SplitterCaixa[];
}

/** Ordem padrão de uma ligação: fibra que chega → … → fibra que sai */
function ordenar(a: PontoUni, b: PontoUni): [PontoUni, PontoUni] {
  const peso = (p: PontoUni) => (p.k === "fibra" ? (p.lado === "chega" ? 0 : 3) : p.k === "entrada" ? 1 : 2);
  return peso(a) <= peso(b) ? [a, b] : [b, a];
}

/** Que tipo de ligação dois pontos formam (ou o motivo de não poder) */
export function tipoEntre(a: PontoUni, b: PontoUni): TipoLigacao | string {
  const [x, y] = ordenar(a, b);
  if (x.k === "fibra" && y.k === "fibra") return x.lado === y.lado && chaveCabo(x.cabo) === chaveCabo(y.cabo) ? "Escolha uma fibra de outro cabo." : "fusao";
  if (x.k === "fibra" && y.k === "entrada") return x.lado === "chega" ? "entrada" : "A entrada do splitter recebe uma fibra que chega.";
  if (x.k === "entrada" && y.k === "porta") return x.spl === y.spl ? "O splitter não pode alimentar a si mesmo." : "nivel2";
  if (x.k === "porta" && y.k === "fibra") return y.lado === "sai" ? "perna" : "A porta do splitter vai para uma fibra que sai.";
  if (x.k === "fibra" && y.k === "porta") return x.lado === "sai" ? "perna" : "A porta do splitter vai para uma fibra que sai.";
  return "Essa ligação não existe numa caixa.";
}

/** Tira do cadastro tudo que usa o ponto (para religar ou desligar) */
export function soltarPonto(c: CadastroLigacoes, p: PontoUni): CadastroLigacoes {
  const id = idPonto(p);
  return {
    // regra não se apaga por um ponto: vira exceção (a fibra deixa de seguir a regra quando ganhar outra ligação)
    regras_emenda: c.regras_emenda,
    emendas: c.emendas.filter((m) => idPonto({ k: "fibra", lado: "chega", ...m.de }) !== id && idPonto({ k: "fibra", lado: "sai", ...m.para }) !== id),
    splitters: c.splitters.map((s) => ({
      ...s,
      entrada:
        (s.entrada.fibra && idPonto({ k: "fibra", lado: "chega", ...s.entrada.fibra }) === id) ||
        (p.k === "entrada" && p.spl === s.id) ||
        (s.entrada.splitter && idPonto({ k: "porta", spl: s.entrada.splitter.id, porta: s.entrada.splitter.porta }) === id)
          ? {}
          : s.entrada,
      portas: portasPara(s.relacao, s.portas).map((pt) =>
        (pt.saida && idPonto({ k: "fibra", lado: "sai", ...pt.saida }) === id) || (p.k === "porta" && p.spl === s.id && p.porta === pt.numero)
          ? { numero: pt.numero, status: pt.status === "cliente" ? pt.status : "livre", ...(pt.status === "cliente" ? { descricao: pt.descricao, cliente_id: pt.cliente_id } : {}) }
          : pt,
      ),
    })),
  };
}

/** Liga dois pontos (troca o que estava ligado neles) */
export function ligar(c: CadastroLigacoes, a0: PontoUni, b0: PontoUni): CadastroLigacoes | string {
  const t = tipoEntre(a0, b0);
  if (!["fusao", "entrada", "perna", "nivel2"].includes(t)) return t;
  const [a, b] = ordenar(a0, b0);
  let n = soltarPonto(soltarPonto(c, a), b);
  if (t === "fusao" && a.k === "fibra" && b.k === "fibra") {
    n = { ...n, emendas: [...n.emendas, { de: { cabo: a.cabo, fibra: a.fibra }, para: { cabo: b.cabo, fibra: b.fibra } }] };
  } else if (t === "entrada" && a.k === "fibra" && b.k === "entrada") {
    n = { ...n, splitters: n.splitters.map((s) => (s.id === b.spl ? { ...s, entrada: { fibra: { cabo: a.cabo, fibra: a.fibra } } } : s)) };
  } else if (t === "nivel2") {
    const ent = (a.k === "entrada" ? a : b) as { k: "entrada"; spl: string };
    const por = (a.k === "porta" ? a : b) as { k: "porta"; spl: string; porta: number };
    n = { ...n, splitters: n.splitters.map((s) => (s.id === ent.spl ? { ...s, entrada: { splitter: { id: por.spl, porta: por.porta } } } : s)) };
  } else if (t === "perna") {
    const por = (a.k === "porta" ? a : b) as { k: "porta"; spl: string; porta: number };
    const f = (a.k === "fibra" ? a : b) as { k: "fibra"; cabo: string; fibra: number };
    n = {
      ...n,
      splitters: n.splitters.map((s) =>
        s.id === por.spl
          ? { ...s, portas: portasPara(s.relacao, s.portas).map((pt) => (pt.numero === por.porta ? { numero: pt.numero, status: "ramal" as const, saida: { cabo: f.cabo, fibra: f.fibra }, descricao: `F${f.fibra} · ${f.cabo}` } : pt)) }
          : s,
      ),
    };
  }
  return n;
}

/** Desliga uma ligação do cadastro (regra: a fibra vira exceção sem emenda) */
export function desligar(c: CadastroLigacoes, l: LigacaoUni): CadastroLigacoes {
  return soltarPonto(c, l.a.k === "fibra" ? l.a : l.b);
}

/** Cor com cor: fibra N do cabo que chega na fibra N do cabo que sai */
export function corComCor(c: CadastroLigacoes, chega: string, sai: string): CadastroLigacoes {
  return { ...c, regras_emenda: [...c.regras_emenda.filter((g) => chaveCabo(g.de) !== chaveCabo(chega)), { de: chega, para: sai }] };
}

// ---------- Traçar rota ----------

/** Pontos ligados ao ponto clicado, seguindo as ligações dentro da caixa (o caminho laranja) */
export function caminhoNaCaixa(m: ModeloUnifilar, p: PontoUni): Set<string> {
  const vistos = new Set<string>([idPonto(p)]);
  const lig = new Set<string>();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const l of m.ligacoes) {
      const ia = idPonto(l.a), ib = idPonto(l.b);
      if (vistos.has(ia) !== vistos.has(ib)) { vistos.add(ia); vistos.add(ib); lig.add(l.id); mudou = true; }
      else if (vistos.has(ia) && vistos.has(ib) && !lig.has(l.id)) { lig.add(l.id); }
    }
    // a entrada do splitter acende todas as portas dele (o sinal se divide)
    for (const id of [...vistos]) {
      if (!id.startsWith("e:")) continue;
      const spl = id.slice(2);
      for (const l of m.ligacoes) for (const q of [l.a, l.b]) if (q.k === "porta" && q.spl === spl && !vistos.has(idPonto(q))) { vistos.add(idPonto(q)); mudou = true; }
    }
  }
  return new Set([...vistos, ...[...lig].map((x) => `L:${x}`)]);
}

/** Um passo da rota inteira (OLT → … → ponta) */
export interface PassoRota { chave: string; nome: string; tipo: TipoElementoRota; cabo?: string; fibra?: number; porta?: string }

/** As rotas que usam esta fibra deste cabo, com a sequência inteira de cada uma */
export function rotasDaFibra(rotas: RotaOptica[], cabo: string, fibra: number): { rota: RotaOptica; passos: PassoRota[] }[] {
  const k = chaveCabo(cabo);
  return rotas
    .filter((r) => r.elementos.some((e) => !!e.cabo_entrada && e.fibra_entrada === fibra && chaveCabo(e.cabo_entrada) === k))
    .map((r) => ({ rota: r, passos: r.elementos.map((e: ElementoRota) => ({ chave: chaveElemento(e), nome: e.nome, tipo: tipoVisual(e), cabo: e.cabo_entrada, fibra: e.fibra_entrada, porta: e.porta || undefined })) }))
    // as rotas principais primeiro, depois as mais longas
    .sort((a, b) => Number(!!a.rota.pai) - Number(!!b.rota.pai) || b.passos.length - a.passos.length);
}

// ---------- Montar pelas rotas ----------

/**
 * Completa os splitters da caixa com o que as rotas dizem: um splitter para cada fibra que chega e usa
 * splitter (a porta PON), com a entrada ligada, e as pernas indo para as fibras que saem (cabos de prédio,
 * CTOs depois da HUB…). O que já está no cadastro fica como está; só preenche o que falta.
 */
export function completarPelasRotas(chave: string, rotas: RotaOptica[], c: CadastroLigacoes): { ed: CadastroLigacoes; splitters: number; pernas: number } {
  const spls = c.splitters.map((s) => ({ ...s, entrada: { ...s.entrada }, portas: portasPara(s.relacao, s.portas).map((p) => ({ ...p })) }));
  let novosSpl = 0, novasPernas = 0;
  const achar = (f: PontaFibra) => spls.find((s) => s.entrada.fibra && mesmaFibra(s.entrada.fibra, f));
  // 1) splitters: um por fibra que chega e usa splitter aqui
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || e.passagem || !e.splitter || !e.cabo_entrada || !e.fibra_entrada) return;
      const f = { cabo: e.cabo_entrada, fibra: e.fibra_entrada };
      if (achar(f)) return;
      // um splitter antigo sem entrada e da mesma relação: ganha a entrada (em vez de criar outro)
      const solto = spls.find((s) => !s.entrada.fibra && !s.entrada.splitter && s.relacao === e.splitter);
      if (solto) { solto.entrada = { fibra: f }; return; }
      spls.push({ id: `r${spls.length + 1}${f.fibra}`, relacao: e.splitter, modelo_id: e.splitter_modelo, entrada: { fibra: f }, portas: portasPara(e.splitter, []) });
      novosSpl++;
    });
  }
  // 2) pernas: o que sai depois desta caixa em cada rota vai numa porta do splitter daquela fibra
  const jaSai = (f: PontaFibra) => spls.some((s) => s.portas.some((p) => p.saida && mesmaFibra(p.saida, f)));
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || e.passagem || !e.cabo_entrada || !e.fibra_entrada) return;
      const s = achar({ cabo: e.cabo_entrada, fibra: e.fibra_entrada });
      if (!s) return;
      const prox = r.elementos[i + 1];
      if (!prox?.cabo_entrada) return;
      // cabo até um prédio entra inteiro: as fibras são as das CDOIs logo depois
      const saidas: PontaFibra[] = prox.fibra_entrada
        ? [{ cabo: prox.cabo_entrada, fibra: prox.fibra_entrada }]
        : r.elementos.slice(i + 2).filter((x) => x.cabo_entrada && x.fibra_entrada && chaveCabo(x.cabo_entrada) === chaveCabo(prox.cabo_entrada!)).map((x) => ({ cabo: x.cabo_entrada!, fibra: x.fibra_entrada! }));
      for (const f of saidas) {
        if (jaSai(f)) continue;
        const livre = s.portas.find((p) => p.status === "livre" && !p.saida && !spls.some((x) => x.entrada.splitter?.id === s.id && x.entrada.splitter.porta === p.numero));
        if (!livre) continue;
        livre.status = "ramal";
        livre.saida = f;
        livre.descricao = `F${f.fibra} · ${f.cabo}`;
        novasPernas++;
      }
    });
  }
  const mudou = novosSpl > 0 || novasPernas > 0 || spls.some((s, k) => JSON.stringify(s.entrada) !== JSON.stringify(c.splitters[k]?.entrada));
  return { ed: mudou ? { ...c, splitters: spls } : c, splitters: novosSpl, pernas: novasPernas };
}

/**
 * Troca o adaptador (porta) do DIO numa rota: a porta do DIO e a fibra do cabo que sai dele (porta N = fibra N).
 * Devolve os elementos novos ou null se a rota não passa pelo DIO.
 */
export function trocarPortaDio(r: RotaOptica, chaveDio: string, n: number): ElementoRota[] | null {
  const i = r.elementos.findIndex((e) => chaveElemento(e) === chaveDio && e.tipo === "dio");
  if (i < 0) return null;
  const pad = String(n).padStart(2, "0");
  return r.elementos.map((e, j) => {
    if (j === i) return { ...e, porta: `Porta ${pad}`, fibra_saida: n };
    if (j === i + 1) return { ...e, fibra_entrada: n };
    return e;
  });
}

// ---------- A emenda manda: o que muda na caixa muda as rotas dali pra frente ----------

/** Uma rota que passa a sair por outra fibra depois de uma mudança no cadastro da caixa */
export interface MudancaRota {
  rota: RotaOptica;
  /** Índice do elemento seguinte à caixa (o que chega pela fibra que mudou) */
  i: number;
  de: PontaFibra;
  para: PontaFibra;
  /** Caixas adiante que recebem a fibra nova pelo mesmo cabo (o cabo segue passando por elas) */
  seguem: string[];
  /** Caixa seguinte (onde chega a fibra que mudou) */
  proxima: string;
  /** A rota inteira já com a mudança (e as outras desta mesma rota, se houver) */
  elementos: ElementoRota[];
}

/** Por onde o sinal que chega em `chegada` sai da caixa, pelo cadastro (fusão, regra cor com cor ou perna do splitter) */
function saidaNoCadastro(c: CadastroLigacoes, chegada: PontaFibra, porta?: { spl: string; porta: number }): PontaFibra | undefined {
  if (porta) {
    const s = c.splitters.find((x) => x.id === porta.spl);
    return s?.portas.find((p) => p.numero === porta.porta)?.saida;
  }
  const av = c.emendas.find((m) => mesmaFibra(m.de, chegada));
  if (av) return av.para;
  const g = c.regras_emenda.find((r) => chaveCabo(r.de) === chaveCabo(chegada.cabo));
  return g ? { cabo: g.para, fibra: chegada.fibra } : undefined;
}

/** A porta de splitter (alimentado pela fibra que chega, em qualquer nível) que leva à fibra que sai */
function portaQueLeva(c: CadastroLigacoes, chegada: PontaFibra, saida: PontaFibra): { spl: string; porta: number } | undefined {
  const raizes = c.splitters.filter((s) => s.entrada.fibra && mesmaFibra(s.entrada.fibra, chegada));
  const doGrupo = [...raizes];
  for (let k = 0; k < doGrupo.length; k++) c.splitters.forEach((s) => { if (s.entrada.splitter?.id === doGrupo[k].id && !doGrupo.includes(s)) doGrupo.push(s); });
  for (const s of doGrupo) for (const p of s.portas) if (p.saida && mesmaFibra(p.saida, saida)) return { spl: s.id, porta: p.numero };
  return undefined;
}

/**
 * Depois de mudar o cadastro de uma caixa (`antes` → `depois`): as rotas cujo sinal agora sai por outra fibra.
 * Muda a chegada no elemento seguinte e, se o cabo continua o mesmo, a fibra segue igual pelas caixas
 * onde ele só passa. Se o cabo novo vai para outra caixa, a rota não muda sozinha (vai em `bloqueadas`).
 * Sub-rotas: a mudança vai para a dona do trecho (a rota-mãe quando é tronco).
 */
export function propagarNasRotas(
  chave: string,
  rotas: RotaOptica[],
  antes: CadastroLigacoes,
  depois: CadastroLigacoes,
): { mudancas: MudancaRota[]; bloqueadas: { rota: RotaOptica; motivo: string }[] } {
  const mudancas: MudancaRota[] = [];
  const bloqueadas: { rota: RotaOptica; motivo: string }[] = [];
  const feitas = new Set<string>();
  /** Para que caixa vai cada cabo (pelas rotas): chaveCabo → [caixa de onde sai, caixa onde chega] */
  const pontas = new Map<string, [string, string]>();
  for (const r of rotas) r.elementos.forEach((e, i) => { if (i > 0 && e.cabo_entrada && !pontas.has(chaveCabo(e.cabo_entrada))) pontas.set(chaveCabo(e.cabo_entrada), [chaveElemento(r.elementos[i - 1]), chaveElemento(e)]); });
  const dono = (r: RotaOptica, k: number): RotaOptica => {
    let atual = r;
    for (let g = 0; g < 20; g++) {
      if (!atual.pai || !atual.tronco || k >= atual.tronco) return atual;
      const mae = rotas.find((x) => x.id === atual.pai!.rota_id);
      if (!mae) return atual;
      atual = mae;
    }
    return atual;
  };
  for (const r0 of rotas) {
    r0.elementos.forEach((e, i) => {
      const prox = r0.elementos[i + 1];
      if (i === 0 || chaveElemento(e) !== chave || !prox || !e.cabo_entrada || !e.fibra_entrada || !prox.cabo_entrada || !prox.fibra_entrada) return;
      const chegada = { cabo: e.cabo_entrada, fibra: e.fibra_entrada };
      const saiHoje = { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada };
      // pelo splitter: a porta que hoje leva a rota; depois da mudança, para onde essa porta vai
      const porta = portaQueLeva(antes, chegada, saiHoje);
      const pelaPorta = !!porta || antes.splitters.some((s) => s.entrada.fibra && mesmaFibra(s.entrada.fibra, chegada));
      const velho = pelaPorta ? (porta ? saiHoje : undefined) : saidaNoCadastro(antes, chegada);
      const novo = pelaPorta ? (porta ? saidaNoCadastro(depois, chegada, porta) : undefined) : saidaNoCadastro(depois, chegada);
      // só o que esta mudança mexeu, e que a rota ainda não diz
      if (!novo || (velho && mesmaFibra(velho, novo)) || mesmaFibra(novo, saiHoje)) return;
      const r = dono(r0, i + 1);
      const k = `${r.id}|${i + 1}`;
      if (feitas.has(k)) return;
      feitas.add(k);
      if (chaveCabo(novo.cabo) !== chaveCabo(saiHoje.cabo)) {
        const pt = pontas.get(chaveCabo(novo.cabo));
        if (!pt || pt[0] !== chave || pt[1] !== chaveElemento(prox)) {
          bloqueadas.push({ rota: r, motivo: `${novo.cabo.split(" [")[0]} não vai para ${prox.nome}: para mudar o caminho, edite a rota no mapa.` });
          return;
        }
      }
      const elementos = r.elementos.map((x) => ({ ...x }));
      elementos[i + 1].cabo_entrada = novo.cabo;
      elementos[i + 1].fibra_entrada = novo.fibra;
      if (elementos[i].fibra_saida === saiHoje.fibra) elementos[i].fibra_saida = novo.fibra;
      if (elementos[i].cabo_saida && chaveCabo(elementos[i].cabo_saida!) === chaveCabo(saiHoje.cabo)) elementos[i].cabo_saida = novo.cabo;
      // mesmo cabo: a fibra segue igual pelas caixas onde o cabo só passa
      const seguem: string[] = [];
      if (chaveCabo(novo.cabo) === chaveCabo(saiHoje.cabo)) {
        for (let j = i + 2; j < elementos.length; j++) {
          const x = elementos[j];
          if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(saiHoje.cabo) || x.fibra_entrada !== saiHoje.fibra) break;
          x.fibra_entrada = novo.fibra;
          if (elementos[j - 1].fibra_saida === saiHoje.fibra) elementos[j - 1].fibra_saida = novo.fibra;
          seguem.push(x.nome);
        }
      }
      const trechos = chaveCabo(novo.cabo) === chaveCabo(saiHoje.cabo) ? r.trechos : r.trechos.map((t) => (t.ate === i + 1 ? { ...t, nome: novo.cabo } : t));
      mudancas.push({ rota: { ...r, trechos }, i: i + 1, de: saiHoje, para: novo, seguem, proxima: prox.nome, elementos });
    });
  }
  // várias mudanças na mesma rota: cada uma aplica a sua parte sobre a anterior
  const acum = new Map<string, { elementos: ElementoRota[]; trechos: RotaOptica["trechos"] }>();
  for (const m of mudancas) {
    const base = acum.get(m.rota.id) ?? { elementos: m.rota.elementos.map((x) => ({ ...x })), trechos: m.rota.trechos };
    const ate = m.i + m.seguem.length;
    const elementos = base.elementos.map((x, j) => (j >= m.i - 1 && j <= ate ? m.elementos[j] : x));
    const trechos = base.trechos.map((t) => (t.ate === m.i ? m.rota.trechos.find((u) => u.ate === m.i) ?? t : t));
    acum.set(m.rota.id, { elementos, trechos });
  }
  for (const m of mudancas) { const a = acum.get(m.rota.id)!; m.elementos = a.elementos; m.rota = { ...m.rota, trechos: a.trechos }; }
  return { mudancas, bloqueadas };
}
