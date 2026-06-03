"use client";

import { useState, useRef, useEffect } from "react";
import L from "leaflet";
import { MapContainer, useMap, ScaleControl, Marker, Popup } from "react-leaflet";

// ─── Camadas de mapa ──────────────────────────────────────────────
const LAYERS = {
  map: {
    label: "Mapa", emoji: "🗺️",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
  },
  satellite: {
    label: "Satélite", emoji: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar",
  },
} as const;
type LayerKey = keyof typeof LAYERS;

// ─── Tipos de ponto ───────────────────────────────────────────────
export type PointCategory = "ftth_ap" | "ftth_rej" | "predio_ap" | "cond_ap" | "sem_viab";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  category: PointCategory;
  cliente: string;
  plusCode: string;
  data?: string;
  extra?: string;
}

const CATEGORIES: Record<PointCategory, { label: string; color: string; emoji: string }> = {
  ftth_ap:   { label: "FTTH Aprovado",         color: "#22c55e", emoji: "✅" },
  ftth_rej:  { label: "FTTH Sem Viabilidade",  color: "#ef4444", emoji: "❌" },
  predio_ap: { label: "Prédio Aprovado",        color: "#3b82f6", emoji: "🏢" },
  cond_ap:   { label: "Condomínio Aprovado",   color: "#f97316", emoji: "🏘️" },
  sem_viab:  { label: "Prédio/Cond. Sem Viab.",color: "#7c3aed", emoji: "🚫" },
};

// ─── Ícone SVG por categoria ──────────────────────────────────────
function makeIcon(color: string, selected = false) {
  const size = selected ? 20 : 14;
  const html = `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${color};border:2.5px solid white;
    box-shadow:0 1px 4px rgba(0,0,0,0.4);
    ${selected ? "outline:3px solid " + color + "55;" : ""}
  "></div>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

// ─── Layer updater ────────────────────────────────────────────────
function LayerUpdater({ layer }: { layer: LayerKey }) {
  const map = useMap();
  const baseRef = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = L.tileLayer(LAYERS[layer].url, {
      attribution: LAYERS[layer].attribution, maxZoom: 18,
    }).addTo(map);
  }, [layer, map]);
  return null;
}

// ─── FitBounds ────────────────────────────────────────────────────
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
      { padding: [40, 40] }
    );
  }, [map, points]);
  return null;
}

// ─── Componente principal ─────────────────────────────────────────
interface Props {
  points: MapPoint[];
}

export default function RelatorioMapa({ points }: Props) {
  const [layer, setLayer] = useState<LayerKey>("map");
  const [visible, setVisible] = useState<Record<PointCategory, boolean>>({
    ftth_ap: true, ftth_rej: true, predio_ap: true, cond_ap: true, sem_viab: true,
  });

  function toggle(cat: PointCategory) {
    setVisible((p) => ({ ...p, [cat]: !p[cat] }));
  }

  const counts = Object.fromEntries(
    (Object.keys(CATEGORIES) as PointCategory[]).map((cat) => [cat, points.filter((p) => p.category === cat).length])
  ) as Record<PointCategory, number>;

  const visiblePoints = points.filter((p) => visible[p.category]);

  const REF_LAT = -28.6775;
  const REF_LON = -49.3696;

  return (
    <div className="relative">
      {/* Controles — camada */}
      <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          display: "flex", gap: 4, background: "white",
          borderRadius: 8, padding: 3, boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          border: "1px solid #e5e7eb",
        }}>
          {(Object.keys(LAYERS) as LayerKey[]).map((k) => (
            <button key={k} onClick={() => setLayer(k)} style={{
              background: layer === k ? "#4f46e5" : "transparent",
              color: layer === k ? "white" : "#374151",
              border: "none", borderRadius: 6, padding: "4px 8px",
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              fontFamily: "system-ui,sans-serif",
            }}>
              {LAYERS[k].emoji} {LAYERS[k].label}
            </button>
          ))}
        </div>

        {/* Legenda / toggles */}
        <div style={{
          background: "white", borderRadius: 8, padding: "6px 10px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)", border: "1px solid #e5e7eb",
          minWidth: 190,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Legenda
          </p>
          {(Object.keys(CATEGORIES) as PointCategory[]).map((cat) => {
            const cfg = CATEGORIES[cat];
            const on = visible[cat];
            return (
              <label key={cat} style={{
                display: "flex", alignItems: "center", gap: 7,
                cursor: "pointer", padding: "3px 0",
                fontFamily: "system-ui,sans-serif",
              }}>
                <input type="checkbox" checked={on} onChange={() => toggle(cat)}
                  style={{ accentColor: cfg.color, width: 13, height: 13 }} />
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: cfg.color, border: "2px solid white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)", flexShrink: 0,
                  opacity: on ? 1 : 0.35,
                }} />
                <span style={{ fontSize: 11, color: on ? "#374151" : "#9ca3af", fontWeight: 500 }}>
                  {cfg.label}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>
                  {counts[cat]}
                </span>
              </label>
            );
          })}
          <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 6, paddingTop: 5 }}>
            <p style={{ fontSize: 10, color: "#9ca3af", fontFamily: "system-ui,sans-serif" }}>
              {visiblePoints.length} de {points.length} pontos
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 520, borderRadius: 12, overflow: "hidden" }}>
        <MapContainer
          center={[REF_LAT, REF_LON]}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          maxZoom={18}
          scrollWheelZoom
        >
          <LayerUpdater layer={layer} />
          <ScaleControl position="bottomleft" imperial={false} />
          {points.length > 0 && <FitBounds points={points} />}

          {visiblePoints.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lon]} icon={makeIcon(CATEGORIES[p.category].color)}>
              <Popup minWidth={180}>
                <div style={{ fontFamily: "system-ui,sans-serif", fontSize: 12 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>
                    {CATEGORIES[p.category].emoji} {CATEGORIES[p.category].label}
                  </p>
                  <p style={{ color: "#555", marginBottom: 2 }}>👤 {p.cliente}</p>
                  <p style={{ color: "#888", fontSize: 11, fontFamily: "monospace", marginBottom: 2 }}>{p.plusCode}</p>
                  {p.data && <p style={{ color: "#888", fontSize: 11 }}>📅 {p.data}</p>}
                  {p.extra && <p style={{ color: "#888", fontSize: 11, marginTop: 2 }}>📝 {p.extra}</p>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
