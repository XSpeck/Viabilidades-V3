"use client";

import { Fragment, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import { distanciaMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { trechosDaRota, type ResultadoRompimento } from "@/lib/rompimento";
import { iconeSvg } from "./IconesRede";

type Ponto = { lat: number; lon: number };

interface Props {
  rota: RotaOptica;
  ref_: number;
  resultado: ResultadoRompimento | null;
}

const icone = (tipo: Parameters<typeof iconeSvg>[0], n: number, apagado: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="position:relative;width:30px;height:30px;${apagado ? "filter:grayscale(1) opacity(.55)" : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"}">${iconeSvg(tipo, 30)}<span style="position:absolute;right:-6px;top:-6px;min-width:15px;height:15px;padding:0 3px;border-radius:9999px;background:#fff;color:#0f172a;border:1.5px solid #0f172a;font:700 9px/12px system-ui,sans-serif;text-align:center">${n}</span></div>`,
  });

/** OTDR: aparelho com a tela do traço */
const iconeOtdr = L.divIcon({
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 40],
  html: `<svg width="34" height="34" viewBox="0 0 34 34" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><rect x="2" y="3" width="30" height="24" rx="5" fill="#1e293b" stroke="#fff" stroke-width="1.5"/><rect x="6" y="7" width="22" height="13" rx="2" fill="#0f766e"/><path d="M7 17 L11 11 L15 13 L18 12 L20 16 L22 16 L23 9 L24 16 L27 17" stroke="#5eead4" stroke-width="1.4" fill="none"/><circle cx="10" cy="23.5" r="1.6" fill="#f59e0b"/><circle cx="15" cy="23.5" r="1.6" fill="#64748b"/><path d="M17 27 L17 33" stroke="#1e293b" stroke-width="2.5"/></svg>`,
});

/** Rompimento: raio vermelho pulsando */
const iconeQuebra = L.divIcon({
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="10" fill="#ef4444" opacity=".35"><animate attributeName="r" values="9;21;9" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;0;.5" dur="1.4s" repeatCount="indefinite"/></circle><circle cx="22" cy="22" r="11" fill="#dc2626" stroke="#fff" stroke-width="2"/><path d="M24 13 L17 23 L22 23 L19 31 L27 20 L22 20 Z" fill="#fde047" stroke="#7f1d1d" stroke-width=".8" stroke-linejoin="round"/></svg>`,
});

function Enquadrar({ pts, alvo }: { pts: [number, number][]; alvo: Ponto | null }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    // só ao abrir a rota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pts.length]);
  useEffect(() => {
    if (alvo) map.setView([alvo.lat, alvo.lon], Math.max(map.getZoom(), 17), { animate: true });
  }, [map, alvo]);
  return null;
}

/** Divide o traçado no ponto do rompimento: [antes, depois] */
function dividir(pts: Ponto[], p: Ponto): [Ponto[], Ponto[]] {
  if (pts.length < 2) return [pts, []];
  let melhor = 0, dMin = Infinity;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = distanciaMetros(pts[k], p) + distanciaMetros(p, pts[k + 1]) - distanciaMetros(pts[k], pts[k + 1]);
    if (d < dMin) { dMin = d; melhor = k; }
  }
  return [[...pts.slice(0, melhor + 1), p], [p, ...pts.slice(melhor + 1)]];
}

export default function MapaRompimento({ rota, ref_, resultado }: Props) {
  const tr = trechosDaRota(rota);
  const todos: [number, number][] = tr.flatMap((t) => t.pts.map((p) => [p.lat, p.lon] as [number, number]));
  rota.elementos.forEach((e) => { if (e.lat !== undefined && e.lon !== undefined) todos.push([e.lat, e.lon]); });
  if (todos.length === 0) {
    return <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">Esta rota não tem coordenadas no mapa.</div>;
  }
  const q = resultado?.trecho;
  const ponto = resultado?.ponto ?? null;
  // a partir de onde fica sem sinal (o rompimento corta tudo depois dele, no sentido da OLT para a ponta)
  const apagadoDesde = q !== undefined ? q : Infinity;
  const refEl = rota.elementos[ref_];

  return (
    <MapContainer center={todos[0]} zoom={15} scrollWheelZoom={false} className="h-full min-h-[320px] w-full rounded-xl z-0 [&_.leaflet-interactive]:outline-none">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' maxZoom={19} />
      <ZoomComCtrl />
      <Enquadrar pts={todos} alvo={ponto} />
      {tr.map((t) => {
        const cor = rota.trechos.find((x) => x.ate === t.i)?.cor ?? "#3b82f6";
        const lp = (ps: Ponto[]) => ps.map((p) => [p.lat, p.lon] as [number, number]);
        if (t.i === q && ponto && resultado?.tipo === "tracado") {
          const [a, b] = dividir(t.pts, ponto);
          return (
            <Fragment key={t.i}>
              <Polyline positions={lp(a)} pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.75 }} />
              <Polyline positions={lp(a)} pathOptions={{ color: cor, weight: 4 }} />
              <Polyline positions={lp(b)} pathOptions={{ color: "#dc2626", weight: 4, dashArray: "6 6" }} />
            </Fragment>
          );
        }
        // depois do rompimento fica sem sinal; no trecho do rompimento, só se ele foi na reserva da caixa de saída
        const apagado = t.i > apagadoDesde || (t.i === apagadoDesde && resultado?.tipo === "reserva" && resultado.reservaDe === t.i - 1);
        return (
          <Fragment key={t.i}>
            {!apagado && <Polyline positions={lp(t.pts)} pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.75 }} />}
            <Polyline positions={lp(t.pts)} pathOptions={apagado ? { color: "#dc2626", weight: 4, dashArray: "6 6", opacity: 0.8 } : { color: cor, weight: 4 }} />
          </Fragment>
        );
      })}
      {rota.elementos.map((e, i) =>
        e.lat !== undefined && e.lon !== undefined ? (
          <Marker key={i} position={[e.lat, e.lon]} icon={icone(tipoVisual(e), i + 1, q !== undefined && i >= q)}>
            <Tooltip direction="top" offset={[0, -14]}>{i + 1}. {e.nome}</Tooltip>
          </Marker>
        ) : null,
      )}
      {refEl?.lat !== undefined && refEl.lon !== undefined && (
        <Marker position={[refEl.lat, refEl.lon]} icon={iconeOtdr} zIndexOffset={900}>
          <Tooltip direction="top" offset={[0, -36]}>OTDR ligado aqui</Tooltip>
        </Marker>
      )}
      {ponto && (
        <Marker position={[ponto.lat, ponto.lon]} icon={iconeQuebra} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -18]} permanent>Rompimento aqui</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
