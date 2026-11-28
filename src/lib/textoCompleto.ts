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

/** Nome curto de caixa/cabo/rota: só a primeira parte ("CTO 12 - Rua X / lado A" → "CTO 12"), cortada em n letras */
export function nomeCurto(s: string, n = 26): string {
  return cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
}

/** Potência curta: "+3,8", "−18,0" (com " dBm" se pedido); "—" sem medida */
export function dbmCurto(v?: number, unidade = false): string {
  if (v === undefined || !Number.isFinite(v)) return unidade ? "—" : "";
  return `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}${unidade ? " dBm" : ""}`;
}
