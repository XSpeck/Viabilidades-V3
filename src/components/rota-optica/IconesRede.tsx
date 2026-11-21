// =====================
// Ícones da rede óptica (OLT, DIO, CEO, CT, HUB, CTO, CDOI, cliente, cabo).
// Cada ícone é um SVG 32×32 em texto, usado no React (árvore, diagrama, janelas)
// e nos marcadores do mapa (Leaflet divIcon).
// =====================
import type { TipoElementoRota } from "@/lib/rotaOptica";

export const COR_ELEMENTO: Record<TipoElementoRota, string> = {
  olt: "#0f172a",
  dio: "#475569",
  ceo: "#2563eb",
  ct: "#111827",
  hub: "#d4a106",
  cto: "#059669",
  cdoi: "#ea580c",
  predio: "#334155",
  onu: "#64748b",
  outro: "#6b7280",
};

const SOMBRA = `<ellipse cx="16" cy="29.5" rx="9" ry="1.6" fill="#000" opacity=".18"/>`;

/** Desenho interno (viewBox 0 0 32 32) de cada tipo. */
const DESENHO: Record<TipoElementoRota, (cor: string) => string> = {
  // Rack com placas e LEDs
  olt: (c) => `${SOMBRA}
    <rect x="3" y="4" width="26" height="23" rx="4" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <rect x="6.5" y="8" width="19" height="4" rx="1" fill="#334155"/>
    <rect x="6.5" y="14" width="19" height="4" rx="1" fill="#334155"/>
    <rect x="6.5" y="20" width="19" height="4" rx="1" fill="#334155"/>
    <circle cx="9" cy="10" r="1.1" fill="#4ade80"/><circle cx="9" cy="16" r="1.1" fill="#4ade80"/><circle cx="9" cy="22" r="1.1" fill="#facc15"/>
    <path d="M13 10h10M13 16h10M13 22h10" stroke="#94a3b8" stroke-width="1" stroke-dasharray="1.5 1"/>`,
  // Bandeja com adaptadores
  dio: (c) => `${SOMBRA}
    <rect x="3" y="7" width="26" height="18" rx="3.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${6.2 + i * 4.3}" y="10.5" width="3" height="4" rx=".6" fill="#e0f2fe"/><rect x="${6.2 + i * 4.3}" y="17.5" width="3" height="4" rx=".6" fill="#e0f2fe"/>`).join("")}`,
  // Caixa de emenda: cilindro (domo) com cintas
  ceo: (c) => `${SOMBRA}
    <rect x="8" y="3" width="16" height="25" rx="8" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <path d="M8.8 11h14.4M8.8 20h14.4" stroke="#1e3a8a" stroke-width="1.6" opacity=".55"/>
    <rect x="13" y="6.5" width="6" height="2.2" rx="1.1" fill="#bfdbfe"/>
    <path d="M12.5 15.5l2 -1.5 2 3 2 -1.5" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Caixa de transporte: caixa com setas de passagem
  ct: (c) => `${SOMBRA}
    <rect x="3" y="6" width="26" height="20" rx="5" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <path d="M7 13.5h15m0 0l-3.2-3m3.2 3l-3.2 3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25 19.5H10m0 0l3.2-3m-3.2 3l3.2 3" stroke="#99f6e4" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  // HUB: círculo com divisão 1 → 4 (splitter)
  hub: (c) => `${SOMBRA}
    <circle cx="16" cy="15.5" r="13" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <path d="M6.5 15.5h6.5M13 15.5L23.5 9M13 15.5l10.5 2.3M13 15.5L23.5 13.2M13 15.5L23.5 22" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="13" cy="15.5" r="2" fill="#fef9c3"/>`,
  // CTO: caixa de atendimento com portas embaixo
  cto: (c) => `${SOMBRA}
    <path d="M5 8a4 4 0 0 1 4-4h14a4 4 0 0 1 4 4v15a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <path d="M9 11h6M15 11l6-3.5M15 11l6 0M15 11l6 3.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    ${[0, 1, 2, 3].map((i) => `<circle cx="${10 + i * 4}" cy="21.5" r="1.6" fill="#d1fae5"/>`).join("")}`,
  // CDOI: prédio com fibra entrando
  cdoi: (c) => `${SOMBRA}
    <path d="M7 27V7.5L17 3.5l8 3V27z" fill="${c}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    ${[0, 1, 2].map((r) => [0, 1].map((k) => `<rect x="${10.5 + k * 6}" y="${9 + r * 5}" width="3.4" height="2.8" rx=".5" fill="#e0f2fe"/>`).join("")).join("")}
    <rect x="14" y="23" width="4" height="4" fill="#bae6fd"/>`,
  // Prédio (agrupador de CDOIs): duas torres
  predio: (c) => `${SOMBRA}
    <rect x="3.5" y="9" width="11" height="18.5" rx="1.2" fill="${c}" stroke="#fff" stroke-width="1.4"/>
    <rect x="13.5" y="3.5" width="15" height="24" rx="1.2" fill="${c}" stroke="#fff" stroke-width="1.4"/>
    ${[0, 1, 2].map((r) => `<rect x="6.2" y="${12 + r * 4.6}" width="2.4" height="2.2" rx=".4" fill="#fde68a"/><rect x="9.6" y="${12 + r * 4.6}" width="2.4" height="2.2" rx=".4" fill="#fde68a"/>`).join("")}
    ${[0, 1, 2, 3].map((r) => [0, 1, 2].map((k) => `<rect x="${16 + k * 3.8}" y="${6.5 + r * 4.4}" width="2.4" height="2.4" rx=".4" fill="#bae6fd"/>`).join("")).join("")}
    <rect x="19" y="23.5" width="4" height="4" fill="#94a3b8"/>`,
  // Cliente: casinha
  onu: (c) => `${SOMBRA}
    <path d="M4.5 15L16 5l11.5 10" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 13.5V27h16V13.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>
    <rect x="13.5" y="19" width="5" height="8" rx=".8" fill="#e2e8f0"/>`,
  outro: (c) => `${SOMBRA}<circle cx="16" cy="15.5" r="10" fill="${c}" stroke="#fff" stroke-width="1.5"/><circle cx="16" cy="15.5" r="3.2" fill="#fff"/>`,
};

export function desenhoElemento(tipo: TipoElementoRota): string {
  return (DESENHO[tipo] ?? DESENHO.outro)(COR_ELEMENTO[tipo] ?? COR_ELEMENTO.outro);
}

/** SVG completo em texto (marcadores do mapa). */
export function iconeSvg(tipo: TipoElementoRota, px = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${px}" height="${px}">${desenhoElemento(tipo)}</svg>`;
}

/** Ícone para usar em HTML (listas, janelas, diagrama). */
export function IconeElemento({ tipo, tamanho = 24, className }: { tipo: TipoElementoRota; tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={tamanho}
      height={tamanho}
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: desenhoElemento(tipo) }}
    />
  );
}

/** Ícone dentro de outro SVG (árvore), centrado em (x, y). */
export function IconeElementoSvg({ tipo, x, y, tamanho = 30 }: { tipo: TipoElementoRota; x: number; y: number; tamanho?: number }) {
  return (
    <svg
      x={x - tamanho / 2}
      y={y - tamanho / 2}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 32 32"
      overflow="visible"
      dangerouslySetInnerHTML={{ __html: desenhoElemento(tipo) }}
    />
  );
}

/** Corte de cabo (capa preta com tubos coloridos), para etiquetas de cabo. */
export const DESENHO_CABO = `
  <circle cx="16" cy="16" r="14" fill="#111827" stroke="#fff" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="10.5" fill="#1f2937"/>
  <circle cx="16" cy="9.8" r="3" fill="#16a34a"/><circle cx="21.4" cy="13" r="3" fill="#facc15"/>
  <circle cx="21.4" cy="19" r="3" fill="#f8fafc"/><circle cx="16" cy="22.2" r="3" fill="#2563eb"/>
  <circle cx="10.6" cy="19" r="3" fill="#dc2626"/><circle cx="10.6" cy="13" r="3" fill="#7c3aed"/>
  <circle cx="16" cy="16" r="2.2" fill="#9ca3af"/>`;

export function IconeCabo({ tamanho = 20, className }: { tamanho?: number; className?: string }) {
  return <svg viewBox="0 0 32 32" width={tamanho} height={tamanho} className={className} aria-hidden dangerouslySetInnerHTML={{ __html: DESENHO_CABO }} />;
}
