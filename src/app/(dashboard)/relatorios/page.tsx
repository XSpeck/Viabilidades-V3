"use client";

import { useState, useEffect } from "react";
import { OpenLocationCode } from "open-location-code";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesRelatorio, getPrediosAtendidosRelatorio, getPrediosSemViabilidadeRelatorio, arquivarViabilizacao, excluirViabilizacao } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao, PredioAtendido, PredioSemViabilidade } from "@/types";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2, Download, Search, RefreshCw, MapPin } from "lucide-react";
import { canAccess } from "@/lib/access";
import dynamic from "next/dynamic";
import type { MapPoint } from "@/components/relatorios/RelatorioMapa";

const RelatorioMapa = dynamic(() => import("@/components/relatorios/RelatorioMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

// ─── CSV export ───────────────────────────────────────────────────
function downloadCSV(rows: Record<string, string | number | boolean | undefined>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).filter((h) => !h.startsWith("_"));
  const lines = rows.map((r) =>
    headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const blob = new Blob(["﻿" + [headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─── Table helpers ────────────────────────────────────────────────
function TableSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input type="text" placeholder="Buscar..." value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full sm:w-64 pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
    </div>
  );
}

function matchSearch(row: Record<string, string | number | boolean | undefined>, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase().replace(/\+/g, "");
  return Object.values(row).some((v) => String(v ?? "").toLowerCase().replace(/\+/g, "").includes(lower));
}

// ─── Page ─────────────────────────────────────────────────────────
type TabKey = "ftth_ap" | "ftth_rej" | "predios" | "condominios" | "ftta_rej" | "utp" | "estruturados" | "sem_viab";

export default function RelatoriosPage() {
  const { user } = useAuth();
  const [viabilizacoes, setViabilizacoes] = useState<Viabilizacao[]>([]);
  const [atendidos, setAtendidos] = useState<PredioAtendido[]>([]);
  const [semViab, setSemViab] = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("ftth_ap");
  const [searches, setSearches] = useState<Record<TabKey, string>>({ ftth_ap: "", ftth_rej: "", predios: "", condominios: "", ftta_rej: "", utp: "", estruturados: "", sem_viab: "" });
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function setSearch(tab: TabKey, v: string) { setSearches((p) => ({ ...p, [tab]: v })); }

  async function buildMapPoints(
    viabs: Viabilizacao[],
    svs: PredioSemViabilidade[]
  ) {
    setLoadingMap(true);
    const REFERENCE_LAT = -28.6775;
    const REFERENCE_LON = -49.3696;

    function decode(plusCode: string): { lat: number; lon: number } | null {
      try {
        const olc = new OpenLocationCode();
        const m = plusCode.trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
        const upper = plusCode.trim().toUpperCase();
        const resolved = olc.isFull(upper) ? upper : olc.recoverNearest(upper, REFERENCE_LAT, REFERENCE_LON);
        const d = olc.decode(resolved);
        return { lat: (d.latitudeLo + d.latitudeHi) / 2, lon: (d.longitudeLo + d.longitudeHi) / 2 };
      } catch { return null; }
    }

    const points: MapPoint[] = [];
    const isUTP = (v: Viabilizacao) => v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP";

    // FTTH aprovadas (excluindo UTP e rejeitadas arquivadas)
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && !isUTP(v) && (
      v.status === "aprovado" ||
      (v.status === "finalizado" && !v.motivo_rejeicao)
    )).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_ap_${v.id}`, ...geo, category: "ftth_ap", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.status === "finalizado" ? (v.data_finalizacao ?? v.data_auditoria) : v.data_auditoria), extra: v.auditado_por ? `Auditor: ${v.auditado_por}` : undefined });
    });

    // FTTH rejeitadas (incluindo arquivadas)
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && (
      v.status === "rejeitado" ||
      (v.status === "finalizado" && !!v.motivo_rejeicao && v.motivo_rejeicao !== "Atendemos UTP")
    )).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_rej_${v.id}`, ...geo, category: "ftth_rej", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.motivo_rejeicao ?? undefined });
    });

    // UTP (todos os tipos)
    viabs.filter(isUTP).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `utp_${v.id}`, ...geo, category: "utp", cliente: v.nome_cliente ?? v.predio_ftta ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria ?? v.data_solicitacao) });
    });

    // FTTA aprovados (Prédio ou Condomínio estruturado)
    viabs.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status_predio === "estruturado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftta_ap_${v.id}`, ...geo, category: "ftta_ap", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_estruturacao ?? v.data_auditoria) });
    });

    // FTTA rejeitados (incluindo arquivados, excluindo UTP)
    viabs.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && (
      v.status === "rejeitado" ||
      (v.status === "finalizado" && (v.status_predio === "rejeitado" || (!!v.motivo_rejeicao && v.motivo_rejeicao !== "Atendemos UTP")))
    )).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftta_rej_${v.id}`, ...geo, category: "ftta_rej", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.motivo_rejeicao ?? undefined });
    });

    // Prédios sem viabilidade (cadastro)
    svs.forEach((s) => {
      const geo = decode(s.localizacao);
      if (geo) points.push({ id: `sem_viab_${s.id}`, ...geo, category: "sem_viab", cliente: s.condominio, plusCode: locationToPlusCode(s.localizacao), data: formatDateTime(s.data_registro), extra: s.observacao });
    });

    setMapPoints(points);
    setLoadingMap(false);
  }

  const MAX_DIAS = 90;

  function validarPeriodo(): string | null {
    if (!dataInicio || !dataFim) return "Selecione as datas de início e fim.";
    if (dataFim < dataInicio) return "A data fim não pode ser anterior à data início.";
    const dias = (new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / 86400000;
    if (dias > MAX_DIAS) return `O período máximo é de 3 meses (${MAX_DIAS} dias).`;
    return null;
  }

  function load() {
    if (validarPeriodo()) return;
    setLoading(true);
    Promise.all([
      getViabilizacoesRelatorio(dataInicio, dataFim),
      getPrediosAtendidosRelatorio(dataInicio, dataFim),
      getPrediosSemViabilidadeRelatorio(dataInicio, dataFim),
    ])
      .then(([v, a, s]) => { setViabilizacoes(v); setAtendidos(a); setSemViab(s); setLoaded(true); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  async function handleArquivar(id: string) {
    setActionPending(id);
    try {
      await arquivarViabilizacao(id);
      setViabilizacoes((prev) => prev.map((v) => v.id === id ? { ...v, status: "finalizado" as const, data_finalizacao: new Date().toISOString() } : v));
    } finally { setActionPending(null); }
  }

  async function handleExcluir(id: string) {
    setActionPending(id);
    setConfirmDelete(null);
    try {
      await excluirViabilizacao(id);
      setViabilizacoes((prev) => prev.filter((v) => v.id !== id));
    } finally { setActionPending(null); }
  }

  useEffect(() => {
    if (showMap && !loading && loaded) {
      buildMapPoints(filtrado, semViab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, loading, viabilizacoes]);

  if (!canAccess(user ?? null, "relatorios")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const filtrado = viabilizacoes;

  // ── Derived data ─────────────────────────────────────────────
  // FTTH
  const ftthAprovadas  = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && (
    v.status === "aprovado" ||
    (v.status === "finalizado" && !v.motivo_rejeicao)
  ));
  const ftthRejeitadas = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && (
    v.status === "rejeitado" ||
    (v.status === "finalizado" && !!v.motivo_rejeicao && v.motivo_rejeicao !== "Atendemos UTP")
  ));

  const taxaAprovacaoFTTH = ftthAprovadas.length + ftthRejeitadas.length > 0
    ? ((ftthAprovadas.length / (ftthAprovadas.length + ftthRejeitadas.length)) * 100).toFixed(1)
    : "0.0";

  // FTTA (Prédio + Condomínio estruturados/rejeitados)
  const fttaAprovados  = filtrado.filter((v) =>
    ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status_predio === "estruturado"
  );
  const fttaRejeitados = filtrado.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && (
    v.status === "rejeitado" ||
    (v.status === "finalizado" && (v.status_predio === "rejeitado" || (!!v.motivo_rejeicao && v.motivo_rejeicao !== "Atendemos UTP")))
  ));

  // Prédios e Condomínios estruturados (separados)
  const prediosEstruturados = filtrado.filter((v) =>
    v.tipo_instalacao === "Prédio" && v.status_predio === "estruturado"
  );
  const condominiosEstruturados = filtrado.filter((v) =>
    v.tipo_instalacao === "Condomínio" && v.status_predio === "estruturado"
  );

  // Tabs de detalhe FTTA: aprovados = estruturados; rejeitados = tab separado
  const prediosViab     = prediosEstruturados;
  const condominiosViab = condominiosEstruturados;
  const utpFiltrado     = filtrado.filter((v) => v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP");

  const atendidosFiltrados = atendidos;
  const semViabFiltrados = semViab;

  const statusLabelRel: Record<string, string> = {
    pendente:     "Pendente",
    em_auditoria: "Em auditoria",
    em_revisao:   "Em revisão",
    aprovado:     "Aprovado",
    rejeitado:    "Sem viabilidade",
    utp:          "UTP",
    finalizado:   "Finalizado",
  };
  const labelForStatus = (v: Viabilizacao): string => {
    if (v.status === "aprovado") {
      if (v.status_instalacao === "instalado") return "Instalado";
      if (v.status_predio === "estruturado") return "Estruturado";
      const sub: Record<string, string> = {
        aguardando_proposta:    "Aprovado — Ag. proposta",
        proposta_enviada:       "Aprovado — Proposta enviada",
        aguardando_confirmacao: "Aprovado — Ag. confirmação",
        agendado:               "Aprovado — Agendado",
      };
      return (v.status_instalacao && sub[v.status_instalacao]) ?? "Aprovado";
    }
    if (v.status !== "finalizado") return statusLabelRel[v.status] ?? v.status;
    if (v.status_instalacao === "instalado")      return "Instalado";
    if (v.status_predio === "estruturado")        return "Estruturado";
    if (v.motivo_rejeicao === "Atendemos UTP")    return "UTP";
    if (v.motivo_rejeicao)                        return "Sem viabilidade";
    return "Finalizado";
  };

  // ── Rows for CSV / table ──────────────────────────────────────
  const rowsFtthAp = ftthAprovadas.map((v) => ({
    _id:          v.id,
    _arquivado:   v.status === "finalizado" || !!v.data_finalizacao,
    Data:         formatDateTime(v.status === "finalizado" ? (v.data_finalizacao ?? v.data_auditoria) : v.data_auditoria),
    Status:       labelForStatus(v),
    "Plus Code":  locationToPlusCode(v.plus_code_cliente),
    Cliente:      v.nome_cliente ?? "-",
    Usuário:      v.usuario,
    CTO:          v.cto_numero ?? "-",
    OLT:          v.olt ?? "-",
    Portas:       v.portas_disponiveis ?? "-",
    "Menor RX":   v.menor_rx ? `${v.menor_rx} dBm` : "-",
    Distância:    v.distancia_cliente ?? "-",
    Auditor:      v.auditado_por ?? "-",
  }));

  const rowsFtthRej = ftthRejeitadas.map((v) => ({
    _id:          v.id,
    _arquivado:   v.status === "finalizado" || !!v.data_finalizacao,
    Data:         formatDateTime(v.data_auditoria),
    Status:       v.status === "finalizado" ? "Arquivado" : "Sem viabilidade",
    "Plus Code":  locationToPlusCode(v.plus_code_cliente),
    Cliente:      v.nome_cliente ?? "-",
    Motivo:       v.motivo_rejeicao ?? "-",
    Usuário:      v.usuario,
    Auditor:      v.auditado_por ?? "-",
  }));

  const mapPredioRow = (v: Viabilizacao) => ({
    _id:         v.id,
    _arquivado:  v.status === "finalizado" || !!v.data_finalizacao,
    Data:        formatDateTime(v.data_estruturacao ?? v.data_auditoria ?? v.data_solicitacao),
    Tipo:        (v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP") ? "UTP" : v.tipo_instalacao,
    "Prédio/Cond.": v.predio_ftta ?? "-",
    "Casa/Apto": v.andar_predio ?? "-",
    Bloco:       v.bloco_predio ?? "-",
    Status:      labelForStatus(v),
    "Plus Code": locationToPlusCode(v.plus_code_cliente),
    Solicitante: v.usuario,
    Cliente:     v.nome_cliente ?? "-",
    CDOI:        v.cdoi ?? "-",
    OLT:         v.olt ?? "-",
    Portas:      v.portas_disponiveis ?? "-",
    "Média RX":  v.media_rx ? `${v.media_rx} dBm` : "-",
    Auditor:     v.auditado_por ?? "-",
  });

  const rowsPredios = prediosViab.map(mapPredioRow);

  const rowsCondominios = condominiosViab.map((v) => ({
    _id:           v.id,
    _arquivado:    v.status === "finalizado" || !!v.data_finalizacao,
    Data:          formatDateTime(v.data_estruturacao ?? v.data_auditoria ?? v.data_solicitacao),
    Condomínio:    v.predio_ftta ?? "-",
    "Casa/Lote":   v.andar_predio ?? "-",
    Bloco:         v.bloco_predio ?? "-",
    Status:        labelForStatus(v),
    "Plus Code":   locationToPlusCode(v.plus_code_cliente),
    Solicitante:   v.usuario,
    Cliente:       v.nome_cliente ?? "-",
    CDOI:          v.cdoi ?? "-",
    OLT:           v.olt ?? "-",
    Portas:        v.portas_disponiveis ?? "-",
    "Média RX":    v.media_rx ? `${v.media_rx} dBm` : "-",
    Auditor:       v.auditado_por ?? "-",
  }));

  const rowsFttaRej = fttaRejeitados.map((v) => ({
    _id:           v.id,
    _arquivado:    v.status === "finalizado" || !!v.data_finalizacao,
    Data:          formatDateTime(v.data_auditoria ?? v.data_solicitacao),
    Status:        v.status === "finalizado" ? "Arquivado" : "Sem viabilidade",
    Tipo:          v.tipo_instalacao,
    "Prédio/Cond.": v.predio_ftta ?? "-",
    Motivo:        v.motivo_rejeicao ?? "-",
    "Plus Code":   locationToPlusCode(v.plus_code_cliente),
    Solicitante:   v.usuario,
    Cliente:       v.nome_cliente ?? "-",
    Auditor:       v.auditado_por ?? "-",
  }));

  const rowsUtp = utpFiltrado.map((v) => ({
    _id:         v.id,
    _arquivado:  v.status === "finalizado" || !!v.data_finalizacao,
    Data:        formatDateTime(v.data_auditoria ?? v.data_solicitacao),
    Status:      v.status === "finalizado" ? "Arquivado" : "UTP",
    "Plus Code": locationToPlusCode(v.plus_code_cliente),
    Tipo:        v.tipo_instalacao,
    Prédio:      v.predio_ftta ?? "-",
    Cliente:     v.nome_cliente ?? "-",
    Usuário:     v.usuario,
    Auditor:     v.auditado_por ?? "-",
  }));

  const rowsEstru = atendidosFiltrados.map((a) => ({
    Data:        formatDateTime(a.data_estruturacao),
    Prédio:      a.condominio,
    Tecnologia:  a.tecnologia,
    Giga:        a.tecnologia === "FTTA" || a.giga ? "Sim" : "Não",
    Localização: locationToPlusCode(a.localizacao),
    Observação:  a.observacao ?? "-",
    Técnico:     a.estruturado_por,
  }));

  const rowsSemViab = semViabFiltrados.map((s) => ({
    Data:           formatDateTime(s.data_registro),
    Condomínio:     s.condominio,
    Localização:    locationToPlusCode(s.localizacao),
    Motivo:         s.observacao,
    "Registrado Por": s.registrado_por,
  }));

  // Tab config
  const tabs: { key: TabKey; label: string }[] = [
    { key: "ftth_ap",      label: "✅ FTTH Aprovadas" },
    { key: "ftth_rej",     label: "❌ FTTH Rejeitadas" },
    { key: "predios",      label: "🏢 FTTA Prédios" },
    { key: "condominios",  label: "🏘️ FTTA Condomínios" },
    { key: "ftta_rej",     label: "❌ FTTA Rejeitados" },
    { key: "utp",          label: "🔌 UTPs" },
    { key: "estruturados", label: "🏗️ Estruturados" },
    { key: "sem_viab",     label: "🚫 Sem Viabilidade" },
  ];

  const barTecnologias = [
    { name: "FTTH", Aprovado: ftthAprovadas.length, Rejeitado: ftthRejeitadas.length },
    { name: "FTTA", Aprovado: fttaAprovados.length, Rejeitado: fttaRejeitados.length },
  ];

  const pieEstruturados = [
    { name: "Prédios",     value: prediosEstruturados.length,     color: "#3b82f6" },
    { name: "Condomínios", value: condominiosEstruturados.length, color: "#f97316" },
  ];

  // Row for active tab
  type RowType = Record<string, string | number | boolean | undefined>;
  const allRows: Record<TabKey, RowType[]> = { ftth_ap: rowsFtthAp, ftth_rej: rowsFtthRej, predios: rowsPredios, condominios: rowsCondominios, ftta_rej: rowsFttaRej, utp: rowsUtp, estruturados: rowsEstru, sem_viab: rowsSemViab };
  const csvNames: Record<TabKey, string> = { ftth_ap: "ftth_aprovadas.csv", ftth_rej: "ftth_rejeitadas.csv", predios: "ftta_predios.csv", condominios: "ftta_condominios.csv", ftta_rej: "ftta_rejeitados.csv", utp: "utps.csv", estruturados: "predios_estruturados.csv", sem_viab: "predios_sem_viabilidade.csv" };
  const currentRows = allRows[activeTab].filter((r) => matchSearch(r, searches[activeTab]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📊 Relatórios e Análises</h1>
        {loaded && (
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        )}
      </div>

      {/* Filtro de data + busca */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data Início <span className="text-red-400">*</span></label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data Fim <span className="text-red-400">*</span></label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          {(dataInicio || dataFim) && (
            <button onClick={() => { setDataInicio(""); setDataFim(""); setLoaded(false); setViabilizacoes([]); setAtendidos([]); setSemViab([]); }}
              className="text-sm text-gray-400 hover:text-gray-600 underline self-center">Limpar</button>
          )}
          <button
            onClick={load}
            disabled={loading || !!validarPeriodo()}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>
              : <><Search className="w-4 h-4" /> {loaded ? "Atualizar" : "Buscar"}</>}
          </button>
        </div>
        {/* Erro de validação ou dica */}
        {(() => {
          const erro = validarPeriodo();
          if (erro && (dataInicio || dataFim)) return <p className="text-xs text-red-500">{erro}</p>;
          if (!dataInicio && !dataFim) return <p className="text-xs text-gray-400">Período obrigatório · máximo 3 meses por consulta.</p>;
          return null;
        })()}
      </div>

      {/* Estado inicial — aguardando busca */}
      {!loaded && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">Selecione o período e clique em <strong className="text-gray-600">Buscar</strong> para carregar os dados.</p>
        </div>
      )}

      {loaded && <>

      {/* KPIs — Tecnologias */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* FTTH */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-600">FTTH</span>
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {taxaAprovacaoFTTH}% aprovação
            </span>
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="text-center pr-4">
              <p className="text-4xl font-bold text-green-600">{ftthAprovadas.length}</p>
              <p className="text-xs text-gray-500 mt-1">✅ Aprovadas</p>
            </div>
            <div className="text-center pl-4">
              <p className="text-4xl font-bold text-red-500">{ftthRejeitadas.length}</p>
              <p className="text-xs text-gray-500 mt-1">❌ Rejeitadas</p>
            </div>
          </div>
        </div>

        {/* FTTA */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-widest text-orange-600">FTTA</span>
            <span className="text-xs text-gray-400">Prédios &amp; Condomínios</span>
          </div>
          <div className="grid grid-cols-2 divide-x">
            <div className="text-center pr-4">
              <p className="text-4xl font-bold text-green-600">{fttaAprovados.length}</p>
              <p className="text-xs text-gray-500 mt-1">✅ Aprovados</p>
            </div>
            <div className="text-center pl-4">
              <p className="text-4xl font-bold text-red-500">{fttaRejeitados.length}</p>
              <p className="text-xs text-gray-500 mt-1">❌ Rejeitados</p>
            </div>
          </div>
        </div>

        {/* UTP */}
        <div className="bg-white rounded-xl border p-5 flex flex-col items-center justify-center gap-1">
          <p className="text-5xl font-bold text-gray-900">{utpFiltrado.length}</p>
          <p className="text-sm font-semibold text-gray-500 mt-1">🔌 UTPs</p>
        </div>

      </div>

      {/* KPIs — Estruturados */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-5xl font-bold text-gray-900">{prediosEstruturados.length}</p>
          <p className="text-sm font-semibold text-gray-500 mt-2">🏢 Prédios Estruturados</p>
        </div>
        <div className="bg-white rounded-xl border p-5 text-center">
          <p className="text-5xl font-bold text-gray-900">{condominiosEstruturados.length}</p>
          <p className="text-sm font-semibold text-gray-500 mt-2">🏘️ Condomínios Estruturados</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Grouped bar: FTTH vs FTTA */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">📊 Aprovados vs Rejeitados por Tecnologia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barTecnologias} barCategoryGap="35%">
              <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Aprovado" fill="#22c55e" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11 }} />
              <Bar dataKey="Rejeitado" fill="#ef4444" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie: Prédios vs Condomínios estruturados */}
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">🥧 Estruturados por Tipo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieEstruturados} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                label={({ name, value, percent }) => value > 0 ? `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)` : ""}>
                {pieEstruturados.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Tabelas com abas */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {/* Tabs */}
        <div className="flex overflow-x-auto border-b">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === t.key ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-50"
              }`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === t.key ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"}`}>
                {allRows[t.key].length}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b bg-gray-50 flex-wrap">
          <TableSearch value={searches[activeTab]} onChange={(v) => setSearch(activeTab, v)} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{currentRows.length} registro(s)</span>
            <button onClick={() => downloadCSV(currentRows, csvNames[activeTab])}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[480px]">
          {currentRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Nenhum registro encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                <tr>
                  {Object.keys(currentRows[0]).filter((h) => !h.startsWith("_")).map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                  {"_id" in currentRows[0] && (
                    <th className="px-4 py-3 text-left whitespace-nowrap">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {currentRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {Object.entries(row).filter(([k]) => !k.startsWith("_")).map(([k, val]) => (
                      <td key={k} className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs max-w-[200px] truncate">
                        {String(val ?? "-")}
                      </td>
                    ))}
                    {"_id" in row && (
                      <td className="px-4 py-2 whitespace-nowrap">
                        {actionPending === String(row._id) ? (
                          <span className="text-xs text-gray-400">Aguarde...</span>
                        ) : confirmDelete === String(row._id) ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-red-600 font-medium">Excluir?</span>
                            <button onClick={() => handleExcluir(String(row._id))} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700">Sim</button>
                            <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-0.5 border rounded text-gray-500 hover:bg-gray-50">Não</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {!row._arquivado && (
                              <button onClick={() => handleArquivar(String(row._id))} className="text-xs px-2 py-0.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                                📦 Arquivar
                              </button>
                            )}
                            <button onClick={() => setConfirmDelete(String(row._id))} className="text-xs px-2 py-0.5 border border-red-200 rounded text-red-500 hover:bg-red-50">
                              🗑️ Excluir
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Mapa de demanda */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <button
          onClick={() => {
            setShowMap((s) => !s);
          }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <span className="font-semibold text-gray-800">🗺️ Mapa de Demanda</span>
            <span className="text-xs text-gray-400 font-normal hidden sm:inline">— visualize onde há procura para planejar novos projetos</span>
          </div>
          <span className="text-gray-400 text-sm">{showMap ? "▲" : "▼"}</span>
        </button>

        {showMap && (
          <div className="border-t">
            {loadingMap ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                <p className="text-sm">Convertendo localizações e carregando mapa...</p>
              </div>
            ) : (
              <div className="p-4">
                <RelatorioMapa points={mapPoints} />
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {mapPoints.length} pontos mapeados · clique nos pins para detalhes · use a legenda para filtrar
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      </>}
    </div>
  );
}
