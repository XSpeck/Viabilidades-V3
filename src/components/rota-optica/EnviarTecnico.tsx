"use client";

import { useState } from "react";
import { Check, Copy, MapPin } from "lucide-react";

/** Link do ponto no Google Maps (abre a navegação no celular do técnico) */
export function linkMaps(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * Botões para mandar o ponto ao técnico: abrir no Google Maps e copiar a mensagem com o link
 * (quem clica cola e envia onde quiser).
 */
export default function EnviarTecnico({ texto, lat, lon, compacto }: { texto: string; lat?: number; lon?: number; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const link = lat !== undefined && lon !== undefined ? linkMaps(lat, lon) : undefined;
  const mensagem = link ? `${texto}\n📍 ${link}` : texto;
  const btn = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${compacto ? "" : "py-1 text-[11px]"}`;
  return (
    <span className="inline-flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className={`${btn} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`} title="Abrir o ponto no Google Maps">
          <MapPin className="h-3 w-3" /> Google Maps
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(mensagem).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }).catch(() => {});
        }}
        className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        title="Copiar a mensagem com o link para colar no grupo / chat do técnico"
      >
        {copiado ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} {copiado ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
