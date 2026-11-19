// =====================
// Cadastro de equipamentos da rede (tipos de cabo, splitter, DIO e OLT).
// Os tipos cadastrados aqui são escolhidos nos quadros de cabo e de caixa da árvore PON.
// =====================

export type CategoriaCatalogo = "cabo" | "splitter" | "dio" | "olt";

export const CATEGORIA_LABEL: Record<CategoriaCatalogo, string> = {
  cabo: "Cabos",
  splitter: "Splitters",
  dio: "DIOs",
  olt: "OLTs",
};

export interface ItemCatalogo {
  id: string;
  categoria: CategoriaCatalogo;
  nome: string;
  obs?: string;
  // Cabo
  capacidade?: number;
  fibras_por_tubo?: number;
  construcao?: string;
  // Splitter
  relacao?: string;
  balanceamento?: "balanceado" | "desbalanceado";
  conector?: string;
  perda_db?: number;
  // DIO
  portas?: number;
  // OLT
  modelo?: string;
  placas?: number;
  portas_por_placa?: number;
  /** Número da primeira placa (0 ou 1, depende do fabricante) */
  placa_inicial?: number;
  /** Número da primeira porta PON de cada placa (0 ou 1) */
  porta_inicial?: number;
  /** Potência de saída da porta PON (dBm) */
  potencia_tx?: number;
  local?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export type ItemCatalogoInput = Omit<ItemCatalogo, "id" | "atualizado_em">;

export const CONSTRUCOES_CABO = ["AS80", "AS120", "AS200", "Drop", "Flat", "Cordão óptico", "Autossustentado (outro)", "Subterrâneo / duto", "Interno"];

/** Cabos comuns para cadastrar com um clique (dá para ajustar antes de salvar). */
export const MODELOS_CABO: { rotulo: string; nome: string; capacidade: number; fibras_por_tubo: number; construcao: string; obs?: string }[] = [
  { rotulo: "Flat (drop)", nome: "Cabo Flat 1F", capacidade: 1, fibras_por_tubo: 1, construcao: "Flat" },
  { rotulo: "Cordão óptico", nome: "Cordão óptico 1F", capacidade: 1, fibras_por_tubo: 1, construcao: "Cordão óptico" },
  { rotulo: "12F · 6 tubetes de 2", nome: "Cabo 12F 6x2", capacidade: 12, fibras_por_tubo: 2, construcao: "AS80", obs: "6 tubetes com 2 fibras (verde e amarelo)" },
  { rotulo: "AS80 12F", nome: "Cabo AS80 12F", capacidade: 12, fibras_por_tubo: 12, construcao: "AS80" },
  { rotulo: "AS80 36F", nome: "Cabo AS80 36F", capacidade: 36, fibras_por_tubo: 6, construcao: "AS80" },
];
export const CONECTORES = ["SC/APC", "SC/UPC", "LC/APC", "LC/UPC", "Sem conector (fusão)"];
export const RELACOES_SPLITTER = ["1:2", "1:4", "1:8", "1:16", "1:32", "1:64"];

/** Perda típica de splitter balanceado (dB), usada como sugestão no cadastro. */
export const PERDA_TIPICA: Record<string, number> = {
  "1:2": 3.7,
  "1:4": 7.3,
  "1:8": 10.5,
  "1:16": 13.7,
  "1:32": 17.1,
  "1:64": 20.5,
};

/** Resumo de uma linha para listas e selects. */
export function resumoItem(i: ItemCatalogo): string {
  const partes: string[] = [];
  if (i.categoria === "cabo") {
    if (i.capacidade) partes.push(`${i.capacidade} fibra${i.capacidade !== 1 ? "s" : ""}`);
    if (i.fibras_por_tubo && i.capacidade !== 1)
      partes.push(i.capacidade && i.fibras_por_tubo >= i.capacidade ? "1 tubo" : `${Math.ceil((i.capacidade ?? 0) / i.fibras_por_tubo)} tubos de ${i.fibras_por_tubo}`);
    if (i.construcao) partes.push(i.construcao);
  } else if (i.categoria === "splitter") {
    if (i.relacao) partes.push(i.relacao);
    if (i.balanceamento) partes.push(i.balanceamento);
    if (i.conector) partes.push(i.conector);
    if (i.perda_db !== undefined) partes.push(`${String(i.perda_db).replace(".", ",")} dB`);
  } else if (i.categoria === "dio") {
    if (i.portas) partes.push(`${i.portas} portas`);
    if (i.conector) partes.push(i.conector);
  } else {
    if (i.modelo) partes.push(i.modelo);
    if (i.placas && i.portas_por_placa) {
      const n0 = numeracaoOlt(i);
      partes.push(`placas ${n0.placas[0]}–${n0.placas[n0.placas.length - 1]} × portas ${n0.portas[0]}–${n0.portas[n0.portas.length - 1]}`);
    }
    if (i.potencia_tx !== undefined) partes.push(`${String(i.potencia_tx).replace(".", ",")} dBm`);
    if (i.local) partes.push(i.local);
  }
  return partes.join(" · ");
}

// =====================
// Numeração das portas da OLT (há modelos que começam em 0 e outros em 1)
// =====================
const pad2 = (v: number) => String(v).padStart(2, "0");

/** Números das placas e das portas PON de uma OLT do cadastro */
export function numeracaoOlt(o?: ItemCatalogo): { placas: number[]; portas: number[] } {
  const p0 = o?.placa_inicial ?? 1;
  const q0 = o?.porta_inicial ?? 1;
  return {
    placas: Array.from({ length: Math.max(0, o?.placas ?? 0) }, (_, k) => p0 + k),
    portas: Array.from({ length: Math.max(0, o?.portas_por_placa ?? 0) }, (_, k) => q0 + k),
  };
}

/** "PL 04 - Porta 13" → { placa: 4, porta: 13 } (aceita 0) */
export function lerPortaOlt(texto: string): { placa: number; porta: number } | null {
  const m = texto.match(/PL\s*(\d+)\D+?(\d+)/i);
  return m ? { placa: parseInt(m[1], 10), porta: parseInt(m[2], 10) } : null;
}

export function textoPortaOlt(placa: number, porta: number): string {
  return `PL ${pad2(placa)} - Porta ${pad2(porta)}`;
}

// =====================
// Firestore (coleção catalogo_rede)
// =====================
const COLECAO = "catalogo_rede";

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

function semVazios<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v)))
  ) as Partial<T>;
}

export async function listarCatalogo(): Promise<ItemCatalogo[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return { ...data, id: d.id, atualizado_em: isoDe(data.atualizado_em) } as ItemCatalogo;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

export async function salvarItemCatalogo(id: string | null, dados: ItemCatalogoInput): Promise<ItemCatalogo> {
  const { addDoc, collection, doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const registro = semVazios({ ...dados, nome: dados.nome.trim(), obs: dados.obs?.trim() });
  let novoId = id;
  if (id) await setDoc(doc(db, COLECAO, id), { ...registro, atualizado_em: serverTimestamp() });
  else novoId = (await addDoc(collection(db, COLECAO), { ...registro, atualizado_em: serverTimestamp() })).id;
  return { ...(registro as ItemCatalogoInput), id: novoId!, atualizado_em: new Date().toISOString() };
}

export async function excluirItemCatalogo(id: string): Promise<void> {
  const { deleteDoc, doc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
}
