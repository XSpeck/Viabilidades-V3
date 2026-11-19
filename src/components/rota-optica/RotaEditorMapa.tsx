"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import type { TipoElementoRota, TrechoCabo } from "@/lib/rotaOptica";
import { iconeSvg } from "./IconesRede";

export type ModoMapa = "adicionar" | "posicionar" | "tracar";

export interface PontoEditor {
  nome: string;
  tipo: TipoElementoRota;
  lat?: number;
  lon?: number;
  /** Curvas do cabo (postes) no trecho que chega neste elemento */
  vertices: { lat: number; lon: number }[];
}

interface Props {
  pontos: PontoEditor[];
  /** Traçado vindo do KML (rotas do GeoGrid): só exibido */
  trechosFixos: TrechoCabo[];
  selecionado: number | null;
  modo: ModoMapa;
  centroPadrao?: [number, number];
  onSelect: (i: number) => void;
  onClicarMapa: (lat: number, lon: number) => void;
  onMoverElemento: (i: number, lat: number, lon: number) => void;
  onMoverVertice: (i: number, k: number, lat: number, lon: number) => void;
  onRemoverVertice: (i: number, k: number) => void;
}

/** Marcador do mapa: ícone do tipo, com número da ordem e destaque quando selecionado. */
function marcador(tipo: TipoElementoRota, numero: number, ativo: boolean) {
  const tam = ativo ? 40 : 32;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="position:relative;width:${tam}px;height:${tam}px;${ativo ? "filter:drop-shadow(0 0 6px #facc15)" : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"}">${iconeSvg(tipo, tam)}<span style="position:absolute;right:-6px;top:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;background:${ativo ? "#facc15" : "#fff"};color:#0f172a;border:1.5px solid #0f172a;font:700 10px/13px system-ui,sans-serif;text-align:center">${numero}</span></div>`,
  });
}

function Cliques({ onClicar }: { onClicar: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Enquadra a rota uma vez, quando aparecem os primeiros pontos. */
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || pontos.length === 0) return;
    if (pontos.length === 1) map.setView(pontos[0], 17);
    else map.fitBounds(L.latLngBounds(pontos), { padding: [30, 30] });
    feito.current = true;
  }, [map, pontos]);
  return null;
}

function Centralizar({ alvo }: { alvo: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo && !map.getBounds().contains(alvo)) map.panTo(alvo);
  }, [map, alvo]);
  return null;
}

/** Mapa do editor de rota: clicar posiciona elementos e traça o cabo; marcadores arrastáveis. */
export default function RotaEditorMapa({
  pontos, trechosFixos, selecionado, modo, centroPadrao, onSelect, onClicarMapa, onMoverElemento, onMoverVertice, onRemoverVertice,
}: Props) {
  const [satelite, setSatelite] = useState(false);

  const comPos = pontos.map((p, i) => ({ p, i })).filter(({ p }) => p.lat !== undefined && p.lon !== undefined);
  const todos = useMemo<[number, number][]>(
    () => [
      ...pontos.filter((p) => p.lat !== undefined && p.lon !== undefined).map((p) => [p.lat!, p.lon!] as [number, number]),
      ...trechosFixos.flatMap((t) => t.pontos.map((q) => [q.lat, q.lon] as [number, number])),
    ],
    [pontos, trechosFixos]
  );

  // Trechos desenhados: elemento anterior com posição → curvas → este elemento
  const trechos: { i: number; pts: [number, number][] }[] = [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    if (a.lat === undefined || a.lon === undefined) continue;
    const pts: [number, number][] = [[a.lat, a.lon], ...b.vertices.map((v) => [v.lat, v.lon] as [number, number])];
    if (b.lat !== undefined && b.lon !== undefined) pts.push([b.lat, b.lon]);
    if (pts.length > 1) trechos.push({ i, pts });
  }

  const sel = selecionado !== null ? pontos[selecionado] : null;
  const alvo: [number, number] | null = sel?.lat !== undefined && sel?.lon !== undefined ? [sel.lat, sel.lon] : null;
  const centro: [number, number] = todos[0] ?? centroPadrao ?? [-28.68, -49.37];

  return (
    <div className="relative">
      <MapContainer
        center={centro}
        zoom={todos.length ? 16 : 14}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        className={`h-[520px] w-full rounded-xl z-0 ${modo === "tracar" || modo === "adicionar" || selecionado !== null ? "cursor-crosshair" : ""}`}
      >
        {satelite ? (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri"
            maxZoom={20}
            maxNativeZoom={19}
          />
        ) : (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            maxZoom={20}
            maxNativeZoom={19}
          />
        )}
        <ZoomComCtrl />
        <Cliques onClicar={onClicarMapa} />
        <Enquadrar pontos={todos} />
        <Centralizar alvo={alvo} />

        {trechosFixos.map((t, k) => (
          <Polyline key={`fc${k}`} positions={t.pontos.map((q) => [q.lat, q.lon] as [number, number])} pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.7 }} />
        ))}
        {trechosFixos.map((t, k) => (
          <Polyline key={`f${k}`} positions={t.pontos.map((q) => [q.lat, q.lon] as [number, number])} pathOptions={{ color: t.cor ?? "#2563eb", weight: 5, opacity: 0.8 }}>
            <Tooltip sticky>{t.nome}</Tooltip>
          </Polyline>
        ))}

        {trechosFixos.length === 0 &&
          trechos.map(({ i, pts }) => (
            <Polyline
              key={`t${i}-${pts.length}`}
              positions={pts}
              pathOptions={{
                color: i === selecionado ? "#facc15" : "#2563eb",
                weight: i === selecionado ? 6 : 4,
                dashArray: pontos[i].lat === undefined ? "6 6" : undefined,
              }}
            />
          ))}

        {/* Curvas do cabo: arrastar move, clique remove */}
        {trechosFixos.length === 0 &&
          pontos.flatMap((p, i) =>
            p.vertices.map((v, k) =>
              i === selecionado ? (
                <Marker
                  key={`v${i}-${k}`}
                  position={[v.lat, v.lon]}
                  draggable
                  icon={L.divIcon({
                    className: "",
                    iconSize: [12, 12],
                    iconAnchor: [6, 6],
                    html: '<div style="width:12px;height:12px;border-radius:9999px;background:#fff;border:2px solid #1d4ed8"></div>',
                  })}
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      onMoverVertice(i, k, ll.lat, ll.lng);
                    },
                    click: () => onRemoverVertice(i, k),
                  }}
                >
                  <Tooltip direction="top">Curva/poste · clique para remover</Tooltip>
                </Marker>
              ) : (
                <CircleMarker key={`v${i}-${k}`} center={[v.lat, v.lon]} radius={3} pathOptions={{ color: "#1d4ed8", fillColor: "#fff", fillOpacity: 1, weight: 2 }} />
              )
            )
          )}

        {comPos.map(({ p, i }) => (
          <Marker
            key={`e${i}`}
            position={[p.lat!, p.lon!]}
            draggable
            icon={marcador(p.tipo, i + 1, i === selecionado)}
            zIndexOffset={i === selecionado ? 1000 : 0}
            eventHandlers={{
              click: () => onSelect(i),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onMoverElemento(i, ll.lat, ll.lng);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -16]}>
              {i + 1}. {p.nome || "(sem nome)"}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <button
        type="button"
        onClick={() => setSatelite((v) => !v)}
        className="absolute top-2 right-2 z-[500] bg-white/95 border border-gray-300 rounded-md px-2 py-1 text-xs font-medium shadow hover:bg-white"
      >
        {satelite ? "Mapa de ruas" : "Satélite"}
      </button>
    </div>
  );
}
