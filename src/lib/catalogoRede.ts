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
  local?: string;
  atualizado_por?: string;
  atualizado_em?: string;
}

export type ItemCatalogoInput = Omit<ItemCatalogo, "id" | "atualizado_em">;

export const CONSTRUCOES_CABO = ["AS80", "AS120", "AS200", "Drop", "Autossustentado (outro)", "Subterrâneo / duto", "Interno"];
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
    if (i.capacidade) partes.push(`${i.capacidade} fibras`);
    if (i.fibras_por_tubo) partes.push(i.capacidade && i.fibras_por_tubo >= i.capacidade ? "1 tubo" : `tubos de ${i.fibras_por_tubo}`);
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
    if (i.placas && i.portas_por_placa) partes.push(`${i.placas} placas × ${i.portas_por_placa} PON = ${i.placas * i.portas_por_placa} portas`);
    if (i.local) partes.push(i.local);
  }
  return partes.join(" · ");
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
