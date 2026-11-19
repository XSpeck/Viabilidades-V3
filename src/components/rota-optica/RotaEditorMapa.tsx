"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import type { TipoElementoRota, TrechoCabo } from "@/lib/rotaOptica";
import { iconeSvg } from "./IconesRede";
import { Search, X } from "lucide-react";
import { formatarCoordenada, lerCoordenada, type Coordenada } from "@/lib/coordenadas";

/** Ferramenta ativa: selecionar/mover, marcar poste do cabo, ou colocar um elemento do tipo escolhido */
export type Ferramenta = "selecionar" | "poste" | TipoElementoRota;

type Ponto = { lat: number; lon: number };

/** Elemento da rede já cadastrada (outras rotas), mostrado ao fundo */
export interface PontoRede {
  nome: string;
  tipo: TipoElementoRota;
  lat: number;
  lon: number;
  /** Já faz parte da rota em edição */
  naRota: boolean;
}

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
  /** Rede existente (outras rotas): caixas e cabos ao fundo */
  rede: PontoRede[];
  redeCabos: { pts: [number, number][]; cor?: string }[];
  onClicarRede: (k: number) => void;
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

function marcadorRede(tipo: TipoElementoRota, naRota: boolean) {
  const tam = 26;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;opacity:${naRota ? 0.35 : 0.8};filter:grayscale(${naRota ? 1 : 0.35}) drop-shadow(0 1px 1px rgba(0,0,0,.3))">${iconeSvg(tipo, tam)}</div>`,
  });
}

const iconePoste = (cor: string, tam = 12) =>
  L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:9999px;background:#fff;border:2.5px solid ${cor};box-shadow:0 1px 2px rgba(0,0,0,.4)"></div>`,
  });

const iconePino = L.divIcon({
  className: "",
  iconSize: [30, 40],
  iconAnchor: [15, 38],
  html: `<svg viewBox="0 0 30 40" width="30" height="40" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M15 39C15 39 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 39 15 39Z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>`,
});

/** Leva o mapa até a coordenada buscada */
function IrPara({ alvo }: { alvo: (Coordenada & { vez: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo) map.flyTo([alvo.lat, alvo.lon], Math.max(map.getZoom(), 18), { duration: 0.8 });
  }, [map, alvo]);
  return null;
}

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
  rede, redeCabos, onClicarRede,
}: Props) {
  const [satelite, setSatelite] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [textoBusca, setTextoBusca] = useState("");
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [achado, setAchado] = useState<(Coordenada & { vez: number }) | null>(null);

  function buscar() {
    const c = lerCoordenada(textoBusca);
    if (!c) return setErroBusca("Não entendi. Use -28.69170, -49.34236 ou cole um link do Google Maps.");
    setErroBusca(null);
    setAchado((a) => ({ ...c, vez: (a?.vez ?? 0) + 1 }));
  }

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
  const pontosRede = useMemo<[number, number][]>(() => rede.map((p) => [p.lat, p.lon] as [number, number]), [rede]);
  const centro: [number, number] = todos[0] ?? pontosRede[0] ?? centroPadrao ?? [-28.68, -49.37];
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
        <Enquadrar pontos={todos.length ? todos : pontosRede} />
        <Centralizar alvo={alvo} />
        <IrPara alvo={achado} />
        {achado && (
          <Marker
            position={[achado.lat, achado.lon]}
            icon={iconePino}
            zIndexOffset={2000}
            eventHandlers={{ click: () => onClicarMapa(achado.lat, achado.lon) }}
          >
            <Tooltip direction="top" offset={[0, -36]} permanent>
              {formatarCoordenada(achado)}
              {ferramenta !== "selecionar" ? " · clique no pino para colocar aqui" : ""}
            </Tooltip>
          </Marker>
        )}

        {/* Rede existente (outras rotas), ao fundo */}
        {redeCabos.map((c, k) => (
          <Polyline key={`rc${k}`} positions={c.pts} interactive={false} pathOptions={{ color: "#64748b", weight: 6, opacity: 0.35, lineCap: "round", lineJoin: "round" }} />
        ))}
        {redeCabos.map((c, k) => (
          <Polyline key={`rk${k}`} positions={c.pts} interactive={false} pathOptions={{ color: c.cor ?? "#94a3b8", weight: 2.5, opacity: 0.6, lineCap: "round", lineJoin: "round" }} />
        ))}
        {rede.map((p, k) => (
          <Marker
            key={`r${k}`}
            position={[p.lat, p.lon]}
            icon={marcadorRede(p.tipo, p.naRota)}
            zIndexOffset={-200}
            eventHandlers={{ click: () => onClicarRede(k) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              <b>{p.nome}</b>
              <br />
              {p.naRota ? "já está nesta rota" : pontos.length === 0 ? "clique para começar a rota a partir daqui" : "clique para usar esta caixa na rota"}
            </Tooltip>
          </Marker>
        ))}

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
                      // 1º clique seleciona o trecho (abre o cabo); clique no trecho já selecionado cria um poste
                      if (i !== selecionado) onSelect(i);
                      else onInserirCurva(i, e.latlng.lat, e.latlng.lng);
                    },
                  }}
                >
                  {ferramenta === "selecionar" && (
                    <Tooltip sticky>
                      {i === selecionado ? "Clique para criar um poste aqui (depois arraste)" : `Cabo até ${pontos[i].nome || `elemento ${i + 1}`} · clique para editar`}
                    </Tooltip>
                  )}
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
      <div className="absolute bottom-6 right-3 z-[500] flex flex-col items-end gap-1.5">
        {buscaAberta && (
          <div className="w-[300px] rounded-xl bg-white border border-slate-300 shadow-xl p-2">
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={textoBusca}
                onChange={(e) => { setTextoBusca(e.target.value); setErroBusca(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); buscar(); }
                  if (e.key === "Escape") { e.stopPropagation(); setBuscaAberta(false); }
                }}
                placeholder="-28.69170, -49.34236 ou link do Maps"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                aria-label="Coordenada"
              />
              <button type="button" onClick={buscar} className="rounded-lg bg-indigo-600 text-white text-xs font-semibold px-2.5 py-1.5 hover:bg-indigo-700">
                Ir
              </button>
            </div>
            {erroBusca && <p className="text-[11px] text-red-600 mt-1">{erroBusca}</p>}
            {achado && !erroBusca && (
              <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                <span>Pino em {formatarCoordenada(achado)}</span>
                <button type="button" onClick={() => setAchado(null)} className="flex items-center gap-0.5 hover:text-slate-800">
                  <X className="w-3 h-3" /> tirar pino
                </button>
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Aceita decimal, graus/min/seg (28°41&apos;30&quot;S 49°20&apos;32&quot;W) e link do Google Maps.</p>
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setBuscaAberta((v) => !v)}
            className={`border rounded-lg p-1.5 shadow ${buscaAberta ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/95 border-slate-300 hover:bg-white text-slate-700"}`}
            title="Buscar coordenada"
            aria-label="Buscar coordenada"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSatelite((v) => !v)}
            className="bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold shadow hover:bg-white"
          >
            {satelite ? "Mapa de ruas" : "Satélite"}
          </button>
        </div>
      </div>
    </div>
  );
}
