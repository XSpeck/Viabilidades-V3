"use client";

import { useEffect, useState, useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ScaleControl, useMapEvents } from "react-leaflet";
import { haversineDistance, formatDistance } from "@/lib/ctos";
import type { CtoWithRoute } from "@/lib/ctos";

// =====================
// Camadas de mapa
// =====================
type MapLayer = "map" | "satellite" | "hybrid";

const LAYERS: Record<MapLayer, { label: string; emoji: string; url: string; attribution: string; overlay?: string }> = {
  map: {
    label: "Mapa",
    emoji: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
  },
  satellite: {
    label: "Satélite",
    emoji: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
  },
  hybrid: {
    label: "Híbrido",
    emoji: "🛣️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, HERE",
    overlay: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
  },
};

function LayerUpdater({ layer }: { layer: MapLayer }) {
  const map = useMap();
  useEffect(() => {
    map.eachLayer((l) => { if ((l as L.TileLayer).options?.maxZoom) map.removeLayer(l); });
    L.tileLayer(LAYERS[layer].url, { attribution: LAYERS[layer].attribution, maxZoom: 20 }).addTo(map);
    if (LAYERS[layer].overlay) {
      L.tileLayer(LAYERS[layer].overlay!, { maxZoom: 20, opacity: 0.85 }).addTo(map);
    }
  }, [layer, map]);
  return null;
}

function ResizeHandler({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    // Aguarda a transição CSS terminar antes de invalidar
    const timer = setTimeout(() => map.invalidateSize(), 320);
    return () => clearTimeout(timer);
  }, [expanded, map]);
  return null;
}

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
// Ícone de ponto de medição
// =====================
function measurePointIcon(label: string) {
  return L.divIcon({
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:#f97316;border:3px solid white;
      box-shadow:0 2px 4px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:700;color:white;
      font-family:system-ui,sans-serif;
    ">${label}</div>`,
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// =====================
// Handler de cliques para medição
// =====================
function MeasureHandler({
  active,
  points,
  onAddPoint,
}: {
  active: boolean;
  points: [number, number][];
  onAddPoint: (p: [number, number]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor = active ? "crosshair" : "";
  }, [active, map]);

  useMapEvents({
    click(e) {
      if (!active) return;
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
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

  // Camada de mapa
  const [activeLayer, setActiveLayer] = useState<MapLayer>("map");

  // Expandir mapa
  const [expanded, setExpanded] = useState(false);
  const mapHeight = expanded ? "580px" : "400px";

  // Estado da ferramenta de medição
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  const addMeasurePoint = useCallback((p: [number, number]) => {
    setMeasurePoints((prev) => [...prev, p]);
  }, []);

  function toggleMeasure() {
    if (measuring) {
      setMeasuring(false);
      setMeasurePoints([]);
    } else {
      setMeasuring(true);
      setMeasurePoints([]);
    }
  }

  // Distâncias acumuladas entre pontos
  const measureSegments = measurePoints.slice(1).map((p, i) => {
    const prev = measurePoints[i];
    return haversineDistance(prev[0], prev[1], p[0], p[1]);
  });
  const totalMeasure = measureSegments.reduce((a, b) => a + b, 0);

  return (
    <div style={{ position: "relative" }}>
      {/* Seletor de camadas — canto superior esquerdo */}
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 1000,
        display: "flex", gap: 4, background: "white",
        borderRadius: 8, padding: 3, boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
        border: "1px solid #e5e7eb",
      }}>
        {(Object.keys(LAYERS) as MapLayer[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            title={LAYERS[key].label}
            style={{
              background: activeLayer === key ? "#4f46e5" : "transparent",
              color: activeLayer === key ? "white" : "#374151",
              border: "none", borderRadius: 6,
              padding: "4px 8px", fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "system-ui,sans-serif",
              transition: "all 0.15s",
            }}
          >
            {LAYERS[key].emoji} {LAYERS[key].label}
          </button>
        ))}
      </div>

      {/* Botões — canto superior direito */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Expandir/recolher */}
        <button
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Recolher mapa" : "Expandir mapa"}
          style={{
            background: "white", color: "#374151",
            border: "2px solid #d1d5db", borderRadius: 8,
            padding: "6px 10px", fontSize: 16, cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)", lineHeight: 1,
          }}
        >
          {expanded ? "⬇️" : "⬆️"}
        </button>
        <button
          onClick={toggleMeasure}
          title={measuring ? "Sair da medição" : "Medir distância"}
          style={{
            background: measuring ? "#f97316" : "white",
            color: measuring ? "white" : "#374151",
            border: "2px solid " + (measuring ? "#f97316" : "#d1d5db"),
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 18,
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            lineHeight: 1,
          }}
        >
          📏
        </button>
        {measuring && measurePoints.length > 0 && (
          <button
            onClick={() => setMeasurePoints([])}
            title="Limpar medição"
            style={{
              background: "white", color: "#374151",
              border: "2px solid #d1d5db", borderRadius: 8,
              padding: "6px 10px", fontSize: 16, cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)", lineHeight: 1,
            }}
          >
            🗑️
          </button>
        )}
      </div>

      {/* Painel de resultado da medição */}
      {measuring && (
        <div style={{
          position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "white", borderRadius: 10,
          padding: "8px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          fontSize: 13, fontFamily: "system-ui,sans-serif", whiteSpace: "nowrap",
          border: "2px solid #f97316",
        }}>
          {measurePoints.length === 0 && (
            <span style={{ color: "#6b7280" }}>📏 Clique no mapa para iniciar a medição</span>
          )}
          {measurePoints.length === 1 && (
            <span style={{ color: "#6b7280" }}>📍 Clique para adicionar mais pontos</span>
          )}
          {measurePoints.length >= 2 && (
            <span>
              📏 Total: <strong style={{ color: "#f97316" }}>{formatDistance(totalMeasure)}</strong>
              {measureSegments.length > 1 && (
                <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 8 }}>
                  ({measureSegments.length} segmentos)
                </span>
              )}
            </span>
          )}
        </div>
      )}

    <MapContainer
      center={[clientLat, clientLon]}
      zoom={15}
      style={{ height: mapHeight, width: "100%", borderRadius: "12px", zIndex: 0, transition: "height 0.3s ease" }}
      zoomControl={false}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
      />

      <FitBounds clientLat={clientLat} clientLon={clientLon} ctos={ctos} />
      <ScaleControl position="bottomleft" imperial={false} />
      <LayerUpdater layer={activeLayer} />
      <ResizeHandler expanded={expanded} />
      <MeasureHandler active={measuring} points={measurePoints} onAddPoint={addMeasurePoint} />

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

      {/* Linha de medição */}
      {measurePoints.length >= 2 && (
        <Polyline
          positions={measurePoints}
          pathOptions={{ color: "#f97316", weight: 3, dashArray: "6, 4" }}
        />
      )}

      {/* Marcadores de medição com distância acumulada */}
      {measurePoints.map((p, i) => {
        const accumulated = measureSegments.slice(0, i).reduce((a, b) => a + b, 0);
        const label = i === 0 ? "A" : String(i + 1);
        return (
          <Marker
            key={`measure-${i}`}
            position={p}
            icon={measurePointIcon(label)}
            zIndexOffset={3000}
          >
            <Popup>
              <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 12 }}>
                <p style={{ fontWeight: 700, marginBottom: 2 }}>Ponto {label}</p>
                {i > 0 && (
                  <>
                    <p>Segmento: <strong>{formatDistance(measureSegments[i - 1])}</strong></p>
                    <p>Acumulado: <strong style={{ color: "#f97316" }}>{formatDistance(accumulated)}</strong></p>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
    </div>
  );
}
