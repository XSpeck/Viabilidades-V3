"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesPendentes, pegarViabilizacao } from "@/lib/firestore";
import { locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { Loader2, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";

const REFRESH_SECONDS = 30;

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export default function ViabilidadesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [pegando, setPegando] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPending(await getViabilizacoesPendentes());
      setLastUpdate(new Date());
      setCountdown(REFRESH_SECONDS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { load(); return REFRESH_SECONDS; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [load]);

  async function handlePegar(id: string) {
    if (!user) return;
    setPegando(id);
    try {
      await pegarViabilizacao(id, user.nome);
      router.push("/auditoria");
    } finally { setPegando(null); }
  }

  if (user?.nivel !== 1) {
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito a auditores.</div>;
  }

  const urgentes = pending.filter((p) => p.urgente);
  const normais  = pending.filter((p) => !p.urgente);

  const progress = (countdown / REFRESH_SECONDS) * 100;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-white rounded-xl border shadow-sm px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📋 Fila de Viabilizações</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              {lastUpdate ? `Atualizado às ${lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Carregando..."}
              {" · "}atualiza em <strong>{countdown}s</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">{pending.length}</p>
              <p className="text-xs text-gray-400">na fila</p>
            </div>
            {urgentes.length > 0 && (
              <div className="text-right">
                <p className="text-3xl font-bold text-red-600">{urgentes.length}</p>
                <p className="text-xs text-red-400">urgente(s)</p>
              </div>
            )}
          </div>
        </div>
        {/* Barra de countdown */}
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-400 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Lista */}
      {!loading && pending.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-xl border">
          <ClipboardList className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-400">Nenhuma solicitação pendente</p>
          <p className="text-gray-300 text-sm mt-1">Todas as viabilizações foram distribuídas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Urgentes */}
          {urgentes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm font-bold text-red-600 uppercase tracking-wide">🔥 Urgente — Cliente Presencial</span>
                <div className="flex-1 h-px bg-red-200" />
              </div>
              {urgentes.map((v, i) => (
                <CardViabilidade key={v.id} v={v} position={i + 1} urgente onPegar={handlePegar} pegando={pegando} />
              ))}
            </div>
          )}

          {/* Normais */}
          {normais.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">📋 Normal</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {normais.map((v, i) => (
                <CardViabilidade key={v.id} v={v} position={urgentes.length + i + 1} urgente={false} onPegar={handlePegar} pegando={pegando} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardViabilidade({ v, position, urgente, onPegar, pegando }: {
  v: Viabilizacao; position: number; urgente: boolean;
  onPegar: (id: string) => void; pegando: string | null;
}) {
  const tipoIcon  = v.tipo_instalacao === "FTTH" ? "🏠" : v.tipo_instalacao === "Prédio" ? "🏢" : "🏘️";
  const tipoColor = v.tipo_instalacao === "FTTH"
    ? "bg-green-100 text-green-700"
    : v.tipo_instalacao === "Prédio"
    ? "bg-blue-100 text-blue-700"
    : "bg-orange-100 text-orange-700";

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 flex items-center gap-4 px-4 py-3 ${urgente ? "border-red-500" : "border-indigo-400"}`}>

      {/* Posição na fila */}
      <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${urgente ? "bg-red-100 text-red-600" : "bg-indigo-50 text-indigo-600"}`}>
        {position}
      </div>

      {/* Informações */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">{v.nome_cliente ?? "Cliente"}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoColor}`}>
            {tipoIcon} {v.tipo_instalacao}
          </span>
          {urgente && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">🔥 URGENTE</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
          <span>👤 {v.usuario}</span>
          <span className="font-mono">📍 {locationToPlusCode(v.plus_code_cliente)}</span>
          {v.predio_ftta && <span>🏢 {v.predio_ftta}{v.andar_predio ? ` · ${v.andar_predio}` : ""}{v.bloco_predio ? ` · Bl. ${v.bloco_predio}` : ""}</span>}
        </div>
      </div>

      {/* Tempo + botão */}
      <div className="shrink-0 flex flex-col items-end gap-2">
        <span className={`text-xs font-medium ${urgente ? "text-red-500" : "text-gray-400"}`}>
          ⏱ {timeAgo(v.data_solicitacao)}
        </span>
        <button
          onClick={() => onPegar(v.id)}
          disabled={!!pegando}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${
            urgente
              ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white"
          }`}
        >
          {pegando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✅ Pegar"}
        </button>
      </div>
    </div>
  );
}
