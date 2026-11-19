"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import { tipoVisual, type ElementoRota, type TipoElementoRota, type TrechoCabo } from "@/lib/rotaOptica";
import { iconeSvg } from "./IconesRede";

interface Props {
  elementos: ElementoRota[];
  trechos: TrechoCabo[];
  selecionado: number | null;
  onSelect: (i: number) => void;
}

/** Marcador do mapa: ícone do tipo, com número da ordem e destaque quando selecionado. */
function marcador(tipo: TipoElementoRota, numero: number, ativo: boolean) {
  const tam = ativo ? 40 : 32;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="position:relative;width:${tam}px;height:${tam}px;${ativo ? "filter:drop-shadow(0 0 6px #facc15)" : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"}">${iconeSvg(tipo, tam)}<span style="position:absolute;right:-6px;top:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;background:${ativo ? "#facc15" : "#fff"};color:#0f172a;border:1.5px solid #0f172a;font:700 10px/13px system-ui,sans-serif;text-align:center">${numero}</span></div>`,
  });
}

function AjustarZoom({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pontos.length === 0) return;
    if (pontos.length === 1) { map.setView(pontos[0], 17); return; }
    map.fitBounds(L.latLngBounds(pontos), { padding: [30, 30] });
    // só no carregamento da rota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pontos.length]);
  return null;
}

function Centralizar({ alvo }: { alvo: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo) map.panTo(alvo);
  }, [map, alvo]);
  return null;
}

export default function RotaMapa({ elementos, trechos, selecionado, onSelect }: Props) {
  const pontosEl = elementos
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.lat !== undefined && e.lon !== undefined);
  const todos: [number, number][] = [
    ...pontosEl.map(({ e }) => [e.lat!, e.lon!] as [number, number]),
    ...trechos.flatMap((t) => t.pontos.map((p) => [p.lat, p.lon] as [number, number])),
  ];

  if (todos.length === 0) {
    return (
      <div className="h-[420px] rounded-xl bg-gray-100 flex items-center justify-center text-sm text-gray-500 text-center px-6">
        Esta rota não tem coordenadas. Informe latitude e longitude nos elementos para vê-la no mapa.
      </div>
    );
  }

  const sel = selecionado !== null ? elementos[selecionado] : null;
  const alvo: [number, number] | null = sel?.lat !== undefined && sel?.lon !== undefined ? [sel.lat, sel.lon] : null;

  return (
    <MapContainer center={todos[0]} zoom={15} scrollWheelZoom={false} className="h-[420px] w-full rounded-xl z-0 [&_.leaflet-interactive]:outline-none">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        maxZoom={19}
      />
      <ZoomComCtrl />
      <AjustarZoom pontos={todos} />
      <Centralizar alvo={alvo} />

      {/* Cabo: capa escura por baixo e a cor do cabo por cima */}
      {trechos.map((t, i) => (
        <Polyline
          key={`c${i}`}
          positions={t.pontos.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.75, lineCap: "round", lineJoin: "round" }}
        />
      ))}
      {trechos.map((t, i) => (
        <Polyline
          key={`t${i}`}
          positions={t.pontos.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: t.cor ?? "#3b82f6", weight: 4, opacity: 1, lineCap: "round", lineJoin: "round" }}
        >
          <Tooltip sticky>{t.nome}</Tooltip>
        </Polyline>
      ))}

      {/* Sem traçado de cabo (cadastro manual): liga os elementos em linha reta */}
      {trechos.length === 0 && pontosEl.length > 1 && (
        <Polyline
          positions={pontosEl.map(({ e }) => [e.lat!, e.lon!] as [number, number])}
          pathOptions={{ color: "#2563eb", weight: 4, dashArray: "6 6" }}
        />
      )}

      {pontosEl.map(({ e, i }) => (
        <Marker
          key={`e${i}`}
          position={[e.lat!, e.lon!]}
          icon={marcador(tipoVisual(e), i + 1, i === selecionado)}
          zIndexOffset={i === selecionado ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(i) }}
        >
          <Tooltip direction="top" offset={[0, -16]}>
            {i + 1}. {e.nome}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
