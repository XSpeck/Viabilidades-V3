"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, ScaleControl, useMapEvents } from "react-leaflet";
import { haversineDistance, formatDistance } from "@/lib/ctos";
import type { CtoWithRoute } from "@/lib/ctos";
import { getRedes, EMPRESAS } from "@/lib/redes";
import type { LinhaRede } from "@/lib/redes";
import { salvarTrajeto } from "@/lib/firestore";

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

const MAP_MAX_ZOOM = 18;

function MapInstanceCapture({ onReady }: { onReady: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function LayerUpdater({ layer }: { layer: MapLayer }) {
  const map = useMap();
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const overlayTileRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (baseTileRef.current) map.removeLayer(baseTileRef.current);
    if (overlayTileRef.current) map.removeLayer(overlayTileRef.current);

    baseTileRef.current = L.tileLayer(LAYERS[layer].url, {
      attribution: LAYERS[layer].attribution,
      maxZoom: MAP_MAX_ZOOM,
      crossOrigin: "anonymous",
    }).addTo(map);

    overlayTileRef.current = LAYERS[layer].overlay
      ? L.tileLayer(LAYERS[layer].overlay!, { maxZoom: MAP_MAX_ZOOM, opacity: 0.85, crossOrigin: "anonymous" }).addTo(map)
      : null;

    map.setMaxZoom(MAP_MAX_ZOOM);
  }, [layer, map]);

  return null;
}

function ResizeHandler({ expanded }: { expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
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
  onConfirm?: (name: string) => void;
  onExpandChange?: (expanded: boolean) => void;
  viabilizacaoId?: string;
  trajetoExistente?: { lat: number; lon: number }[];
  onTrajetoSalvo?: (link: string) => void;
  onContinuar?: () => void;
  autoStartDraw?: boolean;
  referenceRouteOnly?: boolean;
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

function drawPointIcon(index: number) {
  const label = index === 0 ? "A" : String(index + 1);
  return L.divIcon({
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:#7c3aed;border:3px solid white;
      box-shadow:0 2px 4px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:700;color:white;
      font-family:system-ui,sans-serif;
    ">${label}</div>`,
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// =====================
// Handler de cliques para medição
// =====================
function MeasureHandler({
  active,
  onAddPoint,
}: {
  active: boolean;
  points: [number, number][];
  onAddPoint: (p: [number, number]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (active) map.getContainer().style.cursor = "crosshair";
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
// Handler de cliques para desenho
// =====================
function DrawHandler({
  active,
  onAddPoint,
}: {
  active: boolean;
  onAddPoint: (p: [number, number]) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (active) map.getContainer().style.cursor = "crosshair";
    else map.getContainer().style.cursor = "";
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
export default function CtoMap({
  clientLat, clientLon, ctos, selectedName, onSelect, onConfirm, onExpandChange,
  viabilizacaoId, trajetoExistente, onTrajetoSalvo, onContinuar, autoStartDraw, referenceRouteOnly,
}: Props) {
  const selected = ctos.find((c) => c.name === selectedName);
  const clientIcon = createClientIcon();

  const [activeLayer, setActiveLayer] = useState<MapLayer>("map");

  // Redes de distribuidoras
  const [redes, setRedes] = useState<LinhaRede[]>([]);
  const [redesVisiveis, setRedesVisiveis] = useState<Record<string, boolean>>({});
  const [loadingRedes, setLoadingRedes] = useState(false);
  const [redesCarregadas, setRedesCarregadas] = useState(false);
  const [redesMinimizado, setRedesMinimizado] = useState(false);

  async function carregarRedes() {
    if (redesCarregadas) return;
    setLoadingRedes(true);
    try {
      const data = await getRedes();
      setRedes(data);
      const vis: Record<string, boolean> = {};
      data.forEach((r) => { vis[r.empresa] = false; });
      setRedesVisiveis(vis);
      setRedesCarregadas(true);
    } finally {
      setLoadingRedes(false);
    }
  }

  function toggleRede(empresa: string) {
    setRedesVisiveis((prev) => ({ ...prev, [empresa]: !prev[empresa] }));
  }

  // Expandir mapa
  const [expanded, setExpanded] = useState(false);
  const mapHeight = expanded ? "580px" : "400px";

  // Ferramenta de medição
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  const addMeasurePoint = useCallback((p: [number, number]) => {
    setMeasurePoints((prev) => [...prev, p]);
  }, []);

  // Ferramenta de desenho de rota
  const [drawing, setDrawing] = useState(false);
  useEffect(() => { if (autoStartDraw) setDrawing(true); }, [autoStartDraw]);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [salvandoTrajeto, setSalvandoTrajeto] = useState(false);
  const [trajetoLink, setTrajetoLink] = useState<string | null>(null);
  const [salvandoImagem, setSalvandoImagem] = useState(false);
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const onMapReady = useCallback((m: L.Map) => { leafletMapRef.current = m; }, []);

  const addDrawPoint = useCallback((p: [number, number]) => {
    setDrawPoints((prev) => [...prev, p]);
  }, []);

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
  }

  function handleConfirmFromPopup(name: string) {
    onSelect(name);
    if (expanded) {
      setExpanded(false);
      onExpandChange?.(false);
      setTimeout(() => onConfirm?.(name), 350);
    } else {
      onConfirm?.(name);
    }
  }

  function toggleMeasure() {
    if (measuring) {
      setMeasuring(false);
      setMeasurePoints([]);
    } else {
      setMeasuring(true);
      setMeasurePoints([]);
      if (drawing) { setDrawing(false); setDrawPoints([]); }
    }
  }

  function toggleDraw() {
    if (drawing) {
      setDrawing(false);
    } else {
      setDrawing(true);
      if (measuring) { setMeasuring(false); setMeasurePoints([]); }
    }
  }

  function limparDesenho() {
    setDrawPoints([]);
  }

  async function handleSalvarTrajeto() {
    if (!viabilizacaoId || drawPoints.length < 2) return;
    setSalvandoTrajeto(true);
    try {
      await salvarTrajeto(viabilizacaoId, drawPoints);
      const link = `${window.location.origin}/api/rota/${viabilizacaoId}`;
      setTrajetoLink(link);
      setDrawing(false);
      onTrajetoSalvo?.(link);
    } catch (err) {
      console.error("[CtoMap] Erro ao salvar trajeto:", err);
      alert("Erro ao salvar rota. Tente novamente.");
    } finally {
      setSalvandoTrajeto(false);
    }
  }

  async function handleDownloadImagem() {
    const map = leafletMapRef.current;
    if (!map) return;
    setSalvandoImagem(true);
    try {
      const size = map.getSize();
      const canvas = document.createElement("canvas");
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext("2d")!;

      // Fundo neutro caso alguma tile não carregue
      ctx.fillStyle = "#b8d4e8";
      ctx.fillRect(0, 0, size.x, size.y);

      // Desenha as tiles já carregadas (crossOrigin: anonymous foi setado no LayerUpdater)
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
        } catch { /* tile tachada — ignora */ }
      });

      // Rota do cabo
      const route: L.LatLng[] = (trajetoExistente?.length
        ? trajetoExistente.map(p => L.latLng(p.lat, p.lon))
        : drawPoints.map(p => L.latLng(p[0], p[1]))
      );

      if (route.length >= 2) {
        const pts = route.map(ll => map.latLngToContainerPoint(ll));
        const drawLine = (color: string, width: number, alpha: number) => {
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.globalAlpha = alpha;
          ctx.lineCap = ctx.lineJoin = "round";
          pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.globalAlpha = 1;
        };
        drawLine("white", 8, 0.5);
        drawLine("#7c3aed", 5, 0.95);
      }

      // Marcadores
      const drawMarker = (lat: number, lon: number, fill: string, label: string) => {
        const p = map.latLngToContainerPoint(L.latLng(lat, lon));
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

      drawMarker(clientLat, clientLon, "#4f46e5", "C");
      if (selected) drawMarker(selected.lat, selected.lon, "#16a34a", "CTO");

      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mapa-${viabilizacaoId ?? "rota"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (err) {
      console.error("[CtoMap] Erro ao capturar imagem:", err);
      alert("Não foi possível capturar a imagem. Tente um print manual.");
    } finally {
      setSalvandoImagem(false);
    }
  }

  // Distâncias acumuladas entre pontos de medição
  const measureSegments = measurePoints.slice(1).map((p, i) => {
    const prev = measurePoints[i];
    return haversineDistance(prev[0], prev[1], p[0], p[1]);
  });
  const totalMeasure = measureSegments.reduce((a, b) => a + b, 0);

  const canDraw = !!viabilizacaoId;

  return (
    <div ref={mapWrapperRef} style={{ position: "relative" }}>
      {/* Seletor de camadas — canto superior esquerdo */}
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 1000,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {/* Camadas */}
        <div style={{
          display: "flex", gap: 4, background: "white",
          borderRadius: 8, padding: 3, boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          border: "1px solid #e5e7eb",
        }}>
          {(Object.keys(LAYERS) as MapLayer[]).map((key) => (
            <button key={key} onClick={() => setActiveLayer(key)} title={LAYERS[key].label}
              style={{
                background: activeLayer === key ? "#4f46e5" : "transparent",
                color: activeLayer === key ? "white" : "#374151",
                border: "none", borderRadius: 6, padding: "4px 8px",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "system-ui,sans-serif", transition: "all 0.15s",
              }}>
              {LAYERS[key].emoji} {LAYERS[key].label}
            </button>
          ))}
        </div>

        {/* Painel de redes */}
        <div style={{
          background: "white", borderRadius: 8, padding: "6px 8px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)", border: "1px solid #e5e7eb",
          minWidth: 140,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
            <button
              onClick={carregarRedes}
              disabled={loadingRedes}
              style={{
                flex: 1, border: "none", background: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700, color: "#374151", padding: "2px 0",
                fontFamily: "system-ui,sans-serif", display: "flex", alignItems: "center", gap: 4,
                textAlign: "left",
              }}
            >
              <span>⚡ Redes</span>
              {loadingRedes
                ? <span style={{ fontSize: 10, color: "#9ca3af" }}>...</span>
                : !redesCarregadas
                ? <span style={{ fontSize: 10, color: "#4f46e5" }}>carregar</span>
                : null}
            </button>
            {redesCarregadas && (
              <button
                onClick={() => setRedesMinimizado((v) => !v)}
                title={redesMinimizado ? "Expandir" : "Minimizar"}
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  fontSize: 10, color: "#9ca3af", padding: "2px 4px", lineHeight: 1,
                  fontFamily: "system-ui,sans-serif",
                }}
              >
                {redesMinimizado ? "▼" : "▲"}
              </button>
            )}
          </div>

          {!redesMinimizado && (
            <>
              {redesCarregadas && redes.length === 0 && (
                <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 0" }}>Nenhuma rede importada</p>
              )}
              {redes.map((r) => (
                <label key={r.empresa} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  cursor: "pointer", padding: "2px 0", fontSize: 11,
                  fontFamily: "system-ui,sans-serif", color: "#374151",
                }}>
                  <input type="checkbox" checked={redesVisiveis[r.empresa] ?? false}
                    onChange={() => toggleRede(r.empresa)}
                    style={{ accentColor: r.cor, width: 12, height: 12 }} />
                  <div style={{ width: 12, height: 3, borderRadius: 2, background: r.cor, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 600 }}>
                    {EMPRESAS[r.empresa]?.label ?? r.empresa}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Botões — canto superior direito */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Expandir/recolher */}
        <button
          onClick={toggleExpand}
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

        {/* Régua */}
        <button
          onClick={toggleMeasure}
          title={measuring ? "Sair da medição" : "Medir distância"}
          style={{
            background: measuring ? "#f97316" : "white",
            color: measuring ? "white" : "#374151",
            border: "2px solid " + (measuring ? "#f97316" : "#d1d5db"),
            borderRadius: 8, padding: "6px 10px", fontSize: 18,
            cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.2)", lineHeight: 1,
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

        {/* Lápis de rota — só disponível quando viabilizacaoId é passado */}
        {canDraw && (
          <button
            onClick={toggleDraw}
            title={drawing ? "Sair do modo de desenho" : "Traçar rota do cabo"}
            style={{
              background: drawing ? "#7c3aed" : "white",
              color: drawing ? "white" : "#374151",
              border: "2px solid " + (drawing ? "#7c3aed" : "#d1d5db"),
              borderRadius: 8, padding: "6px 10px", fontSize: 18,
              cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.2)", lineHeight: 1,
            }}
          >
            ✏️
          </button>
        )}

        {drawing && drawPoints.length > 0 && (
          <button
            onClick={limparDesenho}
            title="Limpar desenho"
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

      {/* Painel de medição */}
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

      {/* Painel de desenho de rota */}
      {drawing && (
        <div style={{
          position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "white", borderRadius: 10,
          padding: "8px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          fontSize: 13, fontFamily: "system-ui,sans-serif",
          border: "2px solid #7c3aed", display: "flex", alignItems: "center", gap: 10,
          whiteSpace: "nowrap",
        }}>
          {drawPoints.length === 0 && (
            <span style={{ color: "#6b7280" }}>✏️ Clique no mapa para iniciar a rota do cabo</span>
          )}
          {drawPoints.length === 1 && (
            <span style={{ color: "#6b7280" }}>📍 Continue clicando para traçar o caminho</span>
          )}
          {drawPoints.length >= 2 && (
            <>
              <span style={{ color: "#7c3aed" }}>
                ✏️ <strong>{drawPoints.length} pontos</strong>
              </span>
              <button
                onClick={handleSalvarTrajeto}
                disabled={salvandoTrajeto}
                style={{
                  background: "#7c3aed", color: "white", border: "none",
                  borderRadius: 6, padding: "4px 12px", fontSize: 12,
                  fontWeight: 600, cursor: "pointer",
                  fontFamily: "system-ui,sans-serif",
                  opacity: salvandoTrajeto ? 0.6 : 1,
                }}
              >
                {salvandoTrajeto ? "Salvando..." : "✅ Finalizar Rota"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Painel de link salvo */}
      {trajetoLink && !drawing && (
        <div style={{
          position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "#f0fdf4", borderRadius: 10,
          padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          fontSize: 12, fontFamily: "system-ui,sans-serif",
          border: "2px solid #16a34a", display: "flex", alignItems: "center", gap: 8,
          whiteSpace: "nowrap",
        }}>
          <span style={{ color: "#15803d", fontWeight: 700 }}>✅ Rota finalizada!</span>
          {onContinuar && (
            <button
              disabled={salvandoImagem}
              onClick={async () => {
                await handleDownloadImagem();
                onContinuar();
              }}
              style={{
                background: salvandoImagem ? "#9ca3af" : "#16a34a", color: "white", border: "none",
                borderRadius: 6, padding: "5px 14px", fontSize: 12,
                fontWeight: 700, cursor: salvandoImagem ? "default" : "pointer",
                fontFamily: "system-ui,sans-serif",
              }}
            >
              {salvandoImagem ? "📸 Baixando..." : "📸 Baixar e Prosseguir →"}
            </button>
          )}
          <button
            onClick={() => setTrajetoLink(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#9ca3af", fontSize: 14, lineHeight: 1, padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

    <div style={{ height: mapHeight, transition: "height 0.3s ease", borderRadius: "12px", overflow: "hidden" }}>
    <MapContainer
      center={[clientLat, clientLon]}
      zoom={15}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      maxZoom={18}
      scrollWheelZoom
    >
      <MapInstanceCapture onReady={onMapReady} />
      <FitBounds clientLat={clientLat} clientLon={clientLon} ctos={ctos} />
      <ScaleControl position="bottomleft" imperial={false} />
      <LayerUpdater layer={activeLayer} />
      <ResizeHandler expanded={expanded} />
      <MeasureHandler active={measuring} points={measurePoints} onAddPoint={addMeasurePoint} />
      <DrawHandler active={drawing} onAddPoint={addDrawPoint} />

      {/* Linhas das redes de distribuidoras */}
      {redes.map((r) =>
        redesVisiveis[r.empresa] !== false
          ? r.linhas.map((linha, i) => (
              <Polyline
                key={`${r.empresa}-${i}`}
                positions={linha}
                pathOptions={{ color: r.cor, weight: 2.5, opacity: 0.75 }}
              />
            ))
          : null
      )}

      {/* Rota da CTO selecionada */}
      {selected?.route && (
        <Polyline
          positions={selected.route.geometry}
          pathOptions={{
            color: selected.route.isStraightLine ? "#f97316" : "#16a34a",
            weight: referenceRouteOnly ? 2 : 4,
            opacity: referenceRouteOnly ? 0.15 : 0.85,
            dashArray: referenceRouteOnly ? "6, 10" : (selected.route.isStraightLine ? "8, 6" : undefined),
          }}
        />
      )}

      {/* Trajeto existente salvo (roxo tracejado) */}
      {trajetoExistente && trajetoExistente.length >= 2 && !drawPoints.length && (
        <Polyline
          positions={trajetoExistente.map((p) => [p.lat, p.lon] as [number, number])}
          pathOptions={{ color: "#7c3aed", weight: 3, dashArray: "8, 5", opacity: 0.7 }}
        />
      )}

      {/* Trajeto sendo desenhado (roxo sólido) */}
      {drawPoints.length >= 2 && (
        <Polyline
          positions={drawPoints}
          pathOptions={{ color: "#7c3aed", weight: 4, opacity: 0.9 }}
        />
      )}

      {/* Pontos do desenho */}
      {drawPoints.map((p, i) => (
        <Marker
          key={`draw-${i}`}
          position={p}
          icon={drawPointIcon(i)}
          zIndexOffset={3500}
        />
      ))}

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
                  onClick={() => handleConfirmFromPopup(cto.name)}
                  style={{
                    width: "100%", background: "#16a34a", color: "white",
                    border: "none", borderRadius: 6, padding: "6px 0",
                    cursor: "pointer", fontWeight: 600, fontSize: 12,
                  }}
                >
                  ✅ Confirmar esta CTO
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Marcador do cliente */}
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

      {/* Marcadores de medição */}
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
    </div>
  );
}
