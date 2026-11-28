// =====================
// Rede livre: gravação dos elementos e cabos desenhados no mapa e a limpeza para começar do zero.
// As rotas (rotas_opticas) não são mais lidas; ficam como cópia de segurança.
// =====================

/** Coleções do que está desenhado (as rotas antigas não entram: ficam como cópia) */
export const COLECOES_REDE = ["caixas_rede", "cabos_rede", "predios_rede"] as const;

/** Quantos documentos tem em cada coleção da rede */
export async function contarRedeDesenhada(): Promise<Record<(typeof COLECOES_REDE)[number], number>> {
  const { collection, getCountFromServer } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const out = {} as Record<(typeof COLECOES_REDE)[number], number>;
  for (const c of COLECOES_REDE) out[c] = (await getCountFromServer(collection(db, c))).data().count;
  return out;
}

/** Apaga tudo o que está desenhado (elementos, cabos, prédios), em lotes. As rotas antigas ficam. */
export async function apagarRedeDesenhada(): Promise<number> {
  const { collection, getDocs, writeBatch } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  let total = 0;
  for (const c of COLECOES_REDE) {
    const snap = await getDocs(collection(db, c));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await lote.commit();
    }
    total += snap.docs.length;
  }
  return total;
}

/** Próximo código livre para um elemento novo (100001, 100002…), olhando os que já existem */
export function proximoCodigoElemento(codigos: (string | undefined)[], extra = 0): string {
  const nums = codigos.map((c) => (c && /^\d+$/.test(c.trim()) ? parseInt(c.trim(), 10) : 0));
  return String(Math.max(100000, ...nums) + 1 + extra);
}
