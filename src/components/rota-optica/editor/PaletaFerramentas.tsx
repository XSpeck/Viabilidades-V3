"use client";

import { MousePointer2 } from "lucide-react";
import { TIPO_ELEMENTO_LABEL } from "@/lib/rotaOptica";
import type { Ferramenta } from "../RotaEditorMapa";
import { IconeElemento } from "../IconesRede";
import { PALETA } from "./linhas";

/** Paleta do editor: Mover, Poste, Estação e uma ferramenta para cada tipo de caixa */
export default function PaletaFerramentas({
  ferramenta,
  temElementos,
  onEscolher,
}: {
  ferramenta: Ferramenta;
  /** A rota já tem elementos (a estação só pode ser o começo) */
  temElementos: boolean;
  onEscolher: (f: Ferramenta) => void;
}) {
  return (
    <div className="absolute top-3 left-3 right-3 z-[500] pointer-events-none flex">
      <div className="pointer-events-auto flex max-w-full flex-nowrap items-stretch gap-1 overflow-x-auto rounded-2xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg p-1.5 sm:flex-wrap">
        {([
          { k: "selecionar" as Ferramenta, rot: "Mover", icone: <MousePointer2 className="w-5 h-5 text-slate-700" /> },
          {
            k: "poste" as Ferramenta,
            rot: "Poste",
            icone: (
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                <path d="M3 18 Q 9 6 21 8" stroke="#f59e0b" strokeWidth="2.5" fill="none" strokeDasharray="4 3" />
                <circle cx="9" cy="10.5" r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
              </svg>
            ),
          },
        ]).map((b) => (
          <button
            key={b.k}
            type="button"
            onClick={() => onEscolher(b.k)}
            className={`flex shrink-0 flex-col items-center justify-center w-12 rounded-xl py-1 ${ferramenta === b.k ? "bg-indigo-600 text-white [&_svg_path]:stroke-white" : "hover:bg-slate-100"}`}
            title={b.rot}
          >
            <span className={ferramenta === b.k ? "[&_*]:!text-white" : ""}>{b.icone}</span>
            <span className={`text-[9px] font-semibold mt-0.5 ${ferramenta === b.k ? "text-white" : "text-slate-600"}`}>{b.rot}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onEscolher("estacao")}
          disabled={temElementos}
          className={`flex shrink-0 flex-col items-center justify-center w-12 rounded-xl py-1 disabled:opacity-30 ${ferramenta === "estacao" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
          title={temElementos ? "A estação é o começo da rota" : "Montar estação: OLT + DIO + cordão"}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
            <path d="M3 21V9l9-6 9 6v12z" fill={ferramenta === "estacao" ? "#334155" : "#e2e8f0"} stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
            <rect x="8" y="11" width="8" height="10" rx="1" fill="#0f172a" />
            <path d="M9.5 13.5h5M9.5 16h5M9.5 18.5h5" stroke="#4ade80" strokeWidth="1.2" />
          </svg>
          <span className={`text-[9px] font-semibold mt-0.5 ${ferramenta === "estacao" ? "text-white" : "text-slate-600"}`}>Estação</span>
        </button>
        <span className="w-px bg-slate-200 mx-0.5" />
        {PALETA.map((p) => (
          <button
            key={p.t}
            type="button"
            onClick={() => onEscolher(p.t)}
            className={`flex shrink-0 flex-col items-center justify-center w-12 rounded-xl py-1 ${ferramenta === p.t ? "bg-indigo-100 ring-2 ring-indigo-500" : "hover:bg-slate-100"}`}
            title={`Adicionar ${TIPO_ELEMENTO_LABEL[p.t]}`}
          >
            <IconeElemento tipo={p.t} tamanho={24} />
            <span className="text-[9px] font-semibold text-slate-700 mt-0.5">{p.rot}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
