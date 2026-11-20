// =====================
// Textos encurtados com "…": guarda o texto completo para mostrar ao passar o mouse.
// =====================

const cortes = new Map<string, string>();

/** Encurta "t" para n letras com "…" e guarda o texto completo ("completo", ou o próprio t). */
export function cortar(t: string, n: number, completo?: string): string {
  if (t.length <= n) return t;
  const c = `${t.slice(0, Math.max(1, n - 1))}…`;
  cortes.set(c, completo ?? t);
  return c;
}

/** Troca, dentro de um texto, cada pedaço encurtado pelo completo. null se não achou nada. */
export function expandir(texto: string): string | null {
  if (!texto.includes("…")) return null;
  let saida = texto;
  let achou = false;
  // os mais longos primeiro (um corte pode conter outro)
  const lista = [...cortes.entries()].filter(([c]) => saida.includes(c)).sort((a, b) => b[0].length - a[0].length);
  for (const [c, completo] of lista) {
    if (saida.includes(c)) {
      saida = saida.split(c).join(completo);
      achou = true;
    }
  }
  return achou ? saida : null;
}
