"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Loader2, Route as RouteIcon, Zap } from "lucide-react";
import { formatMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, montarArvoresPon, portaPonDaRota, type NoArvore } from "@/lib/arvorePon";
import type { CaixaRede } from "@/lib/caixasRede";
import { chaveCabo } from "@/lib/cabosRede";
import { acumuladoDaRota, localizarRompimento, trechosDaRota, type Sentido } from "@/lib/rompimento";
import { IconeElemento, IconeElementoSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";
import CertificacaoRota from "./CertificacaoRota";
import EnviarTecnico from "./EnviarTecnico";

const MapaRompimento = dynamic(() => import("./MapaRompimento"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl bg-slate-100">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  ),
});

/**
 * Simulador de rompimento: o técnico liga o OTDR numa caixa, mede a distância até o evento e o simulador
 * mostra onde fica (entre quais caixas, a quantos metros, ou dentro da reserva técnica de uma caixa),
 * o ponto no mapa e o que fica sem sinal.
 */

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  onAbrirRota: (id: string) => void;
  /** Começar já com esta rota / caixa */
  inicio?: { rotaId: string; ref?: number };
  /** Nome que vai no laudo da certificação */
  usuario?: string;
}

const curto = (s: string, n = 24) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return cortar(t, n, s);
};
const m0 = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} m`;

function subarvore(n: NoArvore): NoArvore[] {
  return [n, ...n.filhos.flatMap(subarvore)];
}

/** Abas do OTDR: rompimento e certificação */
function AbasOtdr({ aba, onAba }: { aba: "rompimento" | "certificacao"; onAba: (a: "rompimento" | "certificacao") => void }) {
  return (
    <div className="flex border-b border-slate-200 bg-white px-3">
      {([["rompimento", "Rompimento"], ["certificacao", "Certificação de rota"]] as const).map(([k, r]) => (
        <button
          key={k}
          type="button"
          onClick={() => onAba(k)}
          className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold ${aba === k ? "border-red-600 text-red-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export default function SimuladorRompimento(props: Props) {
  const [aba, setAba] = useState<"rompimento" | "certificacao">("rompimento");
  return (
    <div>
      <AbasOtdr aba={aba} onAba={setAba} />
      {aba === "rompimento" ? <Rompimento {...props} /> : <CertificacaoRota rotas={props.rotas} usuario={props.usuario} />}
    </div>
  );
}

function Rompimento({ rotas, caixas, onAbrirRota, inicio }: Props) {
  const [rotaId, setRotaId] = useState(inicio?.rotaId ?? rotas[0]?.id ?? "");
  const rota = rotas.find((r) => r.id === rotaId) ?? rotas[0];
  const idxDio = rota ? rota.elementos.findIndex((e) => e.tipo === "dio") : -1;
  const [ref, setRef] = useState(inicio?.ref ?? (idxDio >= 0 ? idxDio : 0));
  const [sentido, setSentido] = useState<Sentido>("ponta");
  const [dist, setDist] = useState("");

  if (!rota) return <p className="p-6 text-sm text-slate-500">Nenhuma rota salva para simular.</p>;

  const acc = acumuladoDaRota(rota);
  const total = acc[acc.length - 1];
  const tr = trechosDaRota(rota);
  const refOk = Math.min(ref, rota.elementos.length - 1);
  const d = parseFloat(dist.replace(",", "."));
  const res = Number.isFinite(d) && d >= 0 ? localizarRompimento(rota, refOk, sentido, d) : null;
  const el = (i?: number) => (i !== undefined ? rota.elementos[i] : undefined);

  // ---------- Impacto: o que fica sem sinal (subárvore a partir do elemento depois do rompimento) ----------
  let impacto: { no: NoArvore; caixas: NoArvore[]; pontas: NoArvore[]; rotas: RotaOptica[] } | null = null;
  if (res?.trecho !== undefined) {
    const arv = montarArvoresPon(rotas, caixas).find((a) => a.chave === portaPonDaRota(rota).chave);
    const alvo = rota.elementos[res.trecho];
    const no = arv?.nos.find((n) => chaveElemento(n.elemento) === chaveElemento(alvo));
    if (no) {
      const sub = subarvore(no);
      impacto = {
        no,
        caixas: sub,
        pontas: sub.filter((n) => n.filhos.length === 0),
        rotas: rotas.filter((r) => no.rotas.includes(r.id)),
      };
    }
  }
  // Outras rotas que usam o mesmo cabo (se o cabo inteiro rompeu, as fibras delas também)
  const caboRompido = res?.trecho !== undefined ? rota.elementos[res.trecho].cabo_entrada : undefined;
  const mesmoCabo = caboRompido
    ? rotas.filter((r) => r.id !== rota.id && !impacto?.rotas.some((x) => x.id === r.id) && r.elementos.some((e) => e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(caboRompido)))
    : [];
  const clientes = impacto?.no.clientes ?? 0;

  // ---------- Régua da rota ----------
  const RW = 620, RH = 112, x0 = 24, x1 = RW - 24;
  const X = (m: number) => x0 + (total ? (Math.max(0, Math.min(total, m)) / total) * (x1 - x0) : 0);
  const yR = 70; // linha do cabo
  const yIc = 47; // ícones das caixas, acima da linha
  // caixas muito próximas (ex.: OLT e DIO na mesma estação) se abrem lado a lado, com uma perninha até o ponto real
  const xsEl = (() => {
    const xs = rota.elementos.map((_, i) => X(acc[i]));
    const out = [...xs];
    const PASSO = 22;
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] - xs[j] < PASSO) j++;
      if (j > i) {
        const nGrupo = j - i + 1;
        const largura = (nGrupo - 1) * PASSO;
        // o grupo inteiro desliza para dentro da régua (sem amassar contra a borda)
        const ini = Math.max(x0, Math.min(x1 - largura, (xs[i] + xs[j]) / 2 - largura / 2));
        for (let k = i; k <= j; k++) out[k] = ini + (k - i) * PASSO;
      }
      i = j + 1;
    }
    return out;
  })();
  const xRef = X(acc[refOk]);
  const xQ = res?.desdeOlt !== undefined ? X(res.desdeOlt) : null;
  const corte = res && res.tipo !== "alem" && res.tipo !== "antes" ? res.desdeOlt! : null;

  const campo = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none";
  const rot = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";

  return (
    <div className="@container p-3">
      <div className="grid gap-3 @3xl:grid-cols-[340px_1fr]">
        {/* ---------- Coluna esquerda: medição e resultado ---------- */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 space-y-2">
            <div>
              <label className={rot}>Rota</label>
              <select className={campo} value={rota.id} onChange={(e) => { setRotaId(e.target.value); const r = rotas.find((x) => x.id === e.target.value); const di = r ? r.elementos.findIndex((x) => x.tipo === "dio") : -1; setRef(di >= 0 ? di : 0); }}>
                {rotas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={rot}>OTDR ligado em</label>
              <select className={campo} value={refOk} onChange={(e) => setRef(+e.target.value)}>
                {rota.elementos.map((e, i) => <option key={i} value={i}>{i + 1}. {curto(e.nome, 30)} · {formatMetros(acc[i])} da OLT</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([["ponta", "Para a ponta", ArrowRight], ["olt", "Para a OLT", ArrowLeft]] as const).map(([k, r, Ic]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSentido(k)}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold ${sentido === k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                >
                  {k === "olt" && <Ic className="h-3.5 w-3.5" />} {r} {k === "ponta" && <Ic className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div>
              <label className={rot}>Distância medida no OTDR (m)</label>
              <input className={`${campo} text-lg font-bold tabular-nums`} inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="ex.: 1234" />
            </div>
          </div>

          {/* Resultado */}
          {!res ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              Informe a distância que o OTDR mostrou para ver onde fica o rompimento.
            </div>
          ) : res.tipo === "alem" || res.tipo === "antes" ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-bold">{res.tipo === "alem" ? "Passa do fim da rota" : "Passa antes da OLT"}</p>
              <p className="mt-1 text-xs">
                {res.tipo === "alem"
                  ? <>A medida vai {m0(res.sobra ?? 0)} além da <b>{curto(el(rota.elementos.length - 1)?.nome ?? "", 30)}</b> (fim da rota, a {m0(total)} da OLT). Provável no drop do cliente — ou a metragem cadastrada está curta.</>
                  : <>A medida volta {m0(res.sobra ?? 0)} antes da OLT. Confira o sentido (para a ponta / para a OLT).</>}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-red-300 shadow-sm">
              <div className="bg-gradient-to-r from-red-600 to-rose-500 px-3 py-2 text-white">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90"><Zap className="h-3.5 w-3.5" /> Rompimento</p>
                {res.tipo === "reserva" ? (
                  <p className="text-sm font-bold leading-snug">Na reserva técnica da {curto(el(res.reservaDe)?.nome ?? "", 30)}</p>
                ) : (
                  <p className="text-sm font-bold leading-snug">Entre {curto(el(res.depoisDe)?.nome ?? "", 22)} e {curto(el(res.antesDe)?.nome ?? "", 22)}</p>
                )}
              </div>
              <div className="space-y-1.5 bg-white p-3 text-xs text-slate-700">
                {res.tipo === "reserva" ? (
                  <p>O ponto cai no rolo de cabo guardado na caixa (reserva de {tr.find((t) => t.i === res.trecho)?.[res.reservaDe === res.trecho ? "resFim" : "resIni"] ?? 0} m). <b>Confira a caixa e o rolo de reserva.</b></p>
                ) : (
                  (() => {
                    const t = tr.find((x) => x.i === res.trecho)!;
                    const resSaida = sentido === "ponta" ? t.resIni : t.resFim;
                    const noCabo = Math.max(0, (res.metrosDepois ?? 0) - resSaida);
                    return (
                      <>
                        <p className="text-base font-bold text-slate-900">≈ {m0(noCabo)} <span className="text-xs font-normal text-slate-500">de cabo depois da reserva da {curto(el(res.depoisDe)?.nome ?? "", 22)}</span></p>
                        <p className="text-slate-500">{m0(res.metrosDepois ?? 0)} contando a reserva de {resSaida} m enrolada na caixa · trecho de {m0(t.metros)}</p>
                      </>
                    );
                  })()
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{m0(res.desdeOlt ?? 0)} desde a OLT</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">cabo {curto(caboRompido ?? "?", 26)}</span>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mandar para o técnico</p>
                  <EnviarTecnico
                    texto={(() => {
                      const nm = (i?: number) => (i !== undefined ? rota.elementos[i]?.nome.split(" - ")[0].split(" / ")[0] ?? "" : "");
                      const t = tr.find((x) => x.i === res.trecho);
                      const resSaida = t ? (sentido === "ponta" ? t.resIni : t.resFim) : 0;
                      const onde = res.tipo === "reserva"
                        ? `na reserva técnica da ${nm(res.reservaDe)}`
                        : `entre ${nm(res.depoisDe)} e ${nm(res.antesDe)}, ≈ ${Math.round(Math.max(0, (res.metrosDepois ?? 0) - resSaida))} m de cabo depois da ${nm(res.depoisDe)}`;
                      return `⚡ Rompimento — ${rota.nome}\nProvável ${onde}.\nOTDR na ${nm(refOk)}: ${m0(d)} · ${m0(res.desdeOlt ?? 0)} desde a OLT · cabo ${caboRompido ?? "?"}`;
                    })()}
                    lat={res.ponto?.lat}
                    lon={res.ponto?.lon}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Impacto */}
          {impacto && (
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fica sem sinal</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-2">
                {[
                  ["Caixas", impacto.caixas.length],
                  ["Pontas", impacto.pontas.length],
                  ["Clientes", clientes],
                ].map(([r, v]) => (
                  <div key={r} className="rounded-xl bg-red-50 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-red-700">{r}</p>
                    <p className="text-lg font-bold text-red-700">{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {impacto.caixas.map((n) => (
                  <span key={n.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2 text-[10px] text-slate-700">
                    <IconeElemento tipo={tipoVisual(n.elemento)} tamanho={16} /> {curto(n.elemento.nome, 18)}
                  </span>
                ))}
              </div>
              <div className="border-t border-slate-100 px-2 py-2">
                <p className="mb-1 text-[10px] font-semibold text-slate-500">Rotas atingidas</p>
                <div className="flex flex-wrap gap-1">
                  {impacto.rotas.map((r) => (
                    <button key={r.id} type="button" onClick={() => onAbrirRota(r.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-100">
                      <RouteIcon className="h-3 w-3" /> {curto(r.nome, 28)}
                    </button>
                  ))}
                </div>
                {mesmoCabo.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-amber-700">
                    O cabo {curto(caboRompido ?? "", 24)} também leva fibras de: {mesmoCabo.map((r) => curto(r.nome, 20)).join(", ")} — se o cabo inteiro rompeu, elas caem também.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Coluna direita: régua e mapa ---------- */}
        <div className="flex min-h-[420px] flex-col gap-3">
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <svg viewBox={`0 0 ${RW} ${RH}`} className="block w-full h-auto select-none">
              <text x={RW - 10} y="14" fontSize="9" fill="#94a3b8" fontWeight={800} letterSpacing=".08em" textAnchor="end">RÉGUA DA ROTA · {formatMetros(total)}</text>
              {/* cabo: com sinal até o corte, vermelho depois */}
              <line x1={x0} y1={yR} x2={corte !== null ? X(corte) : x1} y2={yR} stroke="#22c55e" strokeWidth="5" strokeLinecap="round" />
              {corte !== null && <line x1={X(corte)} y1={yR} x2={x1} y2={yR} stroke="#dc2626" strokeWidth="4" strokeDasharray="6 5" strokeLinecap="round" />}
              {/* reservas nas caixas */}
              {tr.map((t) => (
                <g key={`r${t.i}`}>
                  {t.resIni > 0 && <rect x={X(acc[t.i - 1])} y={yR - 4} width={Math.max(1.5, X(acc[t.i - 1] + t.resIni) - X(acc[t.i - 1]))} height="8" fill="#fbbf24" opacity=".85" />}
                  {t.resFim > 0 && <rect x={X(acc[t.i] - t.resFim)} y={yR - 4} width={Math.max(1.5, X(acc[t.i]) - X(acc[t.i] - t.resFim))} height="8" fill="#fbbf24" opacity=".85" />}
                </g>
              ))}
              {/* caixas: ícone acima da linha, número e metragem embaixo */}
              {rota.elementos.map((e, i) => (
                <g key={i}>
                  <line x1={xsEl[i]} y1={yIc + 9} x2={X(acc[i])} y2={yR - 2} stroke="#475569" strokeWidth="1" />
                  <circle cx={X(acc[i])} cy={yR} r="2.4" fill="#e2e8f0" />
                  <IconeElementoSvg tipo={tipoVisual(e)} x={xsEl[i]} y={yIc} tamanho={18} />
                  <text x={xsEl[i]} y={yR + 15} fontSize="7.5" fill="#cbd5e1" textAnchor="middle" fontWeight={700}>{i + 1}</text>
                  <text x={xsEl[i]} y={yR + 25} fontSize="6.5" fill="#64748b" textAnchor="middle">{formatMetros(acc[i])}</text>
                </g>
              ))}
              {/* OTDR e a medida */}
              <g>
                <rect x={xRef - 13} y={4} width="26" height="16" rx="3" fill="#1e293b" stroke="#5eead4" />
                <path d={`M${xRef - 9} ${16} l3 -6 l3 2 l3 -1 l2 4 l2 0 l1 -6 l1 6 l3 1`} stroke="#5eead4" fill="none" strokeWidth="1" />
                <line x1={xRef} y1={20} x2={xRef} y2={yR - 3} stroke="#5eead4" strokeDasharray="2 2" />
              </g>
              {xQ !== null && res && (
                <g>
                  <line x1={xRef} y1={29} x2={xQ} y2={29} stroke="#f87171" strokeWidth="1.5" markerEnd="url(#seta)" />
                  <text x={(xRef + xQ) / 2} y={26} fontSize="8.5" fill="#fecaca" textAnchor="middle" fontWeight={800}>{m0(d)}</text>
                  {corte !== null && (
                    <g>
                      <circle cx={xQ} cy={yR} r="9" fill="#ef4444" opacity=".35">
                        <animate attributeName="r" values="7;15;7" dur="1.4s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values=".5;0;.5" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                      <circle cx={xQ} cy={yR} r="7.5" fill="#dc2626" stroke="#fff" strokeWidth="1.5" />
                      <path d={`M${xQ + 1.5} ${yR - 5} l-4.5 6 h3.2 l-2 4.8 l5.2 -6.6 h-3.2 z`} fill="#fde047" />
                    </g>
                  )}
                </g>
              )}
              <defs>
                <marker id="seta" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0 0 L8 4 L0 8 z" fill="#f87171" />
                </marker>
              </defs>
              <rect x={RW - 132} y={RH - 14} width="8" height="6" fill="#fbbf24" />
              <text x={RW - 120} y={RH - 8.5} fontSize="7" fill="#94a3b8">reserva técnica nas caixas</text>
            </svg>
          </div>
          <div className="min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-slate-200">
            <MapaRompimento rota={rota} ref_={refOk} resultado={res} />
          </div>
        </div>
      </div>
    </div>
  );
}
