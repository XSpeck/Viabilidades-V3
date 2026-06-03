"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getInstalacoesPendentes,
  enviarObsAgendamentoTecnico,
  agendarInstalacao,
  reagendarInstalacao,
  marcarInstalado,
} from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, Wrench, Search, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

type FilterKey = "todos" | "aguardando_agendamento" | "aguardando_resposta" | "agendado";

function classifyDate(data?: string): "atrasada" | "hoje" | "futura" | null {
  if (!data) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(data + "T12:00:00"); d.setHours(0, 0, 0, 0);
  if (d < today) return "atrasada";
  if (d.getTime() === today.getTime()) return "hoje";
  return "futura";
}

export default function AgendaTecnicaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getInstalacoesPendentes()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const counts = {
    todos:                 items.length,
    aguardando_agendamento: items.filter((v) => v.status_instalacao === "aguardando_agendamento").length,
    aguardando_resposta:   items.filter((v) => v.status_instalacao === "aguardando_resposta").length,
    agendado:              items.filter((v) => v.status_instalacao === "agendado").length,
  };

  const chips: { key: FilterKey; label: string }[] = [
    { key: "todos",                  label: `Todos (${counts.todos})` },
    { key: "aguardando_agendamento", label: `⏳ Ag. agendamento (${counts.aguardando_agendamento})` },
    { key: "aguardando_resposta",    label: `💬 Ag. resposta (${counts.aguardando_resposta})` },
    { key: "agendado",               label: `📅 Agendados (${counts.agendado})` },
  ].filter((c) => c.key === "todos" || counts[c.key as FilterKey] > 0) as { key: FilterKey; label: string }[];

  const filtered = items
    .filter((v) => filter === "todos" || v.status_instalacao === filter)
    .filter((v) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.nome_cliente?.toLowerCase().includes(q) ||
        v.plus_code_cliente.toLowerCase().includes(q) ||
        v.usuario.toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔧 Agenda Técnica</h1>
          <p className="text-gray-500 text-sm mt-1">Instalações FTTH aprovadas aguardando agendamento</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por cliente, plus code ou solicitante..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === c.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma instalação aguardando agendamento.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border text-gray-400">Nenhum resultado para os filtros aplicados.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <InstalacaoCard key={v.id} v={v} userName={user!.nome} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function InstalacaoCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showEnviarMsg, setShowEnviarMsg] = useState(false);
  const [showAgendar, setShowAgendar] = useState(false);
  const [showReagendar, setShowReagendar] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [periodo, setPeriodo] = useState("Manhã");
  const [tecnico, setTecnico] = useState(v.tecnico_instalacao ?? "");
  const [motivoReagend, setMotivoReagend] = useState("");

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  async function handleEnviarMsg() {
    if (!mensagem.trim()) return;
    setLoading(true);
    try {
      await enviarObsAgendamentoTecnico(v.id, mensagem);
      finishWithSuccess("💬 Mensagem enviada ao cliente.");
    } finally { setLoading(false); }
  }

  async function handleAgendar() {
    if (!dataInstalacao || !tecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await agendarInstalacao(v.id, { data_instalacao: dataInstalacao, periodo_instalacao: periodo, tecnico_instalacao: tecnico });
      finishWithSuccess(`📅 Instalação agendada para ${new Date(dataInstalacao + "T12:00:00").toLocaleDateString("pt-BR")} — ${periodo} — ${tecnico}.`);
    } finally { setLoading(false); }
  }

  async function handleReagendar() {
    if (!dataInstalacao || !tecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await reagendarInstalacao(
        v.id,
        { data_instalacao: dataInstalacao, periodo_instalacao: periodo, tecnico_instalacao: tecnico, motivo: motivoReagend },
        { data_instalacao: v.data_instalacao, periodo_instalacao: v.periodo_instalacao, tecnico_instalacao: v.tecnico_instalacao }
      );
      finishWithSuccess(`🔄 Reagendado para ${new Date(dataInstalacao + "T12:00:00").toLocaleDateString("pt-BR")} — ${periodo} — ${tecnico}.`);
    } finally { setLoading(false); }
  }

  async function handleInstalado() {
    setLoading(true);
    try {
      await marcarInstalado(v.id);
      finishWithSuccess(`🎉 ${v.nome_cliente ?? "Cliente"} marcado como instalado!`);
    } finally { setLoading(false); }
  }

  const status = v.status_instalacao;
  const statusLabel = {
    aguardando_agendamento: { label: "⏳ Ag. agendamento", color: "bg-yellow-100 text-yellow-700" },
    aguardando_resposta:    { label: "💬 Ag. resposta",    color: "bg-blue-100 text-blue-700"   },
    agendado:               { label: "📅 Agendado",        color: "bg-green-100 text-green-700" },
    instalado:              { label: "✅ Instalado",        color: "bg-gray-100 text-gray-600"  },
  };
  const statusCfg = statusLabel[status ?? "aguardando_agendamento"];

  const isAgendado = status === "agendado";
  const dateClass = isAgendado ? (
    classifyDate(v.data_instalacao) === "atrasada" ? "border-l-red-500" :
    classifyDate(v.data_instalacao) === "hoje"     ? "border-l-yellow-400" :
    "border-l-green-500"
  ) : "border-l-indigo-400";

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${dateClass}`}>
      {/* Header compacto */}
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-xl shrink-0">🏠</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{v.nome_cliente ?? "Cliente"}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusCfg.color}`}>{statusCfg.label}</span>
            {v.resposta_usuario_agendamento && status === "aguardando_agendamento" && (
              <span className="text-xs text-green-600 font-medium">✉️ Respondeu</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
            <span className="font-mono">📍 {locationToPlusCode(v.plus_code_cliente)}</span>
            <span>👤 {v.usuario}</span>
            {isAgendado && <span className="font-medium text-green-700">📅 {v.data_instalacao ? new Date(v.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"} — {v.periodo_instalacao} — {v.tecnico_instalacao}</span>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">

          {/* Dados da viabilidade */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 rounded-lg p-3">
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">CTO</p><p className="font-semibold">{v.cto_numero ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Distância</p><p className="font-semibold">{v.distancia_cliente ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Portas</p><p className="font-semibold">{v.portas_disponiveis ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Menor RX</p><p className="font-semibold">{v.menor_rx ? `${v.menor_rx} dBm` : "-"}</p></div>
          </div>

          {/* Conversa */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <MessageSquare className="w-3.5 h-3.5" /> Conversa com o cliente
            </div>

            {/* Mensagem do setor */}
            {v.obs_agendamento_tecnico && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                <p className="text-xs text-indigo-500 font-medium mb-0.5">🔧 Setor de agendamento · {formatDateTime(v.data_agendamento_tecnico)}</p>
                <p className="text-sm text-gray-800">{v.obs_agendamento_tecnico}</p>
              </div>
            )}

            {/* Resposta do usuário */}
            {v.resposta_usuario_agendamento && (
              <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2.5 ml-4">
                <p className="text-xs text-green-600 font-medium mb-0.5">👤 {v.usuario}</p>
                <p className="text-sm text-gray-800">{v.resposta_usuario_agendamento}</p>
              </div>
            )}

            {!v.obs_agendamento_tecnico && !v.resposta_usuario_agendamento && (
              <p className="text-xs text-gray-400 italic pl-1">Nenhuma mensagem ainda.</p>
            )}
          </div>

          {/* Histórico reagendamento */}
          {v.historico_reagendamento_tecnico && (
            <div className="bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-700">🔄 {v.historico_reagendamento_tecnico}</div>
          )}

          {/* Banner de sucesso */}
          {successMsg && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-medium">
              <span className="text-xl">🎉</span><span>{successMsg}</span>
            </div>
          )}

          {/* Ações */}
          {!successMsg && (
            <div className="space-y-2">
              {/* Botões principais */}
              <div className="flex flex-wrap gap-2">
                {!isAgendado && (
                  <button onClick={() => { setShowEnviarMsg(!showEnviarMsg); setShowAgendar(false); setShowReagendar(false); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showEnviarMsg ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>
                    <MessageSquare className="w-3.5 h-3.5" /> Enviar mensagem
                  </button>
                )}
                {!isAgendado && (
                  <button onClick={() => { setShowAgendar(!showAgendar); setShowEnviarMsg(false); setShowReagendar(false); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showAgendar ? "bg-green-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}`}>
                    📅 Agendar instalação
                  </button>
                )}
                {isAgendado && (
                  <>
                    <button onClick={handleInstalado} disabled={loading}
                      className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      ✅ Marcar como Instalado
                    </button>
                    <button onClick={() => { setShowReagendar(!showReagendar); setShowEnviarMsg(false); setShowAgendar(false); }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showReagendar ? "bg-yellow-50 border-yellow-400 text-yellow-700" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>
                      🔄 Reagendar
                    </button>
                    <button onClick={() => { setShowEnviarMsg(!showEnviarMsg); setShowReagendar(false); setShowAgendar(false); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showEnviarMsg ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>
                      <MessageSquare className="w-3.5 h-3.5" /> Mensagem
                    </button>
                  </>
                )}
              </div>

              {/* Form: enviar mensagem */}
              {showEnviarMsg && (
                <div className="border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-blue-800">💬 Enviar mensagem ao cliente</p>
                  <textarea placeholder="Ex: Olá! Temos disponibilidade na terça-feira de manhã. Funciona para você?"
                    value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                    rows={3} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="flex gap-2">
                    <button onClick={handleEnviarMsg} disabled={loading || !mensagem.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm">Enviar</button>
                    <button onClick={() => setShowEnviarMsg(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Form: agendar */}
              {showAgendar && (
                <div className="border border-green-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-green-800">📅 Agendar instalação</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={dataInstalacao} onChange={(e) => setDataInstalacao(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option>
                    </select>
                    <input placeholder="Técnico *" value={tecnico} onChange={(e) => setTecnico(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAgendar} disabled={loading}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                    <button onClick={() => setShowAgendar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Form: reagendar */}
              {showReagendar && (
                <div className="border border-yellow-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-yellow-800">🔄 Reagendar instalação</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={dataInstalacao} onChange={(e) => setDataInstalacao(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option>
                    </select>
                    <input placeholder="Técnico *" value={tecnico} onChange={(e) => setTecnico(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <textarea placeholder="Motivo (opcional)" value={motivoReagend} onChange={(e) => setMotivoReagend(e.target.value)}
                      rows={2} className="px-3 py-2 text-sm border rounded-lg focus:outline-none col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleReagendar} disabled={loading}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                    <button onClick={() => setShowReagendar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
