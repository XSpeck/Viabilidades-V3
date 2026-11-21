// =====================
// Comparação de nome de prédio/condomínio: ignora acento, prefixos ("Ed.", "Residencial"…)
// e aceita pequenos erros de digitação ("Lignitto" ≈ "Lignito").
// =====================

const PREFIXOS = /\b(residencial|condominio|edificio|edif|predio|res|cond|ed|bloco|bairro|vila|parque|torre)\b/g;

export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(PREFIXOS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de edição (inserir, apagar, trocar ou inverter duas letras vizinhas) */
export function distanciaEdicao(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Quantos erros aceitar numa palavra: curta nenhum, média 1, longa 2 */
const tolerancia = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

const palavraParecida = (a: string, b: string) =>
  a === b || distanciaEdicao(a, b) <= tolerancia(Math.min(a.length, b.length));

/** Palavras de ligação não contam como "palavra em comum" */
const LIGACOES = new Set(["das", "dos", "del", "the"]);

export function nomeSimilar(a: string, b: string): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  // nome inteiro com erro pequeno ("lignitto" × "lignito", "monblanc" × "mont blanc")
  const sa = na.replace(/ /g, ""), sb = nb.replace(/ /g, "");
  if (distanciaEdicao(sa, sb) <= tolerancia(Math.min(sa.length, sb.length))) return true;
  // palavras: todas as da menor lista aparecem (com erro pequeno) na outra, ou 2+ em comum
  const pa = na.split(" ").filter((w) => w.length > 2 && !LIGACOES.has(w));
  const pb = nb.split(" ").filter((w) => w.length > 2 && !LIGACOES.has(w));
  if (!pa.length || !pb.length) return false;
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const comuns = menor.filter((w) => maior.some((x) => palavraParecida(w, x))).length;
  return comuns === menor.length ? menor.join("").length >= 4 : comuns >= 2;
}
