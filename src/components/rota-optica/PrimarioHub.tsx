"use client";

import { corFibra, perdaSplitter, tipoVisual, CALCULO_PADRAO } from "@/lib/rotaOptica";
import { pernasSplitter, type NoArvore } from "@/lib/arvorePon";
import { totalPernas, portasPara } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { IconeElementoSvg } from "./IconesRede";

/**
 * HUB visto como splitter PRIMÁRIO: a fibra da OLT entra, o PLC divide e cada porta de saída
 * leva uma fibra até um splitter SECUNDÁRIO (CTO/CDOI). Mostra a cascata (1:8 × 1:8 = 64),
 * a potência em cada etapa e a ocupação de cada secundário.
 */

interface Props {
  no: NoArvore;
  catalogo: ItemCatalogo[];
  /** Abre a janela de um nó da árvore (secundário) */
  onAbrirNo?: (id: string) => void;
  /** Vai para a aba onde se marcam as portas */
  onEditarPortas?: () => void;
}

const ROW = 40;
const W = 440;
const TOPO = 58;

const curto = (s: string, n = 24) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const dbm = (v?: number) => (v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`);
function nivel(v?: number) {
  if (v === undefined) return { cor: "#94a3b8", texto: "sem medida" };
  if (v >= -20) return { cor: "#22c55e", texto: "ótima" };
  if (v >= -25) return { cor: "#84cc16", texto: "boa" };
  if (v >= -27) return { cor: "#f59e0b", texto: "no limite" };
  return { cor: "#ef4444", texto: "abaixo" };
}
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Primeiros splitters abaixo deste nó (o secundário de cada caminho) */
function secundarios(n: NoArvore): NoArvore[] {
  if (pernasSplitter(n)) return [n];
  const r = n.filhos.flatMap(secundarios);
  return r.length ? r : [n];
}

type Saida =
  | { tipo: "ramo"; porta: number; filho: NoArvore; sec: NoArvore[]; sugerida: boolean }
  | { tipo: "cliente"; porta: number; descricao?: string }
  | { tipo: "livre"; porta: number };

export default function PrimarioHub({ no, catalogo, onAbrirNo, onEditarPortas }: Props) {
  const el = no.elemento;
  const relacao = no.caixa?.splitter ?? el.splitter;
  const total = totalPernas(relacao);
  const modelo = catalogo.find((m) => m.id === (no.caixa?.splitter_modelo ?? el.splitter_modelo));
  const perda = perdaSplitter(relacao, modelo?.perda_db);
  const conector = CALCULO_PADRAO.conector_db;
  const potIn = el.potencia_entrada;
  const potSaida = potIn !== undefined && total ? potIn - perda - conector : undefined;

  if (!total || !relacao) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm font-semibold text-slate-800">Esta HUB ainda não tem o splitter primário</p>
        <p className="mt-1 text-xs text-slate-500">Escolha o splitter (ex.: 1:8) do cadastro para ver as saídas até os secundários.</p>
        {onEditarPortas && (
          <button type="button" onClick={onEditarPortas} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
            Definir splitter
          </button>
        )}
      </div>
    );
  }

  // ---------- Saídas: porta marcada → ramo da árvore; o que sobrar ocupa as portas livres (sugerida) ----------
  const portas = portasPara(relacao, no.caixa?.portas ?? []);
  const usados = new Set<string>();
  const saidas: Saida[] = portas.map((p) => {
    if (p.status === "cliente") return { tipo: "cliente", porta: p.numero, descricao: p.descricao };
    if (p.status === "ramal" && p.descricao) {
      const d = norm(p.descricao);
      const f = no.filhos.find((x) => !usados.has(x.id) && (norm(x.elemento.nome).includes(d) || d.includes(norm(curto(x.elemento.nome, 60)))));
      if (f) {
        usados.add(f.id);
        return { tipo: "ramo", porta: p.numero, filho: f, sec: secundarios(f), sugerida: false };
      }
    }
    return { tipo: "livre", porta: p.numero };
  });
  const semPorta = no.filhos.filter((f) => !usados.has(f.id));
  for (const f of semPorta) {
    const k = saidas.findIndex((s) => s.tipo === "livre");
    if (k < 0) break;
    saidas[k] = { tipo: "ramo", porta: saidas[k].porta, filho: f, sec: secundarios(f), sugerida: true };
  }
  const sobrando = semPorta.filter((f) => !saidas.some((s) => s.tipo === "ramo" && s.filho.id === f.id));

  // ---------- Números da cascata ----------
  const ramos = saidas.filter((s): s is Extract<Saida, { tipo: "ramo" }> => s.tipo === "ramo");
  const secs = ramos.flatMap((r) => r.sec);
  const pernasSec = secs.map((s) => pernasSplitter(s)).filter((x): x is NonNullable<typeof x> => !!x);
  const capSec = pernasSec.reduce((a, p) => a + p.total, 0);
  const cliSec = pernasSec.reduce((a, p) => a + p.clientes, 0) + saidas.filter((s) => s.tipo === "cliente").length;
  const relSec = pernasSec[0]?.splitter;
  const maxSec = Math.max(0, ...pernasSec.map((p) => p.total));
  const potPonta = (s: NoArvore) => {
    const ps = pernasSplitter(s);
    if (s.elemento.potencia_saida !== undefined) return s.elemento.potencia_saida;
    if (s.elemento.potencia_entrada === undefined) return undefined;
    return s.elemento.potencia_entrada - (ps ? perdaSplitter(ps.splitter) + conector : 0);
  };
  const pontas = secs.map(potPonta).filter((v): v is number => v !== undefined);
  const pior = pontas.length ? Math.min(...pontas) : undefined;
  const usadas = saidas.filter((s) => s.tipo !== "livre").length;

  // ---------- Desenho ----------
  const n = saidas.length;
  const H = TOPO + n * ROW + 8;
  const xHub = 64;
  const wHub = 96;
  const yHub0 = TOPO - 12;
  const yHub1 = TOPO + n * ROW - 4;
  const yMeio = (yHub0 + yHub1) / 2;
  const xPlc = xHub + 26;
  const xAd = xHub + wHub; // adaptadores na borda da caixa
  const xCard = 196;
  const yPorta = (k: number) => TOPO + k * ROW + ROW / 2 - 4;
  const cIn = corFibra(el.fibra_entrada, el.cabo_entrada);
  const nvIn = nivel(potIn);

  return (
    <div className="p-3 space-y-3">
      {/* Números */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Primário", v: relacao, d: `−${perda.toFixed(1).replace(".", ",")} dB` },
          { r: "Saídas", v: `${usadas}/${total}`, d: `${total - usadas} livre${total - usadas !== 1 ? "s" : ""}` },
          { r: "Clientes", v: capSec ? `${cliSec}/${capSec}` : String(cliSec), d: capSec ? "nos secundários" : "marque os secundários" },
          { r: "Pior ponta", v: pior !== undefined ? dbm(pior) : "—", d: pior !== undefined ? `dBm · ${nivel(pior).texto}` : "sem medida", cor: pior !== undefined ? nivel(pior).cor : undefined },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="text-sm font-bold" style={{ color: t.cor ?? "#1e293b" }}>{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      {/* Desenho do primário */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-lg">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none">
          <defs>
            <linearGradient id="hubCaixa" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4338ca" />
              <stop offset="1" stopColor="#1e1b4b" />
            </linearGradient>
            <linearGradient id="hubPlc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#e0e7ff" />
              <stop offset="1" stopColor="#a5b4fc" />
            </linearGradient>
            <pattern id="hubGrade" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V16" fill="none" stroke="#1e293b" strokeWidth=".6" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#hubGrade)" />

          {/* cabeçalho: entrada */}
          <text x="10" y="16" fontSize="8" fill="#94a3b8" fontWeight={700} letterSpacing=".08em">ENTRADA · VEM DA OLT</text>
          <text x="10" y="29" fontSize="9" fill="#e2e8f0" fontWeight={700}>{curto(el.cabo_entrada ?? "cabo não informado", 30)}</text>
          <text x="10" y="40" fontSize="8" fill="#94a3b8">
            {el.fibra_entrada ? `fibra ${el.fibra_entrada} ${cIn.nome.toLowerCase()}` : "fibra ?"} · chega com <tspan fill={nvIn.cor} fontWeight={800}>{dbm(potIn)} dBm</tspan>
          </text>
          <text x={W - 10} y="16" fontSize="8" fill="#94a3b8" textAnchor="end" fontWeight={700} letterSpacing=".08em">SAÍDAS → SECUNDÁRIOS</text>
          <text x={W - 10} y="29" fontSize="8" fill="#94a3b8" textAnchor="end">cada porta {dbm(potSaida)} dBm</text>

          {/* caixa da HUB */}
          <rect x={xHub} y={yHub0} width={wHub} height={yHub1 - yHub0} rx="12" fill="url(#hubCaixa)" stroke="#818cf8" strokeWidth="1.2" />
          <text x={xHub + wHub / 2} y={yHub0 + 12} fontSize="7.5" fill="#c7d2fe" textAnchor="middle" fontWeight={800} letterSpacing=".1em">HUB</text>

          {/* fibra de entrada */}
          <path d={`M0 ${yMeio} H${xPlc}`} stroke="#020617" strokeWidth="7" strokeLinecap="round" />
          <path d={`M0 ${yMeio} H${xPlc}`} stroke={cIn.hex} strokeWidth="2.6" strokeLinecap="round" />
          <circle r="2.2" fill="#fff">
            <animateMotion dur="1.8s" repeatCount="indefinite" path={`M0 ${yMeio} H${xPlc}`} />
          </circle>

          {/* fibras do PLC até cada adaptador */}
          {saidas.map((s, k) => {
            const y = yPorta(k);
            const livre = s.tipo === "livre";
            return (
              <path
                key={`f${k}`}
                d={`M${xPlc + 22} ${yMeio} C${xPlc + 44} ${yMeio}, ${xAd - 26} ${y}, ${xAd - 4} ${y}`}
                fill="none"
                stroke={livre ? "#475569" : "#fbbf24"}
                strokeWidth={livre ? 1 : 1.6}
                strokeDasharray={livre ? "3 2" : undefined}
              />
            );
          })}

          {/* PLC */}
          <g>
            <rect x={xPlc - 6} y={yMeio - 24} width="34" height="48" rx="6" fill="url(#hubPlc)" stroke="#fff" strokeWidth="1.2" />
            <text x={xPlc + 11} y={yMeio - 8} fontSize="7" fill="#312e81" textAnchor="middle" fontWeight={800}>PLC</text>
            <text x={xPlc + 11} y={yMeio + 4} fontSize="10" fill="#1e1b4b" textAnchor="middle" fontWeight={900}>{relacao}</text>
            <text x={xPlc + 11} y={yMeio + 16} fontSize="6.5" fill="#4338ca" textAnchor="middle" fontWeight={700}>−{perda.toFixed(1).replace(".", ",")} dB</text>
          </g>

          {/* portas e destinos */}
          {saidas.map((s, k) => {
            const y = yPorta(k);
            const yc = TOPO + k * ROW;
            const adaptador = (
              <g>
                <rect x={xAd - 6} y={y - 6} width="14" height="12" rx="2.5" fill={s.tipo === "livre" ? "#334155" : "#22c55e"} stroke="#0f172a" strokeWidth="1" />
                <text x={xAd + 1} y={y + 2.6} fontSize="7" fill={s.tipo === "livre" ? "#94a3b8" : "#052e16"} textAnchor="middle" fontWeight={800}>{s.porta}</text>
              </g>
            );
            if (s.tipo === "livre") {
              return (
                <g key={`p${k}`}>
                  <path d={`M${xAd + 8} ${y} H${xCard}`} stroke="#334155" strokeWidth="1" strokeDasharray="3 2" />
                  <rect x={xCard} y={yc + 4} width={W - xCard - 6} height={ROW - 10} rx="8" fill="none" stroke="#334155" strokeDasharray="4 3" />
                  <text x={xCard + 12} y={yc + ROW / 2 + 1} fontSize="8.5" fill="#64748b" fontWeight={700}>Livre</text>
                  <text x={xCard + 12} y={yc + ROW / 2 + 11} fontSize="7" fill="#475569">reserva para um novo secundário · {dbm(potSaida)} dBm</text>
                  {adaptador}
                </g>
              );
            }
            if (s.tipo === "cliente") {
              return (
                <g key={`p${k}`}>
                  <path d={`M${xAd + 8} ${y} H${xCard}`} stroke="#38bdf8" strokeWidth="1.4" />
                  <rect x={xCard} y={yc + 4} width={W - xCard - 6} height={ROW - 10} rx="8" fill="#0c4a6e" stroke="#0369a1" />
                  <IconeElementoSvg tipo="onu" x={xCard + 16} y={yc + ROW / 2 - 1} tamanho={18} />
                  <text x={xCard + 30} y={yc + ROW / 2 - 2} fontSize="8.5" fill="#e0f2fe" fontWeight={700}>Cliente direto no primário</text>
                  <text x={xCard + 30} y={yc + ROW / 2 + 9} fontSize="7" fill="#7dd3fc">{curto(s.descricao ?? "sem identificação", 30)}</text>
                  {adaptador}
                </g>
              );
            }
            const sec = s.sec[0];
            const ps = pernasSplitter(sec);
            const pIn = sec.elemento.potencia_entrada;
            const pOut = potPonta(sec);
            const nv = nivel(pOut ?? pIn);
            const cFib = corFibra(s.filho.elemento.fibra_entrada, s.filho.elemento.cabo_entrada);
            const ocup = ps ? (ps.clientes + ps.ramais) / ps.total : 0;
            const larg = W - xCard - 6;
            return (
              <g key={`p${k}`} className={onAbrirNo ? "cursor-pointer" : undefined} onClick={() => onAbrirNo?.(sec.id)}>
                <title>{`Porta ${s.porta} → ${s.sec.map((x) => x.elemento.nome).join(", ")}${s.sugerida ? " (porta não marcada: sugerida)" : ""}`}</title>
                <path d={`M${xAd + 8} ${y} H${xCard}`} stroke="#020617" strokeWidth="4.5" />
                <path d={`M${xAd + 8} ${y} H${xCard}`} stroke={cFib.hex} strokeWidth="1.8" />
                <rect x={xCard} y={yc + 4} width={larg} height={ROW - 10} rx="8" fill="#1e293b" stroke={s.sugerida ? "#f59e0b" : "#334155"} strokeDasharray={s.sugerida ? "4 2" : undefined} />
                {/* barra de ocupação do secundário */}
                {ps && <rect x={xCard + 1} y={yc + ROW - 8} width={(larg - 2) * Math.min(1, ocup)} height="2" rx="1" fill={ocup >= 1 ? "#ef4444" : "#22c55e"} />}
                <IconeElementoSvg tipo={tipoVisual(sec.elemento)} x={xCard + 15} y={yc + ROW / 2 - 1} tamanho={20} />
                <text x={xCard + 29} y={yc + ROW / 2 - 2} fontSize="8.5" fill="#f1f5f9" fontWeight={700}>
                  {curto(sec.elemento.nome, s.sec.length > 1 ? 16 : 22)}{s.sec.length > 1 ? ` +${s.sec.length - 1}` : ""}
                </text>
                <text x={xCard + 29} y={yc + ROW / 2 + 9} fontSize="7" fill="#94a3b8">
                  {ps ? `secundário ${ps.splitter} · ${ps.clientes}/${ps.total} clientes` : "sem splitter"}
                  {s.sugerida ? " · porta?" : ""}
                </text>
                <text x={W - 12} y={yc + ROW / 2 - 2} fontSize="9" fill={nv.cor} textAnchor="end" fontWeight={800}>{dbm(pOut ?? pIn)}</text>
                <text x={W - 12} y={yc + ROW / 2 + 9} fontSize="6.5" fill="#64748b" textAnchor="end">{pOut !== undefined ? "dBm na ponta" : "dBm"}</text>
                {adaptador}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Cascata */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-[11px] text-indigo-900">
        <p className="font-semibold">
          Cascata: primário {relacao}
          {relSec ? ` × secundário ${relSec}` : ""} = até {total * (maxSec || 1)} clientes nesta porta PON
        </p>
        <p className="mt-0.5 text-indigo-700">
          {dbm(potIn)} dBm na entrada → {dbm(potSaida)} dBm em cada saída
          {pior !== undefined ? ` → pior ponta ${dbm(pior)} dBm` : ""}
        </p>
      </div>

      {(saidas.some((s) => s.tipo === "ramo" && s.sugerida) || sobrando.length > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          {saidas.some((s) => s.tipo === "ramo" && s.sugerida) && <p>Portas com borda tracejada foram sugeridas: marque a porta certa de cada secundário.</p>}
          {sobrando.length > 0 && <p>Sem porta livre para: {sobrando.map((f) => curto(f.elemento.nome, 20)).join(", ")}.</p>}
          {onEditarPortas && (
            <button type="button" onClick={onEditarPortas} className="mt-1 font-semibold text-amber-800 underline">
              Marcar portas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
