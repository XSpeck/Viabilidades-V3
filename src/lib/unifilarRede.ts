// =====================
// Unifilar em cima da rede livre: os cabos que tocam a caixa saem do caminho de cada cabo, e as ligações
// do cadastro da caixa. Cada cabo aparece nos lados que tem na caixa (o trecho de antes e o de depois);
// o lado vira "chega" ou "sai" pelo sinal (por onde a luz entra), e sem sinal pelo desenho do cabo.
// Editar mexe só no cadastro da caixa; o sinal se recalcula sozinho.
// =====================
import { chaveCabo, type CaboRede } from "./cabosRede";
import { portasPara, type AdaptadorDio, type CaixaRede, type CordaoPon, type EmendaCaixa, type LadoCabo, type PontaFibra, type SplitterCaixa } from "./caixasRede";
import { idPontoRede, type SinalRede } from "./sinalRede";
import { idPonto, type CaboUni, type Lado, type LigacaoUni, type ModeloUnifilar, type PontoUni, type TipoLigacao } from "./unifilar";

/** O que o Unifilar edita numa caixa */
export interface CadastroRede {
  emendas: EmendaCaixa[];
  regras_emenda: { de: string; para: string }[];
  splitters: SplitterCaixa[];
  cordoes: CordaoPon[];
  adaptadores: AdaptadorDio[];
}

export function cadastroDe(c?: CaixaRede): CadastroRede {
  return {
    emendas: c?.emendas ?? [],
    regras_emenda: c?.regras_emenda ?? [],
    splitters: c?.splitters?.length
      ? c.splitters
      : c?.splitter
        ? [{ id: "s1", relacao: c.splitter, modelo_id: c.splitter_modelo, entrada: {}, portas: portasPara(c.splitter, c.portas ?? []) }]
        : [],
    cordoes: c?.cordoes ?? [],
    adaptadores: c?.adaptadores ?? [],
  };
}

type PontoFibraUni = Extract<PontoUni, { k: "fibra" }>;

/** Como os cabos aparecem numa caixa: cada lado (antes/depois) vira "chega" ou "sai" */
export interface MapaCaixa {
  chave: string;
  /** Cabos que tocam a caixa, com os lados que existem nela */
  cabos: { cabo: CaboRede; i: number; lados: Partial<Record<LadoCabo, Lado>> }[];
  paraUni: (p: PontaFibra) => PontoFibraUni | null;
  paraPonta: (p: PontoFibraUni) => PontaFibra | null;
}

export function mapaDaCaixa(chave: string, cabos: CaboRede[], sinal: SinalRede): MapaCaixa {
  const lista: MapaCaixa["cabos"] = [];
  for (const c of cabos) {
    const i = c.caminho?.indexOf(chave) ?? -1;
    if (i < 0 || !c.caminho) continue;
    const ult = c.caminho.length - 1;
    const k = chaveCabo(c.nome);
    const entra = (lado: LadoCabo) => {
      for (let f = 1; f <= (c.capacidade ?? 12); f++) if (sinal.entradas.has(`${chave}#${idPontoRede({ k: "fibra", cabo: k, fibra: f, lado })}`)) return true;
      return false;
    };
    const sai = (lado: LadoCabo) => {
      for (let f = 1; f <= (c.capacidade ?? 12); f++) {
        const id = `${chave}#${idPontoRede({ k: "fibra", cabo: k, fibra: f, lado })}`;
        if (sinal.pontos.has(id) && !sinal.entradas.has(id)) return true;
      }
      return false;
    };
    const lados: Partial<Record<LadoCabo, Lado>> = {};
    if (i > 0 && i < ult) {
      // no meio: a luz entra pelo lado de depois? então ele é o que chega
      const invertido = entra("seg") && !entra("ant");
      lados.ant = invertido ? "sai" : "chega";
      lados.seg = invertido ? "chega" : "sai";
    } else {
      const lado: LadoCabo = i === 0 ? "seg" : "ant";
      lados[lado] = entra(lado) ? "chega" : sai(lado) ? "sai" : lado === "ant" ? "chega" : "sai";
    }
    lista.push({ cabo: c, i, lados });
  }
  const achar = (cabo: string) => lista.find((x) => chaveCabo(x.cabo.nome) === chaveCabo(cabo));
  return {
    chave,
    cabos: lista,
    paraUni: (p) => {
      const x = achar(p.cabo);
      if (!x) return null;
      const meio = !!x.lados.ant && !!x.lados.seg;
      const lado: LadoCabo = meio ? p.lado_cabo ?? "ant" : x.lados.ant ? "ant" : "seg";
      const l = x.lados[lado];
      return l ? { k: "fibra", lado: l, cabo: x.cabo.nome, fibra: p.fibra } : null;
    },
    paraPonta: (p) => {
      const x = achar(p.cabo);
      if (!x) return null;
      const lado = (Object.keys(x.lados) as LadoCabo[]).find((k) => x.lados[k] === p.lado);
      return lado ? { cabo: x.cabo.nome, fibra: p.fibra, lado_cabo: lado } : null;
    },
  };
}

/** Monta o desenho da caixa: cabos (pelos caminhos) e ligações (pelo cadastro e pelo sinal) */
export function montarUnifilarRede(mapa: MapaCaixa, cad: CadastroRede, sinal: SinalRede, nomeDe: (chave: string) => string | undefined): ModeloUnifilar {
  const cabos: CaboUni[] = [];
  for (const { cabo, i, lados } of mapa.cabos) {
    for (const lado of Object.keys(lados) as LadoCabo[]) {
      const l = lados[lado]!;
      const outra = cabo.caminho![lado === "ant" ? i - 1 : i + 1];
      const k = chaveCabo(cabo.nome);
      const s = new Map<number, string[]>();
      for (let f = 1; f <= (cabo.capacidade ?? 12); f++) {
        const sp = sinal.pontos.get(`${mapa.chave}#${idPontoRede({ k: "fibra", cabo: k, fibra: f, lado })}`);
        if (sp) s.set(f, [sp.rotulo]);
      }
      cabos.push({ id: `${l}:${k}`, nome: cabo.nome, chave: k, lado: l, capacidade: cabo.capacidade ?? 12, sinal: s, outraPonta: nomeDe(outra), outraChave: outra });
    }
  }

  const ligacoes: LigacaoUni[] = [];
  const add = (tipo: TipoLigacao, a: PontoUni | null, b: PontoUni | null, origem: LigacaoUni["origem"]) => {
    if (!a || !b) return;
    const id = `${tipo}|${idPonto(a)}|${idPonto(b)}`;
    if (!ligacoes.some((l) => l.id === id)) ligacoes.push({ id, tipo, a, b, origem });
  };
  const u = mapa.paraUni;
  const avulsas = new Set<string>();
  for (const m of cad.emendas) {
    const a = u(m.de), b = u(m.para);
    add("fusao", a, b, "cadastro");
    if (a) avulsas.add(idPonto(a));
    if (b) avulsas.add(idPonto(b));
  }
  for (const g of cad.regras_emenda) {
    const ca = mapa.cabos.find((x) => chaveCabo(x.cabo.nome) === chaveCabo(g.de))?.cabo;
    const cb = mapa.cabos.find((x) => chaveCabo(x.cabo.nome) === chaveCabo(g.para))?.cabo;
    const n = Math.min(ca?.capacidade ?? 12, cb?.capacidade ?? 12);
    for (let f = 1; f <= n; f++) {
      const a = u({ cabo: g.de, fibra: f }), b = u({ cabo: g.para, fibra: f });
      if (!a || !b || avulsas.has(idPonto(a)) || avulsas.has(idPonto(b))) continue;
      add("fusao", a, b, "regra");
    }
  }
  for (const s of cad.splitters) {
    if (s.entrada.fibra) add("entrada", u(s.entrada.fibra), { k: "entrada", spl: s.id }, "cadastro");
    if (s.entrada.splitter) add("nivel2", { k: "porta", spl: s.entrada.splitter.id, porta: s.entrada.splitter.porta }, { k: "entrada", spl: s.id }, "cadastro");
    for (const p of s.portas) if (p.saida) add("perna", { k: "porta", spl: s.id, porta: p.numero }, u(p.saida), "cadastro");
  }
  for (const c of cad.cordoes) add("cordao", { k: "pon", porta: c.porta }, u(c.para), "cadastro");
  for (const a of cad.adaptadores) {
    if (a.de) add("dio", u(a.de), { k: "adaptador", n: a.n }, "cadastro");
    if (a.para) add("dio", { k: "adaptador", n: a.n }, u(a.para), "cadastro");
  }
  // fibra acesa que só atravessa a caixa (nada ligado nela): passa direto
  const ocupado = new Set(ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
  for (const { cabo, lados } of mapa.cabos) {
    if (!lados.ant || !lados.seg) continue;
    for (let f = 1; f <= (cabo.capacidade ?? 12); f++) {
      const a = u({ cabo: cabo.nome, fibra: f, lado_cabo: "ant" }), b = u({ cabo: cabo.nome, fibra: f, lado_cabo: "seg" });
      if (!a || !b || ocupado.has(idPonto(a)) || ocupado.has(idPonto(b))) continue;
      const k = `${mapa.chave}#${idPontoRede({ k: "fibra", cabo: chaveCabo(cabo.nome), fibra: f, lado: "ant" })}`;
      if (!sinal.pontos.has(k)) continue;
      const [x, y] = a.lado === "chega" ? [a, b] : [b, a];
      add("passa", x, y, "rota");
    }
  }
  return { cabos, ligacoes };
}

/** Que ligação dois pontos formam (ou o motivo de não poder). Na rede livre o lado não trava: o sinal decide. */
export function tipoEntreRede(a: PontoUni, b: PontoUni): TipoLigacao | string {
  if (idPonto(a) === idPonto(b)) return "É o mesmo ponto.";
  const tem = (k: PontoUni["k"]) => a.k === k || b.k === k;
  if (a.k === "fibra" && b.k === "fibra") return "fusao";
  if (tem("fibra") && tem("entrada")) return "entrada";
  if (tem("entrada") && tem("porta")) {
    const e = (a.k === "entrada" ? a : b) as { spl: string }, p = (a.k === "porta" ? a : b) as { spl: string };
    return e.spl === p.spl ? "O splitter não pode alimentar a si mesmo." : "nivel2";
  }
  if (tem("porta") && tem("fibra")) return "perna";
  return "Essa ligação não existe numa caixa: veja os pontos com anel verde.";
}

/** Tira do cadastro tudo o que usa o ponto (para religar ou desligar) */
export function soltarRede(c: CadastroRede, p: PontoUni, mapa: MapaCaixa): CadastroRede {
  const id = idPonto(p);
  const de = (x?: PontaFibra) => { const q = x ? mapa.paraUni(x) : null; return q ? idPonto(q) : ""; };
  return {
    regras_emenda: c.regras_emenda,
    emendas: c.emendas.filter((m) => de(m.de) !== id && de(m.para) !== id),
    splitters: c.splitters.map((s) => ({
      ...s,
      entrada:
        (s.entrada.fibra && de(s.entrada.fibra) === id) || (p.k === "entrada" && p.spl === s.id) ||
        (s.entrada.splitter && idPonto({ k: "porta", spl: s.entrada.splitter.id, porta: s.entrada.splitter.porta }) === id)
          ? {}
          : s.entrada,
      portas: portasPara(s.relacao, s.portas).map((pt) =>
        (pt.saida && de(pt.saida) === id) || (p.k === "porta" && p.spl === s.id && p.porta === pt.numero)
          ? { numero: pt.numero, status: pt.status === "cliente" ? pt.status : "livre", ...(pt.status === "cliente" ? { descricao: pt.descricao, cliente_id: pt.cliente_id } : {}) }
          : pt,
      ),
    })),
    cordoes: c.cordoes.filter((x) => de(x.para) !== id && !(p.k === "pon" && p.porta === x.porta)),
    adaptadores: c.adaptadores
      .filter((a) => !(p.k === "adaptador" && p.n === a.n))
      .map((a) => ({ n: a.n, ...(a.de && de(a.de) !== id ? { de: a.de } : {}), ...(a.para && de(a.para) !== id ? { para: a.para } : {}) }))
      .filter((a) => a.de || a.para),
  };
}

/** Liga dois pontos (troca o que estava ligado neles) */
export function ligarRede(c: CadastroRede, a: PontoUni, b: PontoUni, mapa: MapaCaixa): CadastroRede | string {
  const t = tipoEntreRede(a, b);
  if (!["fusao", "entrada", "perna", "nivel2"].includes(t)) return t;
  let n = soltarRede(soltarRede(c, a, mapa), b, mapa);
  const fibra = (x: PontoUni) => (x.k === "fibra" ? mapa.paraPonta(x) : null);
  if (t === "fusao") {
    const [x, y] = a.k === "fibra" && a.lado === "chega" ? [a, b] : [b, a];
    const pa = fibra(x), pb = fibra(y);
    if (!pa || !pb) return "Esse cabo não passa por esta caixa.";
    // a mesma fibra do mesmo cabo dos dois lados: passa direto (não grava fusão)
    if (chaveCabo(pa.cabo) === chaveCabo(pb.cabo) && pa.fibra === pb.fibra) return n;
    n = { ...n, emendas: [...n.emendas, { de: pa, para: pb }] };
  } else if (t === "entrada") {
    const f = fibra(a.k === "fibra" ? a : b), e = (a.k === "entrada" ? a : b) as { spl: string };
    if (!f) return "Esse cabo não passa por esta caixa.";
    n = { ...n, splitters: n.splitters.map((s) => (s.id === e.spl ? { ...s, entrada: { fibra: f } } : s)) };
  } else if (t === "nivel2") {
    const e = (a.k === "entrada" ? a : b) as { spl: string }, p = (a.k === "porta" ? a : b) as { spl: string; porta: number };
    n = { ...n, splitters: n.splitters.map((s) => (s.id === e.spl ? { ...s, entrada: { splitter: { id: p.spl, porta: p.porta } } } : s)) };
  } else {
    const p = (a.k === "porta" ? a : b) as { spl: string; porta: number };
    const f = fibra(a.k === "fibra" ? a : b);
    if (!f) return "Esse cabo não passa por esta caixa.";
    n = {
      ...n,
      splitters: n.splitters.map((s) =>
        s.id === p.spl
          ? { ...s, portas: portasPara(s.relacao, s.portas).map((pt) => (pt.numero === p.porta ? { numero: pt.numero, status: "ramal" as const, saida: f, descricao: `F${f.fibra} · ${f.cabo}` } : pt)) }
          : s,
      ),
    };
  }
  return n;
}

export function desligarRede(c: CadastroRede, l: LigacaoUni, mapa: MapaCaixa): CadastroRede {
  return soltarRede(c, l.a.k === "fibra" ? l.a : l.b.k === "fibra" ? l.b : l.a, mapa);
}

/**
 * DIO: o cordão que está no adaptador `de` passa para o adaptador `para`. A fibra que sai acompanha
 * (adaptador N = fibra N do mesmo cabo de saída).
 */
export function moverCordao(c: CadastroRede, de: number, para: number): CadastroRede | string {
  if (de === para) return c;
  const a = c.adaptadores.find((x) => x.n === de);
  if (!a?.de) return `Nenhum cordão chega no adaptador ${de}.`;
  if (c.adaptadores.some((x) => x.n === para && x.de)) return `O adaptador ${para} já tem cordão.`;
  const novo: AdaptadorDio = { n: para, de: a.de, ...(a.para ? { para: { ...a.para, fibra: para } } : {}) };
  return { ...c, adaptadores: [...c.adaptadores.filter((x) => x.n !== de && x.n !== para), novo] };
}
