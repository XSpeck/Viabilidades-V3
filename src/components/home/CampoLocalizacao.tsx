"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle, ExternalLink, Map as MapIcon, MapPin, X, XCircle } from "lucide-react";
import type { LocalInterpretado } from "@/lib/localizacao";

const LocationPicker = dynamic(() => import("@/components/home/LocationPicker"), { ssr: false });
const MiniMapa = dynamic(() => import("@/components/home/MiniMapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100" />,
});

const ORIGEM = { pluscode: "Plus Code", coordenadas: "Coordenadas", link: "Link do Google Maps" } as const;

/**
 * Passo 1: um campo só. Entende Plus Code (curto ou completo), coordenadas com ponto ou
 * vírgula e link do Google Maps; mostra o ponto num mapa pequeno para conferir.
 */
export default function CampoLocalizacao({
  texto,
  local,
  onTexto,
}: {
  texto: string;
  local: LocalInterpretado | null;
  onTexto: (t: string) => void;
}) {
  const [mapaAberto, setMapaAberto] = useState(false);
  const invalido = texto.trim() !== "" && !local;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            placeholder="Plus Code, coordenadas ou link do Google Maps"
            aria-invalid={invalido}
            className={`w-full rounded-lg border py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 ${
              local ? "border-green-400 bg-green-50 focus:ring-green-400"
              : invalido ? "border-red-400 bg-red-50 focus:ring-red-400"
              : "border-gray-300 focus:ring-indigo-500"}`}
          />
          {texto && (
            <button type="button" onClick={() => onTexto("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Limpar">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMapaAberto(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <MapIcon className="h-4 w-4 text-indigo-600" /> Marcar no mapa
        </button>
      </div>

      {invalido && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <XCircle className="h-3.5 w-3.5 shrink-0" /> Não reconheci. Ex.: 8J3G+WGV, -28.6951, -49.3737 ou um link do Maps.
        </p>
      )}

      {local && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="relative h-40 sm:h-48">
            <MiniMapa lat={local.lat} lon={local.lon} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50 px-3 py-2 text-xs">
            <span className="flex items-center gap-1 font-medium text-green-700">
              <CheckCircle className="h-3.5 w-3.5" /> {ORIGEM[local.origem]}
            </span>
            <span className="font-mono text-gray-700">{local.plusCode}</span>
            <span className="text-gray-400">{local.lat.toFixed(6)}, {local.lon.toFixed(6)}</span>
            <a
              href={`https://www.google.com/maps?q=${local.lat},${local.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-indigo-600 hover:underline"
            >
              Abrir no Maps <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {mapaAberto && (
        <LocationPicker
          onConfirm={(code) => { onTexto(code); setMapaAberto(false); }}
          onClose={() => setMapaAberto(false)}
        />
      )}
    </div>
  );
}
