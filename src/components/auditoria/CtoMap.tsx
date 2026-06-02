"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ScaleControl } from "react-leaflet";
import type { CtoWithRoute } from "@/lib/ctos";

interface Props {
  clientLat: number;
  clientLon: number;
  ctos: CtoWithRoute[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}

// =====================
// Ícones customizados SVG
// =====================

function pinSvg(fill: string, label: string, size: number, ring = false) {
  const ringStroke = ring ? `<circle cx="20" cy="20" r="18" fill="none" stroke="white" stroke-width="3" opacity="0.8"/>` : "";
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 1.4}" viewBox="0 0 40 55">
      <filter id="shadow">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>
      </filter>
      <g filter="url(#shadow)">
        <path d="M20 2C10.6 2 3 9.6 3 19c0 12.5 17 33 17 33s17-20.5 17-33C37 9.6 29.4 2 20 2z" fill="${fill}"/>
        ${ringStroke}
        <circle cx="20" cy="19" r="9" fill="white" opacity="0.95"/>
        <text x="20" y="23" text-anchor="middle" font-size="10" font-weight="700" font-family="system-ui,sans-serif" fill="${fill}">${label}</text>
      </g>
    </svg>
  `;
}

function clientPinSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="50" viewBox="0 0 40 55">
      <filter id="shadow">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.4"/>
      </filter>
      <g filter="url(#shadow)">
        <path d="M20 2C10.6 2 3 9.6 3 19c0 12.5 17 33 17 33s17-20.5 17-33C37 9.6 29.4 2 20 2z" fill="#4f46e5"/>
        <circle cx="20" cy="19" r="10" fill="white" opacity="0.95"/>
        <text x="20" y="24" text-anchor="middle" font-size="14" font-family="system-ui,sans-serif">👤</text>
      </g>
    </svg>
  `;
}

function createCtoIcon(rank: number, dist: number, isSelected: boolean) {
  const labels = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const label = labels[rank] ?? "•";

  let fill: string;
  if (isSelected) {
    fill = "#16a34a";
  } else if (dist < 200) {
    fill = "#22c55e";
  } else if (dist < 400) {
    fill = "#f59e0b";
  } else {
    fill = "#ef4444";
  }

  const size = isSelected ? 36 : 30;

  return L.divIcon({
    html: pinSvg(fill, label, size, isSelected),
    className: "",
    iconSize: [size, size * 1.4],
    iconAnchor: [size / 2, size * 1.4],
    popupAnchor: [0, -(size * 1.4)],
  });
}

function createClientIcon() {
  return L.divIcon({
    html: clientPinSvg(),
    className: "",
    iconSize: [36, 50],
    iconAnchor: [18, 50],
    popupAnchor: [0, -50],
  });
}

// =====================
// FitBounds helper
// =====================
function FitBounds({ clientLat, clientLon, ctos }: {
  clientLat: number; clientLon: number; ctos: CtoWithRoute[];
}) {
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
      { padding: [48, 48] }
    );
  }, [map, clientLat, clientLon, ctos]);
  return null;
}

// =====================
// Mapa principal
// =====================
export default function CtoMap({ clientLat, clientLon, ctos, selectedName, onSelect }: Props) {
  const selected = ctos.find((c) => c.name === selectedName);
  const clientIcon = createClientIcon();

  return (
    <MapContainer
      center={[clientLat, clientLon]}
      zoom={15}
      style={{ height: "380px", width: "100%", borderRadius: "12px", zIndex: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
      />

      <FitBounds clientLat={clientLat} clientLon={clientLon} ctos={ctos} />
      <ScaleControl position="bottomleft" imperial={false} />

      {/* Rota da CTO selecionada (atrás dos marcadores) */}
      {selected?.route && (
        <Polyline
          positions={selected.route.geometry}
          pathOptions={{
            color: selected.route.isStraightLine ? "#f97316" : "#16a34a",
            weight: 4,
            opacity: 0.85,
            dashArray: selected.route.isStraightLine ? "8, 6" : undefined,
          }}
        />
      )}

      {/* Marcadores das CTOs */}
      {ctos.map((cto, i) => {
        const isSelected = cto.name === selectedName;
        const dist = cto.route?.distance ?? cto.straightDistance;
        const icon = createCtoIcon(i, dist, isSelected);

        return (
          <Marker
            key={cto.name}
            position={[cto.lat, cto.lon]}
            icon={icon}
            zIndexOffset={isSelected ? 1000 : i * -10}
            eventHandlers={{ click: () => onSelect(cto.name) }}
          >
            <Popup minWidth={200}>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>{cto.name}</p>
                {cto.route && (
                  <>
                    <p style={{ color: "#555", marginBottom: 2 }}>
                      {cto.route.isStraightLine ? "📏 Linha reta" : "🚶 Rota a pé"}:{" "}
                      <strong>{Math.round(cto.route.distance)}m</strong>
                    </p>
                    <p style={{ color: "#555", marginBottom: 4 }}>
                      Com +50m: <strong>{Math.round(cto.route.distanceWithBuffer)}m</strong>
                    </p>
                    {cto.route.warningMsg && (
                      <p style={{ color: "#ea580c", fontSize: 11, marginBottom: 4 }}>
                        {cto.route.warningMsg}
                      </p>
                    )}
                  </>
                )}
                <button
                  onClick={() => onSelect(cto.name)}
                  style={{
                    width: "100%", background: "#4f46e5", color: "white",
                    border: "none", borderRadius: 6, padding: "6px 0",
                    cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}
                >
                  ✅ Selecionar esta CTO
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Marcador do cliente (por cima de tudo) */}
      <Marker
        position={[clientLat, clientLon]}
        icon={clientIcon}
        zIndexOffset={2000}
      >
        <Popup>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 600 }}>
            📍 Localização do cliente
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
