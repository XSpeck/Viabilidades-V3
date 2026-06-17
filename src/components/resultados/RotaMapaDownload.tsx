"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import { plusCodeToCoords } from "@/lib/pluscode";

// ── Captura instância do mapa ──────────────────────────────────────
function MapReady({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

// ── Tiles com crossOrigin para permitir canvas ──────────────────────
function TilesLayer() {
  const map = useMap();
  const ref = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    ref.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
        crossOrigin: "anonymous",
      }
    ).addTo(map);
    return () => { if (ref.current) map.removeLayer(ref.current); };
  }, [map]);
  return null;
}

// ── FitBounds ──────────────────────────────────────────────────────
function FitRoute({ points }: { points: L.LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 16); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

// ── Componente principal ───────────────────────────────────────────
interface Props {
  plusCodeCliente: string;
  localizacaoCaixa?: string;
  trajetoCabo: { lat: number; lon: number }[];
  viabilizacaoId: string;
  nomeCliente?: string;
}

export default function RotaMapaDownload({
  plusCodeCliente,
  localizacaoCaixa,
  trajetoCabo,
  viabilizacaoId,
  nomeCliente,
}: Props) {
  const [open, setOpen] = useState(false);
  const [clientLL, setClientLL] = useState<L.LatLng | null>(null);
  const [ctoLL, setCtoLL] = useState<L.LatLng | null>(null);
  const [routeLL, setRouteLL] = useState<L.LatLng[]>([]);
  const [baixando, setBaixando] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const onMapReady = useCallback((m: L.Map) => { mapRef.current = m; }, []);

  useEffect(() => {
    plusCodeToCoords(plusCodeCliente).then(c => setClientLL(L.latLng(c.lat, c.lon))).catch(() => {});
    if (localizacaoCaixa) plusCodeToCoords(localizacaoCaixa).then(c => setCtoLL(L.latLng(c.lat, c.lon))).catch(() => {});
    setRouteLL(trajetoCabo.map(p => L.latLng(p.lat, p.lon)));
  }, [plusCodeCliente, localizacaoCaixa, trajetoCabo]);

  const routePositions = routeLL.map(ll => [ll.lat, ll.lng] as [number, number]);

  const allPoints = [
    ...(clientLL ? [clientLL] : []),
    ...(ctoLL ? [ctoLL] : []),
    ...routeLL,
  ];

  async function handleBaixar() {
    const map = mapRef.current;
    if (!map) return;
    setBaixando(true);
    try {
      const size = map.getSize();
      const canvas = document.createElement("canvas");
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext("2d")!;

      ctx.fillStyle = "#b8d4e8";
      ctx.fillRect(0, 0, size.x, size.y);

      const containerRect = map.getContainer().getBoundingClientRect();
      const tiles = map.getContainer().querySelectorAll(".leaflet-tile-loaded") as NodeListOf<HTMLImageElement>;
      tiles.forEach(tile => {
        const r = tile.getBoundingClientRect();
        try {
          ctx.drawImage(tile,
            Math.round(r.left - containerRect.left),
            Math.round(r.top - containerRect.top),
            Math.round(r.width),
            Math.round(r.height),
          );
        } catch { /* tile tachada */ }
      });

      if (routeLL.length >= 2) {
        const pts = routeLL.map(ll => map.latLngToContainerPoint(ll));
        const stroke = (color: string, width: number, alpha: number) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.globalAlpha = alpha;
          ctx.lineCap = ctx.lineJoin = "round";
          pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.globalAlpha = 1;
        };
        stroke("white", 8, 0.5);
        stroke("#7c3aed", 5, 0.95);
      }

      const drawPin = (ll: L.LatLng, fill: string, label: string) => {
        const p = map.latLngToContainerPoint(ll);
        ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = "white"; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = `bold ${label.length > 1 ? 9 : 12}px Arial,sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, p.x, p.y);
      };

      if (clientLL) drawPin(clientLL, "#4f46e5", "C");
      if (ctoLL) drawPin(ctoLL, "#16a34a", "CTO");

      const nome = (nomeCliente ?? viabilizacaoId).replace(/\s+/g, "_");
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mapa-${nome}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-3 py-2 border border-purple-200 rounded-lg text-sm font-medium text-purple-700 hover:bg-purple-50 transition-colors"
      >
        <span>🗺️ Mapa da rota do cabo</span>
        <span className="text-gray-400 text-xs">{open ? "▲ Minimizar" : "▼ Ver mapa"}</span>
      </button>

      {open && (
        <>
          <div style={{ height: 260, borderRadius: 10, overflow: "hidden", border: "1px solid #e9d5ff" }}>
            <MapContainer
              center={clientLL ?? L.latLng(-28.6775, -49.3696)}
              zoom={15}
              style={{ height: "100%", width: "100%" }}
              zoomControl={false}
              scrollWheelZoom={false}
            >
              <MapReady onReady={onMapReady} />
              <TilesLayer />
              {allPoints.length > 0 && <FitRoute points={allPoints} />}

              {/* Rota desenhada — renderização declarativa garante exibição correta */}
              {routePositions.length >= 2 && (
                <>
                  <Polyline
                    positions={routePositions}
                    pathOptions={{ color: "white", weight: 8, opacity: 0.5 }}
                  />
                  <Polyline
                    positions={routePositions}
                    pathOptions={{ color: "#7c3aed", weight: 5, opacity: 0.9 }}
                  />
                </>
              )}

              {/* Marcadores */}
              {clientLL && (
                <CircleMarker
                  center={clientLL}
                  radius={10}
                  pathOptions={{ color: "white", weight: 3, fillColor: "#4f46e5", fillOpacity: 1 }}
                />
              )}
              {ctoLL && (
                <CircleMarker
                  center={ctoLL}
                  radius={10}
                  pathOptions={{ color: "white", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }}
                />
              )}
            </MapContainer>
          </div>
          <button
            onClick={handleBaixar}
            disabled={baixando || allPoints.length === 0}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {baixando ? "Capturando..." : "📸 Baixar imagem do mapa"}
          </button>
        </>
      )}
    </div>
  );
}
