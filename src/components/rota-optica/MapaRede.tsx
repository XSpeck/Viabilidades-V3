"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from "lucide-react";
import ZoomComCtrl from "./ZoomComCtrl";
import { CamadaBase, SeletorCamada, useCamada } from "./CamadasMapa";
import { formatMetros, type RotaOptica, type TipoElementoRota } from "@/lib/rotaOptica";
import { listarPredios, type PredioRede } from "@/lib/prediosRede";
import type { CaixaRede } from "@/lib/caixasRede";
import { semCodigo } from "@/lib/cabosRede";
import { portaPonDaRota } from "@/lib/arvorePon";
import {
  analisarRede, COR_NIVEL, COR_OCUPACAO, faixaOcupacao, indicadores, nivelPotencia,
  type Alerta, type CaboAnalise, type CaixaAnalise, type Gravidade,
} from "@/lib/analiseRede";
import { iconeSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";
import LegendaMapa, { TEMAS, type TemaMapa } from "./mapa/LegendaMapa";
import PainelMapa, { type AbaPainel, type AlertaMapa, type AlvoMapa } from "./mapa/PainelMapa";

/**
 * Mapa da rede inteira, para análise: temas (tipo, porta PON, potência, ocupação) com legenda,
 * alertas no mapa e painel com indicadores, lista de alertas e o detalhe do que foi clicado.
 */

interface Props {
  rotas: RotaOptica[];
  caixas?: CaixaRede[];
  onAbrirRota: (id: string) => void;
  /** Abre uma caixa (ou as duas pontas de um cabo) na aba Unifilar */
  onAbrirNoUnifilar?: (chave: string | string[]) => void;
}

const COR_GRAV: Record<Gravidade, string> = { critico: "#dc2626", atencao: "#f97316", cadastro: "#0284c7" };
const ORDEM_GRAV: Gravidade[] = ["critico", "atencao", "cadastro"];
const piorAlerta = (l: Alerta[]) => ORDEM_GRAV.find((g) => l.some((a) => a.gravidade === g));
const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);

/** Preferência guardada no aparelho (tema, alertas, painel) */
function usePref<T extends string | boolean>(chave: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(chave); if (s !== null) return JSON.parse(s) as T; } catch {}
    return inicial;
  });
  const mudar = (x: T) => { setV(x); try { localStorage.setItem(chave, JSON.stringify(x)); } catch {} };
  return [v, mudar];
}

function icone(tipo: TipoElementoRota, anel: string | null, apagada: boolean, alerta: string | null, rotulo?: string) {
  const ring = anel ? `box-shadow:0 0 0 3px ${anel};background:#fff;border-radius:50%;` : "";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="position:relative;width:30px;height:30px;opacity:${apagada ? 0.45 : 1};filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"><div style="${ring}width:30px;height:30px">${iconeSvg(tipo, 30)}</div>${
      alerta ? `<span style="position:absolute;right:-3px;top:-3px;width:11px;height:11px;border-radius:50%;background:${alerta};border:2px solid #fff"></span>` : ""
    }${rotulo ? `<span style="position:absolute;left:50%;top:33px;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,.85);color:#fff;font:600 9px/1 system-ui,sans-serif;padding:2px 4px;border-radius:4px">${rotulo}</span>` : ""}</div>`,
  });
}

/** Enquadra a rede quando muda o filtro de PON */
function Enquadrar({ pts, vez }: { pts: [number, number][]; vez: string }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    else if (pts.length === 1) map.setView(pts[0], 17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, vez]);
  return null;
}

/** Guarda a área visível (para "só a área visível") e voa até o foco pedido */
function Controle({ onLimites, foco, cheia }: { onLimites: (b: L.LatLngBounds) => void; foco: { lat: number; lon: number; vez: number } | null; cheia: boolean }) {
  const map = useMapEvents({ moveend: () => onLimites(map.getBounds()) });
  useEffect(() => { onLimites(map.getBounds()); }, [map, onLimites]);
  useEffect(() => { if (foco) map.flyTo([foco.lat, foco.lon], Math.max(map.getZoom(), 18), { duration: 0.6 }); }, [map, foco]);
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 60); return () => clearTimeout(t); }, [map, cheia]);
  return null;
}

export default function MapaRede({ rotas, caixas = [], onAbrirRota, onAbrirNoUnifilar }: Props) {
  const [pon, setPon] = useState<string>("");
  const [camada, setCamada] = useCamada();
  const [tema, setTema] = usePref<TemaMapa>("rota_mapa_tema", "tipo");
  const [comAlertas, setComAlertas] = usePref<boolean>("rota_mapa_alertas", true);
  const [painel, setPainel] = usePref<boolean>("rota_mapa_painel", true);
  const [nomes, setNomes] = useState(false);
  const [aba, setAba] = useState<AbaPainel>("indicadores");
  const [sel, setSel] = useState<{ tipo: "caixa" | "cabo"; chave: string } | null>(null);
  const [soVisivel, setSoVisivel] = useState(false);
  const [limites, setLimites] = useState<L.LatLngBounds | null>(null);
  const [foco, setFoco] = useState<{ lat: number; lon: number; vez: number } | null>(null);
  const [cheia, setCheia] = useState(false);
  const [predios, setPredios] = useState<PredioRede[]>([]);
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setPredios(ps)).catch(() => {});
    return () => { vivo = false; };
  }, [rotas]);

  // Tela cheia: Esc fecha e a página de fundo não rola
  useEffect(() => {
    if (!cheia) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setCheia(false); };
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = overflow; };
  }, [cheia]);

  const analise = useMemo(() => {
    const predioDe = new Map<string, { id: string; nome: string; cdois: number }>();
    predios.forEach((p) => p.chaves.forEach((k) => predioDe.set(k, { id: p.id, nome: p.nome, cdois: p.pontos.length })));
    return analisarRede(rotas, caixas, predioDe);
  }, [rotas, caixas, predios]);
  const corPon = useMemo(() => new Map(analise.pons.map((p) => [p.chave, p.cor])), [analise.pons]);

  // filtro de PON (só exibição) e, se pedido, só o que está na área visível
  const naPon = <T extends { pons: string[] }>(x: T) => !pon || x.pons.includes(pon);
  const caixasVis = analise.caixas.filter(naPon);
  const cabosVis = analise.cabos.filter(naPon);
  const dentro = (lat: number, lon: number) => !limites || limites.contains([lat, lon]);
  const caixasSel = soVisivel ? caixasVis.filter((c) => dentro(c.lat, c.lon)) : caixasVis;
  const cabosSel = soVisivel ? cabosVis.filter((c) => c.pts.some(([a, b]) => dentro(a, b))) : cabosVis;
  const rotasPon = new Set(rotas.filter((r) => !pon || portaPonDaRota(r).chave === pon).map((r) => r.id));
  const extras: AlertaMapa[] = soVisivel ? [] : [
    ...analise.semCoordenada.filter((s) => rotasPon.has(s.rota.id)).map((s): AlertaMapa => ({ gravidade: "cadastro", texto: `Sem coordenada (rota ${s.rota.nome})`, alvo: { tipo: "rota", chave: s.rota.id, nome: s.nome } })),
    ...analise.orfas.filter((r) => rotasPon.has(r.id)).map((r): AlertaMapa => ({ gravidade: "cadastro", texto: "Sub-rota órfã: a caixa de onde saía não está mais na rota-mãe", alvo: { tipo: "rota", chave: r.id, nome: r.nome } })),
  ];
  const listaAlertas: AlertaMapa[] = [
    ...caixasSel.flatMap((c) => c.alertas.map((a) => ({ ...a, alvo: { tipo: "caixa" as const, chave: c.chave, lat: c.lat, lon: c.lon, nome: c.nome } }))),
    ...cabosSel.flatMap((c) => {
      const m = c.pts[Math.floor(c.pts.length / 2)];
      return c.alertas.map((a) => ({ ...a, alvo: { tipo: "cabo" as const, chave: c.chave, lat: m[0], lon: m[1], nome: semCodigo(c.nome) } }));
    }),
    ...extras,
  ].sort((a, b) => ORDEM_GRAV.indexOf(a.gravidade) - ORDEM_GRAV.indexOf(b.gravidade));
  const ind = indicadores(caixasSel, cabosSel, extras);
  // uma PON escolhida: o que sai da OLT nela (o resumo da porta)
  const raizPon = pon ? rotas.find((r) => !r.pai && portaPonDaRota(r).chave === pon) : undefined;
  const potPon = raizPon ? raizPon.elementos[0]?.potencia_saida ?? raizPon.elementos[0]?.potencia_entrada : undefined;

  const todos: [number, number][] = [...caixasVis.map((c) => [c.lat, c.lon] as [number, number]), ...cabosVis.flatMap((c) => c.pts)];
  const detalhe = sel ? (sel.tipo === "caixa" ? { caixa: analise.caixas.find((c) => c.chave === sel.chave) } : { cabo: analise.cabos.find((c) => c.chave === sel.chave) }) : null;

  function selecionar(tipo: "caixa" | "cabo", chave: string) {
    setSel({ tipo, chave });
    setAba("detalhe");
    setPainel(true);
  }
  function irPara(alvo: AlvoMapa) {
    if (alvo.tipo === "rota") { onAbrirRota(alvo.chave); return; }
    if (alvo.lat !== undefined && alvo.lon !== undefined) setFoco({ lat: alvo.lat, lon: alvo.lon, vez: Date.now() });
    selecionar(alvo.tipo, alvo.chave);
  }

  // ---------- cores do tema ----------
  function corCaixa(c: CaixaAnalise): { anel: string | null; apagada: boolean } {
    if (tema === "pon") return { anel: c.pons.length === 1 ? corPon.get(c.pons[0]) ?? "#64748b" : "#64748b", apagada: false };
    if (tema === "potencia") {
      const conta = (c.tipo === "cto" || c.tipo === "cdoi" || c.tipo === "predio") && c.atende;
      return conta ? { anel: COR_NIVEL[nivelPotencia(c.potPonta)], apagada: false } : { anel: null, apagada: true };
    }
    if (tema === "ocupacao") {
      return c.ocupacao?.total ? { anel: COR_OCUPACAO[faixaOcupacao(c.ocupacao.clientes + c.ocupacao.ramais, c.ocupacao.total)], apagada: false } : { anel: null, apagada: true };
    }
    return { anel: null, apagada: false };
  }
  function estiloCabo(c: CaboAnalise): { cor: string; peso: number; tracejado?: string; opac: number } {
    const cordao = /^Cordão /i.test(c.nome);
    if (tema === "pon") return c.pons.length === 1 ? { cor: corPon.get(c.pons[0]) ?? "#64748b", peso: 4, opac: 1 } : { cor: corPon.get(c.pons[0]) ?? "#64748b", peso: 4, tracejado: "8 6", opac: 1 };
    if (tema === "potencia") return { cor: "#94a3b8", peso: 3, opac: 0.7 };
    if (tema === "ocupacao") {
      if (cordao) return { cor: "#94a3b8", peso: 2, opac: 0.6 };
      return { cor: COR_OCUPACAO[faixaOcupacao(c.fibras.length, c.capacidade)], peso: 2.5 + Math.min(6, c.capacidade / 18), opac: 1 };
    }
    return { cor: c.cor, peso: 3.5, opac: 1 };
  }

  const controle = "rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm";
  return (
    <div className={`overflow-hidden border border-gray-200 bg-white ${cheia ? "fixed inset-0 z-50 flex flex-col rounded-none" : "rounded-xl"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        <select className={controle} value={pon} onChange={(e) => setPon(e.target.value)} aria-label="Porta PON">
          <option value="">Todas as portas PON ({rotas.length} rota{rotas.length !== 1 ? "s" : ""})</option>
          {analise.pons.map((p) => <option key={p.chave} value={p.chave}>{p.rotulo}</option>)}
        </select>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 text-xs" role="radiogroup" aria-label="Colorir por">
          <span className="bg-gray-50 px-2 py-1.5 text-gray-500">Colorir por</span>
          {TEMAS.map((t) => (
            <button key={t.k} type="button" role="radio" aria-checked={tema === t.k} onClick={() => setTema(t.k)}
              className={`border-l border-gray-200 px-2 py-1.5 font-medium ${tema === t.k ? "bg-indigo-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
              {t.rotulo}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={comAlertas} onChange={(e) => setComAlertas(e.target.checked)} /> Alertas</label>
        <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={nomes} onChange={(e) => setNomes(e.target.checked)} /> Nomes</label>
        <SeletorCamada valor={camada} onMudar={setCamada} className="ml-auto" />
        <button type="button" onClick={() => setCheia((v) => !v)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
          {cheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {cheia ? "Sair" : "Tela cheia"}
        </button>
        <button type="button" onClick={() => setPainel(!painel)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50" title={painel ? "Esconder painel" : "Mostrar painel"}>
          {painel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />} Painel
        </button>
      </div>
      {todos.length === 0 ? (
        <div className="flex h-[520px] items-center justify-center text-sm text-gray-500">Nenhuma rota com coordenadas para mostrar no mapa.</div>
      ) : (
        <div className={`flex flex-col lg:flex-row ${cheia ? "min-h-0 flex-1" : ""}`}>
          <div className={`relative min-w-0 flex-1 ${cheia ? "min-h-[300px]" : ""}`}>
            <MapContainer center={todos[0]} zoom={15} scrollWheelZoom={false} className={`${cheia ? "h-full min-h-[300px]" : "h-[min(72vh,680px)]"} w-full z-0 [&_.leaflet-interactive]:outline-none`}>
              <CamadaBase camada={camada} />
              <ZoomComCtrl />
              <Enquadrar pts={todos} vez={pon} />
              <Controle onLimites={setLimites} foco={foco} cheia={cheia} />
              {analise.soltos.filter(naPon).map((s, k) => (
                <Polyline key={`s${k}`} positions={s.pts} pathOptions={{ color: s.cor ?? "#64748b", weight: 3, opacity: 0.8 }}>
                  <Tooltip sticky>{s.nome} · {s.rota.nome}</Tooltip>
                </Polyline>
              ))}
              {cabosVis.map((c) => {
                const e = estiloCabo(c);
                const ativo = sel?.tipo === "cabo" && sel.chave === c.chave;
                const al = comAlertas ? piorAlerta(c.alertas) : undefined;
                const meio = c.pts[Math.floor(c.pts.length / 2)];
                return (
                  <Fragment key={c.chave}>
                    <Polyline positions={c.pts} pathOptions={{ color: ativo ? "#facc15" : "#0f172a", weight: e.peso + 3.5 + Math.min(c.rotas.length, 4), opacity: ativo ? 0.9 : 0.6, lineCap: "round", lineJoin: "round" }} />
                    <Polyline positions={c.pts} pathOptions={{ color: e.cor, weight: e.peso, opacity: e.opac, dashArray: e.tracejado, lineCap: "round", lineJoin: "round" }}
                      eventHandlers={{ click: () => selecionar("cabo", c.chave) }}>
                      <Tooltip sticky>
                        <b>{curto(semCodigo(c.nome), 40)}</b>
                        <br />
                        {c.fibras.length} de {c.capacidade} fibras · {c.rotas.length} rota{c.rotas.length !== 1 ? "s" : ""}{c.metros ? ` · ${formatMetros(c.metros)}` : ""}
                      </Tooltip>
                    </Polyline>
                    {al && meio && <CircleMarker center={meio} radius={5} pathOptions={{ color: "#fff", weight: 2, fillColor: COR_GRAV[al], fillOpacity: 1 }} eventHandlers={{ click: () => selecionar("cabo", c.chave) }} />}
                  </Fragment>
                );
              })}
              {caixasVis.map((c) => {
                const { anel, apagada } = corCaixa(c);
                const al = comAlertas ? piorAlerta(c.alertas) : undefined;
                return (
                  <Marker key={c.chave} position={[c.lat, c.lon]}
                    icon={icone(c.tipo, sel?.tipo === "caixa" && sel.chave === c.chave ? "#facc15" : anel, apagada, al ? COR_GRAV[al] : null, nomes ? curto(c.nome, 18) : undefined)}
                    eventHandlers={{ click: () => selecionar("caixa", c.chave) }}>
                    <Tooltip direction="top" offset={[0, -14]}>
                      <b>{c.nome}</b>
                      {c.cdois ? ` · ${c.cdois} CDOIs` : ""}
                      <br />
                      {formatMetros(c.metrosOlt)} da OLT · {c.rotas.length} rota{c.rotas.length !== 1 ? "s" : ""}
                      {c.ocupacao?.total ? ` · ${c.ocupacao.clientes + c.ocupacao.ramais}/${c.ocupacao.total} portas` : ""}
                      {c.potPonta !== undefined ? ` · ${c.potPonta.toFixed(1).replace(".", ",")} dBm` : ""}
                    </Tooltip>
                  </Marker>
                );
              })}
            </MapContainer>
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500]">
              <LegendaMapa tema={tema} pons={analise.pons.filter((p) => !pon || p.chave === pon)} alertas={comAlertas} />
            </div>
          </div>
          {painel && (
            <div className={`border-t border-gray-200 lg:w-[330px] lg:shrink-0 lg:border-l lg:border-t-0 ${cheia ? "min-h-0 lg:h-auto" : "lg:h-[min(72vh,680px)]"} h-[460px]`}>
              <PainelMapa
                aba={aba}
                onAba={setAba}
                ind={ind}
                alertas={listaAlertas}
                detalhe={detalhe}
                pons={analise.pons}
                soVisivel={soVisivel}
                onSoVisivel={setSoVisivel}
                onIrPara={irPara}
                onAbrirRota={onAbrirRota}
                onAbrirNoUnifilar={onAbrirNoUnifilar}
                potPon={potPon}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
