"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import type { TipoElementoRota, TrechoCabo } from "@/lib/rotaOptica";
import { iconeSvg } from "./IconesRede";

/** Ferramenta ativa: selecionar/mover, marcar poste do cabo, ou colocar um elemento do tipo escolhido */
export type Ferramenta = "selecionar" | "poste" | TipoElementoRota;

type Ponto = { lat: number; lon: number };

export interface PontoEditor {
  nome: string;
  tipo: TipoElementoRota;
  lat?: number;
  lon?: number;
  /** Curvas do cabo (postes) no trecho que chega neste elemento */
  vertices: Ponto[];
  /** Cor da fibra que chega (para pintar o trecho) */
  cor?: string;
}

interface Props {
  pontos: PontoEditor[];
  /** Traçado vindo do KML (rotas do GeoGrid): só exibido */
  trechosFixos: TrechoCabo[];
  selecionado: number | null;
  ferramenta: Ferramenta;
  /** Postes marcados antes de colocar o próximo elemento */
  pendentes: Ponto[];
  centroPadrao?: [number, number];
  onSelect: (i: number) => void;
  onClicarMapa: (lat: number, lon: number) => void;
  onMoverElemento: (i: number, lat: number, lon: number) => void;
  onMoverVertice: (i: number, k: number, lat: number, lon: number) => void;
  onRemoverVertice: (i: number, k: number) => void;
  onInserirCurva: (i: number, lat: number, lon: number) => void;
  onRemoverPendente: (k: number) => void;
}

function marcador(tipo: TipoElementoRota, numero: number, ativo: boolean) {
  const tam = ativo ? 42 : 34;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="position:relative;width:${tam}px;height:${tam}px;${ativo ? "filter:drop-shadow(0 0 7px #facc15)" : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"}">${iconeSvg(tipo, tam)}<span style="position:absolute;right:-6px;top:-6px;min-width:17px;height:17px;padding:0 3px;border-radius:9999px;background:${ativo ? "#facc15" : "#fff"};color:#0f172a;border:1.5px solid #0f172a;font:700 10px/14px system-ui,sans-serif;text-align:center">${numero}</span></div>`,
  });
}

const iconePoste = (cor: string, tam = 12) =>
  L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:9999px;background:#fff;border:2.5px solid ${cor};box-shadow:0 1px 2px rgba(0,0,0,.4)"></div>`,
  });

function Cliques({ onClicar }: { onClicar: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClicar(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Enquadra a rota existente ao abrir; em rota nova não mexe no mapa enquanto se desenha. */
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    if (pontos.length === 0) return;
    if (pontos.length === 1) map.setView(pontos[0], 17);
    else map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40] });
  }, [map, pontos]);
  return null;
}

function Centralizar({ alvo }: { alvo: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo && !map.getBounds().pad(-0.1).contains(alvo)) map.panTo(alvo);
  }, [map, alvo]);
  return null;
}

/** Mapa do editor: as ferramentas decidem o que o clique faz; marcadores e postes arrastam. */
export default function RotaEditorMapa({
  pontos, trechosFixos, selecionado, ferramenta, pendentes, centroPadrao,
  onSelect, onClicarMapa, onMoverElemento, onMoverVertice, onRemoverVertice, onInserirCurva, onRemoverPendente,
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

  // Trechos desenhados: elemento anterior → postes → este elemento
  const trechos: { i: number; pts: [number, number][] }[] = [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) continue;
    trechos.push({ i, pts: [[a.lat, a.lon], ...b.vertices.map((v) => [v.lat, v.lon] as [number, number]), [b.lat, b.lon]] });
  }

  // Caminho em construção: último elemento posicionado → postes marcados
  const ultimo = [...pontos].reverse().find((p) => p.lat !== undefined && p.lon !== undefined);
  const caminhoPendente: [number, number][] =
    ultimo && pendentes.length ? [[ultimo.lat!, ultimo.lon!], ...pendentes.map((p) => [p.lat, p.lon] as [number, number])] : [];

  const sel = selecionado !== null ? pontos[selecionado] : null;
  const alvo: [number, number] | null = sel?.lat !== undefined && sel?.lon !== undefined ? [sel.lat, sel.lon] : null;
  const centro: [number, number] = todos[0] ?? centroPadrao ?? [-28.68, -49.37];
  const desenhando = ferramenta !== "selecionar";
  const editavel = trechosFixos.length === 0;

  return (
    <div className="relative h-full">
      <MapContainer
        center={centro}
        zoom={todos.length ? 16 : 15}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        className={`h-full w-full z-0 ${desenhando ? "cursor-crosshair [&_.leaflet-grab]:cursor-crosshair" : ""}`}
      >
        {satelite ? (
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles © Esri" maxZoom={20} maxNativeZoom={19} />
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

        {/* Traçado do KML (rotas do GeoGrid) */}
        {trechosFixos.map((t, k) => (
          <Polyline key={`fc${k}`} positions={t.pontos.map((q) => [q.lat, q.lon] as [number, number])} pathOptions={{ color: "#0f172a", weight: 8, opacity: 0.7 }} />
        ))}
        {trechosFixos.map((t, k) => (
          <Polyline key={`f${k}`} positions={t.pontos.map((q) => [q.lat, q.lon] as [number, number])} pathOptions={{ color: t.cor ?? "#3b82f6", weight: 4 }}>
            <Tooltip sticky>{t.nome}</Tooltip>
          </Polyline>
        ))}

        {/* Cabos desenhados: capa + cor da fibra; clique no cabo (ferramenta Selecionar) cria um poste ali */}
        {editavel &&
          trechos.map(({ i, pts }) => {
            const ativo = i === selecionado;
            return (
              <Fragment key={`t${i}`}>
                <Polyline positions={pts} pathOptions={{ color: ativo ? "#ca8a04" : "#0f172a", weight: ativo ? 10 : 8, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />
                <Polyline positions={pts} pathOptions={{ color: pontos[i].cor ?? "#3b82f6", weight: 4, lineCap: "round", lineJoin: "round" }} />
                <Polyline
                  positions={pts}
                  pathOptions={{ color: "#000", opacity: 0, weight: 18 }}
                  eventHandlers={{
                    click: (e) => {
                      if (ferramenta !== "selecionar") return;
                      L.DomEvent.stopPropagation(e);
                      onInserirCurva(i, e.latlng.lat, e.latlng.lng);
                    },
                  }}
                >
                  {ferramenta === "selecionar" && <Tooltip sticky>Clique no cabo para criar um poste e arraste para ajustar</Tooltip>}
                </Polyline>
              </Fragment>
            );
          })}

        {/* Postes já no cabo: arrastar move, clique remove */}
        {editavel &&
          pontos.flatMap((p, i) =>
            p.vertices.map((v, k) => (
              <Marker
                key={`v${i}-${k}-${v.lat}`}
                position={[v.lat, v.lon]}
                draggable
                icon={iconePoste(i === selecionado ? "#ca8a04" : "#1d4ed8", i === selecionado ? 14 : 11)}
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    onMoverVertice(i, k, ll.lat, ll.lng);
                  },
                  click: () => onRemoverVertice(i, k),
                }}
              >
                <Tooltip direction="top">Poste · arraste para mover, clique para remover</Tooltip>
              </Marker>
            ))
          )}

        {/* Caminho em construção (postes antes do próximo elemento) */}
        {caminhoPendente.length > 1 && (
          <Polyline positions={caminhoPendente} pathOptions={{ color: "#f59e0b", weight: 4, dashArray: "8 6", lineCap: "round" }} />
        )}
        {pendentes.map((p, k) => (
          <Marker key={`p${k}-${p.lat}`} position={[p.lat, p.lon]} icon={iconePoste("#f59e0b", 13)} eventHandlers={{ click: () => onRemoverPendente(k) }}>
            <Tooltip direction="top">Poste marcado · clique para remover</Tooltip>
          </Marker>
        ))}

        {comPos.map(({ p, i }) => (
          <Marker
            key={`e${i}`}
            position={[p.lat!, p.lon!]}
            draggable
            icon={marcador(p.tipo, i + 1, i === selecionado)}
            zIndexOffset={i === selecionado ? 1000 : 500}
            eventHandlers={{
              click: () => onSelect(i),
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onMoverElemento(i, ll.lat, ll.lng);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -18]}>
              {i + 1}. {p.nome || "(sem nome)"}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <button
        type="button"
        onClick={() => setSatelite((v) => !v)}
        className="absolute bottom-6 right-3 z-[500] bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow hover:bg-white"
      >
        {satelite ? "Mapa de ruas" : "Satélite"}
      </button>
    </div>
  );
}
