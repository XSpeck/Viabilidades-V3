"use client";

import { useState } from "react";
import { CALCULO_PADRAO, corFibra, perdaSplitter, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota, type NoArvore } from "@/lib/arvorePon";
import {
  portasFinais,
  portasPara,
  rotuloSplitters,
  splittersDaCaixa,
  type PortaCaixa,
  type SplitterCaixa,
} from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { IconeElementoSvg } from "./IconesRede";
import { chaveCabo } from "@/lib/cabosRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * CTO por dentro: um ou mais splitters (1:8, 1:2 + 1:8, dois 1:8 em dois níveis…), cada um alimentado
 * por uma fibra que chega (de uma rota) ou por uma porta de outro splitter; nas portas finais, os clientes.
 */

interface Props {
  no: NoArvore;
  /** Todas as rotas (as fibras que chegam nesta caixa) */
  rotas: RotaOptica[];
  modelos: ItemCatalogo[];
  /** "CTO" (padrão), "HUB" ou "CDOI" — muda os textos e as cores */
  tipoCaixa?: "CTO" | "HUB" | "CDOI";
  /** Abre a caixa na aba Unifilar (onde se edita o que tem dentro dela) */
  onAbrirUnifilar?: () => void;
}

const ROW = 22;
const W = 440;
const TOPO = 34;
const conector = CALCULO_PADRAO.conector_db;

const curto = (s: string, n = 22) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return cortar(t, n, s);
};
const dbm = (v?: number) => (v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`);
function nivel(v?: number) {
  if (v === undefined) return "#94a3b8";
  if (v >= -20) return "#16a34a";
  if (v >= -25) return "#65a30d";
  if (v >= -27) return "#d97706";
  return "#dc2626";
}
export default function CaixaCto({ no, rotas, modelos, tipoCaixa = "CTO", onAbrirUnifilar }: Props) {
  const el = no.elemento;
  const chave = chaveElemento(el);
  const [spls] = useState<SplitterCaixa[]>(() => {
    const l = splittersDaCaixa(no.caixa, { splitter: el.splitter, splitter_modelo: el.splitter_modelo, cabo: el.cabo_entrada, fibra: el.fibra_entrada });
    // um splitter só sem entrada e a fibra desta porta (que usa splitter) ainda sem splitter: liga sozinho
    const semEntrada = l.filter((x) => !x.entrada.fibra && !x.entrada.splitter);
    const minhaUsada = l.some((x) => !!x.entrada.fibra && !!el.cabo_entrada && chaveCabo(x.entrada.fibra.cabo) === chaveCabo(el.cabo_entrada) && x.entrada.fibra.fibra === el.fibra_entrada);
    if (semEntrada.length === 1 && !el.passagem && el.cabo_entrada && el.fibra_entrada && !minhaUsada) {
      return l.map((x) => (x === semEntrada[0] ? { ...x, entrada: { fibra: { cabo: el.cabo_entrada!, fibra: el.fibra_entrada! } } } : x));
    }
    return l;
  });

  // ---------- Fibras que chegam nesta caixa (uma por rota/cor) ----------
  const entradas: { cabo: string; fibra: number; pot?: number; rota: string; pon: string; passagem: boolean }[] = [];
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada || !e.fibra_entrada) return;
      const ja = entradas.find((x) => chaveCabo(x.cabo) === chaveCabo(e.cabo_entrada!) && x.fibra === e.fibra_entrada);
      // a mesma fibra numa rota que usa o splitter vale mais que numa que só passa
      if (ja) { if (ja.passagem && !e.passagem) ja.passagem = false; return; }
      entradas.push({ cabo: e.cabo_entrada, fibra: e.fibra_entrada, pot: e.potencia_entrada, rota: r.nome, pon: portaPonDaRota(r).rotulo.replace(/^.*· /, ""), passagem: !!e.passagem });
    });
  }
  // ---------- Potência e níveis ----------
  const modeloDe = (s: SplitterCaixa) => modelos.find((m) => m.id === s.modelo_id);
  const perda = (s: SplitterCaixa) => perdaSplitter(s.relacao, modeloDe(s)?.perda_db);
  const potEntrada = (s: SplitterCaixa, prof = 0): number | undefined => {
    if (prof > 8) return undefined;
    if (s.entrada.fibra) {
      const f = s.entrada.fibra;
      return entradas.find((x) => chaveCabo(x.cabo) === chaveCabo(f.cabo) && x.fibra === f.fibra)?.pot ?? el.potencia_entrada;
    }
    if (s.entrada.splitter) {
      const pai = spls.find((x) => x.id === s.entrada.splitter!.id);
      const p = pai ? potEntrada(pai, prof + 1) : undefined;
      return p !== undefined && pai ? p - perda(pai) : undefined;
    }
    return undefined;
  };
  const potSaida = (s: SplitterCaixa) => {
    const p = potEntrada(s);
    return p !== undefined ? p - perda(s) : undefined;
  };
  const filhoDa = (s: SplitterCaixa, porta: number) => spls.find((x) => x.entrada.splitter?.id === s.id && x.entrada.splitter.porta === porta);
  const nomeSpl = (s: SplitterCaixa) => `S${spls.indexOf(s) + 1}`;

  // ---------- Layout: raízes à esquerda, níveis para a direita, uma linha por porta final ----------
  const nivelDe = new Map<string, number>();
  const yDe = new Map<string, number>();
  const linhasPorta: { spl: SplitterCaixa; porta: PortaCaixa; y: number }[] = [];
  let linha = 0;
  const posiciona = (s: SplitterCaixa, nv: number, visitados: Set<string>) => {
    if (visitados.has(s.id)) return;
    visitados.add(s.id);
    nivelDe.set(s.id, nv);
    const ys: number[] = [];
    for (const p of portasPara(s.relacao, s.portas)) {
      const f = filhoDa(s, p.numero);
      if (f && !visitados.has(f.id)) {
        posiciona(f, nv + 1, visitados);
        ys.push(yDe.get(f.id)!);
      } else {
        linhasPorta.push({ spl: s, porta: p, y: linha });
        ys.push(linha++);
      }
    }
    yDe.set(s.id, ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : linha++);
  };
  const visit = new Set<string>();
  spls.filter((s) => !s.entrada.splitter || !spls.some((x) => x.id === s.entrada.splitter!.id)).forEach((s) => posiciona(s, 0, visit));
  spls.forEach((s) => posiciona(s, 0, visit)); // sobra (ciclo): entra como raiz
  const maxNv = Math.max(0, ...nivelDe.values());
  const xFinal = W - 168;
  const passo = Math.min(110, (xFinal - 96) / (maxNv + 1));
  const xSpl = (s: SplitterCaixa) => 74 + (nivelDe.get(s.id) ?? 0) * passo;
  const Y = (v: number) => TOPO + v * ROW + ROW / 2;
  const H = TOPO + Math.max(linha, 1) * ROW + 12;

  // ---------- Números ----------
  const finais = portasFinais(spls);
  const clientes = finais.filter((f) => f.porta.status === "cliente").length;
  const ramais = finais.filter((f) => f.porta.status === "ramal").length;
  const potsFinais = finais.map((f) => potSaida(f.spl)).filter((v): v is number => v !== undefined).map((v) => v - conector);
  const pior = potsFinais.length ? Math.min(...potsFinais) : undefined;


  // cores por tipo: CTO verde · CDOI laranja · HUB amarelo
  const tema =
    tipoCaixa === "CDOI"
      ? { caixa: "border-orange-900/40 bg-[#431407]", grade: "#7c2d12", texto: "#fdba74" }
      : tipoCaixa === "HUB"
        ? { caixa: "border-yellow-900/40 bg-[#422006]", grade: "#713f12", texto: "#fde047" }
        : { caixa: "border-emerald-900/40 bg-[#052e1f]", grade: "#064e3b", texto: "#6ee7b7" };

  // Só passagem nesta porta: não há o que configurar aqui (splitters, se houver, são da porta que usa); só mostra a fibra atravessando
  if (no.elemento.passagem) {
    return (
      <div className="p-3 space-y-2.5">
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-800">Só passagem nesta porta</p>
          <p className="mt-0.5 text-[11px] text-slate-600">A fibra atravessa a {tipoCaixa} sem usar splitter (como numa caixa de emenda). Em que fibra chega e por onde segue: aba <b>Emendas</b>.</p>
        </div>
        {spls.length > 0 && (
          <p className="text-[10px] text-slate-400">Os splitters desta {tipoCaixa} são de outra porta: veja e edite na árvore da porta que usa.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-500">
          {tipoCaixa === "HUB"
            ? "Splitters primários da HUB: um para cada porta PON (fibra que chega)."
            : tipoCaixa === "CDOI"
              ? "Splitter da CDOI e o apartamento / cliente em cada perna."
              : "Splitters de atendimento da CTO e os clientes em cada porta."}
        </p>
          <button type="button" onClick={onAbrirUnifilar} disabled={!onAbrirUnifilar} className="ml-auto shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-40" title="O que tem dentro da caixa se muda na aba Unifilar">
            Abrir no Unifilar
          </button>
      </div>

      {no.elemento.passagem && (
        <p className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
          Nesta porta PON a {tipoCaixa} é <b>só passagem</b>: a fibra atravessa a caixa; os splitters abaixo atendem outra porta ou outra fibra.
        </p>
      )}
      {/* Números */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Splitters", v: spls.length ? rotuloSplitters(spls) : "—", d: `${spls.length} no total` },
          { r: "Portas", v: String(finais.length), d: "de atendimento" },
          { r: "Clientes", v: `${clientes}/${finais.length}`, d: `${finais.length - clientes - ramais} livres${ramais ? ` · ${ramais} ramal` : ""}` },
          { r: "Pior porta", v: dbm(pior), d: pior !== undefined ? "dBm" : "sem medida", cor: nivel(pior) },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="truncate text-sm font-bold" style={{ color: t.cor ?? "#1e293b" }}>{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      {/* Desenho */}
      {spls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
          Esta {tipoCaixa} ainda não tem splitter. Os splitters se colocam no Unifilar.
        </div>
      ) : (
        <div className={`overflow-hidden rounded-2xl border shadow-lg ${tema.caixa}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none">
            <defs>
              <pattern id="ctoGrade" width="14" height="14" patternUnits="userSpaceOnUse">
                <path d="M14 0H0V14" fill="none" stroke={tema.grade} strokeWidth=".6" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#ctoGrade)" />
            <text x="8" y="14" fontSize="7.5" fill={tema.texto} fontWeight={800} letterSpacing=".08em">FIBRAS QUE CHEGAM</text>
            <text x={W - 8} y="14" fontSize="7.5" fill={tema.texto} fontWeight={800} textAnchor="end" letterSpacing=".08em">
              {tipoCaixa === "CDOI" ? "APARTAMENTOS / CLIENTES" : "PORTAS DE ATENDIMENTO"}
            </text>

            {/* fibra que entra em cada splitter de 1º nível */}
            {spls.filter((s) => s.entrada.fibra).map((s) => {
              const f = s.entrada.fibra!;
              const c = corFibra(f.fibra, f.cabo);
              const y = Y(yDe.get(s.id) ?? 0);
              const p = potEntrada(s);
              return (
                <g key={`in${s.id}`}>
                  <title>{`${f.cabo} · fibra ${f.fibra}`}</title>
                  <path d={`M0 ${y} H${xSpl(s)}`} stroke="#020617" strokeWidth="6" />
                  <path d={`M0 ${y} H${xSpl(s)}`} stroke={c.hex} strokeWidth="2.4" />
                  <circle r="2" fill="#fff">
                    <animateMotion dur="2s" repeatCount="indefinite" path={`M0 ${y} H${xSpl(s)}`} />
                  </circle>
                  <text x="4" y={y - 6} fontSize="6.8" fill="#d1fae5" fontWeight={700}>{curto(f.cabo, 13)} F{f.fibra}</text>
                  <text x="4" y={y + 11} fontSize="6.5" fill={nivel(p)} fontWeight={700}>{dbm(p)} dBm</text>
                </g>
              );
            })}

            {/* ligações das portas: para outro splitter (2º nível) ou para a porta final */}
            {spls.map((s) => {
              const x0 = xSpl(s) + 30;
              const y0 = Y(yDe.get(s.id) ?? 0);
              return portasPara(s.relacao, s.portas).map((p) => {
                const f = filhoDa(s, p.numero);
                const alvo = f ? { x: xSpl(f), y: Y(yDe.get(f.id) ?? 0) } : { x: xFinal, y: Y(linhasPorta.find((l) => l.spl.id === s.id && l.porta.numero === p.numero)?.y ?? 0) };
                const usada = f || p.status !== "livre";
                return (
                  <path
                    key={`l${s.id}${p.numero}`}
                    d={`M${x0} ${y0} C${x0 + 18} ${y0}, ${alvo.x - 18} ${alvo.y}, ${alvo.x} ${alvo.y}`}
                    fill="none"
                    stroke={f ? "#fbbf24" : usada ? "#34d399" : "#335a4a"}
                    strokeWidth={f ? 2 : usada ? 1.5 : 1}
                    strokeDasharray={usada ? undefined : "3 2"}
                  />
                );
              });
            })}

            {/* splitters */}
            {spls.map((s) => {
              const x = xSpl(s);
              const y = Y(yDe.get(s.id) ?? 0);
              return (
                <g key={`s${s.id}`}>
                  <rect x={x} y={y - 17} width="30" height="34" rx="6" fill="#ecfdf5" stroke="#fff" strokeWidth="1.2" />
                  <text x={x + 15} y={y - 6} fontSize="6.5" fill="#065f46" textAnchor="middle" fontWeight={800}>{nomeSpl(s)}</text>
                  <text x={x + 15} y={y + 4} fontSize="9" fill="#022c22" textAnchor="middle" fontWeight={900}>{s.relacao}</text>
                  <text x={x + 15} y={y + 13} fontSize="6" fill="#047857" textAnchor="middle">−{perda(s).toFixed(1).replace(".", ",")}</text>
                </g>
              );
            })}

            {/* portas finais */}
            {linhasPorta.map(({ spl, porta: p, y: v }) => {
              const y = Y(v);
              const pot = potSaida(spl);
              const potP = pot !== undefined ? pot - conector : undefined;
              const txt = p.status === "cliente" ? p.descricao || "cliente" : p.status === "ramal" ? `→ ${p.descricao || "ramal"}` : "livre";
              return (
                <g key={`p${spl.id}${p.numero}`}>
                  <rect x={xFinal - 1} y={y - 6} width="26" height="12" rx="2.5" fill={p.status === "livre" ? "#1f3d33" : p.status === "cliente" ? "#0284c7" : "#d97706"} stroke="#022c22" />
                  <text x={xFinal + 12} y={y + 2.6} fontSize="6.5" fill="#fff" textAnchor="middle" fontWeight={800}>{nomeSpl(spl)}·{p.numero}</text>
                  {p.status === "cliente" && <IconeElementoSvg tipo="onu" x={xFinal + 34} y={y} tamanho={13} />}
                  <text x={xFinal + (p.status === "cliente" ? 43 : 31)} y={y + 2.8} fontSize="7.5" fill={p.status === "livre" ? "#5e8a78" : "#ecfdf5"} fontWeight={p.status === "livre" ? 400 : 700}>
                    {curto(txt, 18)}
                  </text>
                  <text x={W - 6} y={y + 2.8} fontSize="7" fill={nivel(potP)} textAnchor="end" fontWeight={700}>{dbm(potP)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Fibras que chegam */}
      {entradas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entradas.map((e) => {
            const c = corFibra(e.fibra, e.cabo);
            const usa = spls.filter((s) => !!s.entrada.fibra && chaveCabo(s.entrada.fibra.cabo) === chaveCabo(e.cabo) && s.entrada.fibra.fibra === e.fibra).map(nomeSpl);
            return (
              <span key={`${e.cabo}${e.fibra}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600" title={e.rota}>
                <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: c.hex }} />
                <b className="font-semibold text-slate-700">{e.pon}</b> · {curto(e.cabo, 18)} F{e.fibra} → {usa.length ? usa.join(", ") : e.passagem ? <span className="text-slate-400">só passa</span> : <b className="text-amber-700">sem splitter</b>}
              </span>
            );
          })}
        </div>
      )}

    </div>
  );
}
