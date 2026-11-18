// =====================
// Árvore por porta PON: junta as rotas salvas que saem da mesma porta da OLT.
// Rotas que passam pelos mesmos elementos (mesmo código PT ou mesmo nome) viram um tronco comum;
// onde elas se separam, a árvore ramifica.
// =====================
import type { ElementoRota, RotaOptica } from "./rotaOptica";
import { totalPernas, type CaixaRede } from "./caixasRede";

export interface NoArvore {
  id: string;
  elemento: ElementoRota;
  /** Diagrama interno cadastrado para esta caixa (splitter e portas) */
  caixa?: CaixaRede;
  /** Clientes marcados nas portas desta caixa e de todas abaixo */
  clientes: number;
  pai: NoArvore | null;
  filhos: NoArvore[];
  profundidade: number;
  /** Rotas que passam por aqui (ids) */
  rotas: string[];
  /** Rotas que terminam aqui (ids) */
  fimDe: string[];
  /** Metros desde a OLT (pela primeira rota que criou o nó) */
  distancia: number;
  /** Pontas (fins de rota) neste nó e abaixo */
  pontas: number;
  /** Elementos abaixo deste nó (sem contar ele) */
  abaixo: number;
}

export interface ArvorePon {
  chave: string;
  rotulo: string;
  olt: string;
  raiz: NoArvore;
  nos: NoArvore[];
  rotas: RotaOptica[];
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Identidade de um elemento para juntar rotas: código do GeoGrid ou o nome. */
export function chaveElemento(e: ElementoRota): string {
  return e.codigo ? `PT:${e.codigo.toUpperCase()}` : `N:${normalizar(e.nome)}`;
}

/** Porta PON de origem da rota, a partir do primeiro elemento (OLT). */
export function portaPonDaRota(r: RotaOptica): { chave: string; rotulo: string; olt: string } {
  const e = r.elementos[0];
  if (!e) return { chave: "sem-origem", rotulo: "Sem origem", olt: "" };
  const porta = e.porta ?? "";
  // GeoGrid: "OLT1_ST PL 04 - Porta 13 (Saída) · DIO 04 - Porta 33 ..."
  const m = porta.match(/^\s*(\S+)\s+PL\s*0*(\d+)\s*-\s*Porta\s*0*(\d+)/i);
  if (m) {
    const olt = m[1].toUpperCase();
    return { chave: `${olt}|${+m[2]}|${+m[3]}`, rotulo: `${olt} · PON 0/${+m[2]}/${+m[3]}`, olt };
  }
  // Cadastro manual: "0/4/13", "PON 1/1/1", "PL 4 Porta 13"...
  const pon = porta.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
  const nomeOlt = normalizar(e.nome);
  if (pon) return { chave: `${nomeOlt}|${+pon[2]}|${+pon[3]}|${+pon[1]}`, rotulo: `${e.nome} · PON ${+pon[1]}/${+pon[2]}/${+pon[3]}`, olt: e.nome };
  const pl = porta.match(/PL\s*0*(\d+)\D+0*(\d+)/i);
  if (pl) return { chave: `${nomeOlt}|${+pl[1]}|${+pl[2]}`, rotulo: `${e.nome} · PON 0/${+pl[1]}/${+pl[2]}`, olt: e.nome };
  const primeiraPorta = porta.split("·")[0].trim();
  return {
    chave: `${nomeOlt}|${normalizar(primeiraPorta)}`,
    rotulo: primeiraPorta ? `${e.nome} · ${primeiraPorta}` : e.nome,
    olt: e.nome,
  };
}

function criarNo(elemento: ElementoRota, pai: NoArvore | null, id: string, distancia: number): NoArvore {
  return {
    id,
    elemento,
    pai,
    filhos: [],
    profundidade: pai ? pai.profundidade + 1 : 0,
    rotas: [],
    fimDe: [],
    distancia,
    pontas: 0,
    abaixo: 0,
    clientes: 0,
  };
}

function montar(chave: string, rotulo: string, olt: string, rotas: RotaOptica[], caixas: Map<string, CaixaRede>): ArvorePon {
  const primeira = rotas[0].elementos[0];
  const raiz = criarNo(primeira, null, "0", 0);
  const nos: NoArvore[] = [raiz];

  for (const r of rotas) {
    let atual = raiz;
    let dist = 0;
    atual.rotas.push(r.id);
    r.elementos.slice(1).forEach((e) => {
      dist += e.distancia_m ?? 0;
      const k = chaveElemento(e);
      let filho = atual.filhos.find((f) => chaveElemento(f.elemento) === k);
      if (!filho) {
        filho = criarNo(e, atual, `${atual.id}.${atual.filhos.length}`, dist);
        atual.filhos.push(filho);
        nos.push(filho);
      } else {
        // Mesmo elemento em outra rota: aproveita dados que faltam (ex.: splitter informado só nesta)
        const faltando = Object.fromEntries(
          Object.entries(e).filter(([k, v]) => v !== undefined && filho!.elemento[k as keyof ElementoRota] === undefined)
        );
        if (Object.keys(faltando).length) filho.elemento = { ...filho.elemento, ...faltando };
      }
      filho.rotas.push(r.id);
      atual = filho;
    });
    atual.fimDe.push(r.id);
  }

  // Diagrama interno cadastrado de cada caixa
  for (const n of nos) n.caixa = caixas.get(chaveElemento(n.elemento));

  // Pontas, clientes e elementos abaixo (pós-ordem)
  const calc = (n: NoArvore): void => {
    n.filhos.forEach(calc);
    n.clientes = (pernasSplitter(n)?.clientes ?? 0) + n.filhos.reduce((s, f) => s + f.clientes, 0);
    n.pontas = (n.fimDe.length > 0 ? 1 : 0) + n.filhos.reduce((s, f) => s + f.pontas, 0);
    n.abaixo = n.filhos.reduce((s, f) => s + 1 + f.abaixo, 0);
  };
  calc(raiz);

  return { chave, rotulo, olt, raiz, nos, rotas };
}

/** Agrupa as rotas por porta PON e monta uma árvore para cada porta. */
export function montarArvoresPon(rotas: RotaOptica[], caixas: CaixaRede[] = []): ArvorePon[] {
  const mapaCaixas = new Map(caixas.map((c) => [c.chave, c]));
  const grupos = new Map<string, { rotulo: string; olt: string; rotas: RotaOptica[] }>();
  for (const r of rotas) {
    if (r.elementos.length === 0) continue;
    const p = portaPonDaRota(r);
    const g = grupos.get(p.chave) ?? { rotulo: p.rotulo, olt: p.olt, rotas: [] };
    g.rotas.push(r);
    grupos.set(p.chave, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => montar(chave, g.rotulo, g.olt, g.rotas, mapaCaixas))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }));
}

/** Caminho da raiz até o nó. */
export function caminhoAte(n: NoArvore): NoArvore[] {
  const p: NoArvore[] = [];
  for (let x: NoArvore | null = n; x; x = x.pai) p.unshift(x);
  return p;
}

export interface PernasNo {
  splitter: string;
  total: number;
  /** Portas marcadas como cliente */
  clientes: number;
  /** Pernas que seguem para outra caixa: as marcadas como ramal ou os ramos da árvore, o que for maior */
  ramais: number;
  livres: number;
  /** Portas de cliente, para desenhar na árvore */
  portasCliente: { numero: number; descricao?: string }[];
}

/** Pernas do splitter do nó: usa o diagrama cadastrado da caixa ou o splitter informado na rota. */
export function pernasSplitter(n: NoArvore): PernasNo | null {
  const splitter = n.caixa?.splitter ?? n.elemento.splitter;
  const total = totalPernas(splitter);
  if (total === null || !splitter) return null;
  const portas = n.caixa?.portas ?? [];
  const portasCliente = portas
    .filter((p) => p.status === "cliente" && p.numero <= total)
    .map((p) => ({ numero: p.numero, descricao: p.descricao }));
  const ramaisMarcados = portas.filter((p) => p.status === "ramal" && p.numero <= total).length;
  const clientes = portasCliente.length;
  const ramais = Math.max(ramaisMarcados, n.filhos.length);
  return { splitter, total, clientes, ramais, livres: Math.max(0, total - clientes - ramais), portasCliente };
}
