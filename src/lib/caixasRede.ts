import { chaveCabo } from "./cabosRede";
import type { TipoElementoRota } from "./rotaOptica";
// =====================
// Diagrama interno das caixas (HUB, CTO, caixa de emenda), preenchido à mão na árvore PON.
// Uma caixa é identificada pela mesma chave usada para juntar rotas (código PT ou nome),
// então vale para todas as rotas que passam por ela.
// =====================

export type StatusPorta = "livre" | "cliente" | "ramal";

export const STATUS_PORTA_LABEL: Record<StatusPorta, string> = {
  livre: "Livre",
  cliente: "Cliente",
  ramal: "Ramal (vai para outra caixa)",
};

export interface PortaCaixa {
  numero: number;
  status: StatusPorta;
  /** Nome/código do cliente ou da caixa de destino */
  descricao?: string;
  /** Cliente do cadastro ligado nesta perna */
  cliente_id?: string;
  /** Ramal: a fibra que sai por esta perna (ligada no unifilar) */
  saida?: PontaFibra;
}

/**
 * Lado do cabo numa caixa do meio do caminho dele (o cabo passa pela caixa): o trecho de antes ("ant", para o
 * começo do cabo) ou o de depois ("seg", para o fim). Na ponta do cabo o lado é um só e não precisa ser dito.
 */
export type LadoCabo = "ant" | "seg";

/** Uma fibra de um cabo */
export interface PontaFibra {
  cabo: string;
  fibra: number;
  /** Só numa caixa do meio do caminho do cabo: de que lado da caixa é esta fibra */
  lado_cabo?: LadoCabo;
}

/** OLT: o cordão que sai de uma porta PON ("0/3/2") */
export interface CordaoPon {
  porta: string;
  para: PontaFibra;
}

/** DIO: o adaptador N recebe uma fibra (o cordão) e entrega outra (a fibra N do cabo que sai) */
export interface AdaptadorDio {
  n: number;
  de?: PontaFibra;
  para?: PontaFibra;
}

/** Emenda (fusão) de uma fibra que chega com uma fibra que sai */
export interface EmendaCaixa {
  de: PontaFibra;
  para: PontaFibra;
}

/** Regra "cor com cor": fibra N do cabo de entrada emenda na fibra N do cabo de saída */
export interface RegraEmenda {
  de: string;
  para: string;
}

/** De onde vem a fibra que entra num splitter da caixa */
export interface EntradaSplitter {
  /** Uma fibra que chega na caixa (de uma rota) */
  fibra?: PontaFibra;
  /** Uma porta de outro splitter da mesma caixa (2º nível) */
  splitter?: { id: string; porta: number };
}

/** Um splitter dentro da caixa (a CTO pode ter vários: 1:2 + 1:8, dois 1:8 em dois níveis…) */
export interface SplitterCaixa {
  id: string;
  /** "1:8" */
  relacao: string;
  /** Modelo do cadastro */
  modelo_id?: string;
  entrada: EntradaSplitter;
  portas: PortaCaixa[];
}

export interface CaixaRede {
  id: string;
  chave: string;
  nome: string;
  // ---- rede livre: o elemento em si (onde está e o que é) ----
  tipo?: TipoElementoRota;
  /** Código do ponto (a chave é PT:<código>) */
  codigo?: string;
  lat?: number;
  lon?: number;
  /** OLT ou DIO do cadastro de equipamentos */
  equipamento_id?: string;
  /** CDOI: o prédio onde ela fica */
  predio_id?: string;
  /** OLT: cordão de cada porta PON */
  cordoes?: CordaoPon[];
  /** DIO: o que liga em cada adaptador */
  adaptadores?: AdaptadorDio[];
  // ---- ligações dentro da caixa (Unifilar) ----
  /** Vários splitters (CTO com níveis). Quando existe, vale no lugar de splitter/portas. */
  splitters?: SplitterCaixa[];
  /** CEO: cabos emendados cor com cor */
  regras_emenda?: RegraEmenda[];
  /** CEO: emendas avulsas (exceções à regra, ou cabos sem regra) */
  emendas?: EmendaCaixa[];
  /** CT: atendimento sem splitter — cada fibra que chega é uma porta (numero = fibra) */
  atendimento?: PortaCaixa[];
  /** "1:8", "1:16"... vazio quando a caixa não tem splitter */
  splitter?: string;
  /** Modelo de splitter do cadastro de equipamentos */
  splitter_modelo?: string;
  portas: PortaCaixa[];
  obs?: string;
  /** Unifilar: quanto cada item foi arrastado do lugar automático (cabo, splitter, DIO, OLT) */
  layout_unifilar?: LayoutUnifilar;
  atualizado_por?: string;
  atualizado_em?: string;
}

/** Deslocamento de cada item do desenho da caixa no Unifilar, em relação ao lugar automático */
export type LayoutUnifilar = Record<string, { dx: number; dy: number }>;

export const SPLITTERS = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"] as const;

export function totalPernas(splitter?: string): number | null {
  const m = splitter?.match(/1\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Ajusta a lista de portas ao tamanho do splitter, mantendo o que já foi marcado. */
export function portasPara(splitter: string | undefined, atuais: PortaCaixa[] = []): PortaCaixa[] {
  const total = totalPernas(splitter) ?? 0;
  return Array.from({ length: total }, (_, i) => atuais.find((p) => p.numero === i + 1) ?? { numero: i + 1, status: "livre" as const });
}

/** Id de documento seguro para o Firestore a partir da chave da caixa. */
export function idCaixa(chave: string): string {
  return chave.replace(/[\/#?\[\]*.\s:]+/g, "_").slice(0, 300);
}

export interface ResumoPortas {
  total: number;
  clientes: number;
  ramais: number;
  livres: number;
}

/**
 * Splitters da caixa: os cadastrados; ou, em caixa antiga com um splitter só, um splitter montado
 * com ele (entrada = fibra que chega pela rota).
 */
export function splittersDaCaixa(
  caixa: CaixaRede | undefined,
  rota?: { splitter?: string; splitter_modelo?: string; cabo?: string; fibra?: number },
): SplitterCaixa[] {
  if (caixa?.splitters?.length) return caixa.splitters;
  const rel = caixa?.splitter ?? rota?.splitter;
  if (!rel || totalPernas(rel) === null) return [];
  return [{
    id: "s1",
    relacao: rel,
    modelo_id: caixa?.splitter_modelo ?? rota?.splitter_modelo,
    entrada: rota?.cabo && rota.fibra ? { fibra: { cabo: rota.cabo, fibra: rota.fibra } } : {},
    portas: portasPara(rel, caixa?.portas ?? []),
  }];
}

/**
 * Splitters de uma porta PON dentro da caixa: os que entram pela fibra que chega (cabo + fibra) e os que
 * vêm de portas deles (2º nível). Numa HUB com splitters de várias portas, separa o de cada PON.
 */
export function splittersDaFibra(spls: SplitterCaixa[], cabo?: string, fibra?: number): SplitterCaixa[] {
  const raizes = spls.filter((x) => x.entrada.fibra && cabo && x.entrada.fibra.fibra === fibra && chaveCabo(x.entrada.fibra.cabo) === chaveCabo(cabo));
  const out = [...raizes];
  for (let k = 0; k < out.length; k++) spls.forEach((x) => { if (x.entrada.splitter?.id === out[k].id && !out.includes(x)) out.push(x); });
  return out;
}

/**
 * O splitter que o cadastro da caixa (Unifilar) diz para a fibra que chega por esta rota.
 * É ele que manda: no editor da rota o campo fica travado. null = o cadastro não diz (a rota escolhe).
 */
export function splitterDoCadastro(
  caixa: CaixaRede | undefined,
  cabo?: string,
  fibra?: number,
): { relacao: string; modelo_id?: string } | null {
  if (caixa?.splitters?.length) {
    const raiz = splittersDaFibra(caixa.splitters, cabo, fibra).find((x) => !x.entrada.splitter);
    const s = raiz ?? (caixa.splitters.length === 1 ? caixa.splitters[0] : undefined);
    return s ? { relacao: s.relacao, modelo_id: s.modelo_id } : null;
  }
  return caixa?.splitter && totalPernas(caixa.splitter) !== null ? { relacao: caixa.splitter, modelo_id: caixa.splitter_modelo } : null;
}

/** Portas de atendimento: as que não alimentam outro splitter da caixa */
export function portasFinais(spls: SplitterCaixa[]): { spl: SplitterCaixa; porta: PortaCaixa }[] {
  const usadas = new Set(spls.map((x) => (x.entrada.splitter ? `${x.entrada.splitter.id}|${x.entrada.splitter.porta}` : "")));
  return spls.flatMap((spl) =>
    portasPara(spl.relacao, spl.portas).filter((p) => !usadas.has(`${spl.id}|${p.numero}`)).map((porta) => ({ spl, porta })),
  );
}

/** Texto curto dos splitters ("1:8", "1:2 › 2×1:8") */
export function rotuloSplitters(spls: SplitterCaixa[]): string {
  if (spls.length <= 1) return spls[0]?.relacao ?? "";
  const n1 = spls.filter((x) => !x.entrada.splitter);
  const n2 = spls.filter((x) => x.entrada.splitter);
  const agrupa = (l: SplitterCaixa[]) => {
    const m = new Map<string, number>();
    l.forEach((x) => m.set(x.relacao, (m.get(x.relacao) ?? 0) + 1));
    return [...m.entries()].map(([r, q]) => (q > 1 ? `${q}×${r}` : r)).join("+");
  };
  return n2.length ? `${agrupa(n1)} › ${agrupa(n2)}` : agrupa(n1);
}

export function resumoPortas(caixa: CaixaRede | undefined): ResumoPortas | null {
  if (caixa?.splitters?.length) {
    const fin = portasFinais(caixa.splitters);
    const clientes = fin.filter((f) => f.porta.status === "cliente").length;
    const ramais = fin.filter((f) => f.porta.status === "ramal").length;
    return { total: fin.length, clientes, ramais, livres: fin.length - clientes - ramais };
  }
  const total = totalPernas(caixa?.splitter);
  if (!caixa || total === null) return null;
  const portas = portasPara(caixa.splitter, caixa.portas);
  const clientes = portas.filter((p) => p.status === "cliente").length;
  const ramais = portas.filter((p) => p.status === "ramal").length;
  return { total, clientes, ramais, livres: total - clientes - ramais };
}

// =====================
// Firestore (coleção caixas_rede)
// =====================
const COLECAO = "caixas_rede";

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarCaixas(): Promise<CaixaRede[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      chave: data.chave ?? d.id,
      nome: data.nome ?? "",
      splitter: data.splitter || undefined,
      splitter_modelo: data.splitter_modelo || undefined,
      portas: Array.isArray(data.portas) ? data.portas : [],
      splitters: Array.isArray(data.splitters) && data.splitters.length ? data.splitters : undefined,
      regras_emenda: Array.isArray(data.regras_emenda) && data.regras_emenda.length ? data.regras_emenda : undefined,
      emendas: Array.isArray(data.emendas) && data.emendas.length ? data.emendas : undefined,
      atendimento: Array.isArray(data.atendimento) && data.atendimento.length ? data.atendimento : undefined,
      obs: data.obs || undefined,
      tipo: data.tipo || undefined,
      codigo: data.codigo || undefined,
      lat: typeof data.lat === "number" ? data.lat : undefined,
      lon: typeof data.lon === "number" ? data.lon : undefined,
      equipamento_id: data.equipamento_id || undefined,
      predio_id: data.predio_id || undefined,
      cordoes: Array.isArray(data.cordoes) && data.cordoes.length ? data.cordoes : undefined,
      adaptadores: Array.isArray(data.adaptadores) && data.adaptadores.length ? data.adaptadores : undefined,
      layout_unifilar: data.layout_unifilar && typeof data.layout_unifilar === "object" && Object.keys(data.layout_unifilar).length ? data.layout_unifilar : undefined,
      atualizado_por: data.atualizado_por,
      atualizado_em: isoDe(data.atualizado_em),
    } as CaixaRede;
  });
}

/** Porta como vai para o banco (sem campos vazios) */
function gravarPorta(p: PortaCaixa): PortaCaixa {
  return {
    numero: p.numero,
    status: p.status,
    ...(p.descricao?.trim() ? { descricao: p.descricao.trim() } : {}),
    ...(p.status === "cliente" && p.cliente_id ? { cliente_id: p.cliente_id } : {}),
    ...(p.status === "ramal" && p.saida ? { saida: gravarPonta(p.saida) } : {}),
  };
}

/** Fibra como vai para o banco (o lado só numa caixa do meio do cabo) */
export function gravarPonta(p: PontaFibra): PontaFibra {
  return { cabo: p.cabo, fibra: p.fibra, ...(p.lado_cabo ? { lado_cabo: p.lado_cabo } : {}) };
}

/** O elemento em si (onde está, o que é, cordões e adaptadores): só os campos que vieram (merge mantém o resto) */
function registroElemento(d: Omit<CaixaRede, "id" | "atualizado_em">) {
  return {
    ...(d.tipo ? { tipo: d.tipo } : {}),
    ...(d.codigo ? { codigo: d.codigo } : {}),
    ...(d.lat !== undefined && d.lon !== undefined ? { lat: d.lat, lon: d.lon } : {}),
    ...(d.equipamento_id !== undefined ? { equipamento_id: d.equipamento_id } : {}),
    ...(d.predio_id !== undefined ? { predio_id: d.predio_id } : {}),
    ...(d.cordoes ? { cordoes: d.cordoes.map((c) => ({ porta: c.porta, para: gravarPonta(c.para) })) } : {}),
    ...(d.adaptadores ? { adaptadores: d.adaptadores.map((a) => ({ n: a.n, ...(a.de ? { de: gravarPonta(a.de) } : {}), ...(a.para ? { para: gravarPonta(a.para) } : {}) })) } : {}),
  };
}

export async function salvarCaixa(dados: Omit<CaixaRede, "id" | "atualizado_em">): Promise<CaixaRede> {
  const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const { id, registro, caixa } = registroCaixa(dados);
  // merge: campos que esta tela não mexe (arrumação do Unifilar) continuam
  await setDoc(doc(db, COLECAO, id), { ...registro, atualizado_em: serverTimestamp() }, { merge: true });
  return caixa;
}

/** Coleção das caixas (para gravar em lote junto com as rotas) */
export const COLECAO_CAIXAS = "caixas_rede";

/** O que vai para o banco de uma caixa, e como ela fica na tela depois de gravada */
export function registroCaixa(dados: Omit<CaixaRede, "id" | "atualizado_em">) {
  const id = idCaixa(dados.chave);
  const portas = portasPara(dados.splitter, dados.portas).map((p) =>
    gravarPorta(p)
  );
  // Vários splitters: grava a lista; splitter/portas ficam com o primeiro (telas antigas)
  const splitters = (dados.splitters ?? []).map((x) => ({
    id: x.id,
    relacao: x.relacao,
    modelo_id: x.modelo_id ?? "",
    entrada: x.entrada.fibra ? { fibra: gravarPonta(x.entrada.fibra) } : x.entrada.splitter ? { splitter: x.entrada.splitter } : {},
    portas: portasPara(x.relacao, x.portas).map((p) => (gravarPorta(p))),
  }));
  const registro = {
    chave: dados.chave,
    nome: dados.nome,
    splitters,
    regras_emenda: (dados.regras_emenda ?? []).map((x) => ({ de: x.de, para: x.para })),
    emendas: (dados.emendas ?? []).map((x) => ({ de: gravarPonta(x.de), para: gravarPonta(x.para) })),
    atendimento: (dados.atendimento ?? [])
      .filter((p) => p.status !== "livre" || p.descricao?.trim())
      .map((p) => (gravarPorta(p))),
    splitter: dados.splitter ?? "",
    splitter_modelo: dados.splitter ? dados.splitter_modelo ?? "" : "",
    portas,
    obs: dados.obs?.trim() ?? "",
    atualizado_por: dados.atualizado_por ?? "",
    ...registroElemento(dados),
  };
  const caixa: CaixaRede = { id, ...registro, layout_unifilar: dados.layout_unifilar, splitters: splitters.length ? splitters : undefined,
    regras_emenda: registro.regras_emenda.length ? registro.regras_emenda : undefined,
    emendas: registro.emendas.length ? registro.emendas : undefined,
    atendimento: registro.atendimento.length ? registro.atendimento : undefined, splitter: registro.splitter || undefined, splitter_modelo: registro.splitter_modelo || undefined, obs: registro.obs || undefined, atualizado_em: new Date().toISOString() };
  return { id, registro, caixa };
}

/**
 * Grava só a arrumação do desenho da caixa no Unifilar (não mexe em splitters, emendas, clientes).
 * Layout vazio = volta ao automático.
 */
export async function salvarLayoutUnifilar(chave: string, nome: string, layout: LayoutUnifilar): Promise<void> {
  const { doc, setDoc, deleteField } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const limpo: LayoutUnifilar = {};
  for (const [k, v] of Object.entries(layout)) if (Math.round(v.dx) || Math.round(v.dy)) limpo[k] = { dx: Math.round(v.dx), dy: Math.round(v.dy) };
  await setDoc(doc(db, COLECAO, idCaixa(chave)), { chave, nome, layout_unifilar: Object.keys(limpo).length ? limpo : deleteField() }, { merge: true });
}

export async function excluirCaixa(id: string): Promise<void> {
  const { doc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
}
