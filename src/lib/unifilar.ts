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
      // o que esta rota leva adiante já sai por uma perna de outro splitter: a caixa e a rota discordam
      // (alguém trocou a entrada no Unifilar). Não inventa outro splitter: a diferença aparece no desenho.
      const prox = r.elementos[i + 1];
      if (prox?.cabo_entrada && prox.fibra_entrada && spls.some((s) => s.portas.some((p) => p.saida && mesmaFibra(p.saida, { cabo: prox.cabo_entrada!, fibra: prox.fibra_entrada! })))) return;
      // um splitter antigo sem entrada e da mesma relação: ganha a entrada (em vez de criar outro)
      const solto = spls.find((s) => !s.entrada.fibra && !s.entrada.splitter && s.relacao === e.splitter);
      if (solto) { solto.entrada = { fibra: f }; return; }
      let n = spls.length + 1;
      while (spls.some((x) => x.id === `r${n}`)) n++;
      spls.push({ id: `r${n}`, relacao: e.splitter, modelo_id: e.splitter_modelo, entrada: { fibra: f }, portas: portasPara(e.splitter, []) });
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

// ---------- A fibra vale no trecho inteiro do cabo ----------
// Trocar a fibra numa ponta do cabo (a que sai ou a que entra numa caixa) muda as rotas que passam
// pelo trecho e a caixa da outra ponta do cabo. O cabo que só passa direto por caixas leva a fibra junto.

/** Uma troca de fibra que o cadastro da caixa fez numa rota */
export interface MudancaRota {
  rota: RotaOptica;
  /** Índice (na rota montada) do elemento que chega pela fibra trocada, do lado desta caixa */
  i: number;
  /** "sai": a fibra que sai desta caixa; "chega": a que entra nela */
  sentido: Lado;
  de: PontaFibra;
  para: PontaFibra;
  /** Caixas onde o cabo só passa e que recebem a fibra nova junto */
  seguem: string[];
  /** Caixa da outra ponta do cabo */
  ponta: string;
  /** A rota inteira já com as mudanças (desta e de outras trocas nela) */
  elementos: ElementoRota[];
}

/** Na caixa da outra ponta do cabo: a fibra `de` do cabo vira `para` (fusões, entrada de splitter, pernas) */
export interface TrocaNaPonta { chave: string; nome: string; cabo: string; lado: Lado; de: number; para: number; /** rotas (donas) que levam a esta troca */ rotas: string[] }

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

/** Aplica a troca de fibra no cadastro da caixa da outra ponta */
export function trocarFibraNoCadastro(c: CadastroLigacoes, cabo: string, lado: Lado, de: number, para: number): CadastroLigacoes {
  const k = chaveCabo(cabo);
  const eh = (p?: PontaFibra) => !!p && chaveCabo(p.cabo) === k && p.fibra === de;
  const novo = (p: PontaFibra) => ({ cabo: p.cabo, fibra: para });
  const emendas = c.emendas.map((m) => (lado === "chega" && eh(m.de) ? { ...m, de: novo(m.de) } : lado === "sai" && eh(m.para) ? { ...m, para: novo(m.para) } : m));
  // regra cor com cor: a fibra nova continua indo para onde a antiga ia (vira uma exceção à regra)
  if (lado === "chega") {
    const g = c.regras_emenda.find((r) => chaveCabo(r.de) === k);
    if (g && !c.emendas.some((m) => eh(m.de))) emendas.push({ de: { cabo, fibra: para }, para: { cabo: g.para, fibra: de } });
  } else {
    const g = c.regras_emenda.find((r) => chaveCabo(r.para) === k);
    if (g && !c.emendas.some((m) => eh(m.para))) emendas.push({ de: { cabo: g.de, fibra: de }, para: { cabo, fibra: para } });
  }
  const splitters = c.splitters.map((s) => ({
    ...s,
    entrada: lado === "chega" && eh(s.entrada.fibra) ? { fibra: novo(s.entrada.fibra!) } : s.entrada,
    portas: lado === "sai" ? s.portas.map((p) => (eh(p.saida) ? { ...p, saida: novo(p.saida!), descricao: `F${para} · ${p.saida!.cabo}` } : p)) : s.portas,
  }));
  return { ...c, emendas, splitters };
}

/**
 * Depois de mudar o cadastro de uma caixa (`antes` → `depois`): as rotas cujo sinal agora sai ou entra por
 * outra fibra, e o que muda na caixa da outra ponta de cada cabo. Cabo novo que vai para outra caixa
 * (ou vem de outra) não muda a rota sozinho: vai em `bloqueadas` (o caminho se edita no mapa).
 * Sub-rotas: cada elemento muda na rota dona dele (a mãe, quando é tronco).
 */
export function propagarNasRotas(
  chave: string,
  rotas: RotaOptica[],
  antes: CadastroLigacoes,
  depois: CadastroLigacoes,
): { mudancas: MudancaRota[]; bloqueadas: { rota: RotaOptica; motivo: string }[]; pontas: TrocaNaPonta[] } {
  const mudancas: MudancaRota[] = [];
  const bloqueadas: { rota: RotaOptica; motivo: string }[] = [];
  const pontas: TrocaNaPonta[] = [];
  /** Elementos de cada rota dona, já com as mudanças */
  const novos = new Map<string, ElementoRota[]>();
  const trechosNovos = new Map<string, RotaOptica["trechos"]>();
  const feitas = new Set<string>();
  /** Para que caixas vai cada cabo (pelas rotas): chaveCabo → [caixa de onde sai, caixa onde chega] */
  const pontasCabo = new Map<string, [string, string]>();
  for (const r of rotas) r.elementos.forEach((e, i) => { if (i > 0 && e.cabo_entrada && !pontasCabo.has(chaveCabo(e.cabo_entrada))) pontasCabo.set(chaveCabo(e.cabo_entrada), [chaveElemento(r.elementos[i - 1]), chaveElemento(e)]); });
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
  /** Muda o elemento k da rota (na rota dona dele) */
  const mexer = (r: RotaOptica, k: number, f: (e: ElementoRota) => void) => {
    const d = dono(r, k);
    const els = novos.get(d.id) ?? d.elementos.map((x) => ({ ...x }));
    if (els[k]) f(els[k]);
    novos.set(d.id, els);
    return d;
  };
  const ponta = (pc: TrocaNaPonta) => {
    const ja = pontas.find((x) => x.chave === pc.chave && chaveCabo(x.cabo) === chaveCabo(pc.cabo) && x.lado === pc.lado && x.de === pc.de);
    if (ja) { for (const id of pc.rotas) if (!ja.rotas.includes(id)) ja.rotas.push(id); } else pontas.push(pc);
  };

  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      const prox = r.elementos[i + 1];
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada || !e.fibra_entrada || !prox?.cabo_entrada || !prox.fibra_entrada) return;
      const chegada = { cabo: e.cabo_entrada, fibra: e.fibra_entrada };
      const saiHoje = { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada };

      // ---- a fibra que SAI desta caixa ----
      const porta = portaQueLeva(antes, saiHoje);
      const pelaPorta = !!porta || antes.splitters.some((s) => s.entrada.fibra && mesmaFibra(s.entrada.fibra, chegada));
      const velho = pelaPorta ? (porta ? saiHoje : undefined) : saidaNoCadastro(antes, chegada);
      const novo = pelaPorta ? (porta ? saidaNoCadastro(depois, chegada, porta) : undefined) : saidaNoCadastro(depois, chegada);
      const k0 = `s|${dono(r, i + 1).id}|${i + 1}`;
      if (novo && !(velho && mesmaFibra(velho, novo)) && !mesmaFibra(novo, saiHoje) && !feitas.has(k0)) {
        feitas.add(k0);
        const mesmoCabo = chaveCabo(novo.cabo) === chaveCabo(saiHoje.cabo);
        const pt = pontasCabo.get(chaveCabo(novo.cabo));
        if (!mesmoCabo && (!pt || pt[0] !== chave || pt[1] !== chaveElemento(prox))) {
          bloqueadas.push({ rota: dono(r, i + 1), motivo: `${novo.cabo.split(" [")[0]} não vai para ${prox.nome}: para mudar o caminho, edite a rota no mapa.` });
        } else {
          mexer(r, i, (x) => { if (x.fibra_saida === saiHoje.fibra) x.fibra_saida = novo.fibra; if (x.cabo_saida && chaveCabo(x.cabo_saida) === chaveCabo(saiHoje.cabo)) x.cabo_saida = novo.cabo; });
          const d = mexer(r, i + 1, (x) => { x.cabo_entrada = novo.cabo; x.fibra_entrada = novo.fibra; });
          // o cabo segue passando direto: a fibra nova vai junto até onde o cabo termina
          const seguem: string[] = [];
          let fim = i + 1;
          if (mesmoCabo) {
            for (let j = i + 2; j < r.elementos.length; j++) {
              const x = r.elementos[j];
              if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(saiHoje.cabo) || x.fibra_entrada !== saiHoje.fibra) break;
              mexer(r, j - 1, (y) => { if (y.fibra_saida === saiHoje.fibra) y.fibra_saida = novo.fibra; });
              mexer(r, j, (y) => { y.fibra_entrada = novo.fibra; });
              seguem.push(x.nome);
              fim = j;
            }
            // a caixa onde o cabo termina recebe a fibra nova (fusão / splitter dela)
            const cx = r.elementos[fim];
            ponta({ chave: chaveElemento(cx), nome: cx.nome, cabo: saiHoje.cabo, lado: "chega", de: saiHoje.fibra, para: novo.fibra, rotas: [d.id] });
          } else {
            const ts = trechosNovos.get(d.id) ?? d.trechos;
            trechosNovos.set(d.id, ts.map((t) => (t.ate === i + 1 ? { ...t, nome: novo.cabo } : t)));
          }
          mudancas.push({ rota: d, i: i + 1, sentido: "sai", de: saiHoje, para: novo, seguem, ponta: r.elementos[fim].nome, elementos: [] });
        }
      }

      // ---- a fibra que ENTRA nesta caixa ----
      const veioAntes = entradaNoCadastro(antes, saiHoje);
      const vemAgora = entradaNoCadastro(depois, saiHoje);
      // a saída desta rota agora é alimentada por outra fibra que chega (mudou a entrada do splitter ou a fusão)
      const k1 = `c|${dono(r, i).id}|${i}`;
      if (vemAgora && !mesmaFibra(vemAgora, chegada) && (!veioAntes || mesmaFibra(veioAntes, chegada)) && !feitas.has(k1)) {
        feitas.add(k1);
        if (chaveCabo(vemAgora.cabo) !== chaveCabo(chegada.cabo)) {
          bloqueadas.push({ rota: dono(r, i), motivo: `a entrada passou para ${vemAgora.cabo.split(" [")[0]}, que não é o cabo por onde a rota chega: para mudar o caminho, edite a rota no mapa.` });
        } else {
          // volta pelo cabo enquanto ele só passa pelas caixas de trás
          let ini = i;
          for (let j = i - 1; j >= 1; j--) {
            const x = r.elementos[j];
            if (!x.cabo_entrada || chaveCabo(x.cabo_entrada) !== chaveCabo(chegada.cabo) || x.fibra_entrada !== chegada.fibra) break;
            ini = j;
          }
          const passam: string[] = [];
          for (let j = ini; j <= i; j++) {
            mexer(r, j, (x) => { x.fibra_entrada = vemAgora.fibra; });
            mexer(r, j - 1, (x) => { if (x.fibra_saida === chegada.fibra) x.fibra_saida = vemAgora.fibra; });
            if (j < i) passam.push(r.elementos[j].nome);
          }
          const cx = r.elementos[ini - 1];
          ponta({ chave: chaveElemento(cx), nome: cx.nome, cabo: chegada.cabo, lado: "sai", de: chegada.fibra, para: vemAgora.fibra, rotas: [dono(r, i).id] });
          mudancas.push({ rota: dono(r, i), i, sentido: "chega", de: chegada, para: vemAgora, seguem: passam, ponta: cx.nome, elementos: [] });
        }
      }
    });
  }
  for (const m of mudancas) {
    m.elementos = novos.get(m.rota.id) ?? m.rota.elementos;
    m.rota = { ...m.rota, trechos: trechosNovos.get(m.rota.id) ?? m.rota.trechos };
  }
  // a própria caixa não é "outra ponta"
  return { mudancas, bloqueadas, pontas: pontas.filter((p) => p.chave !== chave) };
}
