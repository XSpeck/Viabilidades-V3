"use client";

import { CALCULO_PADRAO, capacidadeDoCabo, capacidadeRegistrada, corFibra, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, type NoArvore } from "@/lib/arvorePon";
import {
  portasFinais,
  splittersDaCaixa,
  type SplitterCaixa,
  type StatusPorta,
} from "@/lib/caixasRede";
import { potenciaPortasFinais } from "@/lib/potenciaCaixa";
import { chaveCabo } from "@/lib/cabosRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { IconeElementoSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * CT (caixa de transporte): extensão de uma CTO. Portas da CTO seguem por um cabo até a CT,
 * e na CT cada fibra atende um cliente (sem splitter). Mostra CTO → cabo → CT → clientes.
 */

interface Props {
  no: NoArvore;
  rotas: RotaOptica[];
  modelos: ItemCatalogo[];
  /** Abre a CT na aba Unifilar (cliente de cada fibra; a porta da CTO se liga na CTO) */
  onAbrirUnifilar?: () => void;
}

const ROW = 22;
const W = 440;
const TOPO = 40;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const curto = (s: string, n = 22) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return cortar(t, n, s);
};
const caboCurto = (c: string) => c.split(" · ")[0].split(" - ")[0].trim();
const dbm = (v?: number) => (v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`);
function nivel(v?: number) {
  if (v === undefined) return "#94a3b8";
  if (v >= -20) return "#16a34a";
  if (v >= -25) return "#65a30d";
  if (v >= -27) return "#d97706";
  return "#dc2626";
}

export default function CaixaCt({ no, rotas, modelos, onAbrirUnifilar }: Props) {
  const ct = no.elemento;
  const chave = chaveElemento(ct);
  const cabo = ct.cabo_entrada ?? "";

  // CTO de onde a CT é extensão: a primeira CTO subindo pela árvore
  let cto: NoArvore | null = no.pai;
  while (cto && tipoVisual(cto.elemento) !== "cto" && cto.elemento.tipo !== "olt") cto = cto.pai;
  if (cto && tipoVisual(cto.elemento) !== "cto") cto = null;


  // ---------- Fibras do cabo que chega na CT ----------
  const usadas = new Map<number, { pot?: number; rota: string }>();
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i > 0 && chaveElemento(e) === chave && e.fibra_entrada && e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(cabo) && !usadas.has(e.fibra_entrada)) usadas.set(e.fibra_entrada, { pot: e.potencia_entrada, rota: r.nome });
    });
  }
  const maior = Math.max(1, ...usadas.keys());
  // capacidade: a cadastrada; senão a do nome ("04 FO ASO" = 4); senão a estimada pelas fibras usadas
  const capNome = Number(cabo.match(/(\d+)\s*F(?:O|IBRAS?)?\b/i)?.[1]) || undefined;
  const cap = cabo ? capacidadeRegistrada(cabo) ?? capNome ?? capacidadeDoCabo(cabo, maior) : maior;
  const nFibras = Math.min(Math.max(cap, maior), 24);
  const fibras = Array.from({ length: nFibras }, (_, i) => i + 1);

  // ---------- Portas finais da CTO e a potência de cada uma ----------
  const splsCto: SplitterCaixa[] = cto ? splittersDaCaixa(cto.caixa, { splitter: cto.elemento.splitter, splitter_modelo: cto.elemento.splitter_modelo, cabo: cto.elemento.cabo_entrada, fibra: cto.elemento.fibra_entrada }) : [];
  const entradasCto: { cabo: string; fibra: number; pot?: number }[] = [];
  if (cto) {
    const kc = chaveElemento(cto.elemento);
    for (const r of rotas) r.elementos.forEach((e, i) => {
      if (i > 0 && chaveElemento(e) === kc && e.cabo_entrada && e.fibra_entrada && !entradasCto.some((x) => chaveCabo(x.cabo) === chaveCabo(e.cabo_entrada!) && x.fibra === e.fibra_entrada)) entradasCto.push({ cabo: e.cabo_entrada, fibra: e.fibra_entrada, pot: e.potencia_entrada });
    });
  }
  const potCto = potenciaPortasFinais(splsCto, entradasCto, (id) => modelos.find((m) => m.id === id)?.perda_db, cto?.elemento.potencia_entrada);
  const finaisCto = portasFinais(splsCto);
  const nomeSpl = (id: string) => `S${splsCto.findIndex((x) => x.id === id) + 1}`;
  const rotuloPortaCto = (id: string, p: number) => (splsCto.length > 1 ? `${nomeSpl(id)}·${p}` : `P${p}`);
  /** Porta da CTO que alimenta a fibra f (porta Ramal marcada para esta CT nesta fibra) */
  const origemSalva = (f: number) =>
    finaisCto.find(({ porta }) => {
      if (porta.status !== "ramal") return false;
      if (porta.saida) return !!cabo && chaveCabo(porta.saida.cabo) === chaveCabo(cabo) && porta.saida.fibra === f;
      if (!porta.descricao) return false;
      const d = norm(porta.descricao);
      return d.includes(norm(curto(ct.nome, 60))) && new RegExp(`\\bf${f}$`).test(d);
    });

  // ---------- Estado de edição: porta da CTO e cliente de cada fibra ----------
  const inicial = () =>
    fibras.map((f) => {
      const o = origemSalva(f);
      const a = no.caixa?.atendimento?.find((x) => x.numero === f);
      return { fibra: f, origem: o ? `${o.spl.id}|${o.porta.numero}` : "", status: (a?.status ?? "livre") as StatusPorta, descricao: a?.descricao ?? "" };
    });
  const linhas = inicial();

  // ---------- Potência na CT ----------
  const dist = ct.distancia_m ?? 0;
  const perdaCabo = (dist / 1000) * CALCULO_PADRAO.atenuacao_db_km + CALCULO_PADRAO.conector_db;
  const potFibra = (f: number) => {
    const l = linhas.find((x) => x.fibra === f);
    const p = l?.origem ? potCto.get(l.origem) : undefined;
    if (p !== undefined) return p - perdaCabo;
    const u = usadas.get(f)?.pot;
    return u;
  };

  const ligadas = linhas.filter((l) => l.origem).length;
  const clientes = linhas.filter((l) => l.status === "cliente").length;
  const pots = linhas.filter((l) => l.origem).map((l) => potFibra(l.fibra)).filter((v): v is number => v !== undefined);
  const pior = pots.length ? Math.min(...pots) : undefined;

  // ---------- Desenho ----------
  const H = TOPO + fibras.length * ROW + 10;
  const xCto = 8, wCto = 92, xCt = 262, wCt = 34;
  const Y = (i: number) => TOPO + i * ROW + ROW / 2;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-500">
          {cto ? <>Extensão da <b>{curto(cto.elemento.nome, 26)}</b>: portas dela seguem pelo cabo até aqui.</> : "Não há CTO antes desta CT na rota."}
        </p>
        <button type="button" onClick={onAbrirUnifilar} disabled={!onAbrirUnifilar} className="ml-auto shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-40" title="Cliente de cada fibra e a porta da CTO se mudam na aba Unifilar">
          Abrir no Unifilar
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Cabo", v: cabo ? caboCurto(cabo) : "—", d: dist ? `${Math.round(dist)} m da CTO` : "" },
          { r: "Fibras ligadas", v: `${ligadas}/${fibras.length}`, d: "a portas da CTO" },
          { r: "Clientes", v: String(clientes), d: `${fibras.length - clientes} livre${fibras.length - clientes !== 1 ? "s" : ""}` },
          { r: "Pior fibra", v: dbm(pior), d: pior !== undefined ? "dBm na CT" : "sem medida", cor: nivel(pior) },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="truncate text-sm font-bold" style={{ color: t.cor ?? "#1e293b" }}>{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-900/40 bg-[#0a0a0a] shadow-lg">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none">
          <defs>
            <pattern id="ctGrade" width="14" height="14" patternUnits="userSpaceOnUse">
              <path d="M14 0H0V14" fill="none" stroke="#262626" strokeWidth=".6" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#ctGrade)" />
          {/* CTO */}
          <rect x={xCto} y={TOPO - 22} width={wCto} height={H - TOPO + 14} rx="10" fill="#065f46" stroke="#34d399" strokeWidth="1" />
          <IconeElementoSvg tipo="cto" x={xCto + 14} y={TOPO - 10} tamanho={16} />
          <text x={xCto + 25} y={TOPO - 7} fontSize="7.5" fill="#d1fae5" fontWeight={800}>{cto ? curto(cto.elemento.nome, 12) : "CTO ?"}</text>
          {/* cabo */}
          <text x={(xCto + wCto + xCt) / 2} y={TOPO - 22} fontSize="7.5" fill="#d4d4d4" textAnchor="middle" fontWeight={700}>{cabo ? caboCurto(cabo) : "cabo"}{dist ? ` · ${Math.round(dist)} m` : ""}</text>
          <rect x={xCto + wCto + 6} y={TOPO - 16} width={xCt - xCto - wCto - 12} height="8" rx="4" fill="#020617" />
          {/* CT */}
          <rect x={xCt} y={TOPO - 22} width={wCt} height={H - TOPO + 14} rx="8" fill="#171717" stroke="#a3a3a3" strokeWidth="1" />
          <text x={xCt + wCt / 2} y={TOPO - 10} fontSize="7.5" fill="#fafafa" textAnchor="middle" fontWeight={900}>CT</text>

          {linhas.map((l, i) => {
            const y = Y(i);
            const c = corFibra(l.fibra, cabo);
            const o = l.origem ? finaisCto.find((x) => `${x.spl.id}|${x.porta.numero}` === l.origem) : undefined;
            const pot = potFibra(l.fibra);
            const ligado = !!o;
            const txt = l.status === "cliente" ? l.descricao || "cliente" : "livre";
            return (
              <g key={l.fibra}>
                {o && (
                  <>
                    <rect x={xCto + wCto - 30} y={y - 6} width="26" height="12" rx="2.5" fill="#d97706" stroke="#171717" />
                    <text x={xCto + wCto - 17} y={y + 2.6} fontSize="6.5" fill="#fff" textAnchor="middle" fontWeight={800}>{rotuloPortaCto(o.spl.id, o.porta.numero)}</text>
                  </>
                )}
                <path d={`M${xCto + wCto - 4} ${y} H${xCt}`} stroke={ligado ? c.hex : "#404040"} strokeWidth={ligado ? 2 : 1} strokeDasharray={ligado ? undefined : "3 2"} />
                {ligado && (
                  <circle r="1.7" fill="#fff">
                    <animateMotion dur="2.4s" repeatCount="indefinite" path={`M${xCto + wCto - 4} ${y} H${xCt}`} />
                  </circle>
                )}
                <rect x={xCt + 4} y={y - 6} width="26" height="12" rx="2.5" fill={l.status === "cliente" ? "#0284c7" : "#262626"} stroke="#171717" />
                <text x={xCt + 17} y={y + 2.6} fontSize="6.5" fill="#fff" textAnchor="middle" fontWeight={800}>F{l.fibra}</text>
                {l.status === "cliente" && <IconeElementoSvg tipo="onu" x={xCt + wCt + 10} y={y} tamanho={13} />}
                <text x={xCt + wCt + (l.status === "cliente" ? 19 : 8)} y={y + 2.8} fontSize="7.5" fill={l.status === "cliente" ? "#fafafa" : "#737373"} fontWeight={l.status === "cliente" ? 700 : 400}>{curto(txt, 14)}</text>
                <text x={W - 6} y={y + 2.8} fontSize="7" fill={ligado ? nivel(pot) : "#737373"} textAnchor="end" fontWeight={700}>{ligado ? dbm(pot) : "sem porta"}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-[11px] text-slate-500">
        No Unifilar: a porta da CTO que desce para cada fibra se liga na <b>CTO</b> (Editar conexões, porta → fibra do cabo),
        e o cliente de cada fibra se marca na <b>CT</b> (Clientes nas portas).
      </p>
    </div>
  );
}
