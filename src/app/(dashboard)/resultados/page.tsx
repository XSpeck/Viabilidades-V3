"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesUsuario, getViabilizacoesHistorico, finalizarViabilizacao, arquivarPorDesistencia, enviarDadosPredio, enviarPropostaInstalacao, confirmarPropostaUsuario, contestarViabilizacao, reenviarParaAuditoria, confirmarPropostaVisita, contraproporVisita } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, CheckCircle, XCircle, Clock, Building2, Search, History, Download, ChevronDown, ChevronUp } from "lucide-react";
import { canAccess } from "@/lib/access";
import FluxoStepper from "@/components/resultados/FluxoStepper";
import TempoDecorrido from "@/components/TempoDecorrido";

type StatusFilter =
  | "todos" | "analise" | "aprovado" | "ag_dados" | "agendado" | "estruturado" | "sem_viab" | "utp"
  | "ag_inst" | "neg_inst" | "inst_agendado" | "instalado" | "em_revisao" | "contestado";
type TipoFilter = "todos" | "FTTH" | "Prédio" | "Condomínio";

export default function ResultadosPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");

  const [historico, setHistorico] = useState<Viabilizacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historicoReady, setHistoricoReady] = useState(false);
  const [histSearch, setHistSearch] = useState("");
  const [histTipo, setHistTipo] = useState<TipoFilter>("todos");
  const [histStatus, setHistStatus] = useState("todos");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setResults(await getViabilizacoesUsuario([user.nome, user.login, user.uid, `${user.nome}@viabilidade.com`])); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!canAccess(user ?? null, "resultados")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  async function loadHistorico() {
    if (!user || historicoReady) return;
    setLoadingHistorico(true);
    try {
      setHistorico(await getViabilizacoesHistorico([user.nome, user.login, user.uid, `${user.nome}@viabilidade.com`]));
      setHistoricoReady(true);
    } finally { setLoadingHistorico(false); }
  }

  function downloadHistoricoCSV() {
    const rows = historicoFiltrado.map((v) => ({
      Data:        formatDateTime(v.data_solicitacao),
      Tipo:        v.tipo_instalacao,
      Cliente:     v.nome_cliente ?? "-",
      "Plus Code": locationToPlusCode(v.plus_code_cliente),
      Prédio:      v.predio_ftta ?? "-",
      Status:      v.status,
      "CTO/CDOI":  v.cdoi ?? v.cto_numero ?? "-",
      OLT:         v.olt ?? "-",
      Distância:   v.distancia_cliente ?? "-",
      Auditor:     v.auditado_por ?? "-",
      "Dt. Audit.":formatDateTime(v.data_auditoria),
    }));
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = rows.map((r) => headers.map((h) => `"${String(r[h as keyof typeof r] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob(["﻿" + [headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `historico_${user?.nome?.replace(/\s/g, "_")}.csv`; a.click();
  }

  const statusOptions = [
    { key: "todos",         label: "Todos os status"   },
    { key: "pendente",      label: "Pendente"           },
    { key: "em_auditoria",  label: "Em auditoria"       },
    { key: "em_revisao",    label: "Devolvida / Em revisão" },
    { key: "aprovado",      label: "Aprovado"           },
    { key: "em_agendamento",label: "Em agendamento"     },
    { key: "rejeitado",     label: "Sem viabilidade"    },
    { key: "utp",           label: "UTP"                },
    { key: "finalizado",    label: "Finalizado"         },
  ];

  const historicoFiltrado = historico
    .filter((v) => histTipo === "todos" || v.tipo_instalacao === histTipo)
    .filter((v) => {
      if (histStatus === "todos") return true;
      if (histStatus === "em_agendamento")
        return (
          v.status_predio === "agendado" ||
          v.status_predio === "pronto_auditoria" ||
          (v.status_instalacao != null && v.status_instalacao !== "instalado")
        );
      return v.status === histStatus;
    })
    .filter((v) => {
      if (!histSearch.trim()) return true;
      const q = histSearch.toLowerCase();
      return (
        v.nome_cliente?.toLowerCase().includes(q) ||
        v.plus_code_cliente.toLowerCase().includes(q) ||
        v.predio_ftta?.toLowerCase().includes(q) ||
        v.cto_numero?.toLowerCase().includes(q)
      );
    });

  async function handleFinalizar(id: string) {
    await finalizarViabilizacao(id);
    load();
  }

  const counts = {
    analise:      results.filter((r) => ["pendente", "em_auditoria"].includes(r.status) && !r.status_predio && !r.status_instalacao).length,
    aprovado:     results.filter((r) => r.status === "aprovado" && !r.status_predio && !r.status_instalacao).length,
    ag_dados:     results.filter((r) => r.status_predio === "aguardando_dados").length,
    agendado:     results.filter((r) => ["pronto_auditoria", "proposta_visita", "agendado"].includes(r.status_predio ?? "")).length,
    estruturado:  results.filter((r) => r.status_predio === "estruturado").length,
    semViab:      results.filter((r) => r.status === "rejeitado").length,
    utp:          results.filter((r) => r.status === "utp").length,
    em_revisao:   results.filter((r) => r.status === "em_revisao" && r.revisao_tipo === "devolvido").length,
    contestado:   results.filter((r) => r.status === "em_revisao" && r.revisao_tipo === "contestado").length,
    ag_inst:      results.filter((r) => r.status_instalacao === "aguardando_proposta").length,
    neg_inst:     results.filter((r) => ["proposta_enviada", "aguardando_confirmacao"].includes(r.status_instalacao ?? "")).length,
    inst_agendado:results.filter((r) => r.status_instalacao === "agendado").length,
    instalado:    results.filter((r) => r.status_instalacao === "instalado").length,
  };

  function matchesStatus(r: Viabilizacao): boolean {
    switch (statusFilter) {
      case "analise":      return ["pendente", "em_auditoria"].includes(r.status) && !r.status_predio && !r.status_instalacao;
      case "aprovado":     return r.status === "aprovado" && !r.status_predio && !r.status_instalacao;
      case "ag_dados":     return r.status_predio === "aguardando_dados";
      case "agendado":     return ["pronto_auditoria", "proposta_visita", "agendado"].includes(r.status_predio ?? "");
      case "estruturado":  return r.status_predio === "estruturado";
      case "sem_viab":     return r.status === "rejeitado";
      case "utp":          return r.status === "utp";
      case "em_revisao":   return r.status === "em_revisao" && r.revisao_tipo === "devolvido";
      case "contestado":   return r.status === "em_revisao" && r.revisao_tipo === "contestado";
      case "ag_inst":      return r.status_instalacao === "aguardando_proposta";
      case "neg_inst":     return ["proposta_enviada", "aguardando_confirmacao"].includes(r.status_instalacao ?? "");
      case "inst_agendado":return r.status_instalacao === "agendado";
      case "instalado":    return r.status_instalacao === "instalado";
      default:             return true;
    }
  }

  const filtered = results
    .filter(matchesStatus)
    .filter((r) => tipoFilter === "todos" || r.tipo_instalacao === tipoFilter)
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.nome_cliente?.toLowerCase().includes(q) ||
        r.plus_code_cliente.toLowerCase().includes(q) ||
        r.predio_ftta?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => ((b.data_solicitacao ?? "") > (a.data_solicitacao ?? "") ? 1 : -1));

  const statusChips = (
    [
      { key: "todos",        label: "Todos",               count: results.length     },
      { key: "analise",      label: "🔍 Em análise",       count: counts.analise     },
      { key: "aprovado",     label: "✅ Aprovado",          count: counts.aprovado    },
      { key: "ag_dados",     label: "⚠️ Ag. dados",        count: counts.ag_dados    },
      { key: "agendado",     label: "📅 Agendado",          count: counts.agendado    },
      { key: "estruturado",  label: "🎉 Estruturado",       count: counts.estruturado },
      { key: "em_revisao",   label: "↩️ Devolvida",          count: counts.em_revisao  },
      { key: "contestado",   label: "💬 Contestado",         count: counts.contestado  },
      { key: "sem_viab",     label: "❌ Sem viab.",         count: counts.semViab     },
      { key: "utp",          label: "📡 UTP",               count: counts.utp         },
      { key: "ag_inst",      label: "⚠️ Propor data",       count: counts.ag_inst     },
      { key: "neg_inst",     label: "🔧 Negociando",        count: counts.neg_inst    },
      { key: "inst_agendado",label: "📅 Agendado",           count: counts.inst_agendado },
      { key: "instalado",    label: "✅ Concluído",          count: counts.instalado   },
    ] as { key: StatusFilter; label: string; count: number }[]
  ).filter((c) => c.key === "todos" || c.count > 0);

  const tipoChips: { key: TipoFilter; label: string }[] = [
    { key: "todos",       label: "Todos os tipos" },
    { key: "FTTH",        label: "🏠 FTTH" },
    { key: "Prédio",      label: "🏢 Prédio" },
    { key: "Condomínio",  label: "🏘️ Condomínio" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Meus Resultados</h1>
          <p className="text-gray-500 text-sm mt-1">Viabilizações de <strong>{user?.nome}</strong></p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Em Análise",     count: counts.analise,                             color: "blue",   icon: <Clock className="w-5 h-5" /> },
          { label: "Aprovadas",      count: counts.aprovado + counts.estruturado,        color: "green",  icon: <CheckCircle className="w-5 h-5" /> },
          { label: "Sem Viabilidade",count: counts.semViab,                              color: "red",    icon: <XCircle className="w-5 h-5" /> },
          { label: "Prédio/Cond.",   count: counts.ag_dados + counts.agendado,           color: "purple", icon: <Building2 className="w-5 h-5" /> },
        ].map((item) => (
          <div key={item.label} className="bg-white border rounded-xl p-4 flex items-center gap-3">
            <div className={`text-${item.color}-600`}>{item.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{item.count}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, plus code ou prédio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statusChips.map((c) => (
            <button key={c.key} onClick={() => setStatusFilter(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === c.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {c.label}{c.key !== "todos" && ` (${c.count})`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tipoChips.map((c) => (
            <button key={c.key} onClick={() => setTipoFilter(c.key as TipoFilter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tipoFilter === c.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border text-gray-400">
          {results.length === 0 ? "Nenhuma solicitação encontrada." : "Nenhum resultado para os filtros aplicados."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <ResultCard
                r={r}
                onFinalizar={handleFinalizar}
                onRefresh={load}
                showData={r.status === "aprovado" || r.status_predio === "estruturado"}
              />
            </div>
          ))}
        </div>
      )}

      {/* ─── Histórico completo ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <button
          onClick={() => { setShowHistorico((s) => { if (!s) loadHistorico(); return !s; }); }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-gray-800">📋 Histórico Completo</span>
            <span className="text-xs text-gray-400 font-normal hidden sm:inline">— todas as viabilizações incluindo finalizadas</span>
          </div>
          {showHistorico ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showHistorico && (
          <div className="border-t">
            {loadingHistorico ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <p className="text-sm">Carregando histórico...</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* Filtros do histórico */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por cliente, plus code, prédio ou CTO..."
                      value={histSearch} onChange={(e) => setHistSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                  <select value={histTipo} onChange={(e) => setHistTipo(e.target.value as TipoFilter)}
                    className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="todos">Todos os tipos</option>
                    <option value="FTTH">FTTH</option>
                    <option value="Prédio">Prédio</option>
                    <option value="Condomínio">Condomínio</option>
                  </select>
                  <select value={histStatus} onChange={(e) => setHistStatus(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {statusOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button onClick={downloadHistoricoCSV}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>

                <p className="text-xs text-gray-400">{historicoFiltrado.length} de {historico.length} registro(s)</p>

                {historicoFiltrado.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">Nenhum registro encontrado.</div>
                ) : (
                  <div className="overflow-auto rounded-lg border max-h-[420px]">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                        <tr>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Data</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Tipo</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Cliente</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Plus Code</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Prédio/Cond.</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">CTO / CDOI</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Status</th>
                          <th className="px-3 py-3 text-left whitespace-nowrap">Auditor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {historicoFiltrado.map((v) => {
                          const finalizadoColor =
                            v.status_instalacao === "instalado"   ? "bg-green-100 text-green-700" :
                            v.status_predio === "estruturado"     ? "bg-green-100 text-green-700" :
                            v.motivo_rejeicao === "Atendemos UTP" ? "bg-purple-100 text-purple-700" :
                            v.motivo_rejeicao                     ? "bg-red-100 text-red-700" :
                            v.motivo_desistencia                  ? "bg-orange-100 text-orange-700" :
                            "bg-gray-100 text-gray-600";
                          const finalizadoLabel =
                            v.status_instalacao === "instalado"   ? "✅ Instalado" :
                            v.status_predio === "estruturado"     ? "✅ Estruturado" :
                            v.motivo_rejeicao === "Atendemos UTP" ? "📡 UTP" :
                            v.motivo_rejeicao                     ? "❌ Sem viab." :
                            v.motivo_desistencia                  ? "🚫 Desistência" :
                            "📁 Finalizado";
                          const statusColors: Record<string, string> = {
                            aprovado:     "bg-green-100 text-green-700",
                            rejeitado:    "bg-red-100 text-red-700",
                            utp:          "bg-purple-100 text-purple-700",
                            finalizado:   finalizadoColor,
                            em_auditoria: "bg-yellow-100 text-yellow-700",
                            pendente:     "bg-blue-100 text-blue-600",
                            em_revisao:   "bg-orange-100 text-orange-700",
                          };
                          const statusLabel: Record<string, string> = {
                            aprovado:     "✅ Aprovado",
                            rejeitado:    "❌ Sem viab.",
                            utp:          "📡 UTP",
                            finalizado:   finalizadoLabel,
                            em_auditoria: "🔍 Em análise",
                            pendente:     "⏳ Pendente",
                            em_revisao:   v.revisao_tipo === "contestado" ? "💬 Contestado" : "↩️ Devolvida",
                          };
                          return (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{formatDateTime(v.data_solicitacao)}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {(() => {
                                  const isUTP = v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP";
                                  return <span className="text-xs">{isUTP ? "📡 UTP" : v.tipo_instalacao === "FTTH" ? "🏠 FTTH" : v.tipo_instalacao === "Prédio" ? "🏢 Prédio" : "🏘️ Condomínio"}</span>;
                                })()}
                              </td>
                              <td className="px-3 py-2.5 max-w-[140px] truncate">{v.nome_cliente ?? "-"}</td>
                              <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap"><a href={`https://maps.google.com/?q=${encodeURIComponent(v.plus_code_cliente)}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline" title="Ver no Google Maps">{locationToPlusCode(v.plus_code_cliente)}</a></td>
                              <td className="px-3 py-2.5 max-w-[140px] truncate text-gray-600">{v.predio_ftta ?? "-"}</td>
                              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{v.cdoi ?? v.cto_numero ?? "-"}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span title={v.motivo_desistencia ?? v.motivo_rejeicao ?? undefined} className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[v.status] ?? "bg-gray-100 text-gray-600"}`}>
                                  {statusLabel[v.status] ?? v.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{v.auditado_por ?? "-"}</td>
                            </tr>
                          );
                        })}
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

function ResultCard({ r, onFinalizar, onRefresh, showData }: {
  r: Viabilizacao; onFinalizar: (id: string) => void; onRefresh: () => void; showData?: boolean;
}) {
  const { user } = useAuth();
  const isDevolvida = r.status === "em_revisao" && r.revisao_tipo === "devolvido";
  const isContestacaoPendente = r.status === "em_revisao" && r.revisao_tipo === "contestado";
  const needsDateAction = r.status_instalacao === "aguardando_proposta" || r.status_instalacao === "aguardando_confirmacao" || r.status_predio === "proposta_visita";
  const [open, setOpen] = useState(isDevolvida || needsDateAction || r.status_predio === "aguardando_dados");
  const [submitting, setSubmitting] = useState(false);

  // ── Proposta de instalação FTTH ────────────────────────
  const [propostaData, setPropostaData] = useState("");
  const [propostaPeriodo, setPropostaPeriodo] = useState("Manhã");
  const [propostaObs, setPropostaObs] = useState("");
  const [enviandoProposta, setEnviandoProposta] = useState(false);

  async function handleEnviarProposta() {
    if (!propostaData) { alert("Informe a data desejada!"); return; }
    setEnviandoProposta(true);
    try {
      await enviarPropostaInstalacao(r.id, { proposta_data: propostaData, proposta_periodo: propostaPeriodo, proposta_obs: propostaObs || undefined }, r.historico_agendamento);
      onRefresh();
    } catch { alert("Erro ao enviar. Tente novamente."); }
    finally { setEnviandoProposta(false); }
  }

  async function handleConfirmarProposta() {
    if (!r.agendamento_data) return;
    setEnviandoProposta(true);
    try {
      await confirmarPropostaUsuario(r.id, { agendamento_data: r.agendamento_data, agendamento_periodo: r.agendamento_periodo ?? "Manhã" }, r.historico_agendamento);
      onRefresh();
    } catch { alert("Erro ao confirmar."); }
    finally { setEnviandoProposta(false); }
  }


  // ── Desistência ───────────────────────────────────────
  const [showDesistencia, setShowDesistencia] = useState(false);
  const [obsDesistencia, setObsDesistencia]   = useState("");
  const [enviandoDesistencia, setEnviandoDesistencia] = useState(false);

  async function handleDesistencia() {
    setEnviandoDesistencia(true);
    try {
      await arquivarPorDesistencia(r.id, obsDesistencia || undefined);
      onRefresh();
    } catch { alert("Erro ao registrar desistência."); }
    finally { setEnviandoDesistencia(false); }
  }

  // ── Contestação ────────────────────────────────────────
  const [showContestar, setShowContestar] = useState(false);
  const [msgContestacao, setMsgContestacao] = useState("");
  const [enviandoContestacao, setEnviandoContestacao] = useState(false);

  async function handleContestar() {
    if (!msgContestacao.trim()) { alert("Escreva a contestação!"); return; }
    setEnviandoContestacao(true);
    try {
      await contestarViabilizacao(r.id, msgContestacao, user?.nome ?? "Usuário", r.status, r.mensagens);
      onRefresh();
    } catch { alert("Erro ao enviar contestação."); }
    finally { setEnviandoContestacao(false); }
  }

  // ── Resposta a devolução ───────────────────────────────
  const [msgResposta, setMsgResposta] = useState("");
  const [enviandoResposta, setEnviandoResposta] = useState(false);

  async function handleReenviar() {
    if (!msgResposta.trim()) { alert("Escreva uma resposta!"); return; }
    setEnviandoResposta(true);
    try {
      await reenviarParaAuditoria(r.id, msgResposta, user?.nome ?? "Usuário", r.mensagens);
      onRefresh();
    } catch { alert("Erro ao enviar."); }
    finally { setEnviandoResposta(false); }
  }

  // ── Proposta de visita (FTTA/UTP) ─────────────────────
  const [enviandoConfirmacaoVisita, setEnviandoConfirmacaoVisita] = useState(false);
  const [contraData, setContraData] = useState("");
  const [contraPeriodo, setContraPeriodo] = useState("Manhã");
  const [contraObs, setContraObs] = useState("");

  async function handleConfirmarPropostaVisita() {
    if (!r.proposta_visita_data) return;
    setEnviandoConfirmacaoVisita(true);
    try {
      await confirmarPropostaVisita(r.id, { proposta_visita_data: r.proposta_visita_data, proposta_visita_periodo: r.proposta_visita_periodo ?? "Manhã", proposta_visita_tecnico: r.proposta_visita_tecnico }, r.historico_visita);
      onRefresh();
    } finally { setEnviandoConfirmacaoVisita(false); }
  }

  async function handleContraproporVisita() {
    if (!contraData) { alert("Informe a data!"); return; }
    setEnviandoConfirmacaoVisita(true);
    try {
      await contraproporVisita(r.id, contraData, contraPeriodo, contraObs || undefined, r.historico_visita);
      onRefresh();
    } finally { setEnviandoConfirmacaoVisita(false); }
  }

  // ── Dados do síndico ───────────────────────────────────
  const [nomeSindico, setNomeSindico] = useState("");
  const [contatoSindico, setContatoSindico] = useState("");
  const [nomeClientePredio, setNomeClientePredio] = useState("");
  const [contatoClientePredio, setContatoClientePredio] = useState("");
  const [apartamento, setApartamento] = useState(r.andar_predio ?? "");
  const [obsAgendamento, setObsAgendamento] = useState("");
  const [dataPreferenciaVisita, setDataPreferenciaVisita] = useState("");
  const [periodoPreferenciaVisita, setPeriodoPreferenciaVisita] = useState("Manhã");
  const [nomePredioInput, setNomePredioInput] = useState(r.predio_ftta ?? "");

  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const isFtta = ["Prédio", "Condomínio"].includes(r.tipo_instalacao);
  const isCond = r.tipo_instalacao === "Condomínio";
  const isFttaUtp = isFtta || r.status === "utp" || r.motivo_rejeicao === "Atendemos UTP";
  const aguardandoDados = r.status_predio === "aguardando_dados";
  const isAprovado = r.status === "aprovado";
  const canExpand = ["aprovado", "rejeitado", "utp", "em_revisao"].includes(r.status) || isFtta;

  const statusLabel: Record<string, string> = {
    pendente:     "⏳ Na fila",
    em_auditoria: "🔍 Em análise",
    em_revisao:   isDevolvida ? "↩️ Devolvida" : "💬 Contestação enviada",
    aprovado:     "✅ Aprovado",
    rejeitado:    "❌ Sem viabilidade",
    utp:          "📡 UTP",
    finalizado:   "📦 Finalizado",
  };

  const predioStatusLabel: Record<string, string> = {
    aguardando_dados: "📋 Dados pendentes",
    pronto_auditoria: "⏳ Aguardando visita",
    proposta_visita:  "⚠️ Confirmar data",
    agendado:         "📅 Visita agendada",
    estruturado:      "🏗️ Estruturado",
  };
  const predioStatusColor: Record<string, string> = {
    aguardando_dados: "bg-orange-100 text-orange-700",
    pronto_auditoria: "bg-blue-100 text-blue-700",
    proposta_visita:  "bg-orange-100 text-orange-700",
    agendado:         "bg-green-100 text-green-700",
    estruturado:      "bg-green-100 text-green-700",
  };
  const instLabel: Record<string, string> = {
    aguardando_proposta:    "⚠️ Propor data",
    proposta_enviada:       "⏳ Proposta enviada",
    aguardando_confirmacao: "⚠️ Confirmar data",
    agendado:               "📅 Inst. agendada",
    instalado:              "🎉 Instalado",
  };
  const instColor: Record<string, string> = {
    aguardando_proposta:    "bg-orange-100 text-orange-700",
    proposta_enviada:       "bg-yellow-100 text-yellow-700",
    aguardando_confirmacao: "bg-orange-100 text-orange-700",
    agendado:               "bg-green-100 text-green-700",
    instalado:              "bg-blue-100 text-blue-700",
  };

  async function handleEnviarDados() {
    if (!nomeSindico || !contatoSindico || !nomeClientePredio || !contatoClientePredio || !apartamento) {
      alert("Preencha todos os campos obrigatórios (*)"); return;
    }
    setSubmitting(true);
    try {
      await enviarDadosPredio(r.id, { predio_ftta: nomePredioInput, nome_sindico: nomeSindico, contato_sindico: contatoSindico, nome_cliente_predio: nomeClientePredio, contato_cliente_predio: contatoClientePredio, apartamento, data_preferencia_visita: dataPreferenciaVisita || undefined, periodo_preferencia_visita: dataPreferenciaVisita ? periodoPreferenciaVisita : undefined, obs_agendamento: obsAgendamento || undefined });
      onRefresh();
    } catch { alert("Erro ao enviar. Tente novamente."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="p-4">
      <FluxoStepper v={r} />

      <button onClick={() => setOpen(!open)} className="w-full text-left mt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-gray-900">
              {(r.status === "utp" || r.motivo_rejeicao === "Atendemos UTP") ? "📡" : r.tipo_instalacao === "FTTH" ? "🏠" : isCond ? "🏘️" : "🏢"}{" "}
              {r.nome_cliente ?? r.plus_code_cliente}
              {r.urgente && " 🔥"}
            </p>
            <p className="text-xs text-gray-400">
              📍 <a href={`https://maps.google.com/?q=${encodeURIComponent(r.plus_code_cliente)}`} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-indigo-600 hover:underline" title="Ver no Google Maps">{locationToPlusCode(r.plus_code_cliente)}</a> · {formatDateTime(r.data_solicitacao)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.status !== "finalizado" && r.status !== "rejeitado" && <TempoDecorrido iso={r.status_atualizado_em} />}
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              isDevolvida ? "bg-orange-100 text-orange-700" :
              isContestacaoPendente ? "bg-blue-100 text-blue-700" :
              r.status_predio ? (predioStatusColor[r.status_predio] ?? "bg-gray-100 text-gray-500") :
              r.status_instalacao ? (instColor[r.status_instalacao] ?? "bg-gray-100 text-gray-500") :
              "bg-gray-100 text-gray-500"
            }`}>
              {r.status_predio ? (predioStatusLabel[r.status_predio] ?? r.status_predio) :
               r.status_instalacao ? (instLabel[r.status_instalacao] ?? r.status_instalacao) :
               (statusLabel[r.status] ?? r.status)}
            </span>
            {canExpand && <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>}
          </div>
        </div>
        {isAprovado && !r.status_instalacao && !r.status_predio && !open && (
          <p className="text-xs text-indigo-500 mt-1.5 font-medium">👆 Toque para ver os dados da viabilidade</p>
        )}
        {r.status_instalacao === "aguardando_proposta" && !open && (
          <p className="text-xs text-indigo-500 mt-1.5 font-medium">📅 Ação necessária — informe sua disponibilidade de data</p>
        )}
        {r.status_instalacao === "aguardando_confirmacao" && !open && (
          <p className="text-xs text-orange-500 mt-1.5 font-medium">⚠️ Nova data proposta — confirme ou contra-proponha</p>
        )}
        {aguardandoDados && !open && (
          <p className="text-xs text-orange-500 mt-1.5 font-medium">⚠️ Ação necessária — preencha os dados do {isCond ? "responsável" : "síndico"}</p>
        )}
        {r.status_predio === "pronto_auditoria" && !open && (
          <p className="text-xs text-blue-500 mt-1.5 font-medium">⏳ Dados enviados — aguardando agendamento da visita</p>
        )}
        {r.status_predio === "proposta_visita" && !open && (
          <p className="text-xs text-orange-500 mt-1.5 font-medium">⚠️ Nova data proposta — confirme ou contra-proponha a visita</p>
        )}
        {r.status_predio === "agendado" && !open && (
          <p className="text-xs text-green-600 mt-1.5 font-medium">📅 Visita técnica agendada — toque para ver os detalhes</p>
        )}
        {r.status_predio === "estruturado" && !open && (
          <p className="text-xs text-green-600 mt-1.5 font-medium">🏗️ Estrutura instalada — toque para ver os detalhes</p>
        )}
        {isDevolvida && !open && (
          <p className="text-xs text-orange-500 mt-1.5 font-medium">↩️ Ação necessária — o auditor solicitou uma correção</p>
        )}
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t space-y-3 text-sm text-gray-600">

          {/* ── Thread de mensagens ── */}
          {r.mensagens && r.mensagens.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">💬 Mensagens</p>
              {r.mensagens.map((m, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 text-sm ${
                  m.tipo === "auditoria"   ? "bg-blue-50 border border-blue-200" :
                  m.tipo === "contestacao" ? "bg-orange-50 border border-orange-200" :
                  "bg-gray-50 border border-gray-200"
                }`}>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">{m.de} · {formatDateTime(m.data)}</p>
                  <p className="text-gray-800 whitespace-pre-wrap">{m.texto}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Devolvida — responder e reenviar ── */}
          {isDevolvida && (
            <div className="space-y-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="font-medium text-orange-800 text-sm">↩️ Viabilização devolvida pelo auditor</p>
              <p className="text-xs text-orange-700">Responda abaixo e reenvie para a fila de análise.</p>
              <textarea
                placeholder="Sua resposta ou esclarecimento..."
                value={msgResposta}
                onChange={(e) => setMsgResposta(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
              <button onClick={handleReenviar} disabled={enviandoResposta || !msgResposta.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {enviandoResposta ? <Loader2 className="w-4 h-4 animate-spin" /> : "📤 Reenviar para análise"}
              </button>
            </div>
          )}

          {/* ── Contestação pendente — aguardando auditor ── */}
          {isContestacaoPendente && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-800">💬 Contestação enviada</p>
              <p className="text-blue-700 text-xs mt-1">Aguardando análise do auditor. Você será notificado quando houver uma resposta.</p>
            </div>
          )}

          {/* ===== FTTH aprovado ===== */}
          {r.status === "aprovado" && r.tipo_instalacao === "FTTH" && (
            <div className="bg-green-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Dados da viabilidade</span>
                <button
                  onClick={() => copyToClipboard(
                    [
                      `CTO: ${r.cto_numero ?? "-"}`,
                      r.olt ? `OLT: ${r.olt}` : "",
                      `Portas: ${r.portas_disponiveis ?? "-"}`,
                      `Menor RX: ${r.menor_rx ? r.menor_rx + " dBm" : "-"}`,
                      `Distância: ${r.distancia_cliente ?? "-"}`,
                      `Localização CTO: ${r.localizacao_caixa ?? "-"}`,
                      r.observacoes ? `Obs: ${r.observacoes}` : "",
                    ].filter(Boolean).join("\n"),
                    "ftth"
                  )}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors font-medium flex items-center gap-1 ${copied === "ftth" ? "bg-green-600 text-white" : "bg-white border border-green-300 text-green-700 hover:bg-green-100"}`}>
                  {copied === "ftth" ? "✓ Copiado!" : "📋 Copiar"}
                </button>
              </div>
              <p><strong>CTO:</strong> {r.cto_numero}</p>
              {r.olt && <p><strong>OLT:</strong> {r.olt}</p>}
              <p><strong>Portas:</strong> {r.portas_disponiveis}</p>
              <p><strong>Menor RX:</strong> {r.menor_rx} dBm</p>
              <p><strong>Distância:</strong> {r.distancia_cliente}</p>
              <p><strong>Localização CTO:</strong> {r.localizacao_caixa}</p>
              {r.observacoes && <p className="whitespace-pre-wrap"><strong>Obs:</strong> {r.observacoes}</p>}
            </div>
          )}

          {/* ===== Condomínio aprovado direto — dados da CTO ===== */}
          {r.status === "aprovado" && r.tipo_instalacao === "Condomínio" && !r.status_predio && (
            <div className="bg-green-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Dados da viabilidade</span>
                <button
                  onClick={() => copyToClipboard(
                    [
                      `CTO: ${r.cto_numero ?? "-"}`,
                      r.olt ? `OLT: ${r.olt}` : "",
                      `Portas: ${r.portas_disponiveis ?? "-"}`,
                      `Menor RX: ${r.menor_rx ? r.menor_rx + " dBm" : "-"}`,
                      `Distância: ${r.distancia_cliente ?? "-"}`,
                      `Localização CTO: ${r.localizacao_caixa ?? "-"}`,
                      r.observacoes ? `Obs: ${r.observacoes}` : "",
                    ].filter(Boolean).join("\n"),
                    "cond"
                  )}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors font-medium flex items-center gap-1 ${copied === "cond" ? "bg-green-600 text-white" : "bg-white border border-green-300 text-green-700 hover:bg-green-100"}`}>
                  {copied === "cond" ? "✓ Copiado!" : "📋 Copiar"}
                </button>
              </div>
              <p><strong>CTO:</strong> {r.cto_numero}</p>
              {r.olt && <p><strong>OLT:</strong> {r.olt}</p>}
              <p><strong>Portas:</strong> {r.portas_disponiveis}</p>
              <p><strong>Menor RX:</strong> {r.menor_rx} dBm</p>
              <p><strong>Distância:</strong> {r.distancia_cliente}</p>
              <p><strong>Localização CTO:</strong> {r.localizacao_caixa}</p>
              {r.observacoes && <p className="whitespace-pre-wrap"><strong>Obs:</strong> {r.observacoes}</p>}
            </div>
          )}

          {/* ===== Rota do cabo (KML) — aparece quando o auditor traçou o caminho ===== */}
          {r.trajeto_cabo?.length && r.trajeto_expira_em && new Date(r.trajeto_expira_em) > new Date() && (
            <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2.5">
              <span className="text-purple-700 text-sm flex-1">
                🗺️ <strong>Rota do cabo</strong> — traçada pelo auditor
              </span>
              <button
                onClick={() => copyToClipboard(
                  `${window.location.origin}/api/rota/${r.id}`,
                  "rota"
                )}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${copied === "rota" ? "bg-purple-600 text-white" : "bg-white border border-purple-300 text-purple-700 hover:bg-purple-100"}`}
              >
                {copied === "rota" ? "✓ Copiado!" : "📋 Copiar link KML"}
              </button>
            </div>
          )}

          {/* ===== Fluxo de agendamento de instalação FTTH / Condomínio / FTTA ===== */}
          {["FTTH", "Prédio", "Condomínio"].includes(r.tipo_instalacao) && r.status_instalacao && (
            <div className="space-y-2">
              {r.status_instalacao === "aguardando_proposta" && (
                <div className="space-y-2">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                    ✅ Viabilidade aprovada! Informe a data e período de preferência para a instalação.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={propostaData} onChange={(e) => setPropostaData(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <select value={propostaPeriodo} onChange={(e) => setPropostaPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option><option>Noturno</option><option>Dia todo</option>
                    </select>
                    <textarea placeholder="Observações (opcional)" value={propostaObs} onChange={(e) => setPropostaObs(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                  </div>
                  <button onClick={handleEnviarProposta} disabled={enviandoProposta || !propostaData}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                    {enviandoProposta ? <Loader2 className="w-4 h-4 animate-spin" /> : "📤 Enviar para agendamento"}
                  </button>
                </div>
              )}

              {r.status_instalacao === "proposta_enviada" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-yellow-800">⏳ Proposta enviada ao setor de agendamento</p>
                  <p>📆 Sua preferência: <strong>{r.proposta_data ? new Date(r.proposta_data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</strong> — {r.proposta_periodo}</p>
                  {r.proposta_obs && <p className="text-gray-600 whitespace-pre-wrap">📝 {r.proposta_obs}</p>}
                  <p className="text-xs text-yellow-700 mt-1">Aguardando análise e confirmação do agendamento.</p>
                </div>
              )}

              {r.status_instalacao === "aguardando_confirmacao" && (
                <div className="space-y-2">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1 text-sm">
                    <p className="font-medium text-orange-800">⚠️ Setor de agendamento propôs uma nova data</p>
                    <p>📆 Nova data: <strong>{r.agendamento_data ? new Date(r.agendamento_data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</strong> — {r.agendamento_periodo}</p>
                    <p>👷 Técnico: {r.agendamento_tecnico}</p>
                    {r.agendamento_obs && <p className="text-gray-600 whitespace-pre-wrap">📝 {r.agendamento_obs}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmarProposta} disabled={enviandoProposta} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">
                      ✅ Confirmar esta data
                    </button>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Propor outra data</summary>
                    <div className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={propostaData} onChange={(e) => setPropostaData(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <select value={propostaPeriodo} onChange={(e) => setPropostaPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                          <option>Manhã</option><option>Tarde</option><option>Noturno</option><option>Dia todo</option>
                        </select>
                        <textarea placeholder="Motivo / observação" value={propostaObs} onChange={(e) => setPropostaObs(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                      </div>
                      <button onClick={handleEnviarProposta} disabled={enviandoProposta || !propostaData} className="w-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg text-sm">
                        📤 Enviar nova proposta
                      </button>
                    </div>
                  </details>
                </div>
              )}

              {r.status_instalacao === "agendado" && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-medium text-green-800">📅 Instalação agendada!</p>
                  <p>📆 Data: <strong>{r.data_instalacao ? new Date(r.data_instalacao + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</strong></p>
                  <p>🕐 Período: {r.periodo_instalacao} · 👷 Técnico: {r.tecnico_instalacao}</p>
                  {r.historico_agendamento && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-green-700 hover:text-green-900">📋 Histórico de negociação</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap text-gray-600 bg-white border rounded-lg p-2.5 leading-relaxed">{r.historico_agendamento}</pre>
                    </details>
                  )}
                </div>
              )}

              {r.status_instalacao === "instalado" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium text-blue-800">🎉 Instalação concluída pelo técnico {r.tecnico_instalacao ?? ""}!</p>
                  <p className="text-blue-700 text-xs">Clique em "Arquivar" para arquivar este agendamento.</p>
                  {r.historico_agendamento && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-blue-700 hover:text-blue-900">📋 Histórico de negociação</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap text-gray-600 bg-white border rounded-lg p-2.5 leading-relaxed">{r.historico_agendamento}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== FTTA aprovado direto ===== */}
          {r.status === "aprovado" && r.tipo_instalacao === "Prédio" && !r.status_predio && (
            <div className="bg-green-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Dados da viabilidade</span>
                <button
                  onClick={() => copyToClipboard(
                    [
                      `CDOI: ${r.cdoi ?? "-"}`,
                      r.olt ? `OLT: ${r.olt}` : "",
                      `Prédio: ${r.predio_ftta ?? "-"}`,
                      `Portas: ${r.portas_disponiveis ?? "-"}`,
                      `Média RX: ${r.media_rx ? r.media_rx + " dBm" : "-"}`,
                      r.observacoes ? `Obs: ${r.observacoes}` : "",
                    ].filter(Boolean).join("\n"),
                    "ftta"
                  )}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors font-medium flex items-center gap-1 ${copied === "ftta" ? "bg-green-600 text-white" : "bg-white border border-green-300 text-green-700 hover:bg-green-100"}`}>
                  {copied === "ftta" ? "✓ Copiado!" : "📋 Copiar"}
                </button>
              </div>
              <p><strong>CDOI:</strong> {r.cdoi}</p>
              {r.olt && <p><strong>OLT:</strong> {r.olt}</p>}
              <p><strong>Prédio:</strong> {r.predio_ftta}</p>
              <p><strong>Portas:</strong> {r.portas_disponiveis}</p>
              <p><strong>Média RX:</strong> {r.media_rx} dBm</p>
              {r.observacoes && <p className="whitespace-pre-wrap"><strong>Obs:</strong> {r.observacoes}</p>}
            </div>
          )}

          {/* ===== Rejeitado ===== */}
          {r.status === "rejeitado" && (
            <div className="bg-red-50 rounded-lg p-3">
              <p><strong>Motivo:</strong> {r.motivo_rejeicao ?? "Não temos projeto neste ponto."}</p>
            </div>
          )}

          {/* ===== UTP ===== */}
          {r.status === "utp" && !r.status_instalacao && (
            <div className="bg-purple-50 rounded-lg p-3">
              <p>Atendemos esta área via UTP (cabo de rede).</p>
            </div>
          )}

          {/* ===== Contestar ===== */}
          {["rejeitado", "utp"].includes(r.status) && !r.status_instalacao && !showContestar && (
            <button onClick={() => setShowContestar(true)} className="text-xs border border-orange-300 text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg">
              💬 Contestar decisão
            </button>
          )}
          {showContestar && (
            <div className="space-y-2 border border-orange-200 rounded-lg p-3 bg-orange-50">
              <p className="text-xs font-medium text-orange-800">💬 Contestar decisão do auditor</p>
              <textarea
                placeholder="Descreva o motivo da contestação (ex: vizinho tem nossa internet, endereço correto é outro...)"
                value={msgContestacao}
                onChange={(e) => setMsgContestacao(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              />
              <div className="flex gap-2">
                <button onClick={handleContestar} disabled={enviandoContestacao || !msgContestacao.trim()}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  {enviandoContestacao ? <Loader2 className="w-4 h-4 animate-spin" /> : "📤 Enviar contestação"}
                </button>
                <button onClick={() => setShowContestar(false)} className="px-3 border rounded-lg text-sm">✕</button>
              </div>
            </div>
          )}

          {/* ===== Aguardando dados síndico ===== */}
          {aguardandoDados && (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="font-medium text-orange-800 text-sm">🏗️ Precisamos viabilizar a estrutura no {isCond ? "condomínio" : "prédio"}</p>
                <p className="text-xs text-orange-700 mt-1">Preencha os dados abaixo para que possamos agendar a visita técnica.</p>
              </div>
              <div className="space-y-2">
                <input type="text" placeholder={`Nome do ${isCond ? "condomínio" : "prédio"} *`} value={nomePredioInput} onChange={(e) => setNomePredioInput(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">{isCond ? "👤 Responsável do condomínio" : "👤 Síndico"}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder={`Nome do ${isCond ? "responsável" : "síndico"} *`} value={nomeSindico} onChange={(e) => setNomeSindico(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="text" placeholder="Telefone *" value={contatoSindico} onChange={(e) => setContatoSindico(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">🏠 Cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nome do cliente *" value={nomeClientePredio} onChange={(e) => setNomeClientePredio(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="text" placeholder="Telefone *" value={contatoClientePredio} onChange={(e) => setContatoClientePredio(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <input type="text" placeholder={`${isCond ? "Casa/Lote" : "Apartamento"} *`} value={apartamento} onChange={(e) => setApartamento(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">📅 Preferência de data para a visita</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={dataPreferenciaVisita} onChange={(e) => setDataPreferenciaVisita(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={periodoPreferenciaVisita} onChange={(e) => setPeriodoPreferenciaVisita(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>Manhã</option>
                    <option>Tarde</option>
                    <option>Noturno</option>
                    <option>Dia todo</option>
                  </select>
                </div>
                <textarea placeholder="Observações (opcional)" value={obsAgendamento} onChange={(e) => setObsAgendamento(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <button onClick={handleEnviarDados} disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : "📤 Enviar para verificação técnica"}
              </button>
            </div>
          )}

          {/* ===== Pronto para agendar ===== */}
          {r.status_predio === "pronto_auditoria" && (
            <div className="space-y-2 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <p className="font-medium text-blue-800">✅ Dados enviados!</p>
                <p className="text-blue-700 text-xs">Aguardando o agendamento da visita técnica pelo nosso time.</p>
              </div>
              <div className="bg-gray-50 border rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Dados que você enviou</p>
                <p>👤 {isCond ? "Responsável" : "Síndico"}: <strong>{r.nome_sindico}</strong> · {r.contato_sindico}</p>
                <p>🏠 Cliente: <strong>{r.nome_cliente_predio}</strong> · {r.contato_cliente_predio}</p>
                <p>🚪 {isCond ? "Casa/Lote" : "Apto"}: <strong>{r.apartamento}</strong></p>
                {r.data_preferencia_visita && (
                  <p>📅 Preferência: <strong>{new Date(r.data_preferencia_visita + "T12:00:00").toLocaleDateString("pt-BR")}</strong> — {r.periodo_preferencia_visita ?? "Manhã"}</p>
                )}
              </div>
              {r.obs_agendamento && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">💬 Sua observação</p>
                  <p className="text-gray-700 italic whitespace-pre-wrap">"{r.obs_agendamento}"</p>
                </div>
              )}
            </div>
          )}

          {/* ===== Proposta de data de visita ===== */}
          {r.status_predio === "proposta_visita" && (
            <div className="space-y-2">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1 text-sm">
                <p className="font-medium text-orange-800">⚠️ O auditor propôs uma data para a visita técnica</p>
                <p>📆 Data proposta: <strong>{r.proposta_visita_data ? new Date(r.proposta_visita_data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</strong> — {r.proposta_visita_periodo}</p>
                {r.proposta_visita_tecnico && <p>👷 Técnico: {r.proposta_visita_tecnico}</p>}
                {r.obs_agendamento && <p className="text-gray-600 whitespace-pre-wrap">📝 {r.obs_agendamento}</p>}
              </div>
              {r.historico_visita && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-600">📋 Histórico de negociação</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-gray-50 border rounded-lg p-2.5 leading-relaxed">{r.historico_visita}</pre>
                </details>
              )}
              <button onClick={handleConfirmarPropostaVisita} disabled={enviandoConfirmacaoVisita}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {enviandoConfirmacaoVisita ? <Loader2 className="w-4 h-4 animate-spin" /> : "✅ Confirmar esta data"}
              </button>
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Propor outra data</summary>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={contraData} onChange={(e) => setContraData(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <select value={contraPeriodo} onChange={(e) => setContraPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                      <option>Manhã</option><option>Tarde</option><option>Noturno</option><option>Dia todo</option>
                    </select>
                    <textarea placeholder="Motivo / observação (opcional)" value={contraObs} onChange={(e) => setContraObs(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg col-span-2 focus:outline-none" />
                  </div>
                  <button onClick={handleContraproporVisita} disabled={enviandoConfirmacaoVisita || !contraData}
                    className="w-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg text-sm disabled:opacity-50">
                    📤 Enviar nova proposta
                  </button>
                </div>
              </details>
            </div>
          )}

          {/* ===== Visita agendada ===== */}
          {r.status_predio === "agendado" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium text-green-800">📅 Visita técnica agendada!</p>
              <p>📆 Data: <strong>{r.data_visita ? new Date(r.data_visita + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</strong></p>
              <p>🕐 Período: {r.periodo_visita}</p>
              <p>👷 Técnico: {r.tecnico_responsavel}</p>
              <p>🔧 Tecnologia: {r.tecnologia_predio}</p>
              {(r.giga || r.tecnologia_predio === "FTTA" || r.tipo_instalacao === "Condomínio") && <p>⚡ Giga: Sim</p>}
              {r.obs_agendamento && <p className="text-gray-600 whitespace-pre-wrap">📝 {r.obs_agendamento}</p>}
              {r.historico_visita && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-gray-400 hover:text-gray-600">📋 Histórico de negociação</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-white border rounded-lg p-2 leading-relaxed">{r.historico_visita}</pre>
                </details>
              )}
            </div>
          )}

          {/* ===== Estruturado ===== */}
          {r.status_predio === "estruturado" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-green-800">🎉 Estrutura instalada!</p>
              <p className="text-green-700 text-xs">A estrutura do prédio foi concluída. Um novo pedido de viabilidade poderá ser feito para solicitar a instalação.</p>
              <p>🔧 Tecnologia: {r.tecnologia_predio}</p>
              <p>👷 Técnico: {r.tecnico_responsavel}</p>
              {r.notas_visita && r.notas_visita.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-green-700 hover:text-green-900">📝 Notas da visita ({r.notas_visita.length})</summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {r.notas_visita.map((n, i) => (
                      <li key={i} className="bg-white border rounded-lg p-2 text-gray-600">
                        <span className="font-medium text-gray-700">{n.por}</span> · <span className="text-gray-400">{new Date(n.data).toLocaleDateString("pt-BR")}</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{n.texto}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {r.auditado_por && (
            <p className="text-xs text-gray-400">🔍 Auditado por: <strong>{r.auditado_por}</strong> · {formatDateTime(r.data_auditoria)}</p>
          )}

          {["aprovado", "rejeitado", "utp"].includes(r.status) && !r.status_instalacao && !r.status_predio && !r.data_finalizacao && (
            <button onClick={() => onFinalizar(r.id)} className="mt-2 text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors font-medium">
              ✅ {r.status === "aprovado" ? "Finalizar" : "OK, Entendi"}
            </button>
          )}
          {r.status_instalacao === "instalado" && (
            <button onClick={() => onFinalizar(r.id)} className="mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">📁 Arquivar</button>
          )}
          {r.status_predio === "estruturado" && (
            <button onClick={() => onFinalizar(r.id)} className="mt-2 text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors font-medium">✅ Ciente</button>
          )}

          {/* Desistência — visível durante a negociação de agendamento */}
          {r.status === "aprovado" && r.status_instalacao && r.status_instalacao !== "instalado" && r.status_instalacao !== "agendado" && !r.data_finalizacao && (
            <div className="mt-3">
              {!showDesistencia ? (
                <button onClick={() => setShowDesistencia(true)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium">
                  ✕ Não tenho mais interesse
                </button>
              ) : (
                <div className="border border-red-200 rounded-lg p-3 space-y-2 bg-red-50 mt-1">
                  <p className="text-xs font-semibold text-red-700">Confirmar desistência</p>
                  <p className="text-xs text-red-600">Esta ação arquivará o processo. O histórico ficará disponível.</p>
                  <textarea value={obsDesistencia} onChange={(e) => setObsDesistencia(e.target.value)}
                    placeholder="Motivo (opcional)" rows={2}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={handleDesistencia} disabled={enviandoDesistencia}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
                      {enviandoDesistencia ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                    </button>
                    <button onClick={() => setShowDesistencia(false)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                      Cancelar
                    </button>
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
