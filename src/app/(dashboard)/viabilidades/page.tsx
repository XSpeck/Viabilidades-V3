"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesPendentes, pegarViabilizacao } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ViabilidadesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [pegando, setPegando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPending(await getViabilizacoesPendentes()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.nivel !== 1) {
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito a auditores.</div>;
  }

  async function handlePegar(id: string) {
    if (!user) return;
    setPegando(id);
    try {
      await pegarViabilizacao(id, user.nome);
      router.push("/auditoria");
    } finally { setPegando(null); }
  }

  const urgentes = pending.filter((p) => p.urgente);
  const normais = pending.filter((p) => !p.urgente);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📋 Viabilizações Disponíveis</h1>
          <p className="text-gray-500 text-sm mt-1">Solicitações aguardando auditoria técnica</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : pending.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma viabilização pendente. Todas distribuídas!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {urgentes.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-700 font-semibold mb-3">🔥 {urgentes.length} URGENTE(S) — Clientes Presenciais</p>
              <div className="space-y-3">{urgentes.map((v) => <CardViabilidade key={v.id} v={v} urgente onPegar={handlePegar} pegando={pegando} />)}</div>
            </div>
          )}
          {normais.length > 0 && (
            <div className="space-y-3">
              <p className="text-gray-600 font-medium">📋 {normais.length} solicitação(ões) normal(is)</p>
              {normais.map((v) => <CardViabilidade key={v.id} v={v} urgente={false} onPegar={handlePegar} pegando={pegando} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardViabilidade({ v, urgente, onPegar, pegando }: {
  v: Viabilizacao; urgente: boolean;
  onPegar: (id: string) => void; pegando: string | null;
}) {
  const tipoIcon = v.tipo_instalacao === "FTTH" ? "🏠" : v.tipo_instalacao === "Prédio" ? "🏢" : "🏘️";
  return (
    <div className={`bg-white rounded-xl border-l-4 shadow-sm p-4 ${urgente ? "border-red-500" : "border-indigo-400"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-semibold text-gray-900">
            {tipoIcon} {v.nome_cliente ?? "Cliente"} {urgente && <span className="text-red-600 text-sm">🔥 URGENTE</span>}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span>👤 {v.usuario}</span>
            <span className="font-mono">📍 {locationToPlusCode(v.plus_code_cliente)}</span>
            <span>🏷️ {v.tipo_instalacao}</span>
            <span>📅 {formatDateTime(v.data_solicitacao)}</span>
          </div>
          {v.predio_ftta && (
            <p className="text-sm text-gray-600">🏢 {v.predio_ftta}{v.andar_predio ? ` | Apto: ${v.andar_predio}` : ""}{v.bloco_predio ? ` | Bloco: ${v.bloco_predio}` : ""}</p>
          )}
        </div>
        <button
          onClick={() => onPegar(v.id)}
          disabled={pegando === v.id}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          {pegando === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "✅ Pegar"}
        </button>
      </div>
    </div>
  );
}
