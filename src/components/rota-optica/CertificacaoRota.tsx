"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileDown } from "lucide-react";
import { formatMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import type { Sentido } from "@/lib/rompimento";
import {
  ATENUACAO,
  eventosEsperados,
  situacaoDistancia,
  situacaoPerda,
  situacaoTotal,
  TOLERANCIA,
  type Lambda,
  type Situacao,
} from "@/lib/certificacao";
import { IconeElemento } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * Certificação de rota: o traço que o OTDR deve mostrar (eventos, perdas e distâncias esperadas)
 * e a comparação com o que o técnico mediu. Nada é gravado: o laudo sai em PDF.
 */

interface Props {
  rotas: RotaOptica[];
  usuario?: string;
}

const curto = (s: string, n = 24) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const db = (v?: number) => (v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(2).replace(".", ","));
const num = (t: string) => {
  const v = parseFloat(t.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

const COR: Record<Situacao, string> = { ok: "#16a34a", atencao: "#d97706", fora: "#dc2626" };
const SIMBOLO: Record<Situacao, string> = { ok: "✓", atencao: "!", fora: "✕" };
const TEXTO: Record<Situacao, string> = { ok: "dentro", atencao: "no limite", fora: "fora" };

function Selo({ s }: { s?: Situacao }) {
  if (!s) return <span className="inline-block w-4" />;
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: COR[s] }} title={TEXTO[s]}>
      {SIMBOLO[s]}
    </span>
  );
}

export default function CertificacaoRota({ rotas, usuario }: Props) {
  const [rotaId, setRotaId] = useState(rotas[0]?.id ?? "");
  const rota = rotas.find((r) => r.id === rotaId) ?? rotas[0];
  const idxDio = rota ? rota.elementos.findIndex((e) => e.tipo === "dio") : -1;
  const [ref, setRef] = useState(idxDio >= 0 ? idxDio : 0);
  const [sentido, setSentido] = useState<Sentido>("ponta");
  const [lambda, setLambda] = useState<Lambda>(1310);
  const [tecnico, setTecnico] = useState(usuario ?? "");
  const [medidas, setMedidas] = useState<Record<number, { d: string; p: string }>>({});
  const [total, setTotal] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);

  const refOk = rota ? Math.min(ref, rota.elementos.length - 1) : 0;
  const eventos = useMemo(() => (rota ? eventosEsperados(rota, refOk, sentido, lambda) : []), [rota, refOk, sentido, lambda]);

  if (!rota) return <p className="p-6 text-sm text-slate-500">Nenhuma rota salva para certificar.</p>;

  // medir de novo do zero quando muda a rota, a caixa, o sentido ou a onda
  const limpar = () => { setMedidas({}); setTotal(""); };

  const fim = eventos[eventos.length - 1];
  const esperadoTotal = fim?.acumulado ?? 0;
  const limiteTotal = fim?.acumuladoLimite ?? 0;

  // situação de cada evento medido
  const linhas = eventos.map((ev, k) => {
    const m = medidas[k];
    const dm = m ? num(m.d) : undefined;
    const pm = m ? num(m.p) : undefined;
    return {
      ev,
      k,
      dm,
      pm,
      sd: dm !== undefined && k > 0 ? situacaoDistancia(dm, ev.distancia) : undefined,
      sp: pm !== undefined ? situacaoPerda(pm, ev.limite) : undefined,
    };
  });
  const tMed = num(total);
  const sTotal = tMed !== undefined ? situacaoTotal(tMed, limiteTotal) : undefined;
  const situacoes = [...linhas.flatMap((l) => [l.sd, l.sp]), sTotal].filter((s): s is Situacao => !!s);
  const medidos = situacoes.length;
  const resultado: Situacao | null = !medidos ? null : situacoes.includes("fora") ? "fora" : situacoes.includes("atencao") ? "atencao" : "ok";
  const tituloResultado = resultado === "ok" ? "Aprovada" : resultado === "atencao" ? "Aprovada com ressalvas" : resultado === "fora" ? "Reprovada" : "";

  // ---------- Traço (perda acumulada × distância) ----------
  const W = 640, H = 230, L = 40, R = 14, T = 16, B = 26;
  const maxD = Math.max(10, ...eventos.map((e) => e.distancia), ...linhas.map((l) => l.dm ?? 0)) * 1.06;
  const maxP = Math.max(1, limiteTotal, tMed ?? 0) + 1;
  const sx = (d: number) => L + (d / maxD) * (W - L - R);
  const sy = (p: number) => T + (p / maxP) * (H - T - B);
  const degraus = (campo: "acumulado" | "acumuladoLimite") => {
    let path = `M${sx(0)} ${sy(0)}`;
    let ant = 0;
    eventos.forEach((e, k) => {
      const antes = k === 0 ? 0 : ant + e.fibra;
      path += ` L${sx(e.distancia)} ${sy(antes)} L${sx(e.distancia)} ${sy(e[campo])}`;
      ant = e[campo];
    });
    return path;
  };
  // medido: perda medida em cada evento + fibra esperada entre eles
  const pontosMedidos: { x: number; y: number; k: number }[] = [];
  {
    let acum = 0;
    linhas.forEach((l, k) => {
      const antes = k === 0 ? 0 : acum + l.ev.fibra;
      acum = antes + (l.pm ?? l.ev.esperado);
      if (l.pm !== undefined || l.dm !== undefined) pontosMedidos.push({ x: sx(l.dm ?? l.ev.distancia), y: sy(acum), k });
    });
  }
  const ticksD = [0, maxD / 4, maxD / 2, (3 * maxD) / 4].map((v) => Math.round(v));
  const ticksP = Array.from({ length: Math.floor(maxP / 5) + 1 }, (_, k) => k * 5);

  const campo = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";
  const rot = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";
  const mini = "w-16 rounded-md border border-slate-300 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums focus:border-indigo-400 focus:outline-none";
  const set = (k: number, m: Partial<{ d: string; p: string }>) => setMedidas((x) => ({ ...x, [k]: { d: x[k]?.d ?? "", p: x[k]?.p ?? "", ...m } }));

  // ---------- Laudo em PDF (janela de impressão: "Salvar como PDF") ----------
  function exportar() {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const svg = svgRef.current?.outerHTML ?? "";
    const linhasHtml = linhas
      .map((l) => {
        const cel = (s?: Situacao) => (s ? `<span style="color:${COR[s]};font-weight:800">${SIMBOLO[s]} ${TEXTO[s]}</span>` : "");
        return `<tr>
          <td>${l.k}</td>
          <td>${esc(l.ev.elemento.nome)}</td>
          <td>${esc(l.ev.rotulo)}</td>
          <td class="n">${l.ev.distancia.toLocaleString("pt-BR")} m</td>
          <td class="n">${l.dm !== undefined ? `${l.dm.toLocaleString("pt-BR")} m` : "—"}</td>
          <td>${cel(l.sd)}</td>
          <td class="n">${db(l.ev.esperado)} (≤ ${db(l.ev.limite)})</td>
          <td class="n">${l.pm !== undefined ? db(l.pm) : "—"}</td>
          <td>${cel(l.sp)}</td>
        </tr>`;
      })
      .join("");
    const ref0 = rota.elementos[refOk];
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificação ${esc(rota.nome)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:11px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#64748b;margin-bottom:12px}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}
        .box{border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px} .box b{display:block;font-size:13px}
        .res{font-size:16px;font-weight:800;padding:8px 10px;border-radius:6px;color:#fff;margin:8px 0}
        table{width:100%;border-collapse:collapse;margin-top:10px} th,td{border-bottom:1px solid #e2e8f0;padding:4px 5px;text-align:left}
        th{background:#f1f5f9;font-size:10px;text-transform:uppercase;color:#475569} td.n{text-align:right;font-variant-numeric:tabular-nums}
        svg{width:100%;height:auto;border:1px solid #1e293b;border-radius:6px;margin-top:6px}
        .rod{margin-top:14px;color:#64748b;font-size:10px} .ass{margin-top:40px;display:flex;gap:40px} .ass div{flex:1;border-top:1px solid #0f172a;padding-top:4px;text-align:center}
      </style></head><body>
      <h1>Certificação de rota óptica (OTDR)</h1>
      <div class="sub">${esc(rota.nome)} · ${new Date().toLocaleString("pt-BR")}</div>
      <div class="grid">
        <div class="box">OTDR ligado em<b>${esc(ref0?.nome ?? "")}</b></div>
        <div class="box">Sentido<b>${sentido === "ponta" ? "Para a ponta" : "Para a OLT"}</b></div>
        <div class="box">Comprimento de onda<b>${lambda} nm (${String(ATENUACAO[lambda]).replace(".", ",")} dB/km)</b></div>
        <div class="box">Técnico<b>${esc(tecnico || "—")}</b></div>
        <div class="box">Comprimento esperado<b>${(fim?.distancia ?? 0).toLocaleString("pt-BR")} m</b></div>
        <div class="box">Perda total esperada<b>${db(esperadoTotal)} dB</b></div>
        <div class="box">Perda total máxima<b>${db(limiteTotal)} dB</b></div>
        <div class="box">Perda total medida<b>${tMed !== undefined ? `${db(tMed)} dB` : "—"}</b></div>
      </div>
      ${resultado ? `<div class="res" style="background:${COR[resultado]}">Resultado: ${tituloResultado}</div>` : ""}
      ${svg}
      <table><thead><tr><th>#</th><th>Caixa</th><th>Evento</th><th>Dist. esperada</th><th>Dist. medida</th><th></th><th>Perda esperada</th><th>Perda medida</th><th></th></tr></thead>
      <tbody>${linhasHtml}</tbody></table>
      <div class="rod">Tolerâncias: fusão ≤ ${db(TOLERANCIA.fusao)} dB · conector ≤ ${db(TOLERANCIA.conector)} dB · splitter até +${db(TOLERANCIA.splitterExtra)} dB do nominal · distância ±${TOLERANCIA.distanciaPct * 100}% (mín. ${TOLERANCIA.distanciaMin} m). As distâncias incluem as reservas técnicas das caixas.</div>
      <div class="ass"><div>Técnico</div><div>Responsável</div></div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("O navegador bloqueou a janela do PDF. Libere pop-ups para este site.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="@container p-3">
      <div className="grid gap-3 @3xl:grid-cols-[300px_1fr]">
        {/* ---------- Coluna esquerda: configuração e resultado ---------- */}
        <div className="space-y-3">
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3">
            <div>
              <label className={rot}>Rota</label>
              <select
                className={campo}
                value={rota.id}
                onChange={(e) => {
                  setRotaId(e.target.value);
                  const r = rotas.find((x) => x.id === e.target.value);
                  const di = r ? r.elementos.findIndex((x) => x.tipo === "dio") : -1;
                  setRef(di >= 0 ? di : 0);
                  limpar();
                }}
              >
                {rotas.map((r) => <option key={r.id} value={r.id}>{r.pai ? "↳ " : ""}{r.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={rot}>OTDR ligado em</label>
              <select className={campo} value={refOk} onChange={(e) => { setRef(+e.target.value); limpar(); }}>
                {rota.elementos.map((e, i) => <option key={i} value={i}>{i + 1}. {curto(e.nome, 30)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([["ponta", "Para a ponta"], ["olt", "Para a OLT"]] as const).map(([k, r]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setSentido(k); limpar(); }}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${sentido === k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                >
                  {k === "olt" && <ArrowLeft className="h-3.5 w-3.5" />} {r} {k === "ponta" && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div>
              <label className={rot}>Comprimento de onda</label>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {([1310, 1550] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLambda(l)}
                    className={`rounded-lg py-1.5 text-xs font-semibold ${lambda === l ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                  >
                    {l} nm <span className="font-normal text-slate-400">· {String(ATENUACAO[l]).replace(".", ",")} dB/km</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={rot}>Técnico (vai no laudo)</label>
              <input className={campo} value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Nome do técnico" />
            </div>
          </div>

          {/* Totais */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ["Comprimento", formatMetros(fim?.distancia ?? 0)],
              ["Eventos", String(eventos.length)],
              ["Perda esperada", `${db(esperadoTotal)} dB`],
              ["Perda máxima", `${db(limiteTotal)} dB`],
            ].map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
                <p className="text-[10px] text-slate-500">{r}</p>
                <p className="text-sm font-bold tabular-nums text-slate-800">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <label className={rot}>Perda total medida (dB)</label>
            <div className="flex items-center gap-2">
              <input className={`${campo} text-lg font-bold tabular-nums`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder={`até ${db(limiteTotal)}`} />
              <Selo s={sTotal} />
            </div>
          </div>

          {/* Resultado */}
          {resultado ? (
            <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: COR[resultado] }}>
              <div className="px-3 py-2 text-white" style={{ background: COR[resultado] }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">Certificação · {lambda} nm</p>
                <p className="text-base font-bold">{tituloResultado}</p>
              </div>
              <p className="bg-white px-3 py-2 text-[11px] text-slate-600">
                {medidos} medida{medidos !== 1 ? "s" : ""} conferida{medidos !== 1 ? "s" : ""}:{" "}
                {(["ok", "atencao", "fora"] as const).map((s) => `${situacoes.filter((x) => x === s).length} ${TEXTO[s]}`).join(" · ")}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
              Digite na tabela a distância e a perda que o OTDR mostrou em cada evento.
            </div>
          )}
          <button
            type="button"
            onClick={exportar}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <FileDown className="h-4 w-4" /> Exportar laudo (PDF)
          </button>
        </div>

        {/* ---------- Coluna direita: traço e eventos ---------- */}
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ background: "#020617" }}>
              <text x="10" y="11" fontSize="8.5" fill="#94a3b8" fontWeight={800} letterSpacing=".08em">TRAÇO ESPERADO · {lambda} nm</text>
              {ticksP.map((p) => (
                <g key={`p${p}`}>
                  <line x1={L} x2={W - R} y1={sy(p)} y2={sy(p)} stroke="#1e293b" />
                  <text x={L - 4} y={sy(p) + 3} fontSize="7" fill="#64748b" textAnchor="end">{p} dB</text>
                </g>
              ))}
              {ticksD.map((d) => (
                <text key={`d${d}`} x={sx(d)} y={H - 10} fontSize="7" fill="#64748b" textAnchor="middle">{formatMetros(d)}</text>
              ))}
              {/* limite e esperado */}
              <path d={degraus("acumuladoLimite")} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity=".7" />
              <path d={degraus("acumulado")} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" />
              {/* eventos */}
              {eventos.map((e, k) => (
                <g key={`e${k}`}>
                  <line x1={sx(e.distancia)} x2={sx(e.distancia)} y1={T} y2={H - B} stroke="#334155" strokeDasharray="1 3" />
                  <circle cx={sx(e.distancia)} cy={T + 2} r="6" fill="#0f172a" stroke={e.tipo === "splitter" ? "#a78bfa" : "#5eead4"} />
                  <text x={sx(e.distancia)} y={T + 4.5} fontSize="6.5" fill="#e2e8f0" textAnchor="middle" fontWeight={800}>{k}</text>
                </g>
              ))}
              {/* medido */}
              {pontosMedidos.map((p) => {
                const s = linhas[p.k].sp ?? linhas[p.k].sd;
                return <circle key={`m${p.k}`} cx={p.x} cy={p.y} r="3.6" fill={s ? COR[s] : "#f8fafc"} stroke="#fff" strokeWidth="1" />;
              })}
              <g fontSize="7" fill="#94a3b8">
                <line x1={W - 190} x2={W - 176} y1={H - 22} y2={H - 22} stroke="#5eead4" strokeWidth="2" />
                <text x={W - 172} y={H - 19.5}>esperado</text>
                <line x1={W - 132} x2={W - 118} y1={H - 22} y2={H - 22} stroke="#f59e0b" strokeDasharray="4 3" />
                <text x={W - 114} y={H - 19.5}>limite</text>
                <circle cx={W - 82} cy={H - 22} r="3" fill="#f8fafc" />
                <text x={W - 76} y={H - 19.5}>medido</text>
              </g>
            </svg>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">#</th>
                  <th className="px-2 py-1.5 text-left">Evento</th>
                  <th className="px-2 py-1.5 text-right">Distância</th>
                  <th className="px-2 py-1.5 text-right">Medida (m)</th>
                  <th className="px-2 py-1.5 text-right">Perda (dB)</th>
                  <th className="px-2 py-1.5 text-right">Medida (dB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.k} className="align-middle">
                    <td className="px-2 py-1.5 font-bold text-slate-400">{l.k}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <IconeElemento tipo={tipoVisual(l.ev.elemento)} tamanho={18} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{curto(l.ev.elemento.nome, 26)}</p>
                          <p className="truncate text-[10px] text-slate-500">{l.ev.rotulo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{formatMetros(l.ev.distancia)}</td>
                    <td className="px-2 py-1.5">
                      {l.k > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <input className={mini} inputMode="decimal" value={medidas[l.k]?.d ?? ""} onChange={(e) => set(l.k, { d: e.target.value })} />
                          <Selo s={l.sd} />
                        </div>
                      ) : (
                        <p className="text-right text-[10px] text-slate-400">início</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {db(l.ev.esperado)}
                      <span className="block text-[9.5px] text-slate-400">máx. {db(l.ev.limite)}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <input className={mini} inputMode="decimal" value={medidas[l.k]?.p ?? ""} onChange={(e) => set(l.k, { p: e.target.value })} />
                        <Selo s={l.sp} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">
            Tolerâncias: fusão ≤ {db(TOLERANCIA.fusao)} dB · conector ≤ {db(TOLERANCIA.conector)} dB · splitter até +{db(TOLERANCIA.splitterExtra)} dB do nominal ·
            distância ±{TOLERANCIA.distanciaPct * 100}% (mín. {TOLERANCIA.distanciaMin} m). As distâncias incluem as reservas técnicas das caixas.
          </p>
        </div>
      </div>
    </div>
  );
}
