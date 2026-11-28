import { inicioProprio } from "./compartilhados";
// =====================
// Clientes da rede: cadastro (nome, documento, endereço, contato) e a ligação com uma perna
// de splitter de CTO ou CDOI. A ligação mora na porta da caixa (cliente_id); daqui se lê e se muda.
// =====================
import { chaveElemento } from "./arvorePon";
import { portasFinais, splittersDaCaixa, type CaixaRede, type SplitterCaixa } from "./caixasRede";
import { tipoVisual, type RotaOptica } from "./rotaOptica";

export interface ClienteRede {
  id: string;
  /** Nome ou razão social */
  nome: string;
  /** Nascimento (CPF) ou abertura (CNPJ), "AAAA-MM-DD" */
  nascimento?: string;
  /** Código do cliente (do sistema da empresa) */
  codigo: string;
  /** CPF ou CNPJ, só números */
  documento?: string;
  endereco?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  contato?: string;
  email?: string;
  obs?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export const ESTADOS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export const soDigitos = (s: string) => s.replace(/\D/g, "");

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos */
export function documentoValido(doc: string): boolean {
  const d = soDigitos(doc);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const dv = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dv(9) === +d[9] && dv(10) === +d[10];
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const dv = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((a, p, i) => a + p * +d[i], 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === +d[12] && dv(13) === +d[13];
  }
  return false;
}

/** 123.456.789-09 / 12.345.678/0001-95 */
export function formatarDocumento(doc?: string): string {
  const d = soDigitos(doc ?? "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}

export function formatarCep(cep?: string): string {
  const d = soDigitos(cep ?? "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep ?? "";
}

/** Próximo código livre (CLI-000001…), olhando os já usados */
export function proximoCodigoCliente(clientes: ClienteRede[]): string {
  const usados = clientes.map((c) => c.codigo.match(/^CLI-(\d+)$/)?.[1]).filter((x): x is string => !!x).map(Number);
  return `CLI-${String(Math.max(0, ...usados) + 1).padStart(6, "0")}`;
}

// =====================
// Ligação cliente ↔ perna de splitter (CTO ou CDOI)
// =====================

export interface LigacaoCliente {
  /** chave da caixa (PT:<código>) */
  chave: string;
  caixa: string;
  tipo: "cto" | "cdoi";
  spl: string;
  porta: number;
  /** "S1-3" */
  rotulo: string;
}

export const rotuloPerna = (spl: string, porta: number) => `${spl.toUpperCase()}-${porta}`;

/** Caixas que atendem cliente (CTO e CDOI da rede), com os splitters (do diagrama ou da rota) */
export function caixasDeAtendimento(rotas: RotaOptica[], caixas: CaixaRede[]) {
  const vistas = new Map<string, { chave: string; nome: string; tipo: "cto" | "cdoi"; splitters: SplitterCaixa[]; caixa?: CaixaRede }>();
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i < inicioProprio(r) || e.passagem) return;
      const t = tipoVisual(e);
      if (t !== "cto" && t !== "cdoi") return;
      const k = chaveElemento(e);
      if (vistas.has(k)) return;
      const caixa = caixas.find((c) => c.chave === k);
      const splitters = splittersDaCaixa(caixa, { splitter: e.splitter, splitter_modelo: e.splitter_modelo, cabo: e.cabo_entrada, fibra: e.fibra_entrada });
      if (!splitters.length) return;
      vistas.set(k, { chave: k, nome: e.nome, tipo: t, splitters, caixa });
    });
  }
  return [...vistas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

/** Onde cada cliente está ligado (pelas portas das caixas) */
export function ligacoesDosClientes(rotas: RotaOptica[], caixas: CaixaRede[]): Map<string, LigacaoCliente> {
  const m = new Map<string, LigacaoCliente>();
  for (const cx of caixasDeAtendimento(rotas, caixas)) {
    for (const { spl, porta } of portasFinais(cx.splitters)) {
      if (porta.status === "cliente" && porta.cliente_id) {
        m.set(porta.cliente_id, { chave: cx.chave, caixa: cx.nome, tipo: cx.tipo, spl: spl.id, porta: porta.numero, rotulo: rotuloPerna(spl.id, porta.numero) });
      }
    }
  }
  return m;
}

/**
 * Liga o cliente numa perna (ou desliga, com destino null): solta a perna antiga (se houver) e marca a nova
 * como "cliente". Grava as caixas que mudaram e devolve a lista de caixas atualizada.
 */
export async function ligarCliente(
  cliente: Pick<ClienteRede, "id" | "nome">,
  destino: { chave: string; spl: string; porta: number } | null,
  rotas: RotaOptica[],
  caixas: CaixaRede[],
  usuario: string
): Promise<CaixaRede[]> {
  const atendem = caixasDeAtendimento(rotas, caixas);
  const mudadas = new Map<string, { nome: string; splitters: SplitterCaixa[]; caixa?: CaixaRede }>();
  const pegar = (chave: string) => {
    const ja = mudadas.get(chave);
    if (ja) return ja;
    const cx = atendem.find((x) => x.chave === chave);
    if (!cx) return null;
    const copia = { nome: cx.nome, caixa: cx.caixa, splitters: cx.splitters.map((s) => ({ ...s, portas: s.portas.map((p) => ({ ...p })) })) };
    mudadas.set(chave, copia);
    return copia;
  };
  // solta onde ele estava
  for (const cx of atendem) {
    if (!cx.splitters.some((s) => s.portas.some((p) => p.cliente_id === cliente.id))) continue;
    const c = pegar(cx.chave)!;
    c.splitters.forEach((s) => s.portas.forEach((p) => {
      if (p.cliente_id === cliente.id && !(destino && destino.chave === cx.chave && destino.spl === s.id && destino.porta === p.numero)) {
        p.status = "livre";
        p.descricao = undefined;
        p.cliente_id = undefined;
      }
    }));
  }
  // liga no destino
  if (destino) {
    const c = pegar(destino.chave);
    const p = c?.splitters.find((s) => s.id === destino.spl)?.portas.find((x) => x.numero === destino.porta);
    if (!c || !p) throw new Error("Perna do splitter não encontrada.");
    if (p.status !== "livre" && p.cliente_id !== cliente.id) throw new Error(`A perna ${rotuloPerna(destino.spl, destino.porta)} da ${c.nome} já está ocupada.`);
    p.status = "cliente";
    p.descricao = cliente.nome;
    p.cliente_id = cliente.id;
  }
  // as caixas mudadas vão juntas, pelo mesmo caminho das outras telas (só os splitters mudam)
  const { doc, writeBatch, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const { registroCaixa, COLECAO_CAIXAS } = await import("./caixasRede");
  const lote = writeBatch(db);
  const gravadas: CaixaRede[] = [];
  for (const [chave, c] of mudadas) {
    const { id, registro, caixa } = registroCaixa({ ...(c.caixa ?? { portas: [] }), chave, nome: c.caixa?.nome || c.nome, splitters: c.splitters, atualizado_por: usuario });
    lote.set(doc(db, COLECAO_CAIXAS, id), { ...registro, atualizado_em: serverTimestamp() }, { merge: true });
    gravadas.push(caixa);
  }
  await lote.commit();
  return [...caixas.filter((x) => !gravadas.some((g) => g.chave === x.chave)), ...gravadas];
}

// =====================
// Firestore (coleção clientes_rede) — só ADM, como o resto da rede
// =====================
const COLECAO = "clientes_rede";

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarClientes(): Promise<ClienteRede[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  return snap.docs
    .map((d) => {
      const x = d.data();
      return { ...x, id: d.id, nome: x.nome ?? "", codigo: x.codigo ?? "", atualizado_em: isoDe(x.atualizado_em) } as ClienteRede;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function salvarCliente(c: Omit<ClienteRede, "id" | "atualizado_em"> & { id?: string }, usuario: string): Promise<ClienteRede> {
  const { collection, doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const ref = c.id ? doc(db, COLECAO, c.id) : doc(collection(db, COLECAO));
  const txt = (v?: string) => v?.trim() ?? "";
  const registro = {
    nome: txt(c.nome),
    nascimento: txt(c.nascimento),
    codigo: txt(c.codigo),
    documento: soDigitos(c.documento ?? ""),
    endereco: txt(c.endereco),
    bairro: txt(c.bairro),
    cep: soDigitos(c.cep ?? ""),
    cidade: txt(c.cidade),
    estado: txt(c.estado).toUpperCase(),
    contato: txt(c.contato),
    email: txt(c.email).toLowerCase(),
    obs: txt(c.obs),
    atualizado_por: usuario,
  };
  await setDoc(ref, { ...registro, atualizado_em: serverTimestamp() });
  return { ...registro, id: ref.id, atualizado_em: new Date().toISOString() };
}

export async function excluirCliente(id: string): Promise<void> {
  const { doc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
}
