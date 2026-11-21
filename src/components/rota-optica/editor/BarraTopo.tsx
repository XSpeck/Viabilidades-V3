"use client";

import { AlertTriangle, Loader2, Route, Save, Settings2, Undo2 } from "lucide-react";
import { formatMetros } from "@/lib/rotaOptica";
import { fmtDbm, nivelCor } from "./linhas";

/** Barra do topo do editor: nome da rota, números, pendências e os botões de salvar / cancelar */
export default function BarraTopo({
  nome,
  onNome,
  rotaNova,
  nomeComErro,
  elementos,
  distancia,
  potFinal,
  pendencias,
  onPendencias,
  verCalc,
  onCalc,
  podeDesfazer,
  onDesfazer,
  onCancelar,
  onSalvar,
  salvando,
}: {
  nome: string;
  onNome: (v: string) => void;
  rotaNova: boolean;
  nomeComErro: boolean;
  elementos: number;
  distancia: number;
  potFinal?: number;
  pendencias: number;
  onPendencias: () => void;
  verCalc: boolean;
  onCalc: () => void;
  podeDesfazer: boolean;
  onDesfazer: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
  salvando: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/60">
      <span className="rounded-lg bg-indigo-600 text-white p-1.5"><Route className="w-4 h-4" /></span>
      <input
        value={nome}
        onChange={(e) => onNome(e.target.value)}
        placeholder={rotaNova ? "Nome da nova rota (ex.: OLT1 PL04 P13 → HUB 0/4/13)" : "Nome da rota"}
        className={`flex-1 min-w-[220px] bg-transparent text-base font-semibold text-slate-900 border-b-2 py-1 outline-none placeholder:font-normal placeholder:text-slate-400 ${
          nomeComErro ? "border-red-400" : "border-transparent focus:border-indigo-400"
        }`}
      />
      <div className="flex items-center gap-1.5 text-xs">
        <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1"><b>{elementos}</b> elementos</span>
        <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1"><b>{formatMetros(distancia)}</b></span>
        <span className={`rounded-full bg-white border border-slate-200 px-2.5 py-1 font-semibold ${nivelCor(potFinal)}`}>
          {potFinal !== undefined ? fmtDbm(potFinal) : "— dBm"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {elementos > 0 && (
          <button
            type="button"
            onClick={onPendencias}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-semibold ${
              pendencias ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-emerald-50 border-emerald-300 text-emerald-700"
            }`}
            title="Pendências para salvar"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> {pendencias ? `${pendencias} pendência${pendencias > 1 ? "s" : ""}` : "tudo ok"}
          </button>
        )}
        <button
          type="button"
          onClick={onCalc}
          className={`p-2 rounded-lg border ${verCalc ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 hover:bg-slate-50"}`}
          title="Cálculo de potência"
          aria-label="Cálculo de potência"
        >
          <Settings2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDesfazer}
          disabled={!podeDesfazer}
          className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
          title="Desfazer (Ctrl+Z)"
          aria-label="Desfazer"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar rota
        </button>
      </div>
    </header>
  );
}
