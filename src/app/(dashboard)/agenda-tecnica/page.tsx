"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getInstalacoesPendentes,
  getInstalacoesArquivadas,
  confirmarAgendamentoTecnico,
  marcarInstalado,
  finalizarViabilizacao,
} from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, Wrench, Search, ChevronDown, ChevronUp, History, Download } from "lucide-react";

type FilterKey = "todos" | "proposta_enviada" | "aguardando_confirmacao" | "agendado" | "instalado";

// ─── CSV export ───────────────────────────────────────────────────
function downloadCSV(rows: Record<string, string | number | undefined>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = rows.map((r) =>
    headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob(["﻿" + [headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

// ─── Helper de data ───────────────────────────────────────────────
function itemDate(v: Viabilizacao): string {
  return v.data_instalacao ?? v.proposta_data ?? v.data_solicitacao ?? "";
}

// ─── Page ─────────────────────────────────────────────────────────
export default function AgendaTecnicaPage() {
  const { user } = useAuth();

  // Ativos
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Arquivados
  const [arquivados, setArquivados] = useState<Viabilizacao[]>([]);
  const [loadingArq, setLoadingArq] = useState(false);
  const [arquivadosReady, setArquivadosReady] = useState(false);
  const [showArquivados, setShowArquivados] = useState(false);
  const [arquSearch, setArquSearch] = useState("");
  const [arquDateFrom, setArquDateFrom] = useState("");
  const [arquDateTo, setArquDateTo] = useState("");
  const [arquTecnico, setArquTecnico] = useState("todos");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getInstalacoesPendentes()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadArquivados() {
    if (arquivadosReady) return;
    setLoadingArq(true);
    try {
      setArquivados(await getInstalacoesArquivadas());
      setArquivadosReady(true);
    } finally { setLoadingArq(false); }
  }

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const counts = {
    todos:                  items.length,
    proposta_enviada:       items.filter((v) => v.status_instalacao === "proposta_enviada").length,
    aguardando_confirmacao: items.filter((v) => v.status_instalacao === "aguardando_confirmacao").length,
    agendado:               items.filter((v) => v.status_instalacao === "agendado").length,
    instalado:              items.filter((v) => v.status_instalacao === "instalado").length,
  };

  const chips = (
    [
      { key: "todos",                  label: `Todos (${counts.todos})` },
      { key: "proposta_enviada",       label: `📋 Nova proposta (${counts.proposta_enviada})` },
      { key: "aguardando_confirmacao", label: `⏳ Ag. confirmação (${counts.aguardando_confirmacao})` },
      { key: "agendado",               label: `📅 Agendados (${counts.agendado})` },
      { key: "instalado",              label: `✅ Instalados (${counts.instalado})` },
    ] as { key: FilterKey; label: string }[]
  ).filter((c) => c.key === "todos" || counts[c.key] > 0);

  const filtered = items
    .filter((v) => filter === "todos" || v.status_instalacao === filter)
    .filter((v) => {
      const d = itemDate(v);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo + "T23:59:59") return false;
      return true;
    })
    .filter((v) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.nome_cliente?.toLowerCase().includes(q) ||
        v.plus_code_cliente.toLowerCase().includes(q) ||
        v.usuario.toLowerCase().includes(q) ||
        v.tecnico_instalacao?.toLowerCase().includes(q)
      );
    });

  // Arquivados filtrados
  const tecnicosArq = ["todos", ...Array.from(new Set(arquivados.map((v) => v.tecnico_instalacao).filter(Boolean))) as string[]];

  const arquivadosFiltrados = arquivados
    .filter((v) => arquTecnico === "todos" || v.tecnico_instalacao === arquTecnico)
    .filter((v) => {
      const d = v.data_instalacao ?? v.data_finalizacao ?? "";
      if (arquDateFrom && d < arquDateFrom) return false;
      if (arquDateTo && d > arquDateTo + "T23:59:59") return false;
      return true;
    })
    .filter((v) => {
      if (!arquSearch.trim()) return true;
      const q = arquSearch.toLowerCase();
      return (
        v.nome_cliente?.toLowerCase().includes(q) ||
        v.plus_code_cliente.toLowerCase().includes(q) ||
        v.usuario.toLowerCase().includes(q) ||
        v.tecnico_instalacao?.toLowerCase().includes(q) ||
        v.cto_numero?.toLowerCase().includes(q)
      );
    });

  function downloadArquivados() {
    downloadCSV(
      arquivadosFiltrados.map((v) => ({
        "Dt. Instalação": v.data_instalacao ? new Date(v.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR") : "-",
        "Dt. Arquivamento": formatDateTime(v.data_finalizacao),
        Cliente:     v.nome_cliente ?? "-",
        Solicitante: v.usuario,
        "Plus Code": locationToPlusCode(v.plus_code_cliente),
        CTO:         v.cto_numero ?? "-",
        Distância:   v.distancia_cliente ?? "-",
        "Menor RX":  v.menor_rx ? `${v.menor_rx} dBm` : "-",
        Técnico:     v.tecnico_instalacao ?? "-",
        Período:     v.periodo_instalacao ?? "-",
        "Status Inst.": v.status_instalacao ?? "-",
      })),
      "instalacoes_arquivadas.csv"
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔧 Agenda Técnica</h1>
          <p className="text-gray-500 text-sm mt-1">
            Instalações FTTH
            {counts.proposta_enviada > 0 && <span className="text-orange-600 font-medium"> · {counts.proposta_enviada} aguardando análise</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Filtros ativos */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar por cliente, plus code, técnico ou solicitante..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">Data de</p>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">até</p>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-2">Limpar</button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === c.key
                  ? c.key === "proposta_enviada" ? "bg-orange-600 text-white" : "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista ativa */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma instalação ativa.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border text-gray-400">Nenhum resultado para os filtros aplicados.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <AgendaTecnicaCard key={v.id} v={v} onRefresh={load} />
          ))}
        </div>
      )}

      {/* ─── Arquivados ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <button
          onClick={() => { setShowArquivados((s) => { if (!s) loadArquivados(); return !s; }); }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-gray-800">📁 Arquivados</span>
            <span className="text-xs text-gray-400 font-normal hidden sm:inline">— instalações finalizadas</span>
          </div>
          {showArquivados ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showArquivados && (
          <div className="border-t">
            {loadingArq ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <p className="text-sm">Carregando arquivados...</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Filtros arquivados */}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por cliente, plus code, CTO ou técnico..."
                      value={arquSearch} onChange={(e) => setArquSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Data de</p>
                    <input type="date" value={arquDateFrom} onChange={(e) => setArquDateFrom(e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">até</p>
                    <input type="date" value={arquDateTo} onChange={(e) => setArquDateTo(e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <select value={arquTecnico} onChange={(e) => setArquTecnico(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm self-end focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {tecnicosArq.map((t) => (
                      <option key={t} value={t}>{t === "todos" ? "Todos os técnicos" : `👷 ${t}`}</option>
                    ))}
                  </select>
                  {(arquDateFrom || arquDateTo) && (
                    <button onClick={() => { setArquDateFrom(""); setArquDateTo(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-2">Limpar datas</button>
                  )}
                  <button onClick={downloadArquivados}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium self-end">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>

                <p className="text-xs text-gray-400">{arquivadosFiltrados.length} de {arquivados.length} registro(s)</p>

                {arquivadosFiltrados.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">Nenhum registro arquivado encontrado.</div>
                ) : (
                  <div className="overflow-auto rounded-lg border max-h-[420px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Dt. Instalação</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Dt. Arquivamento</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Cliente</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Solicitante</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Plus Code</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">CTO</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Distância</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Menor RX</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Técnico</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Período</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {arquivadosFiltrados.map((v) => (
                          <tr key={v.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap text-xs font-medium">
                              {v.data_instalacao ? new Date(v.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap text-xs">{formatDateTime(v.data_finalizacao)}</td>
                            <td className="px-3 py-2.5 max-w-[140px] truncate">{v.nome_cliente ?? "-"}</td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{v.usuario}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{locationToPlusCode(v.plus_code_cliente)}</td>
                            <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{v.cto_numero ?? "-"}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{v.distancia_cliente ?? "-"}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{v.menor_rx ? `${v.menor_rx} dBm` : "-"}</td>
                            <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{v.tecnico_instalacao ?? "-"}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{v.periodo_instalacao ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card de instalação ────────────────────────────────────────────
function AgendaTecnicaCard({ v, onRefresh }: { v: Viabilizacao; onRefresh: () => void }) {
  const [open, setOpen] = useState(v.status_instalacao === "proposta_enviada");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmar, setShowConfirmar] = useState(false);

  const [agData, setAgData] = useState(v.proposta_data ?? "");
  const [agPeriodo, setAgPeriodo] = useState(v.proposta_periodo ?? "Manhã");
  const [agTecnico, setAgTecnico] = useState(v.agendamento_tecnico ?? "");
  const [agObs, setAgObs] = useState("");

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  async function handleConfirmar() {
    if (!agData || !agTecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await confirmarAgendamentoTecnico(
        v.id,
        { agendamento_data: agData, agendamento_periodo: agPeriodo, agendamento_tecnico: agTecnico, agendamento_obs: agObs || undefined },
        { proposta_data: v.proposta_data, proposta_periodo: v.proposta_periodo },
        v.historico_agendamento
      );
      const alterou = agData !== v.proposta_data || agPeriodo !== v.proposta_periodo;
      finishWithSuccess(alterou
        ? "🔄 Proposta alterada e enviada ao cliente para confirmação."
        : `📅 Agendado! ${new Date(agData + "T12:00:00").toLocaleDateString("pt-BR")} — ${agPeriodo} — ${agTecnico}.`
      );
    } finally { setLoading(false); }
  }

  async function handleInstalado() {
    setLoading(true);
    try {
      await marcarInstalado(v.id);
      finishWithSuccess("✅ Marcado como instalado! Aguardando arquivamento.");
    } finally { setLoading(false); }
  }

  async function handleArquivar() {
    setLoading(true);
    try {
      await finalizarViabilizacao(v.id);
      onRefresh();
    } finally { setLoading(false); }
  }

  const status = v.status_instalacao;
  const statusCfg: Record<string, { label: string; color: string }> = {
    proposta_enviada:       { label: "📋 Nova proposta",           color: "bg-orange-100 text-orange-700" },
    aguardando_confirmacao: { label: "⏳ Ag. confirmação cliente", color: "bg-yellow-100 text-yellow-700" },
    agendado:               { label: "📅 Agendado",               color: "bg-green-100 text-green-700"  },
    instalado:              { label: "✅ Instalado",              color: "bg-blue-100 text-blue-700"    },
  };
  const cfg = statusCfg[status ?? ""] ?? { label: status ?? "-", color: "bg-gray-100 text-gray-600" };

  const borderColor =
    status === "proposta_enviada"       ? "border-l-orange-500" :
    status === "aguardando_confirmacao" ? "border-l-yellow-400" :
    status === "agendado"               ? "border-l-green-500"  :
    "border-l-blue-400";

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${borderColor}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-xl shrink-0">🏠</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{v.nome_cliente ?? "Cliente"}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
            <span className="font-mono">📍 {locationToPlusCode(v.plus_code_cliente)}</span>
            <span>👤 {v.usuario}</span>
            {status === "proposta_enviada" && v.proposta_data && (
              <span className="font-medium text-orange-600">Proposta: {new Date(v.proposta_data + "T12:00:00").toLocaleDateString("pt-BR")} — {v.proposta_periodo}</span>
            )}
            {status === "agendado" && v.data_instalacao && (
              <span className="font-medium text-green-700">📅 {new Date(v.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR")} — {v.periodo_instalacao} — {v.tecnico_instalacao}</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">
          {/* Dados técnicos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 rounded-lg p-3">
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">CTO</p><p className="font-semibold">{v.cto_numero ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Distância</p><p className="font-semibold">{v.distancia_cliente ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Portas</p><p className="font-semibold">{v.portas_disponiveis ?? "-"}</p></div>
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Menor RX</p><p className="font-semibold">{v.menor_rx ? `${v.menor_rx} dBm` : "-"}</p></div>
          </div>

          {/* Negociação */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📋 Negociação</p>
            {v.proposta_data && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                <p className="text-xs text-blue-500 font-medium mb-0.5">👤 Proposta do usuário</p>
                <p className="text-sm text-gray-800 font-medium">
                  📆 {new Date(v.proposta_data + "T12:00:00").toLocaleDateString("pt-BR")} — {v.proposta_periodo}
                </p>
                {v.proposta_obs && <p className="text-sm text-gray-600 mt-1">📝 {v.proposta_obs}</p>}
              </div>
            )}
            {v.agendamento_obs && (
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5 ml-4">
                <p className="text-xs text-orange-500 font-medium mb-0.5">🔧 Agendamento alterou</p>
                <p className="text-sm text-gray-800 font-medium">
                  📆 {v.agendamento_data ? new Date(v.agendamento_data + "T12:00:00").toLocaleDateString("pt-BR") : "-"} — {v.agendamento_periodo}
                </p>
                <p className="text-sm text-gray-600 mt-1">📝 {v.agendamento_obs}</p>
              </div>
            )}
            {status === "aguardando_confirmacao" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800">
                ⏳ Aguardando o cliente confirmar a nova data.
              </div>
            )}
            {v.historico_agendamento && (
              <details className="text-xs text-gray-400 cursor-pointer">
                <summary className="hover:text-gray-600">Ver histórico</summary>
                <pre className="mt-1 whitespace-pre-wrap text-gray-500 bg-gray-50 p-2 rounded-lg">{v.historico_agendamento}</pre>
              </details>
            )}
          </div>

          {successMsg && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-medium">
              <span className="text-xl">🎉</span><span>{successMsg}</span>
            </div>
          )}

          {!successMsg && (
            <div className="space-y-2">
              {status === "proposta_enviada" && (
                <>
                  {!showConfirmar ? (
                    <button onClick={() => setShowConfirmar(true)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium">
                      🔧 Analisar e confirmar data/técnico
                    </button>
                  ) : (
                    <div className="border border-indigo-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-medium text-indigo-800">
                        🔧 Confirmar agendamento
                        {v.proposta_data && <span className="text-xs text-gray-500 ml-2">(proposta: {new Date(v.proposta_data + "T12:00:00").toLocaleDateString("pt-BR")} {v.proposta_periodo})</span>}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={agData} onChange={(e) => setAgData(e.target.value)}
                          className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <select value={agPeriodo} onChange={(e) => setAgPeriodo(e.target.value)}
                          className="px-3 py-2 text-sm border rounded-lg">
                          <option>Manhã</option><option>Tarde</option>
                        </select>
                        <input placeholder="Técnico *" value={agTecnico} onChange={(e) => setAgTecnico(e.target.value)}
                          className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <textarea placeholder="Observação para o cliente (se alterar data)"
                          value={agObs} onChange={(e) => setAgObs(e.target.value)}
                          rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                      </div>
                      <p className={`text-xs ${agData === v.proposta_data && agPeriodo === v.proposta_periodo ? "text-green-600" : "text-orange-600"}`}>
                        {agData === v.proposta_data && agPeriodo === v.proposta_periodo
                          ? "✅ Confirmando a data proposta → agendado direto"
                          : "⚠️ Data diferente da proposta → cliente precisará confirmar"}
                      </p>
                      <div className="flex gap-2">
                        <button onClick={handleConfirmar} disabled={loading}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                        <button onClick={() => setShowConfirmar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {status === "agendado" && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                  <div className="text-sm space-y-0.5">
                    <p className="font-medium text-green-800">📅 Instalação confirmada</p>
                    <p>Data: <strong>{v.data_instalacao ? new Date(v.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</strong></p>
                    <p>Período: {v.periodo_instalacao} · Técnico: {v.tecnico_instalacao}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleInstalado} disabled={loading}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">
                      ✅ Marcar como Instalado
                    </button>
                    <button onClick={handleArquivar} disabled={loading}
                      className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                      📁 Arquivar
                    </button>
                  </div>
                </div>
              )}

              {status === "instalado" && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-blue-800">✅ Instalação concluída</p>
                    <p className="text-xs text-blue-600">Técnico: {v.tecnico_instalacao ?? "-"} · {v.periodo_instalacao}</p>
                  </div>
                  <button onClick={handleArquivar} disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                    📁 Arquivar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
