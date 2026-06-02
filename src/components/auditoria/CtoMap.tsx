"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import type { CtoWithRoute } from "@/lib/ctos";

interface Props {
  clientLat: number;
  clientLon: number;
  ctos: CtoWithRoute[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}

function FitBounds({ clientLat, clientLon, ctos }: { clientLat: number; clientLon: number; ctos: CtoWithRoute[] }) {
  const map = useMap();
  useEffect(() => {
    if (ctos.length === 0) return;
    const points: [number, number][] = [
      [clientLat, clientLon],
      ...ctos.map((c) => [c.lat, c.lon] as [number, number]),
    ];
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
      { padding: [40, 40] }
    );
  }, [map, clientLat, clientLon, ctos]);
  return null;
}

export default function CtoMap({ clientLat, clientLon, ctos, selectedName, onSelect }: Props) {
  const selected = ctos.find((c) => c.name === selectedName);

  return (
    <MapContainer
      center={[clientLat, clientLon]}
      zoom={15}
      style={{ height: "360px", width: "100%", borderRadius: "12px", zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
      />

      <FitBounds clientLat={clientLat} clientLon={clientLon} ctos={ctos} />

      {/* Marcador do cliente */}
      <CircleMarker
        center={[clientLat, clientLon]}
        radius={10}
        pathOptions={{ color: "#4f46e5", fillColor: "#4f46e5", fillOpacity: 0.9, weight: 2 }}
      >
        <Popup>📍 Cliente</Popup>
      </CircleMarker>

      {/* Marcadores das CTOs */}
      {ctos.map((cto, i) => {
        const isSelected = cto.name === selectedName;
        const dist = cto.route?.distance ?? cto.straightDistance;
        const color = isSelected ? "#16a34a" : dist < 200 ? "#22c55e" : dist < 400 ? "#f59e0b" : "#ef4444";

        return (
          <CircleMarker
            key={cto.name}
            center={[cto.lat, cto.lon]}
            radius={isSelected ? 12 : 8}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: isSelected ? 3 : 2,
            }}
            eventHandlers={{ click: () => onSelect(cto.name) }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣"][i] ?? "📍"} {cto.name}</p>
                {cto.route && (
                  <>
                    <p>{cto.route.isStraightLine ? "📏 Linha reta" : "🚶 Rota real"}: {Math.round(cto.route.distance)}m</p>
                    <p>Com sobra: <strong>{Math.round(cto.route.distanceWithBuffer)}m</strong></p>
                    {cto.route.warningMsg && <p className="text-orange-600 text-xs mt-1">{cto.route.warningMsg}</p>}
                  </>
                )}
                <button
                  onClick={() => onSelect(cto.name)}
                  className="mt-2 bg-indigo-600 text-white text-xs px-3 py-1 rounded-lg w-full"
                >
                  ✅ Selecionar
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Rota da CTO selecionada */}
      {selected?.route && (
        <Polyline
          positions={selected.route.geometry}
          pathOptions={{
            color: selected.route.isStraightLine ? "#f97316" : "#16a34a",
            weight: 4,
            dashArray: selected.route.isStraightLine ? "8, 6" : undefined,
          }}
        />
      )}
    </MapContainer>
  );
}
