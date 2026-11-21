"use client";

import { Building2, Flame, Home, Loader2, MapPin, MessageSquare, Phone, User, Users } from "lucide-react";
import { locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";

/** Minutos desde a data (ISO) */
export const minutosDesde = (iso: string | undefined, agora: number) =>
  iso ? Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000)) : 0;

export function tempoTexto(min: number): string {
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}min` : ""}`;
  return `${Math.floor(h / 24)}d`;
}

/** Cor do tempo de espera: até 30 min normal, até 2 h atenção, acima disso atrasado */
export function corEspera(min: number): string {
  if (min >= 120) return "bg-red-100 text-red-700";
  if (min >= 30) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-600";
}

const TIPO = {
  FTTH: { icone: Home, rotulo: "Casa" },
  "Prédio": { icone: Building2, rotulo: "Prédio" },
  "Condomínio": { icone: Users, rotulo: "Condomínio" },
} as const;

export default function CardFila({ v, posicao, agora, pegando, onPegar }: {
  v: Viabilizacao; posicao: number; agora: number; pegando: string | null; onPegar: (id: string) => void;
}) {
  const t = TIPO[v.tipo_instalacao] ?? TIPO.FTTH;
  const espera = minutosDesde(v.data_solicitacao, agora);

  return (
    <div className={`flex items-start gap-3 rounded-xl border border-l-4 bg-white px-4 py-3 shadow-sm ${v.urgente ? "border-l-red-500" : "border-l-indigo-400"}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${v.urgente ? "bg-red-100 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
        {posicao}
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-gray-900">{v.nome_cliente ?? "Cliente"}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            <t.icone className="h-3 w-3" /> {t.rotulo}
          </span>
          {v.urgente && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              <Flame className="h-3 w-3" /> Urgente
            </span>
          )}
          {v.predio_estruturado && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Prédio pronto</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {v.usuario}</span>
          <a href={`https://maps.google.com/?q=${encodeURIComponent(v.plus_code_cliente)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-indigo-600 hover:underline" title="Ver no Google Maps">
            <MapPin className="h-3 w-3" /> {locationToPlusCode(v.plus_code_cliente)}
          </a>
          {v.telefone_cliente && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {v.telefone_cliente}</span>}
          {v.predio_ftta && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" /> {v.predio_ftta}{v.andar_predio ? ` · ${v.andar_predio}` : ""}{v.bloco_predio ? ` · Bl. ${v.bloco_predio}` : ""}
            </span>
          )}
        </div>
        {v.obs_usuario && (
          <p className="flex items-start gap-1 text-xs text-gray-600" title={v.obs_usuario}>
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <span className="line-clamp-2 whitespace-pre-wrap">{v.obs_usuario}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corEspera(espera)}`} title="Tempo na fila">{tempoTexto(espera)}</span>
        <button
          type="button"
          onClick={() => onPegar(v.id)}
          disabled={!!pegando}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-colors ${v.urgente ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300" : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300"}`}
        >
          {pegando === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Pegar"}
        </button>
      </div>
    </div>
  );
}
