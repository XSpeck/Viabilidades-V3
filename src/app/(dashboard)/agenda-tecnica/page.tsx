"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getInstalacoesPendentes,
  getInstalacoesArquivadas,
  confirmarAgendamentoTecnico,
  marcarInstalado,
  finalizarViabilizacao,
  reagendarInstalacao,
  atribuirTecnicoInstalacao,
} from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, Wrench, Search, ChevronDown, ChevronUp, History, Download } from "lucide-react";
import { canAccess } from "@/lib/access";

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
  const [view, setView] = useState<"ftth" | "ftta_utp">("ftth");
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

  if (!canAccess(user ?? null, "agenda-tecnica")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const isUTPItem    = (v: Viabilizacao) => v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP";
  const isFtthLike   = (v: Viabilizacao) => (v.tipo_instalacao === "FTTH" || v.tipo_instalacao === "Condomínio") && !isUTPItem(v);
  const itemsFtth    = items.filter(isFtthLike);
  const itemsFttaUtp = items.filter((v) => !isFtthLike(v));
  const activeItems  = view === "ftth" ? itemsFtth : itemsFttaUtp;

  const counts = {
    todos:                  activeItems.length,
    proposta_enviada:       activeItems.filter((v) => v.status_instalacao === "proposta_enviada").length,
    aguardando_confirmacao: activeItems.filter((v) => v.status_instalacao === "aguardando_confirmacao").length,
    agendado:               activeItems.filter((v) => v.status_instalacao === "agendado").length,
    instalado:              activeItems.filter((v) => v.status_instalacao === "instalado").length,
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

  const filtered = activeItems
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
  const activeArquivados = view === "ftth"
    ? arquivados.filter(isFtthLike)
    : arquivados.filter((v) => !isFtthLike(v));

  const tecnicosArq = ["todos", ...Array.from(new Set(activeArquivados.map((v) => v.tecnico_instalacao).filter(Boolean))) as string[]];

  const arquivadosFiltrados = activeArquivados
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
        OLT:         v.olt ?? "-",
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
            {view === "ftth" ? "Instalações FTTH" : "Agendamentos FTTA / UTP"}
            {counts.proposta_enviada > 0 && <span className="text-orange-600 font-medium"> · {counts.proposta_enviada} aguardando análise</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Tabs FTTH / FTTA+UTP */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => { setView("ftth"); setFilter("todos"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "ftth" ? "bg-white shadow text-indigo-700 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
        >
          🏠 FTTH <span className="ml-1 text-xs text-gray-400">({itemsFtth.length})</span>
        </button>
        <button
          onClick={() => { setView("ftta_utp"); setFilter("todos"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "ftta_utp" ? "bg-white shadow text-indigo-700 font-semibold" : "text-gray-500 hover:text-gray-700"}`}
        >
          🏢 FTTA / 📡 UTP <span className="ml-1 text-xs text-gray-400">({itemsFttaUtp.length})</span>
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
      ) : activeItems.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{view === "ftth" ? "Nenhuma instalação FTTH ativa." : "Nenhum agendamento FTTA/UTP ativo."}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border text-gray-400">Nenhum resultado para os filtros aplicados.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <AgendaTecnicaCard key={v.id} v={v} isFttaUtp={view === "ftta_utp"} onRefresh={load} />
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
                  <div className="space-y-2">
                    {arquivadosFiltrados.map((v) => (
                      <ArquivadoCard key={v.id} v={v} />
                    ))}
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
function AgendaTecnicaCard({ v, isFttaUtp = false, onRefresh }: { v: Viabilizacao; isFttaUtp?: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(v.status_instalacao === "proposta_enviada");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [showReagendar, setShowReagendar] = useState(false);

  // ── Confirmar agendamento ──────────────────────────────
  const [agData, setAgData] = useState(v.proposta_data ?? "");
  const [agPeriodo, setAgPeriodo] = useState(v.proposta_periodo ?? "Manhã");
  const [agObs, setAgObs] = useState("");

  // ── Atribuir técnico ───────────────────────────────────
  const [tecnicoAtribuir, setTecnicoAtribuir] = useState("");
  const [salvandoTecnico, setSalvandoTecnico] = useState(false);

  // ── Reagendar ──────────────────────────────────────────
  const [reagData, setReagData] = useState(v.data_instalacao ?? "");
  const [reagPeriodo, setReagPeriodo] = useState(v.periodo_instalacao ?? "Manhã");
  const [reagTecnico, setReagTecnico] = useState(v.tecnico_instalacao ?? "");
  const [reagMotivo, setReagMotivo] = useState("");

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  async function handleConfirmar() {
    if (!agData) { alert("Preencha a data!"); return; }
    setLoading(true);
    try {
      await confirmarAgendamentoTecnico(
        v.id,
        { agendamento_data: agData, agendamento_periodo: agPeriodo, agendamento_obs: agObs || undefined },
        { proposta_data: v.proposta_data, proposta_periodo: v.proposta_periodo },
        v.historico_agendamento
      );
      const alterou = agData !== v.proposta_data || agPeriodo !== v.proposta_periodo;
      finishWithSuccess(alterou
        ? "🔄 Proposta alterada e enviada ao cliente para confirmação."
        : `📅 ${isFttaUtp ? "Visita agendada" : "Agendado"}! ${new Date(agData + "T12:00:00").toLocaleDateString("pt-BR")} — ${agPeriodo}.`
      );
    } finally { setLoading(false); }
  }

  async function handleAtribuirTecnico() {
    if (!tecnicoAtribuir.trim()) return;
    setSalvandoTecnico(true);
    try {
      await atribuirTecnicoInstalacao(v.id, tecnicoAtribuir.trim());
      finishWithSuccess(`👷 Técnico ${tecnicoAtribuir.trim()} atribuído!`);
    } finally { setSalvandoTecnico(false); }
  }

  async function handleReagendar() {
    if (!reagData || !reagTecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await reagendarInstalacao(
        v.id,
        { data_instalacao: reagData, periodo_instalacao: reagPeriodo, tecnico_instalacao: reagTecnico, motivo: reagMotivo || undefined },
        v.historico_agendamento
      );
      finishWithSuccess(`🔄 Reagendado para ${new Date(reagData + "T12:00:00").toLocaleDateString("pt-BR")} — ${reagPeriodo} — ${reagTecnico}.`);
    } finally { setLoading(false); }
  }

  async function handleInstalado() {
    setLoading(true);
    try {
      await marcarInstalado(v.id);
      finishWithSuccess(isFttaUtp ? "✅ Visita concluída! Aguardando arquivamento pelo usuário." : "✅ Marcado como instalado! Aguardando arquivamento pelo usuário.");
    } finally { setLoading(false); }
  }

  async function handleArquivar() {
    setLoading(true);
    try { await finalizarViabilizacao(v.id); onRefresh(); }
    finally { setLoading(false); }
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

  const fmtData = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "N/A";

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${borderColor}`}>

      {/* ── Cabeçalho (sempre visível) ── */}
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-xl shrink-0">{v.status === "utp" ? "📡" : v.tipo_instalacao === "FTTH" ? "🏠" : "🏢"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">
              {v.tipo_instalacao !== "FTTH" && v.predio_ftta ? `${v.predio_ftta} — ` : ""}{v.nome_cliente ?? "Cliente"}
            </span>
            {v.status === "utp" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-purple-100 text-purple-700">📡 UTP</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>{cfg.label}</span>
            {status === "agendado" && v.data_instalacao && (
              <span className="text-xs font-medium text-green-700 shrink-0">
                {fmtData(v.data_instalacao)} · {v.periodo_instalacao}{v.tecnico_instalacao ? ` · 👷 ${v.tecnico_instalacao}` : " · ⚠️ sem técnico"}
              </span>
            )}
            {status === "instalado" && v.data_instalacao && (
              <span className="text-xs text-blue-600 shrink-0">{fmtData(v.data_instalacao)} · 👷 {v.tecnico_instalacao}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-0.5">
            <span className="font-mono">📍 {locationToPlusCode(v.plus_code_cliente)}</span>
            <span>👤 {v.usuario}</span>
            {status === "proposta_enviada" && v.proposta_data && (
              <span className="font-medium text-orange-600">
                Proposta: {fmtData(v.proposta_data)} — {v.proposta_periodo}
              </span>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-4">

          {/* ── Dados técnicos ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-gray-50 rounded-lg p-3">
            {v.tipo_instalacao === "FTTH" ? (
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">CTO</p><p className="font-semibold text-gray-800">{v.cto_numero ?? "-"}</p></div>
            ) : (
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">CDOI</p><p className="font-semibold text-gray-800">{v.cdoi ?? "-"}</p></div>
            )}
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">OLT</p><p className="font-semibold text-gray-800">{v.olt ?? "-"}</p></div>
            {v.tipo_instalacao === "FTTH" ? (
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">Distância</p><p className="font-semibold text-gray-800">{v.distancia_cliente ?? "-"}</p></div>
            ) : (
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">Prédio</p><p className="font-semibold text-gray-800">{v.predio_ftta ?? "-"}</p></div>
            )}
            <div><p className="text-gray-400 uppercase font-medium mb-0.5">Portas</p><p className="font-semibold text-gray-800">{v.portas_disponiveis ?? "-"}</p></div>
            <div>
              <p className="text-gray-400 uppercase font-medium mb-0.5">{v.tipo_instalacao === "FTTH" ? "Menor RX" : "Média RX"}</p>
              <p className="font-semibold text-gray-800">{(v.tipo_instalacao === "FTTH" ? v.menor_rx : v.media_rx) ? `${v.tipo_instalacao === "FTTH" ? v.menor_rx : v.media_rx} dBm` : "-"}</p>
            </div>
          </div>

          {/* ── Conteúdo por status ── */}

          {/* PROPOSTA ENVIADA — negociação em destaque */}
          {status === "proposta_enviada" && (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">👤 Proposta do usuário</p>
                <p className="font-medium text-gray-800">📆 {fmtData(v.proposta_data)} — {v.proposta_periodo}</p>
                {v.proposta_obs && <p className="text-gray-600 mt-1">📝 {v.proposta_obs}</p>}
              </div>
              {!showConfirmar ? (
                <button onClick={() => setShowConfirmar(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium">
                  {isFttaUtp ? "🗓️ Definir data da visita" : "🔧 Definir data e técnico"}
                </button>
              ) : (
                <div className="border border-indigo-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-indigo-800">{isFttaUtp ? "🗓️ Confirmar visita" : "🔧 Confirmar agendamento"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={agData} onChange={(e) => setAgData(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <select value={agPeriodo} onChange={(e) => setAgPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option><option>Dia todo</option>
                    </select>
                    <textarea placeholder="Observação para o cliente (se alterar data)" value={agObs} onChange={(e) => setAgObs(e.target.value)}
                      rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                  </div>
                  <p className={`text-xs font-medium ${agData === v.proposta_data && agPeriodo === v.proposta_periodo ? "text-green-600" : "text-orange-600"}`}>
                    {agData === v.proposta_data && agPeriodo === v.proposta_periodo
                      ? "✅ Mesma data proposta — confirmado direto"
                      : "⚠️ Data diferente — cliente precisará confirmar"}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmar} disabled={loading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
                      {loading ? "..." : "Confirmar"}
                    </button>
                    <button onClick={() => setShowConfirmar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AGUARDANDO CONFIRMAÇÃO — aguardando cliente */}
          {status === "aguardando_confirmacao" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                  <p className="text-xs text-blue-500 font-medium mb-0.5">👤 Usuário pediu</p>
                  <p className="font-medium text-gray-800">{fmtData(v.proposta_data)} — {v.proposta_periodo}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
                  <p className="text-xs text-orange-500 font-medium mb-0.5">🔧 Agendamento propôs</p>
                  <p className="font-medium text-gray-800">{fmtData(v.agendamento_data)} — {v.agendamento_periodo}</p>
                  {v.agendamento_obs && <p className="text-xs text-gray-500 mt-0.5">📝 {v.agendamento_obs}</p>}
                </div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800 text-center">
                ⏳ Aguardando confirmação do cliente.
              </div>
            </div>
          )}

          {/* AGENDADO — data confirmada + ações */}
          {status === "agendado" && (
            <div className="space-y-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">{isFttaUtp ? "📅 Visita confirmada" : "📅 Instalação confirmada"}</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-400 text-xs mb-0.5">Data</p><p className="font-semibold text-gray-800">{fmtData(v.data_instalacao)}</p></div>
                  <div><p className="text-gray-400 text-xs mb-0.5">Período</p><p className="font-semibold text-gray-800">{v.periodo_instalacao}</p></div>
                  <div>
                    <p className="text-gray-400 text-xs mb-0.5">Técnico</p>
                    <p className="font-semibold text-gray-800">{v.tecnico_instalacao ?? <span className="text-orange-500 italic">não atribuído</span>}</p>
                  </div>
                </div>
                {(v.agendamento_obs || v.proposta_obs) && (
                  <p className="text-xs text-gray-500 mt-1.5">📝 {v.agendamento_obs ?? v.proposta_obs}</p>
                )}
              </div>

              {/* Atribuir técnico quando ainda não definido */}
              {!v.tecnico_instalacao && (
                <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-orange-800">👷 Atribuir técnico</p>
                  <div className="flex gap-2">
                    <input
                      placeholder="Nome do técnico *"
                      value={tecnicoAtribuir}
                      onChange={(e) => setTecnicoAtribuir(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <button
                      onClick={handleAtribuirTecnico}
                      disabled={salvandoTecnico || !tecnicoAtribuir.trim()}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white rounded-lg text-sm font-medium"
                    >
                      {salvandoTecnico ? "..." : "Atribuir"}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleInstalado} disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">
                  {isFttaUtp ? "✅ Marcar como Concluído" : "✅ Marcar como Instalado"}
                </button>
                <button onClick={() => setShowReagendar(!showReagendar)} disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${showReagendar ? "bg-yellow-50 border-yellow-400 text-yellow-700" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                  🔄 Reagendar
                </button>

              </div>
              {showReagendar && (
                <div className="border border-yellow-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-yellow-800">{isFttaUtp ? "🔄 Reagendar visita" : "🔄 Reagendar instalação"}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={reagData} onChange={(e) => setReagData(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <select value={reagPeriodo} onChange={(e) => setReagPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option><option>Dia todo</option>
                    </select>
                    <input placeholder="Técnico *" value={reagTecnico} onChange={(e) => setReagTecnico(e.target.value)}
                      className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    <textarea placeholder="Motivo do reagendamento (opcional)" value={reagMotivo} onChange={(e) => setReagMotivo(e.target.value)}
                      rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleReagendar} disabled={loading || !reagData || !reagTecnico.trim()}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-300 text-white py-2 rounded-lg text-sm font-medium">
                      {loading ? "..." : "Confirmar reagendamento"}
                    </button>
                    <button onClick={() => setShowReagendar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INSTALADO — conclusão + arquivar */}
          {status === "instalado" && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm space-y-0.5">
                <p className="font-medium text-blue-800">{isFttaUtp ? "✅ Visita concluída" : "✅ Instalação concluída"}</p>
                <p className="text-blue-700">{fmtData(v.data_instalacao)} · {v.periodo_instalacao} · 👷 {v.tecnico_instalacao}</p>
                <p className="text-xs text-blue-500">Aguardando arquivamento pelo usuário.</p>
              </div>
              <button onClick={handleArquivar} disabled={loading}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                📁 Arquivar
              </button>
            </div>
          )}

          {/* ── Histórico de negociação (colapsado) ── */}
          {v.historico_agendamento && (
            <details className="text-xs">
              <summary className="text-gray-400 hover:text-gray-600 cursor-pointer select-none">Ver histórico de negociação</summary>
              <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-gray-50 border rounded-lg p-2.5 leading-relaxed">{v.historico_agendamento}</pre>
            </details>
          )}

          {/* ── Banner de sucesso ── */}
          {successMsg && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-medium">
              <span className="text-xl">🎉</span><span>{successMsg}</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Card de instalação arquivada ──────────────────────────────────
function ArquivadoCard({ v }: { v: Viabilizacao }) {
  const [open, setOpen] = useState(false);
  const fmtData = (d?: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "-";

  const isFTTH = v.tipo_instalacao === "FTTH";
  const isUTP = v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP";

  const tipoBadge = isUTP
    ? { icon: "📡", label: "UTP",        color: "bg-purple-100 text-purple-700" }
    : isFTTH
    ? { icon: "🏠", label: "FTTH",       color: "bg-blue-100 text-blue-700"    }
    : v.tipo_instalacao === "Condomínio"
    ? { icon: "🏘️", label: "Condomínio", color: "bg-teal-100 text-teal-700"    }
    : { icon: "🏢", label: "FTTA",       color: "bg-indigo-100 text-indigo-700" };

  return (
    <div className="bg-white rounded-xl border border-l-4 border-l-gray-300 overflow-hidden">

      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-lg shrink-0">{tipoBadge.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{v.nome_cliente ?? "Cliente"}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${tipoBadge.color}`}>{tipoBadge.label}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">Arquivado</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-0.5">
            <span>📅 {fmtData(v.data_instalacao)} · {v.periodo_instalacao ?? "-"}</span>
            <span>👷 {v.tecnico_instalacao ?? "-"}</span>
            <span>👤 {v.usuario}</span>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-4">

          {/* Resumo da instalação */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">✅ Instalação concluída</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-gray-400 text-xs mb-0.5">Data</p><p className="font-semibold text-gray-800">{fmtData(v.data_instalacao)}</p></div>
              <div><p className="text-gray-400 text-xs mb-0.5">Período</p><p className="font-semibold text-gray-800">{v.periodo_instalacao ?? "-"}</p></div>
              <div><p className="text-gray-400 text-xs mb-0.5">Técnico</p><p className="font-semibold text-gray-800">{v.tecnico_instalacao ?? "-"}</p></div>
              <div><p className="text-gray-400 text-xs mb-0.5">Arquivado em</p><p className="font-semibold text-gray-800">{formatDateTime(v.data_finalizacao)}</p></div>
            </div>
          </div>

          {/* Cliente */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">👤 Cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 text-sm text-gray-700">
              <p><span className="text-gray-400">Nome:</span> {v.nome_cliente ?? "-"}</p>
              <p><span className="text-gray-400">Solicitante:</span> {v.usuario}</p>
              <p><span className="text-gray-400">Plus Code:</span> <span className="font-mono text-xs">{locationToPlusCode(v.plus_code_cliente)}</span></p>
            </div>
          </div>

          {/* Dados técnicos */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">🔧 Dados técnicos</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs bg-gray-50 rounded-lg p-3">
              {isFTTH ? (
                <div><p className="text-gray-400 uppercase font-medium mb-0.5">CTO</p><p className="font-semibold text-gray-800">{v.cto_numero ?? "-"}</p></div>
              ) : (
                <div><p className="text-gray-400 uppercase font-medium mb-0.5">CDOI</p><p className="font-semibold text-gray-800">{v.cdoi ?? "-"}</p></div>
              )}
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">OLT</p><p className="font-semibold text-gray-800">{v.olt ?? "-"}</p></div>
              {isFTTH ? (
                <div><p className="text-gray-400 uppercase font-medium mb-0.5">Distância</p><p className="font-semibold text-gray-800">{v.distancia_cliente ?? "-"}</p></div>
              ) : (
                <div><p className="text-gray-400 uppercase font-medium mb-0.5">Prédio</p><p className="font-semibold text-gray-800">{v.predio_ftta ?? "-"}</p></div>
              )}
              <div><p className="text-gray-400 uppercase font-medium mb-0.5">Portas</p><p className="font-semibold text-gray-800">{v.portas_disponiveis ?? "-"}</p></div>
              <div>
                <p className="text-gray-400 uppercase font-medium mb-0.5">{isFTTH ? "Menor RX" : "Média RX"}</p>
                <p className="font-semibold text-gray-800">{(isFTTH ? v.menor_rx : v.media_rx) ? `${isFTTH ? v.menor_rx : v.media_rx} dBm` : "-"}</p>
              </div>
            </div>
          </div>

          {/* Proposta original */}
          {v.proposta_data && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">📋 Proposta original do cliente</p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                <p>📆 {fmtData(v.proposta_data)} — {v.proposta_periodo}</p>
                {v.proposta_obs && <p className="text-gray-500 mt-0.5">📝 {v.proposta_obs}</p>}
              </div>
            </div>
          )}

          {/* Histórico */}
          {v.historico_agendamento && (
            <details className="text-xs">
              <summary className="text-gray-400 hover:text-gray-600 cursor-pointer select-none">Ver histórico de negociação</summary>
              <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-gray-50 border rounded-lg p-2.5 leading-relaxed">{v.historico_agendamento}</pre>
            </details>
          )}

        </div>
      )}
    </div>
  );
}
