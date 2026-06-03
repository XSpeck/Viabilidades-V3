"use client";

import { useState, useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, useMapEvents, ScaleControl } from "react-leaflet";
import { CheckCircle, X } from "lucide-react";

interface Props {
  onConfirm: (plusCode: string) => void;
  onClose: () => void;
}

// Ícone do marcador selecionado
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

// Converte coordenadas para Plus Code (síncrono via OLC)
async function coordsToPlusCode(lat: number, lon: number): Promise<string> {
  const { OpenLocationCode } = await import("open-location-code");
  const olc = new OpenLocationCode();
  return olc.encode(lat, lon, 10); // precisão 10 = ~14x14m
}

// Captura cliques no mapa
function ClickHandler({
  onPick,
}: {
  onPick: (lat: number, lon: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ onConfirm, onClose }: Props) {
  const [marker, setMarker] = useState<{ lat: number; lon: number } | null>(null);
  const [plusCode, setPlusCode] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const handlePick = useCallback(async (lat: number, lon: number) => {
    setMarker({ lat, lon });
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

  function handleConfirm() {
    if (plusCode) onConfirm(plusCode);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 9999, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        background: "white", borderRadius: 16, overflow: "hidden",
        width: "100%", maxWidth: 900, display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid #e5e7eb",
          background: "#4f46e5",
        }}>
          <div>
            <p style={{ color: "white", fontWeight: 700, fontSize: 15, margin: 0 }}>
              📍 Selecionar Localização no Mapa
            </p>
            <p style={{ color: "#c7d2fe", fontSize: 12, margin: 0 }}>
              Clique no mapa para marcar o ponto
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
              color: "white", cursor: "pointer", padding: "6px 10px", fontSize: 16,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mapa */}
        <div style={{ flex: 1, minHeight: 400, position: "relative", cursor: "crosshair" }}>
          <MapContainer
            center={[-28.6775, -49.3696]}
            zoom={14}
            style={{ height: "100%", minHeight: 400, width: "100%" }}
            zoomControl={false}
            scrollWheelZoom
          >
            {/* Satélite por padrão */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="© Esri, Maxar"
              maxZoom={20}
            />
            {/* Overlay de ruas/nomes */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
              maxZoom={20}
              opacity={0.7}
            />
            <ScaleControl position="bottomleft" imperial={false} />
            <ClickHandler onPick={handlePick} />

            {marker && (
              <Marker
                position={[marker.lat, marker.lon]}
                icon={selectedIcon()}
              />
            )}
          </MapContainer>

          {/* Instrução flutuante */}
          {!marker && (
            <div style={{
              position: "absolute", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "rgba(0,0,0,0.65)", color: "white",
              borderRadius: 10, padding: "10px 18px", fontSize: 14,
              fontWeight: 600, pointerEvents: "none", zIndex: 1000,
              fontFamily: "system-ui,sans-serif", whiteSpace: "nowrap",
            }}>
              👆 Clique no ponto desejado
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
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Convertendo coordenadas...
              </p>
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
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
                Nenhum ponto selecionado
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "8px 16px", border: "1px solid #d1d5db",
                borderRadius: 8, background: "white", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "#374151",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!plusCode || converting}
              style={{
                padding: "8px 16px", border: "none",
                borderRadius: 8,
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
