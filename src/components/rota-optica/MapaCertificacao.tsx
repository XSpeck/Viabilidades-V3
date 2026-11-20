"use client";

import { Fragment, useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import { tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { trechosDaRota } from "@/lib/rompimento";
import { iconeSvg } from "./IconesRede";

/** Ponto que o técnico precisa visitar */
export interface PontoVisita {
  n: number;
  lat: number;
  lon: number;
  cor: string;
  titulo: string;
}

interface Props {
  rota: RotaOptica;
  ref_: number;
  pontos: PontoVisita[];
  /** ponto em foco (n) */
  foco?: number | null;
}

const icone = (tipo: Parameters<typeof iconeSvg>[0], n: number) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="position:relative;width:26px;height:26px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${iconeSvg(tipo, 26)}<span style="position:absolute;right:-6px;top:-6px;min-width:14px;height:14px;padding:0 3px;border-radius:9999px;background:#fff;color:#0f172a;border:1.5px solid #0f172a;font:700 8.5px/11px system-ui,sans-serif;text-align:center">${n}</span></div>`,
  });

const iconeOtdr = L.divIcon({
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 38],
  html: `<svg width="32" height="32" viewBox="0 0 34 34" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><rect x="2" y="3" width="30" height="24" rx="5" fill="#1e293b" stroke="#fff" stroke-width="1.5"/><rect x="6" y="7" width="22" height="13" rx="2" fill="#0f766e"/><path d="M7 17 L11 11 L15 13 L18 12 L20 16 L22 16 L23 9 L24 16 L27 17" stroke="#5eead4" stroke-width="1.4" fill="none"/><path d="M17 27 L17 33" stroke="#1e293b" stroke-width="2.5"/></svg>`,
});

/** Alfinete numerado do ponto a visitar */
const iconeVisita = (n: number, cor: string) =>
  L.divIcon({
    className: "",
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    html: `<svg width="30" height="40" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))"><path d="M15 39 C15 39 3 24 3 15 a12 12 0 0 1 24 0 c0 9 -12 24 -12 24z" fill="${cor}" stroke="#fff" stroke-width="2"/><text x="15" y="19.5" font-family="system-ui,sans-serif" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">${n}</text></svg>`,
  });

function Enquadrar({ pts, foco }: { pts: [number, number][]; foco: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    // só ao abrir / trocar de rota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pts.length]);
  useEffect(() => {
    if (foco) map.setView(foco, Math.max(map.getZoom(), 17), { animate: true });
  }, [map, foco]);
  return null;
}

export default function MapaCertificacao({ rota, ref_, pontos, foco }: Props) {
  const tr = trechosDaRota(rota);
  const todos: [number, number][] = tr.flatMap((t) => t.pts.map((p) => [p.lat, p.lon] as [number, number]));
  rota.elementos.forEach((e) => { if (e.lat !== undefined && e.lon !== undefined) todos.push([e.lat, e.lon]); });
  if (todos.length === 0) {
    return <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500">Esta rota não tem coordenadas no mapa.</div>;
  }
  const refEl = rota.elementos[ref_];
  const pFoco = foco !== null && foco !== undefined ? pontos.find((p) => p.n === foco) : undefined;

  return (
    <MapContainer center={todos[0]} zoom={15} scrollWheelZoom={false} className="h-full min-h-[300px] w-full rounded-xl z-0 [&_.leaflet-interactive]:outline-none">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>' maxZoom={19} />
      <ZoomComCtrl />
      <Enquadrar pts={todos} foco={pFoco ? [pFoco.lat, pFoco.lon] : null} />
      {tr.map((t) => {
        const cor = rota.trechos.find((x) => x.ate === t.i)?.cor ?? "#3b82f6";
        const lp = t.pts.map((p) => [p.lat, p.lon] as [number, number]);
        return (
          <Fragment key={t.i}>
            <Polyline positions={lp} pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.75 }} />
            <Polyline positions={lp} pathOptions={{ color: cor, weight: 4 }} />
          </Fragment>
        );
      })}
      {rota.elementos.map((e, i) =>
        e.lat !== undefined && e.lon !== undefined ? (
          <Marker key={i} position={[e.lat, e.lon]} icon={icone(tipoVisual(e), i + 1)}>
            <Tooltip direction="top" offset={[0, -12]}>{i + 1}. {e.nome}</Tooltip>
          </Marker>
        ) : null,
      )}
      {refEl?.lat !== undefined && refEl.lon !== undefined && (
        <Marker position={[refEl.lat, refEl.lon]} icon={iconeOtdr} zIndexOffset={900}>
          <Tooltip direction="top" offset={[0, -34]}>OTDR ligado aqui</Tooltip>
        </Marker>
      )}
      {pontos.map((p) => (
        <Marker key={`v${p.n}`} position={[p.lat, p.lon]} icon={iconeVisita(p.n, p.cor)} zIndexOffset={1000 + p.n}>
          <Tooltip direction="top" offset={[0, -36]} permanent={pontos.length <= 4 || p.n === foco}>
            {p.n}. {p.titulo}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
