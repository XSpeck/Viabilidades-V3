"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DemandaRede, PrioridadeDemanda } from "@/types";

const REFERENCE_LAT = -28.6775;
const REFERENCE_LON = -49.3696;

const TECNICO_COLOR: Record<string, string> = {
  Eduardo: "#3b82f6",
  Ulisses: "#16a34a",
  Zilli:   "#ea580c",
  Andre:   "#7c3aed",
};

const PRIORIDADE_SIZE: Record<PrioridadeDemanda, number> = {
  baixa: 10, media: 13, alta: 16, urgente: 20,
};

const PRIORIDADE_LABEL: Record<PrioridadeDemanda, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta", agendada: "Agendada", em_andamento: "Em andamento", concluida: "Concluída",
};

// ─── Helpers ──────────────────────────────────────────────────────
function decode(local: string): { lat: number; lon: number } | null {
  try {
    // lat,lon direto
    const m = local.trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
    // Plus Code
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenLocationCode } = require("open-location-code");
    const olc   = new OpenLocationCode();
    const upper = local.trim().toUpperCase();
    const full  = olc.isFull(upper) ? upper : olc.recoverNearest(upper, REFERENCE_LAT, REFERENCE_LON);
    const d     = olc.decode(full);
    return { lat: (d.latitudeLo + d.latitudeHi) / 2, lon: (d.longitudeLo + d.longitudeHi) / 2 };
  } catch { return null; }
}

function makeIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

interface Pin { demanda: DemandaRede; lat: number; lon: number; }

function FitBounds({ pins }: { pins: Pin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) { map.setView([pins[0].lat, pins[0].lon], 15); return; }
    map.fitBounds(
      L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])),
      { padding: [40, 40] },
    );
  }, [pins, map]);
  return null;
}

// ─── Componente principal ─────────────────────────────────────────
export default function DemandasMap({ demandas }: { demandas: DemandaRede[] }) {
  const [satellite, setSatellite]   = useState(false);
  const [hidden, setHidden]         = useState<Set<string>>(new Set());

  const allPins: Pin[] = demandas
    .filter((d) => !!d.local)
    .flatMap((d) => {
      const geo = decode(d.local!);
      return geo ? [{ demanda: d, ...geo }] : [];
    });

  const semLocal   = demandas.filter((d) => !d.local).length;
  const visible    = allPins.filter((p) => p.demanda.tecnicos.some((t) => !hidden.has(t)));
  const tecnicosPresentes = Array.from(new Set(demandas.flatMap((d) => d.tecnicos))).sort();

  function toggle(tec: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(tec) ? next.delete(tec) : next.add(tec);
      return next;
    });
  }

  return (
    <div className="space-y-3">

      {/* Legenda / filtro por técnico */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap gap-2 flex-1">
          {tecnicosPresentes.map((tec) => {
            const count = allPins.filter((p) => p.demanda.tecnicos.includes(tec)).length;
            const off   = hidden.has(tec);
            return (
              <button key={tec} onClick={() => toggle(tec)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  off ? "opacity-40 bg-gray-50 border-gray-200 text-gray-400"
                      : "bg-white border-gray-300 text-gray-700 shadow-sm hover:shadow-md"
                }`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: TECNICO_COLOR[tec] ?? "#999" }} />
                {tec}
                <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legenda de tamanho + toggle satélite */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400 hidden sm:flex items-center gap-2">
            {(["baixa", "media", "alta", "urgente"] as PrioridadeDemanda[]).map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="rounded-full bg-gray-400 inline-block"
                  style={{ width: PRIORIDADE_SIZE[p], height: PRIORIDADE_SIZE[p] }} />
                <span className="capitalize">{p}</span>
              </span>
            ))}
          </span>
          <button onClick={() => setSatellite((s) => !s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              satellite ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}>
            {satellite ? "🗺️ Mapa" : "🛰️ Satélite"}
          </button>
        </div>
      </div>

      {/* Aviso demandas sem localização */}
      {semLocal > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ {semLocal} demanda(s) sem localização cadastrada não aparecem no mapa.
        </p>
      )}

      {/* Estado vazio */}
      {allPins.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📍</p>
          <p className="text-sm">Nenhuma demanda com localização cadastrada.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border shadow-sm" style={{ height: 500 }}>
          <MapContainer
            center={[REFERENCE_LAT, REFERENCE_LON]}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            zoomControl>

            {satellite ? (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Esri World Imagery"
              />
            ) : (
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
              />
            )}

            <FitBounds pins={visible} />

            {visible.map((p) => {
              const color = TECNICO_COLOR[p.demanda.tecnicos[0]] ?? "#666";
              const size  = PRIORIDADE_SIZE[p.demanda.prioridade];
              return (
                <Marker key={p.demanda.id} position={[p.lat, p.lon]} icon={makeIcon(color, size)}>
                  <Popup>
                    <div style={{ minWidth: 190, fontFamily: "inherit" }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{p.demanda.tipo}</p>
                      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>{p.demanda.descricao}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: color, display: "inline-block", flexShrink: 0,
                        }} />
                        <strong style={{ fontSize: 13 }}>{p.demanda.tecnicos.join(", ")}</strong>
                      </div>
                      {p.demanda.bairro && (
                        <p style={{ fontSize: 12, marginBottom: 2 }}>
                          📍 <strong>{p.demanda.bairro}</strong>
                        </p>
                      )}
                      <p style={{ fontSize: 12, marginBottom: 2 }}>
                        Prioridade: <strong>{PRIORIDADE_LABEL[p.demanda.prioridade]}</strong>
                      </p>
                      <p style={{ fontSize: 12, marginBottom: 2 }}>
                        Status: <strong>{STATUS_LABEL[p.demanda.status] ?? p.demanda.status}</strong>
                      </p>
                      {p.demanda.data_agendamento && (
                        <p style={{ fontSize: 12 }}>
                          Agendado: <strong>
                            {new Date(p.demanda.data_agendamento + "T12:00:00").toLocaleDateString("pt-BR")}
                            {" — "}{p.demanda.periodo_agendamento}
                          </strong>
                        </p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
