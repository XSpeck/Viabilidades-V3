"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileDown, MapPin, Plus, X } from "lucide-react";
import { formatMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { localizarRompimento, type Sentido } from "@/lib/rompimento";
import {
  analisarLeitura,
  ATENUACAO,
  eventosEsperados,
  situacaoTotal,
  TOLERANCIA,
  type AnaliseEvento,
  type Lambda,
  type LeituraOtdr,
  type Situacao,
} from "@/lib/certificacao";
import { IconeElemento } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * Certificação de rota: o técnico digita a tabela de eventos que o OTDR mostrou (distância e perda)
 * e o sistema diz onde fica cada evento na rota (caixa, cabo entre caixas ou reserva técnica)
 * e quais pontos precisam de visita. Nada é gravado: o laudo sai em PDF.
 */

interface Props {
  rotas: RotaOptica[];
  usuario?: string;
}

const curto = (s: string, n = 24) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const nomeSimples = (s: string) => s.split(" - ")[0].split(" / ")[0].trim();
const db = (v?: number) => (v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(2).replace(".", ","));
const num = (t: string) => {
  const v = parseFloat(t.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
};

const COR: Record<Situacao, string> = { ok: "#16a34a", atencao: "#d97706", fora: "#dc2626" };
const SIMBOLO: Record<Situacao, string> = { ok: "✓", atencao: "!", fora: "✕" };
const TEXTO: Record<Situacao, string> = { ok: "ok", atencao: "atenção", fora: "verificar" };

function Selo({ s }: { s?: Situacao }) {
  if (!s) return <span className="inline-block w-4" />;
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: COR[s] }} title={TEXTO[s]}>
      {SIMBOLO[s]}
    </span>
  );
}

const vazias = () => Array.from({ length: 4 }, () => ({ d: "", p: "" }));

export default function CertificacaoRota({ rotas, usuario }: Props) {
  const [rotaId, setRotaId] = useState(rotas[0]?.id ?? "");
  const rota = rotas.find((r) => r.id === rotaId) ?? rotas[0];
  const idxDio = rota ? rota.elementos.findIndex((e) => e.tipo === "dio") : -1;
  const [ref, setRef] = useState(idxDio >= 0 ? idxDio : 0);
  const [sentido, setSentido] = useState<Sentido>("ponta");
  const [lambda, setLambda] = useState<Lambda>(1550);
  const [unidade, setUnidade] = useState<"km" | "m">("km");
  const [tecnico, setTecnico] = useState(usuario ?? "");
  const [linhas, setLinhas] = useState<{ d: string; p: string }[]>(vazias);
  const [fimTxt, setFimTxt] = useState("");
  const [totalTxt, setTotalTxt] = useState("");
  const [verEsperados, setVerEsperados] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const refOk = rota ? Math.min(ref, rota.elementos.length - 1) : 0;
  const esperados = useMemo(() => (rota ? eventosEsperados(rota, refOk, sentido, lambda) : []), [rota, refOk, sentido, lambda]);

  if (!rota) return <p className="p-6 text-sm text-slate-500">Nenhuma rota salva para certificar.</p>;

  const fator = unidade === "km" ? 1000 : 1;
  const metros = (t: string) => {
    const v = num(t);
    return v !== undefined ? v * fator : undefined;
  };
  const leituras: LeituraOtdr[] = [
    ...linhas.flatMap((l) => {
      const d = metros(l.d);
      return d !== undefined ? [{ distancia: d, perda: num(l.p) }] : [];
    }),
    ...(metros(fimTxt) !== undefined ? [{ distancia: metros(fimTxt)!, fim: true }] : []),
  ].sort((a, b) => a.distancia - b.distancia);
  const analise: AnaliseEvento[] = analisarLeitura(rota, esperados, leituras, (d) => localizarRompimento(rota, refOk, sentido, d), nomeSimples);

  const fimEsp = esperados[esperados.length - 1];
  const esperadoTotal = fimEsp?.acumulado ?? 0;
  const limiteTotal = fimEsp?.acumuladoLimite ?? 0;
  const tMed = num(totalTxt);
  const sTotal = tMed !== undefined ? situacaoTotal(tMed, limiteTotal) : undefined;
  const visitar = analise.filter((a) => a.situacao !== "ok").sort((a, b) => (a.situacao === b.situacao ? a.leitura.distancia - b.leitura.distancia : a.situacao === "fora" ? -1 : 1));
  const conferidos = analise.filter((a) => a.situacao === "ok");
  const situacoes = [...analise.map((a) => a.situacao), ...(sTotal ? [sTotal] : [])];
  const resultado: Situacao | null = !situacoes.length ? null : situacoes.includes("fora") ? "fora" : situacoes.includes("atencao") ? "atencao" : "ok";
  const tituloResultado = resultado === "ok" ? "Rota aprovada" : resultado === "atencao" ? "Aprovada com ressalvas" : resultado === "fora" ? "Precisa de visita" : "";

  const limpar = () => { setLinhas(vazias()); setFimTxt(""); setTotalTxt(""); };

  // ---------- Traço: esperado × eventos lidos ----------
  const W = 640, H = 210, L = 40, R = 14, T = 18, B = 24;
  const maxD = Math.max(10, ...esperados.map((e) => e.distancia), ...leituras.map((l) => l.distancia)) * 1.06;
  const maxP = Math.max(1, limiteTotal, tMed ?? 0) + 1;
  const sx = (d: number) => L + (Math.max(0, Math.min(maxD, d)) / maxD) * (W - L - R);
  const sy = (p: number) => T + (Math.max(0, Math.min(maxP, p)) / maxP) * (H - T - B);
  const degraus = (campo: "acumulado" | "acumuladoLimite") => {
    let path = `M${sx(0)} ${sy(0)}`;
    let ant = 0;
    esperados.forEach((e, k) => {
      const antes = k === 0 ? 0 : ant + e.fibra;
      path += ` L${sx(e.distancia)} ${sy(antes)} L${sx(e.distancia)} ${sy(e[campo])}`;
      ant = e[campo];
    });
    return path;
  };
  const aten = ATENUACAO[lambda] / 1000;
  const lancamento = esperados[0]?.esperado ?? 0;
  const marcas = analise.map((a, k) => {
    const somaPerdas = lancamento + analise.slice(0, k + 1).reduce((s, x) => s + (x.leitura.perda ?? 0), 0);
    return { a, k, x: sx(a.leitura.distancia), y: sy(somaPerdas + a.leitura.distancia * aten) };
  });
  const ticksD = [0, maxD / 4, maxD / 2, (3 * maxD) / 4].map((v) => Math.round(v));
  const ticksP = Array.from({ length: Math.floor(maxP / 5) + 1 }, (_, k) => k * 5);

  const campo = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";
  const rot = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";
  const mini = "w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-right text-xs tabular-nums focus:border-indigo-400 focus:outline-none";
  const fmtD = (m: number) => (unidade === "km" ? `${(m / 1000).toFixed(3).replace(".", ",")} km` : `${Math.round(m).toLocaleString("pt-BR")} m`);

  // ---------- Laudo em PDF ----------
  function exportar() {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const svg = svgRef.current?.outerHTML ?? "";
    const linhaHtml = (a: AnaliseEvento) => `<tr>
        <td><span style="color:${COR[a.situacao]};font-weight:800">${SIMBOLO[a.situacao]} ${TEXTO[a.situacao]}</span></td>
        <td class="n">${fmtD(a.leitura.distancia)}</td>
        <td class="n">${a.leitura.fim ? "fim" : a.leitura.perda !== undefined ? `${db(a.leitura.perda)} dB` : "—"}</td>
        <td><b>${esc(a.onde)}</b><br><span class="d">${esc(a.detalhe)}</span></td>
      </tr>`;
    const ref0 = rota.elementos[refOk];
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificação ${esc(rota.nome)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:11px}
        h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;margin:14px 0 4px} .sub{color:#64748b;margin-bottom:12px}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}
        .box{border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px} .box b{display:block;font-size:13px}
        .res{font-size:16px;font-weight:800;padding:8px 10px;border-radius:6px;color:#fff;margin:8px 0}
        table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:5px;text-align:left;vertical-align:top}
        th{background:#f1f5f9;font-size:10px;text-transform:uppercase;color:#475569} td.n{text-align:right;white-space:nowrap}
        .d{color:#475569} svg{width:100%;height:auto;border:1px solid #1e293b;border-radius:6px;margin-top:6px}
        .rod{margin-top:14px;color:#64748b;font-size:10px} .ass{margin-top:40px;display:flex;gap:40px} .ass div{flex:1;border-top:1px solid #0f172a;padding-top:4px;text-align:center}
      </style></head><body>
      <h1>Certificação de rota óptica (OTDR)</h1>
      <div class="sub">${esc(rota.nome)} · ${new Date().toLocaleString("pt-BR")}</div>
      <div class="grid">
        <div class="box">OTDR ligado em<b>${esc(ref0?.nome ?? "")}</b></div>
        <div class="box">Sentido<b>${sentido === "ponta" ? "Para a ponta" : "Para a OLT"}</b></div>
        <div class="box">Comprimento de onda<b>${lambda} nm</b></div>
        <div class="box">Técnico<b>${esc(tecnico || "—")}</b></div>
        <div class="box">Comprimento esperado<b>${fmtD(fimEsp?.distancia ?? 0)}</b></div>
        <div class="box">Comprimento lido<b>${metros(fimTxt) !== undefined ? fmtD(metros(fimTxt)!) : "—"}</b></div>
        <div class="box">Perda esperada / máx.<b>${db(esperadoTotal)} / ${db(limiteTotal)} dB</b></div>
        <div class="box">Perda total lida<b>${tMed !== undefined ? `${db(tMed)} dB` : "—"}</b></div>
      </div>
      ${resultado ? `<div class="res" style="background:${COR[resultado]}">Resultado: ${tituloResultado}</div>` : ""}
      ${visitar.length ? `<h2>Pontos para o técnico verificar</h2><table><thead><tr><th></th><th>Distância</th><th>Perda</th><th>Onde / o que fazer</th></tr></thead><tbody>${visitar.map(linhaHtml).join("")}</tbody></table>` : ""}
      ${svg}
      ${conferidos.length ? `<h2>Eventos conferidos sem problema</h2><table><tbody>${conferidos.map(linhaHtml).join("")}</tbody></table>` : ""}
      <div class="rod">Tolerâncias: fusão ≤ ${db(TOLERANCIA.fusao)} dB · conector ≤ ${db(TOLERANCIA.conector)} dB · splitter até +${db(TOLERANCIA.splitterExtra)} dB do nominal · distância ±${TOLERANCIA.distanciaPct * 100}% (mín. 10 m para achar a caixa). As distâncias da rota incluem as reservas técnicas das caixas.</div>
      <div class="ass"><div>Técnico</div><div>Responsável</div></div>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("O navegador bloqueou a janela do PDF. Libere pop-ups para este site.");
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  const cartao = (a: AnaliseEvento, k: number) => {
    const el = a.esperado ? rota.elementos[a.esperado.i] : a.local?.depoisDe !== undefined ? rota.elementos[a.local.reservaDe ?? a.local.depoisDe] : undefined;
    return (
      <div key={k} className="flex gap-2 rounded-xl border bg-white p-2.5" style={{ borderColor: `${COR[a.situacao]}66` }}>
        <Selo s={a.situacao} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
            {el && <IconeElemento tipo={tipoVisual(el)} tamanho={18} />}
            <span className="min-w-0">{a.onde}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">{a.detalhe}</p>
          <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums">{fmtD(a.leitura.distancia)} do OTDR</span>
            {a.leitura.fim ? <span className="rounded-full bg-slate-100 px-2 py-0.5">fim da fibra</span> : a.leitura.perda !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums">{db(a.leitura.perda)} dB</span>}
            {a.local?.desdeOlt !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums"><MapPin className="mr-0.5 inline h-3 w-3" />{formatMetros(a.local.desdeOlt)} da OLT</span>}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="@container p-3">
      <div className="grid gap-3 @3xl:grid-cols-[300px_1fr]">
        {/* ---------- Coluna esquerda: configuração e leitura ---------- */}
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
              <select className={campo} value={refOk} onChange={(e) => setRef(+e.target.value)}>
                {rota.elementos.map((e, i) => <option key={i} value={i}>{i + 1}. {curto(e.nome, 30)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([["ponta", "Para a ponta"], ["olt", "Para a OLT"]] as const).map(([k, r]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSentido(k)}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${sentido === k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                >
                  {k === "olt" && <ArrowLeft className="h-3.5 w-3.5" />} {r} {k === "ponta" && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([1310, 1550] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLambda(l)}
                  className={`rounded-lg py-1.5 text-xs font-semibold ${lambda === l ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                >
                  {l} nm
                </button>
              ))}
            </div>
            <div>
              <label className={rot}>Técnico (vai no laudo)</label>
              <input className={campo} value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Nome do técnico" />
            </div>
          </div>

          {/* Leitura do OTDR */}
          <div className="space-y-2 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-indigo-900">Leitura do OTDR</p>
              <div className="ml-auto flex rounded-lg bg-white p-0.5 text-[10px] font-semibold">
                {(["km", "m"] as const).map((u) => (
                  <button key={u} type="button" onClick={() => setUnidade(u)} className={`rounded-md px-2 py-0.5 ${unidade === u ? "bg-indigo-600 text-white" : "text-slate-500"}`}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Copie da tabela de eventos do aparelho: <b>Dis</b> e <b>Event-L</b> de cada evento.</p>
            <div className="grid grid-cols-[18px_1fr_1fr_18px] items-center gap-1 text-[10px] font-semibold uppercase text-slate-400">
              <span>#</span><span className="text-right">Dis ({unidade})</span><span className="text-right">Event-L (dB)</span><span />
            </div>
            {linhas.map((l, k) => (
              <div key={k} className="grid grid-cols-[18px_1fr_1fr_18px] items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400">{k + 1}</span>
                <input className={mini} inputMode="decimal" value={l.d} onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === k ? { ...x, d: e.target.value } : x)))} placeholder={unidade === "km" ? "0,076" : "76"} />
                <input className={mini} inputMode="decimal" value={l.p} onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === k ? { ...x, p: e.target.value } : x)))} placeholder="0,00" />
                <button type="button" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== k) : vazias()))} className="text-slate-300 hover:text-red-600" aria-label="Tirar evento">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setLinhas((ls) => [...ls, { d: "", p: "" }])} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-indigo-300 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50">
              <Plus className="h-3.5 w-3.5" /> evento
            </button>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <div>
                <label className={rot}>Fim da fibra · Len ({unidade})</label>
                <input className={mini} inputMode="decimal" value={fimTxt} onChange={(e) => setFimTxt(e.target.value)} placeholder={unidade === "km" ? fmtD(fimEsp?.distancia ?? 0).replace(" km", "") : String(fimEsp?.distancia ?? "")} />
              </div>
              <div>
                <label className={rot}>Perda total · Loss (dB)</label>
                <div className="flex items-center gap-1">
                  <input className={mini} inputMode="decimal" value={totalTxt} onChange={(e) => setTotalTxt(e.target.value)} placeholder={`até ${db(limiteTotal)}`} />
                  <Selo s={sTotal} />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Esperado: fim em <b>{fmtD(fimEsp?.distancia ?? 0)}</b> · perda {db(esperadoTotal)} dB (máx. {db(limiteTotal)})
            </p>
          </div>

          <button type="button" onClick={exportar} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <FileDown className="h-4 w-4" /> Exportar laudo (PDF)
          </button>
        </div>

        {/* ---------- Coluna direita: onde verificar ---------- */}
        <div className="min-w-0 space-y-3">
          {resultado ? (
            <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: COR[resultado] }}>
              <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: COR[resultado] }}>
                <p className="text-base font-bold">{tituloResultado}</p>
                <p className="ml-auto text-[11px] opacity-90">{visitar.length ? `${visitar.length} ponto${visitar.length > 1 ? "s" : ""} para verificar` : "nenhum ponto para verificar"}</p>
              </div>
              {sTotal && sTotal !== "ok" && (
                <p className="bg-white px-3 py-1.5 text-[11px] text-slate-700">
                  Perda total lida {db(tMed)} dB acima do máximo de {db(limiteTotal)} dB{visitar.length ? ": os pontos abaixo explicam parte da diferença." : ": confira conectores e limpeza nas pontas."}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              Digite os eventos do OTDR à esquerda: aqui aparece onde fica cada um na rota e para onde mandar o técnico.
            </div>
          )}

          {visitar.length > 0 && (
            <section className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Onde enviar o técnico</p>
              {visitar.map(cartao)}
            </section>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ background: "#020617" }}>
              <text x="10" y="11" fontSize="8.5" fill="#94a3b8" fontWeight={800} letterSpacing=".08em">TRAÇO · {lambda} nm · OTDR em {curto(rota.elementos[refOk]?.nome ?? "", 24)}</text>
              {ticksP.map((p) => (
                <g key={`p${p}`}>
                  <line x1={L} x2={W - R} y1={sy(p)} y2={sy(p)} stroke="#1e293b" />
                  <text x={L - 4} y={sy(p) + 3} fontSize="7" fill="#64748b" textAnchor="end">{p} dB</text>
                </g>
              ))}
              {ticksD.map((d) => (
                <text key={`d${d}`} x={sx(d)} y={H - 9} fontSize="7" fill="#64748b" textAnchor="middle">{fmtD(d)}</text>
              ))}
              <path d={degraus("acumuladoLimite")} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity=".6" />
              <path d={degraus("acumulado")} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" />
              {/* caixas da rota */}
              {esperados.map((e, k) => (
                <g key={`e${k}`}>
                  <line x1={sx(e.distancia)} x2={sx(e.distancia)} y1={T} y2={H - B} stroke="#334155" strokeDasharray="1 3" />
                  <text x={sx(e.distancia)} y={T - 2} fontSize="6.5" fill="#94a3b8" textAnchor="middle">{curto(e.elemento.nome, 12)}</text>
                </g>
              ))}
              {/* eventos lidos */}
              {marcas.map(({ a, k, x, y }) => (
                <g key={`m${k}`}>
                  <line x1={x} x2={x} y1={T} y2={H - B} stroke={COR[a.situacao]} strokeOpacity=".35" />
                  <circle cx={x} cy={y} r="4" fill={COR[a.situacao]} stroke="#fff" strokeWidth="1" />
                </g>
              ))}
              <g fontSize="7" fill="#94a3b8">
                <line x1={W - 190} x2={W - 176} y1={H - 22} y2={H - 22} stroke="#5eead4" strokeWidth="2" />
                <text x={W - 172} y={H - 19.5}>esperado</text>
                <line x1={W - 132} x2={W - 118} y1={H - 22} y2={H - 22} stroke="#f59e0b" strokeDasharray="4 3" />
                <text x={W - 114} y={H - 19.5}>limite</text>
                <circle cx={W - 82} cy={H - 22} r="3" fill="#f8fafc" />
                <text x={W - 76} y={H - 19.5}>lido</text>
              </g>
            </svg>
          </div>

          {conferidos.length > 0 && (
            <details className="group rounded-2xl border border-slate-200 bg-white px-3 py-2">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Conferidos sem problema <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700">{conferidos.length}</span>
                <span className="ml-auto text-slate-400 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="mt-2 space-y-1.5">{conferidos.map(cartao)}</div>
            </details>
          )}

          <details open={verEsperados} onToggle={(e) => setVerEsperados((e.target as HTMLDetailsElement).open)} className="group rounded-2xl border border-slate-200 bg-white px-3 py-2">
            <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Eventos esperados da rota <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-600">{esperados.length}</span>
              <span className="ml-auto text-slate-400 transition group-open:rotate-180">▾</span>
            </summary>
            <table className="mt-2 w-full text-[11px]">
              <tbody className="divide-y divide-slate-100">
                {esperados.map((e, k) => (
                  <tr key={k}>
                    <td className="py-1 pr-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <IconeElemento tipo={tipoVisual(e.elemento)} tamanho={16} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{curto(e.elemento.nome, 26)}</p>
                          <p className="truncate text-[10px] text-slate-500">{e.rotulo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums text-slate-700">{fmtD(e.distancia)}</td>
                    <td className="py-1 pl-2 text-right tabular-nums text-slate-700">{db(e.esperado)} <span className="text-[9.5px] text-slate-400">máx. {db(e.limite)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="text-[10px] text-slate-400">
            Uma leitura até ±{TOLERANCIA.distanciaPct * 100}% (mín. 10 m) de uma caixa é tratada como evento daquela caixa; fora disso, o sistema mostra em que trecho de cabo ou reserva técnica ela cai.
            Tolerâncias: fusão ≤ {db(TOLERANCIA.fusao)} dB · conector ≤ {db(TOLERANCIA.conector)} dB · splitter até +{db(TOLERANCIA.splitterExtra)} dB do nominal.
          </p>
        </div>
      </div>
    </div>
  );
}
