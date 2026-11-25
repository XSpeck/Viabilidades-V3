"use client";

import { COR_NIVEL, COR_OCUPACAO, ROTULO_NIVEL, ROTULO_OCUPACAO, type FaixaOcupacao, type NivelPotencia } from "@/lib/analiseRede";

export type TemaMapa = "tipo" | "pon" | "potencia" | "ocupacao";
export const TEMAS: { k: TemaMapa; rotulo: string }[] = [
  { k: "tipo", rotulo: "Tipo de caixa" },
  { k: "pon", rotulo: "Porta PON" },
  { k: "potencia", rotulo: "Potência" },
  { k: "ocupacao", rotulo: "Ocupação" },
];

const Item = ({ cor, texto, linha, tracejado }: { cor: string; texto: string; linha?: boolean; tracejado?: boolean }) => (
  <li className="flex items-center gap-1.5">
    {linha ? (
      <svg width="20" height="8" aria-hidden><line x1="1" y1="4" x2="19" y2="4" stroke={cor} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={tracejado ? "4 3" : undefined} /></svg>
    ) : (
      <span className="inline-block h-3 w-3 rounded-full border-[3px] bg-white" style={{ borderColor: cor }} />
    )}
    <span>{texto}</span>
  </li>
);

/** Legenda do tema escolhido (canto do mapa) */
export default function LegendaMapa({ tema, pons, alertas }: { tema: TemaMapa; pons: { chave: string; rotulo: string; cor: string }[]; alertas: boolean }) {
  return (
    <div className="pointer-events-auto max-w-[220px] rounded-xl border border-slate-200 bg-white/95 px-2.5 py-2 text-[10.5px] text-slate-700 shadow-lg backdrop-blur">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{TEMAS.find((t) => t.k === tema)?.rotulo}</p>
      <ul className="space-y-0.5">
        {tema === "tipo" && (
          <>
            <li className="text-slate-500">Ícone pelo tipo de caixa</li>
            <Item cor="#3b82f6" texto="cabo na cor da fibra" linha />
          </>
        )}
        {tema === "pon" && (
          <>
            {pons.map((p) => <Item key={p.chave} cor={p.cor} texto={p.rotulo.replace(/^.*· /, "")} />)}
            <Item cor="#64748b" texto="caixa de várias PONs" />
            <Item cor="#64748b" texto="cabo de várias PONs" linha tracejado />
          </>
        )}
        {tema === "potencia" && (
          <>
            {(["otima", "boa", "limite", "abaixo", "sem"] as NivelPotencia[]).map((n) => <Item key={n} cor={COR_NIVEL[n]} texto={ROTULO_NIVEL[n]} />)}
            <li className="text-slate-500">pior ponta das CTOs e CDOIs</li>
          </>
        )}
        {tema === "ocupacao" && (
          <>
            {(["baixa", "media", "alta", "cheia", "sem"] as FaixaOcupacao[]).map((f) => <Item key={f} cor={COR_OCUPACAO[f]} texto={ROTULO_OCUPACAO[f]} />)}
            <li className="text-slate-500">caixas: portas · cabos: fibras (mais grosso = maior)</li>
          </>
        )}
      </ul>
      {alertas && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1 text-[10px]">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-red-600" /> crítico</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-orange-500" /> atenção</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-sky-600" /> cadastro</span>
        </div>
      )}
    </div>
  );
}
