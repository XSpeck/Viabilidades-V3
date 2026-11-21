"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DemandaRede } from "@/types";
import { corTecnico, diasAtraso, hojeIso } from "./constantes";

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const PESO_PERIODO = (p?: string) => (p === "Manhã" ? 0 : p === "Tarde" ? 1 : p === "Noturno" ? 2 : 3);

/** Segunda-feira da semana de uma data "AAAA-MM-DD" */
function segundaDe(iso: string): Date {
  const d = new Date(`${iso}T12:00:00`);
  const dia = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dia);
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Agenda da equipe de rede: uma coluna por dia da semana com as demandas agendadas ou em andamento,
 * por período e técnico. Clicar abre a demanda na lista.
 */
export default function AgendaSemana({ demandas, onAbrir }: { demandas: DemandaRede[]; onAbrir: (id: string) => void }) {
  const hoje = hojeIso();
  const [inicio, setInicio] = useState(() => segundaDe(hoje));

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + i);
    return iso(d);
  }), [inicio]);

  const porDia = useMemo(() => {
    const m = new Map<string, DemandaRede[]>();
    for (const d of demandas) {
      if (!d.data_agendamento || !["agendada", "em_andamento", "concluida"].includes(d.status)) continue;
      const lista = m.get(d.data_agendamento) ?? [];
      lista.push(d);
      m.set(d.data_agendamento, lista);
    }
    for (const l of m.values()) l.sort((a, b) => PESO_PERIODO(a.periodo_agendamento) - PESO_PERIODO(b.periodo_agendamento));
    return m;
  }, [demandas]);

  const mover = (semanas: number) => setInicio((d) => { const n = new Date(d); n.setDate(n.getDate() + semanas * 7); return n; });
  const fmt = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
  const naSemana = dias.reduce((t, d) => t + (porDia.get(d)?.length ?? 0), 0);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => mover(-1)} className="rounded-lg border p-1.5 hover:bg-gray-50" aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold text-gray-800">{fmt(dias[0])} a {fmt(dias[6])}</span>
        <button type="button" onClick={() => mover(1)} className="rounded-lg border p-1.5 hover:bg-gray-50" aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" onClick={() => setInicio(segundaDe(hoje))} className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">Esta semana</button>
        <span className="ml-auto text-xs text-gray-500">{naSemana} visita(s) na semana</span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {dias.map((dia, i) => {
          const itens = porDia.get(dia) ?? [];
          const ehHoje = dia === hoje;
          return (
            <div key={dia} className={`min-h-[110px] rounded-lg border p-2 ${ehHoje ? "border-indigo-400 bg-indigo-50/50" : "bg-gray-50/50"} ${!itens.length ? "hidden md:block" : ""}`}>
              <p className={`mb-1.5 text-xs font-semibold ${ehHoje ? "text-indigo-700" : "text-gray-500"}`}>{DIAS[i]} {fmt(dia)}{ehHoje && " · hoje"}</p>
              <div className="space-y-1.5">
                {itens.map((d) => {
                  const atrasada = diasAtraso(d, hoje) > 0;
                  return (
                    <button key={d.id} type="button" onClick={() => onAbrir(d.id)}
                      className={`w-full rounded-md border bg-white px-2 py-1.5 text-left text-xs shadow-sm hover:border-indigo-300 ${atrasada ? "border-red-300" : ""} ${d.status === "concluida" ? "opacity-60" : ""}`}>
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-gray-400">
                        {d.periodo_agendamento ?? "—"}
                        {atrasada && <span className="text-red-600">· atrasada</span>}
                        {d.status === "concluida" && <span className="text-green-600">· feita</span>}
                      </p>
                      <p className="line-clamp-2 font-medium text-gray-800">{d.tipo}{d.bairro ? ` · ${d.bairro}` : ""}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                        {d.tecnicos.length ? d.tecnicos.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${corTecnico(t)}`} />{t.split(" ")[0]}</span>
                        )) : <span className="italic">sem técnico</span>}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {naSemana === 0 && <p className="text-center text-sm text-gray-400">Nenhuma visita agendada nesta semana.</p>}
    </div>
  );
}
