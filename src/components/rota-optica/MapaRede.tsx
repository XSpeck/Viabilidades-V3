"use client";

import { Fragment, useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Polyline, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import ZoomComCtrl from "./ZoomComCtrl";
import { CamadaBase, SeletorCamada, useCamada } from "./CamadasMapa";
import { formatMetros, tipoVisual, type RotaOptica, type TipoElementoRota } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { chaveCabo } from "@/lib/cabosRede";
import { listarPredios, type PredioRede } from "@/lib/prediosRede";
import { iconeSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * Mapa da rede inteira: todas as rotas salvas (cabo na cor da fibra), as caixas com o ícone do tipo
 * e os prédios agrupados. Filtro por porta PON; clicar numa caixa ou num cabo mostra as rotas que passam ali.
 */

interface Props {
  rotas: RotaOptica[];
  onAbrirRota: (id: string) => void;
}

const icone = (tipo: TipoElementoRota, rotulo?: string) =>
  L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="position:relative;width:30px;height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">${iconeSvg(tipo, 30)}${rotulo ? `<span style="position:absolute;left:50%;top:30px;transform:translateX(-50%);white-space:nowrap;background:rgba(15,23,42,.85);color:#fff;font:600 9px/1 system-ui,sans-serif;padding:2px 4px;border-radius:4px">${rotulo}</span>` : ""}</div>`,
  });

function Enquadrar({ pts, vez }: { pts: [number, number][]; vez: string }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    else if (pts.length === 1) map.setView(pts[0], 17);
    // reenquadra quando muda o filtro
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, vez]);
  return null;
}

const curto = (s: string, n = 26) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return cortar(t, n, s);
};

export default function MapaRede({ rotas, onAbrirRota }: Props) {
  const [pon, setPon] = useState<string>("");
  const [camada, setCamada] = useCamada();
  const [nomes, setNomes] = useState(false);
  const [predios, setPredios] = useState<PredioRede[]>([]);
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setPredios(ps)).catch(() => {});
    return () => { vivo = false; };
  }, [rotas]);

  const portas = [...new Map(rotas.map((r) => { const p = portaPonDaRota(r); return [p.chave, p.rotulo]; })).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true }));
  const vis = pon ? rotas.filter((r) => portaPonDaRota(r).chave === pon) : rotas;

  // Caixas: uma por chave, com as rotas que passam; CDOIs de prédio viram o prédio
  const predioDe = new Map<string, PredioRede>();
  predios.forEach((p) => p.chaves.forEach((k) => predioDe.set(k, p)));
  const caixas = new Map<string, { nome: string; tipo: TipoElementoRota; lat: number; lon: number; rotas: RotaOptica[]; metros: number[]; cdois?: number }>();
  for (const r of vis) {
    let acc = 0;
    r.elementos.forEach((e, i) => {
      if (i > 0) acc += e.distancia_m ?? 0;
      if (e.lat === undefined || e.lon === undefined) return;
      const pr = predioDe.get(chaveElemento(e));
      const k = pr ? `PREDIO:${pr.id}` : chaveElemento(e);
      const c = caixas.get(k) ?? { nome: pr ? pr.nome : e.nome, tipo: pr ? "predio" : tipoVisual(e), lat: e.lat, lon: e.lon, rotas: [], metros: [], cdois: pr ? pr.pontos.length : undefined };
      if (!c.rotas.includes(r)) c.rotas.push(r);
      c.metros.push(acc);
      caixas.set(k, c);
    });
  }
  // Cabos: um traçado por trecho; rotas no mesmo trecho de cabo ficam juntas
  const cabos = new Map<string, { nome: string; cor: string; pts: [number, number][]; rotas: RotaOptica[]; fibras: Set<number>; metros?: number }>();
  for (const r of vis) {
    r.elementos.forEach((e, i) => {
      if (i === 0) return;
      const t = r.trechos.find((x) => x.ate === i);
      const a = r.elementos[i - 1];
      const pts: [number, number][] = t?.pontos?.length
        ? t.pontos.map((p) => [p.lat, p.lon])
        : a.lat !== undefined && a.lon !== undefined && e.lat !== undefined && e.lon !== undefined ? [[a.lat, a.lon], [e.lat, e.lon]] : [];
      if (pts.length < 2) return;
      const k = `${chaveCabo(e.cabo_entrada ?? `trecho${i}`)}|${chaveElemento(a)}|${chaveElemento(e)}`;
      const c = cabos.get(k) ?? { nome: e.cabo_entrada ?? "cabo", cor: t?.cor ?? "#3b82f6", pts, rotas: [], fibras: new Set<number>(), metros: e.distancia_m };
      if (!c.rotas.includes(r)) c.rotas.push(r);
      if (e.fibra_entrada) c.fibras.add(e.fibra_entrada);
      cabos.set(k, c);
    });
  }
  // traçados das rotas importadas (sem índice de trecho): desenha como estão
  const soltos = vis.flatMap((r) => r.trechos.filter((t) => t.ate === undefined).map((t) => ({ r, t })));

  const todos: [number, number][] = [...[...caixas.values()].map((c) => [c.lat, c.lon] as [number, number]), ...[...cabos.values()].flatMap((c) => c.pts)];
  const listaRotas = (rs: RotaOptica[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
      {rs.slice(0, 12).map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onAbrirRota(r.id)}
          style={{ textAlign: "left", border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer" }}
        >
          {r.nome}
        </button>
      ))}
      {rs.length > 12 && <span style={{ fontSize: 10, color: "#64748b" }}>+{rs.length - 12} rotas</span>}
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        <select className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={pon} onChange={(e) => setPon(e.target.value)}>
          <option value="">Todas as portas PON ({rotas.length} rota{rotas.length !== 1 ? "s" : ""})</option>
          {portas.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={nomes} onChange={(e) => setNomes(e.target.checked)} /> Nomes das caixas
        </label>
        <SeletorCamada valor={camada} onMudar={setCamada} className="ml-auto" />
        <span className="text-[11px] text-gray-400">{caixas.size} caixas · {cabos.size} trechos de cabo</span>
      </div>
      {todos.length === 0 ? (
        <div className="flex h-[520px] items-center justify-center text-sm text-gray-500">Nenhuma rota com coordenadas para mostrar no mapa.</div>
      ) : (
        <MapContainer center={todos[0]} zoom={15} scrollWheelZoom={false} className="h-[min(70vh,640px)] w-full z-0 [&_.leaflet-interactive]:outline-none">
          <CamadaBase camada={camada} />
          <ZoomComCtrl />
          <Enquadrar pts={todos} vez={pon} />
          {soltos.map(({ r, t }, k) => (
            <Polyline key={`s${k}`} positions={t.pontos.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: t.cor ?? "#64748b", weight: 3, opacity: 0.8 }}>
              <Tooltip sticky>{t.nome} · {r.nome}</Tooltip>
            </Polyline>
          ))}
          {[...cabos.values()].map((c, k) => (
            <Fragment key={`c${k}`}>
              <Polyline positions={c.pts} pathOptions={{ color: "#0f172a", weight: 7 + Math.min(c.rotas.length, 4), opacity: 0.7, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={c.pts} pathOptions={{ color: c.cor, weight: 3.5, lineCap: "round", lineJoin: "round" }}>
                <Tooltip sticky>
                  <b>{curto(c.nome, 40)}</b>
                  <br />
                  {c.fibras.size} fibra{c.fibras.size !== 1 ? "s" : ""} em uso · {c.rotas.length} rota{c.rotas.length !== 1 ? "s" : ""}{c.metros ? ` · ${formatMetros(c.metros)}` : ""}
                </Tooltip>
                <Popup>
                  <b>{c.nome}</b>
                  <div style={{ fontSize: 11, color: "#475569" }}>Fibras em uso: {[...c.fibras].sort((a, b) => a - b).map((f) => `F${f}`).join(", ") || "—"}</div>
                  {listaRotas(c.rotas)}
                </Popup>
              </Polyline>
            </Fragment>
          ))}
          {[...caixas.values()].map((c, k) => (
            <Marker key={`m${k}`} position={[c.lat, c.lon]} icon={icone(c.tipo, nomes ? curto(c.nome, 18) : undefined)}>
              <Tooltip direction="top" offset={[0, -14]}>
                <b>{c.nome}</b>
                {c.cdois ? ` · ${c.cdois} CDOIs` : ""}
                <br />
                {formatMetros(Math.min(...c.metros))} da OLT · {c.rotas.length} rota{c.rotas.length !== 1 ? "s" : ""}
              </Tooltip>
              <Popup>
                <b>{c.nome}</b>
                <div style={{ fontSize: 11, color: "#475569" }}>
                  {c.cdois ? `Prédio com ${c.cdois} CDOIs · ` : ""}{formatMetros(Math.min(...c.metros))} da OLT
                </div>
                {listaRotas(c.rotas)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
