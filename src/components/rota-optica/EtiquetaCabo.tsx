"use client";

import { useState } from "react";

/** Etiqueta do cabo, como a que o técnico prende no cabo real dentro da caixa */
export default function EtiquetaCabo({ codigo, grande = false }: { codigo: string; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(codigo).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1200);
        }).catch(() => {});
      }}
      title="Etiqueta do cabo em campo (clique para copiar)"
      className={`shrink-0 inline-flex items-center gap-1 rounded-md border-2 border-slate-900 bg-yellow-300 font-mono font-bold tracking-wider text-slate-900 shadow-sm hover:bg-yellow-200 ${grande ? "px-2 py-0.5 text-sm" : "px-1 text-[10px] leading-4"}`}
    >
      {copiado ? "copiado ✓" : codigo}
    </button>
  );
}
