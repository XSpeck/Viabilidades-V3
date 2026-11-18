"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ElementoRota, TrechoCabo } from "@/lib/rotaOptica";

interface Props {
  elementos: ElementoRota[];
  trechos: TrechoCabo[];
  selecionado: number | null;
  onSelect: (i: number) => void;
}

const COR_TIPO: Record<string, string> = {
  olt: "#111827",
  dio: "#374151",
  ceo: "#d97706",
  hub: "#4f46e5",
  cto: "#059669",
  onu: "#0ea5e9",
  outro: "#6b7280",
};

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
    <MapContainer center={todos[0]} zoom={15} scrollWheelZoom className="h-[420px] w-full rounded-xl z-0">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        maxZoom={19}
      />
      <AjustarZoom pontos={todos} />
      <Centralizar alvo={alvo} />

      {trechos.map((t, i) => (
        <Polyline
          key={`t${i}`}
          positions={t.pontos.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: t.cor ?? "#2563eb", weight: 5, opacity: 0.85 }}
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
        <CircleMarker
          key={`e${i}`}
          center={[e.lat!, e.lon!]}
          radius={i === selecionado ? 11 : 7}
          pathOptions={{
            color: i === selecionado ? "#111827" : "#ffffff",
            weight: i === selecionado ? 3 : 2,
            fillColor: COR_TIPO[e.tipo] ?? "#6b7280",
            fillOpacity: 1,
          }}
          eventHandlers={{ click: () => onSelect(i) }}
        >
          <Tooltip direction="top" offset={[0, -6]}>
            {i + 1}. {e.nome}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
