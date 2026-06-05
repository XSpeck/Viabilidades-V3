"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getCtos, findNearestCtos, type CtoWithRoute } from "@/lib/ctos";
import { plusCodeToCoords } from "@/lib/pluscode";
import { Loader2, MapPin, AlertTriangle } from "lucide-react";

const CtoMap = dynamic(() => import("./CtoMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

const RADIUS_M = 600;

interface Props {
  plusCode: string;
  nomeCliente?: string;
  onSelectCdoi?: (name: string) => void;
  onConfirm?: () => void;
  onExpandChange?: (expanded: boolean) => void;
}

export default function FttaMap({ plusCode, nomeCliente, onSelectCdoi, onConfirm, onExpandChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientLat, setClientLat] = useState(0);
  const [clientLon, setClientLon] = useState(0);
  const [ctos, setCtos] = useState<CtoWithRoute[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { lat, lon } = await plusCodeToCoords(plusCode);
        setClientLat(lat);
        setClientLon(lon);
        const allCtos = await getCtos();
        const cdois = allCtos.filter((c) => c.name.toUpperCase().startsWith("CDOI"));
        const nearby = findNearestCtos(lat, lon, cdois, RADIUS_M);
        setCtos(nearby);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao carregar mapa.");
      } finally {
        setLoading(false);
      }
    })();
  }, [plusCode]);

  function handleSelect(name: string) {
    setSelectedName(name);
    onSelectCdoi?.(name);
  }

  function handleConfirm(name: string) {
    setSelectedName(name);
    onSelectCdoi?.(name);
    onConfirm?.();
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-600" />
          <p className="font-medium text-gray-800 text-sm">
            Mapa FTTA — {nomeCliente ?? plusCode}
          </p>
        </div>
        {selectedName && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
            ✅ {selectedName}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            <p className="text-sm">Carregando CTOs e redes...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {ctos.length === 0 && (
              <div className="text-center py-2 text-gray-500 text-sm">
                ⚠️ Nenhuma CTO/CDOI encontrada em {RADIUS_M}m.
              </div>
            )}
            <CtoMap
              clientLat={clientLat}
              clientLon={clientLon}
              ctos={ctos}
              selectedName={selectedName}
              onSelect={handleSelect}
              onConfirm={handleConfirm}
              onExpandChange={onExpandChange}
            />
            {selectedName && onSelectCdoi && (
              <p className="text-xs text-blue-600 text-center">
                CDOI <strong>{selectedName}</strong> preenchida no formulário
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
