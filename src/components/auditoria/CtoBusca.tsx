"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  getCtos, findNearestCtos, calculateRoutes, formatDistance,
  type CtoWithRoute,
} from "@/lib/ctos";
import { plusCodeToCoords } from "@/lib/pluscode";
import { Loader2, AlertTriangle, MapPin, CheckCircle } from "lucide-react";

const CtoMap = dynamic(() => import("./CtoMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

interface SelectedCto {
  cto_numero: string;
  distancia_cliente: string;
  localizacao_caixa: string;
}

interface Props {
  plusCode: string;
  nomeCliente?: string;
  initialCto?: string;
  onConfirm: (data: SelectedCto) => void;
  onClose: () => void;
  onExpandChange?: (expanded: boolean) => void;
}

export default function CtoBusca({ plusCode, nomeCliente, initialCto, onConfirm, onClose, onExpandChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientLat, setClientLat] = useState(0);
  const [clientLon, setClientLon] = useState(0);
  const [ctos, setCtos] = useState<CtoWithRoute[]>([]);
  const [radius, setRadius] = useState(600);
  const [selectedName, setSelectedName] = useState<string | null>(initialCto ?? null);
  const [confirming, setConfirming] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const loadCtos = useCallback(async (lat: number, lon: number, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const allCtos = await getCtos();
      const ctosOnly = allCtos.filter((c) => !c.name.toUpperCase().startsWith("CDOI"));
      const nearby = findNearestCtos(lat, lon, ctosOnly, r);

      if (nearby.length === 0) {
        setCtos([]);
        setLoading(false);
        return;
      }

      const withRoutes = await calculateRoutes(lat, lon, nearby, 6);
      setCtos(withRoutes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar CTOs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { lat, lon } = await plusCodeToCoords(plusCode);
        setClientLat(lat);
        setClientLon(lon);
        await loadCtos(lat, lon, radius);
      } catch (e) {
        setError(`Erro ao converter Plus Code: ${e instanceof Error ? e.message : String(e)}`);
        setLoading(false);
      }
    })();
  }, [plusCode]);

  function handleRadiusChange(newRadius: number) {
    setRadius(newRadius);
    if (!clientLat || !clientLon) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadCtos(clientLat, clientLon, newRadius), 500);
  }

  async function confirmCto(name: string) {
    const cto = ctos.find((c) => c.name === name);
    if (!cto) return;
    const distance = cto.route?.distanceWithBuffer ?? cto.straightDistance + 50;
    setSelectedName(name);
    setConfirming(true);
    try {
      const { OpenLocationCode } = await import("open-location-code");
      const olc = new OpenLocationCode();
      const plusCode = olc.encode(cto.lat, cto.lon);
      onConfirm({ cto_numero: cto.name, distancia_cliente: formatDistance(distance), localizacao_caixa: plusCode });
    } catch {
      onConfirm({ cto_numero: cto.name, distancia_cliente: formatDistance(distance), localizacao_caixa: `${cto.lat.toFixed(6)},${cto.lon.toFixed(6)}` });
    }
  }

  const selectedCto = ctos.find((c) => c.name === selectedName);
  const icons = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣"];

  return (
    <div className="border border-indigo-200 rounded-xl bg-indigo-50/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-600" />
          <p className="font-medium text-gray-800 text-sm">
            Busca de CTOs — {nomeCliente ?? plusCode}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <div className="p-4 space-y-4">
        {/* Raio */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600 whitespace-nowrap">
            Raio: <strong>{radius}m</strong>
          </label>
          <input
            type="range" min={200} max={1000} step={50}
            value={radius}
            onChange={(e) => handleRadiusChange(Number(e.target.value))}
            className="flex-1 accent-indigo-600"
            disabled={loading}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">1km</span>
        </div>

        {/* Estado de carregamento */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-sm">Carregando CTOs e calculando rotas...</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && ctos.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm">
            ⚠️ Nenhuma CTO encontrada em {radius}m. Tente aumentar o raio.
          </div>
        )}

        {!loading && ctos.length > 0 && (
          <>
            {/* Mapa */}
            <CtoMap
              clientLat={clientLat}
              clientLon={clientLon}
              ctos={ctos}
              selectedName={selectedName}
              onSelect={setSelectedName}
              onConfirm={confirmCto}
              onExpandChange={onExpandChange}
            />

            {/* Aviso de linha reta da CTO selecionada */}
            {selectedCto?.route?.warningMsg && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {selectedCto.route.warningMsg}
              </div>
            )}

            {/* Lista de CTOs */}
            <div className="space-y-2">
              {ctos.map((cto, i) => {
                const isSelected = cto.name === selectedName;
                const route = cto.route;
                const dist = route?.distance ?? cto.straightDistance;
                const distStr = route
                  ? `${route.isStraightLine ? "📏" : "🚶"} ${formatDistance(dist)} (+50m: ${formatDistance(route.distanceWithBuffer)})`
                  : `📏 ${formatDistance(cto.straightDistance)} (linha reta)`;

                return (
                  <button
                    key={cto.name}
                    onClick={() => confirmCto(cto.name)}
                    disabled={confirming}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? "border-green-500 bg-green-50"
                        : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50"
                    } disabled:opacity-60`}
                  >
                    <span className="text-xl">{icons[i] ?? "📍"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{cto.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{distStr}</p>
                      {route?.isStraightLine && (
                        <p className="text-xs text-orange-500 mt-0.5">Rota real indisponível</p>
                      )}
                    </div>
                    {isSelected && confirming
                      ? <Loader2 className="w-5 h-5 text-green-600 shrink-0 animate-spin" />
                      : isSelected
                        ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                        : null}
                  </button>
                );
              })}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
