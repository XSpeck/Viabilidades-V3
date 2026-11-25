"use client";

import { Fragment, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MousePointerClick, Route as RouteIcon, X, Zap } from "lucide-react";
import ZoomComCtrl from "./ZoomComCtrl";
import { CamadaBase, SeletorCamada, useCamada } from "./CamadasMapa";
import { distanciaMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { resumoPortas, type CaixaRede } from "@/lib/caixasRede";
import { semCodigo } from "@/lib/cabosRede";
import { afetadasPeloCorte, trechoNoClique, trechosDaRede, trechosDaRota, type TrechoRede } from "@/lib/rompimento";
import { iconeSvg, IconeElemento } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";
import EnviarTecnico from "./EnviarTecnico";

type Ponto = { lat: number; lon: number };
const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const ll = (ps: Ponto[]) => ps.map((p) => [p.lat, p.lon] as [number, number]);

const iconeQuebra = L.divIcon({
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="10" fill="#ef4444" opacity=".35"><animate attributeName="r" values="9;21;9" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;0;.5" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="22" cy="22" r="11" fill="#dc2626" stroke="#fff" stroke-width="2"/><path d="M24 13 L17 23 L22 23 L19 31 L27 20 L22 20 Z" fill="#fde047" stroke="#7f1d1d" stroke-width=".8" stroke-linejoin="round"/></svg>`,
});
const iconeCaixa = (tipo: Parameters<typeof iconeSvg>[0], afetada: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;${afetada ? "box-shadow:0 0 0 3px #dc2626;border-radius:50%;background:#fff;" : ""}filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${iconeSvg(tipo, 26)}</div>`,
  });

/** Parte o traçado no ponto do corte: [antes, depois] */
function dividir(pts: Ponto[], p: Ponto): [Ponto[], Ponto[]] {
  let melhor = 0, dMin = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = distanciaMetros(pts[k], p) + distanciaMetros(p, pts[k + 1]) - distanciaMetros(pts[k], pts[k + 1]);
    if (d < dMin) { dMin = d; melhor = k; }
  }
  return [[...pts.slice(0, melhor + 1), p], [p, ...pts.slice(melhor + 1)]];
}

function Clique({ onClique }: { onClique: (p: Ponto) => void }) {
  useMapEvents({ click: (e) => onClique({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}

/**
 * Rompimento pelo mapa: clica onde o cabo rompeu e o sistema corta o cabo inteiro ali e lista as
 * CTOs e CDOIs sem sinal de todas as rotas (e portas PON) que passam naquele trecho.
 */
export default function RompimentoMapa({ rotas, caixas, onAbrirRota }: { rotas: RotaOptica[]; caixas: CaixaRede[]; onAbrirRota: (id: string) => void }) {
  const [camada, setCamada] = useCamada();
  const [corte, setCorte] = useState<{ trecho: TrechoRede; ponto: Ponto } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verRotas, setVerRotas] = useState(false);
  const rede = useMemo(() => trechosDaRede(rotas), [rotas]);
  const cadDe = useMemo(() => new Map(caixas.map((c) => [c.chave, c])), [caixas]);
  const todos: [number, number][] = rede.flatMap((t) => ll(t.pts));

  const res = corte ? afetadasPeloCorte(corte.trecho) : null;
  const clientesDe = (chave: string) => resumoPortas(cadDe.get(chave))?.clientes;
  const totalClientes = res ? res.caixas.reduce((s, c) => s + (clientesDe(c.chave) ?? 0), 0) : 0;
  const ctos = res ? res.caixas.filter((c) => tipoVisual(c.elemento) === "cto") : [];
  const cdois = res ? res.caixas.filter((c) => tipoVisual(c.elemento) === "cdoi") : [];
  // por porta PON (uma caixa pode atender mais de uma)
  const porPon = useMemo(() => {
    if (!res) return [];
    const m = new Map<string, { rotulo: string; caixas: typeof res.caixas }>();
    res.caixas.forEach((c) => c.rotas.forEach((r) => {
      const p = portaPonDaRota(r);
      const g = m.get(p.chave) ?? { rotulo: p.rotulo, caixas: [] };
      if (!g.caixas.includes(c)) g.caixas.push(c);
      m.set(p.chave, g);
    }));
    return [...m.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }));
  }, [res]);
  const pons = res ? new Set(res.rotas.map((r) => portaPonDaRota(r).chave)).size : 0;

  // caixas para desenhar (uma por chave)
  const caixasMapa = useMemo(() => {
    const m = new Map<string, { nome: string; tipo: ReturnType<typeof tipoVisual>; lat: number; lon: number }>();
    rotas.forEach((r) => r.elementos.forEach((e) => {
      if (e.lat === undefined || e.lon === undefined) return;
      const k = chaveElemento(e);
      if (!m.has(k)) m.set(k, { nome: e.nome, tipo: tipoVisual(e), lat: e.lat, lon: e.lon });
    }));
    return [...m.entries()];
  }, [rotas]);
  const afetadas = new Set(res?.caixas.map((c) => c.chave) ?? []);
  // trechos sem sinal depois do corte (de todas as rotas atingidas)
  const semSinal = useMemo(() => {
    if (!res || !corte) return [];
    const out: Ponto[][] = [];
    const vistos = new Set<string>();
    for (const u of corte.trecho.usos) {
      trechosDaRota(u.rota).forEach((t) => {
        if (t.i <= u.i || t.pts.length < 2) return;
        const k = JSON.stringify([t.pts[0], t.pts[t.pts.length - 1]]);
        if (vistos.has(k)) return;
        vistos.add(k);
        out.push(t.pts);
      });
    }
    return out;
  }, [res, corte]);

  function clicar(p: Ponto) {
    const r = trechoNoClique(rede, p, 40);
    if (!r) { setAviso("Clique em cima de um cabo (até 40 m dele)."); return; }
    setAviso(null);
    setCorte({ trecho: r.trecho, ponto: r.ponto });
  }

  if (!todos.length) return <p className="p-6 text-sm text-slate-500">Nenhuma rota com traçado no mapa.</p>;

  const texto = corte && res
    ? `⚡ Rompimento no cabo ${semCodigo(corte.trecho.cabo)} entre ${curto(corte.trecho.de.nome, 40)} e ${curto(corte.trecho.para.nome, 40)}.\n` +
      `Sem sinal: ${ctos.length} CTO${ctos.length !== 1 ? "s" : ""} e ${cdois.length} CDOI${cdois.length !== 1 ? "s" : ""}` +
      `${totalClientes ? ` (${totalClientes} clientes)` : ""} em ${pons} porta${pons !== 1 ? "s" : ""} PON:\n` +
      res.caixas.map((c) => `• ${curto(c.elemento.nome, 40)}`).join("\n")
    : "";

  return (
    <div className="@container p-3">
      <div className="grid gap-3 @3xl:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          {!corte ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
              <MousePointerClick className="mx-auto mb-1.5 h-6 w-6 text-slate-400" />
              <p className="font-semibold text-slate-800">Clique no mapa onde o cabo rompeu</p>
              <p className="mt-1">O cabo inteiro é cortado ali (todas as fibras) e aparecem as CTOs e CDOIs sem sinal de todas as rotas que passam no trecho.</p>
              {aviso && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-amber-800">{aviso}</p>}
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-red-300 shadow-sm">
                <div className="flex items-start gap-2 bg-gradient-to-r from-red-600 to-rose-500 px-3 py-2 text-white">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90"><Zap className="h-3.5 w-3.5" /> Rompimento</p>
                    <p className="text-sm font-bold leading-snug">Cabo {curto(semCodigo(corte.trecho.cabo), 34)}</p>
                    <p className="text-[11px] opacity-90">entre {curto(corte.trecho.de.nome, 22)} e {curto(corte.trecho.para.nome, 22)} · todas as fibras</p>
                  </div>
                  <button type="button" onClick={() => setCorte(null)} className="rounded p-0.5 hover:bg-white/20" aria-label="Limpar rompimento"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 bg-white p-2">
                  {[["CTOs", ctos.length], ["CDOIs", cdois.length], ["Clientes", totalClientes], ["PONs", pons]].map(([r, v]) => (
                    <div key={r} className="rounded-xl bg-red-50 px-1 py-1.5 text-center">
                      <p className="text-[10px] text-red-700">{r}</p>
                      <p className="text-lg font-bold text-red-700">{v}</p>
                    </div>
                  ))}
                </div>
                {aviso && <p className="bg-amber-50 px-3 py-1 text-[11px] text-amber-800">{aviso}</p>}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white">
                <p className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ficam sem sinal</p>
                {res!.caixas.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Nenhuma CTO ou CDOI depois deste ponto (o cabo só passa por caixas de emenda ou é só passagem).</p>
                ) : (
                  <div className="max-h-[42vh] space-y-2 overflow-y-auto p-2">
                    {porPon.map((g) => (
                      <section key={g.rotulo}>
                        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"><IconeElemento tipo="olt" tamanho={14} /> {g.rotulo}</p>
                        <ul className="space-y-1">
                          {g.caixas.map((c) => {
                            const cli = clientesDe(c.chave);
                            return (
                              <li key={c.chave} className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/50 px-2 py-1">
                                <IconeElemento tipo={tipoVisual(c.elemento)} tamanho={20} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-slate-800" title={c.elemento.nome}>{curto(c.elemento.nome, 34)}</span>
                                  <span className="block text-[10px] text-slate-500">{cli !== undefined ? `${cli} cliente${cli !== 1 ? "s" : ""}` : "portas sem cadastro"}</span>
                                </span>
                                <button type="button" onClick={() => onAbrirRota(c.rotas[0].id)} title={`Abrir ${c.rotas[0].nome}`} className="rounded-md p-1 text-indigo-600 hover:bg-indigo-50"><RouteIcon className="h-3.5 w-3.5" /></button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-100 px-2 py-2">
                  <button type="button" onClick={() => setVerRotas((v) => !v)} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-700" aria-expanded={verRotas}>
                    <span className={`inline-block transition-transform ${verRotas ? "rotate-90" : ""}`}>▸</span>
                    {res!.rotas.length} rota{res!.rotas.length !== 1 ? "s" : ""} atingida{res!.rotas.length !== 1 ? "s" : ""}
                  </button>
                  {verRotas && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {res!.rotas.map((r) => (
                        <button key={r.id} type="button" onClick={() => onAbrirRota(r.id)} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-100">
                          <RouteIcon className="h-3 w-3" /> {curto(r.nome, 28)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-t border-slate-100 px-2 py-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mandar para o técnico</p>
                  <EnviarTecnico texto={texto} lat={corte.ponto.lat} lon={corte.ponto.lon} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative min-h-[460px] overflow-hidden rounded-2xl border border-slate-200">
          <MapContainer center={todos[0]} bounds={L.latLngBounds(todos)} boundsOptions={{ padding: [30, 30] }} scrollWheelZoom={false} className="h-full min-h-[460px] w-full cursor-crosshair z-0 [&_.leaflet-interactive]:outline-none">
            <CamadaBase camada={camada} />
            <ZoomComCtrl />
            <Clique onClique={clicar} />
            {rede.map((t) => {
              const cortado = corte?.trecho.chave === t.chave;
              if (cortado && corte) {
                const [a, b] = dividir(t.pts, corte.ponto);
                return (
                  <Fragment key={t.chave}>
                    <Polyline positions={ll(a)} pathOptions={{ color: "#0f172a", weight: 7, opacity: 0.7 }} />
                    <Polyline positions={ll(a)} pathOptions={{ color: "#22c55e", weight: 3.5 }} />
                    <Polyline positions={ll(b)} pathOptions={{ color: "#dc2626", weight: 4, dashArray: "6 6" }} />
                  </Fragment>
                );
              }
              return (
                <Fragment key={t.chave}>
                  <Polyline positions={ll(t.pts)} pathOptions={{ color: "#0f172a", weight: 6, opacity: 0.55 }} />
                  <Polyline positions={ll(t.pts)} pathOptions={{ color: corte ? "#22c55e" : "#3b82f6", weight: 3 }}>
                    <Tooltip sticky>{curto(semCodigo(t.cabo), 40)} · {t.usos.length} rota{t.usos.length !== 1 ? "s" : ""}</Tooltip>
                  </Polyline>
                </Fragment>
              );
            })}
            {semSinal.map((pts, k) => <Polyline key={`x${k}`} positions={ll(pts)} pathOptions={{ color: "#dc2626", weight: 4, dashArray: "6 6", opacity: 0.9 }} />)}
            {caixasMapa.map(([k, c]) => (
              <Marker key={k} position={[c.lat, c.lon]} icon={iconeCaixa(c.tipo, afetadas.has(k))}>
                <Tooltip direction="top" offset={[0, -12]}>{c.nome}{afetadas.has(k) ? " · sem sinal" : ""}</Tooltip>
              </Marker>
            ))}
            {corte && (
              <Marker position={[corte.ponto.lat, corte.ponto.lon]} icon={iconeQuebra} zIndexOffset={1000}>
                <Tooltip direction="top" offset={[0, -18]} permanent>Rompimento aqui</Tooltip>
              </Marker>
            )}
          </MapContainer>
          <div className="pointer-events-none absolute right-2 top-2 z-[500]">
            <div className="pointer-events-auto"><SeletorCamada valor={camada} onMudar={setCamada} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
