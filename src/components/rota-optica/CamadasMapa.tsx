"use client";

import { useState } from "react";
import { TileLayer } from "react-leaflet";

/**
 * Camadas de fundo dos mapas da rota óptica: Ruas (OpenStreetMap), Satélite (Esri) e Híbrido
 * (satélite com ruas e nomes por cima). A escolha fica guardada neste navegador.
 */

export type Camada = "ruas" | "satelite" | "hibrido";

const CHAVE = "rota_optica_camada";

export function useCamada(): [Camada, (c: Camada) => void] {
  const [camada, setCamada] = useState<Camada>(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem(CHAVE) : null;
      return v === "satelite" || v === "hibrido" ? v : "ruas";
    } catch {
      return "ruas";
    }
  });
  const mudar = (c: Camada) => {
    setCamada(c);
    try { window.localStorage.setItem(CHAVE, c); } catch {}
  };
  return [camada, mudar];
}

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/** Fundo do mapa (vai dentro do MapContainer). Cada camada tem key própria para ser recriada na troca. */
export function CamadaBase({ camada }: { camada: Camada }) {
  if (camada === "ruas") {
    return (
      <TileLayer
        key="ruas"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        maxZoom={20}
        maxNativeZoom={19}
      />
    );
  }
  return (
    <>
      {/* Esri só tem foto até o zoom 18 na região: acima disso amplia a última */}
      <TileLayer key="satelite" url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} attribution="Tiles © Esri" maxZoom={20} maxNativeZoom={18} />
      {camada === "hibrido" && (
        <>
          <TileLayer key="hib-ruas" url={`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`} maxZoom={20} maxNativeZoom={18} opacity={0.9} />
          <TileLayer key="hib-nomes" url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`} maxZoom={20} maxNativeZoom={18} />
        </>
      )}
    </>
  );
}

/** Botões Ruas | Satélite | Híbrido */
export function SeletorCamada({ valor, onMudar, className = "" }: { valor: Camada; onMudar: (c: Camada) => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-lg border border-slate-300 bg-white/95 p-0.5 shadow ${className}`} role="radiogroup" aria-label="Fundo do mapa">
      {([["ruas", "Ruas"], ["satelite", "Satélite"], ["hibrido", "Híbrido"]] as const).map(([k, r]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={valor === k}
          onClick={() => onMudar(k)}
          className={`rounded-md px-2 py-1 text-xs font-semibold ${valor === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
