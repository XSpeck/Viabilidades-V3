"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMapEvents, ScaleControl, useMap } from "react-leaflet";
import { CheckCircle, X, Search, Loader2 } from "lucide-react";

interface Props {
  onConfirm: (plusCode: string) => void;
  onClose: () => void;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// =====================
// Ícone do marcador
// =====================
function selectedIcon() {
  return L.divIcon({
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="50" viewBox="0 0 40 55">
        <filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.4"/></filter>
        <g filter="url(#s)">
          <path d="M20 2C10.6 2 3 9.6 3 19c0 12.5 17 33 17 33s17-20.5 17-33C37 9.6 29.4 2 20 2z" fill="#4f46e5"/>
          <circle cx="20" cy="19" r="10" fill="white" opacity="0.95"/>
          <text x="20" y="24" text-anchor="middle" font-size="14" font-family="system-ui">📍</text>
        </g>
      </svg>`,
    className: "",
    iconSize: [36, 50],
    iconAnchor: [18, 50],
    popupAnchor: [0, -50],
  });
}

// =====================
// Converte coords → Plus Code
// =====================
async function coordsToPlusCode(lat: number, lon: number): Promise<string> {
  const { OpenLocationCode } = await import("open-location-code");
  const olc = new OpenLocationCode();
  return olc.encode(lat, lon, 10);
}

// =====================
// Busca Nominatim (OpenStreetMap)
// =====================
// Bounding box de Criciúma e região (bounded=0 = prioriza mas não filtra)
const CRICIUMIA_VIEWBOX = "-49.50,-28.55,-49.15,-28.85";

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "6",
    "accept-language": "pt-BR,pt",
    viewbox: CRICIUMIA_VIEWBOX,
    bounded: "0",
    countrycodes: "br",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "ViabilidadeV3/1.0" },
  });
  return res.json();
}

// =====================
// Voa para uma posição
// =====================
function FlyTo({ coords }: { coords: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 17, { duration: 1.2 });
  }, [coords, map]);
  return null;
}

// =====================
// Captura cliques no mapa
// =====================
function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

// =====================
// Componente principal
// =====================
export default function LocationPicker({ onConfirm, onClose }: Props) {
  const [marker, setMarker] = useState<{ lat: number; lon: number } | null>(null);
  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  // Busca de endereço
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce da busca
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) { setResults([]); setShowResults(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchNominatim(query);
        setResults(data);
        setShowResults(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  const handlePick = useCallback(async (lat: number, lon: number) => {
    setMarker({ lat, lon });
    setShowResults(false);
    setConverting(true);
    try {
      const code = await coordsToPlusCode(lat, lon);
      setPlusCode(code);
    } catch {
      setPlusCode(`${lat.toFixed(6)},${lon.toFixed(6)}`);
    } finally {
      setConverting(false);
    }
  }, []);

  function handleSelectResult(r: NominatimResult) {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    setQuery(r.display_name.split(",").slice(0, 3).join(","));
    setShowResults(false);
    setFlyTo([lat, lon]);
    handlePick(lat, lon);
  }

  function handleConfirm() {
    if (plusCode) onConfirm(plusCode);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      zIndex: 9999, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "white", borderRadius: 16, overflow: "hidden",
        width: "100%", maxWidth: 920, display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        height: "92vh", maxHeight: 720,
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "#4f46e5",
        }}>
          <div>
            <p style={{ color: "white", fontWeight: 700, fontSize: 15, margin: 0 }}>
              📍 Selecionar Localização no Mapa
            </p>
            <p style={{ color: "#c7d2fe", fontSize: 12, margin: 0 }}>
              Busque um endereço ou clique diretamente no mapa
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
            color: "white", cursor: "pointer", padding: "6px 10px",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Barra de busca */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", position: "relative", background: "white" }}>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: "#9ca3af", pointerEvents: "none",
            }} />
            {searching && <Loader2 size={16} style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              color: "#9ca3af", animation: "spin 1s linear infinite",
            }} />}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Buscar endereço, rua, bairro, cidade..."
              style={{
                width: "100%", padding: "9px 40px", border: "2px solid #e5e7eb",
                borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
                fontFamily: "system-ui,sans-serif",
              }}
              onKeyDown={(e) => e.key === "Escape" && setShowResults(false)}
            />
          </div>

          {/* Dropdown de resultados */}
          {showResults && results.length > 0 && (
            <div style={{
              position: "absolute", left: 12, right: 12, top: "calc(100% - 2px)",
              background: "white", border: "1px solid #e5e7eb", borderRadius: "0 0 10px 10px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10000,
              maxHeight: 260, overflowY: "auto",
            }}>
              {results.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => handleSelectResult(r)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    width: "100%", padding: "10px 14px", border: "none",
                    background: "none", cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid #f3f4f6", fontFamily: "system-ui,sans-serif",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f3ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>📍</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {r.display_name.split(",")[0]}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.display_name.split(",").slice(1).join(",").trim()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mapa — flex: 1 com minHeight: 0 para encolher corretamente */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", cursor: "crosshair", overflow: "hidden" }}>
          <MapContainer
            center={[-28.6775, -49.3696]}
            zoom={14}
            maxZoom={18}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            scrollWheelZoom
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="© Esri, Maxar"
              maxZoom={18}
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
              opacity={0.7}
            />
            <ScaleControl position="bottomleft" imperial={false} />
            <FlyTo coords={flyTo} />
            <ClickHandler onPick={handlePick} />

            {marker && (
              <Marker position={[marker.lat, marker.lon]} icon={selectedIcon()} />
            )}
          </MapContainer>

          {!marker && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.65)", color: "white",
              borderRadius: 10, padding: "10px 18px", fontSize: 14,
              fontWeight: 600, pointerEvents: "none", zIndex: 1000,
              fontFamily: "system-ui,sans-serif", whiteSpace: "nowrap",
            }}>
              👆 Busque um endereço ou clique no mapa
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, background: "#f9fafb",
        }}>
          <div style={{ flex: 1 }}>
            {converting && (
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Convertendo coordenadas...</p>
            )}
            {plusCode && !converting && (
              <div>
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Plus Code selecionado:</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#4f46e5", margin: 0, fontFamily: "monospace" }}>
                  {plusCode}
                </p>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
                  {marker?.lat.toFixed(6)}, {marker?.lon.toFixed(6)}
                </p>
              </div>
            )}
            {!marker && !converting && (
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Nenhum ponto selecionado</p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{
              padding: "8px 16px", border: "1px solid #d1d5db",
              borderRadius: 8, background: "white", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "#374151",
            }}>
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!plusCode || converting}
              style={{
                padding: "8px 16px", border: "none", borderRadius: 8,
                background: plusCode && !converting ? "#4f46e5" : "#e5e7eb",
                cursor: plusCode && !converting ? "pointer" : "not-allowed",
                fontSize: 13, fontWeight: 700, color: "white",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <CheckCircle size={15} />
              Usar esta localização
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
