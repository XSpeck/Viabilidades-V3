"use client";

import { useState, useEffect } from "react";
import { OpenLocationCode } from "open-location-code";
import { useAuth } from "@/contexts/AuthContext";
import { getAllViabilizacoes, getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
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
function downloadCSV(rows: Record<string, string | number | undefined>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
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

function matchSearch(row: Record<string, string | number | undefined>, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase().replace(/\+/g, "");
  return Object.values(row).some((v) => String(v ?? "").toLowerCase().replace(/\+/g, "").includes(lower));
}

// ─── Page ─────────────────────────────────────────────────────────
type TabKey = "ftth_ap" | "ftth_rej" | "predios" | "condominios" | "estruturados" | "sem_viab";

export default function RelatoriosPage() {
  const { user } = useAuth();
  const [viabilizacoes, setViabilizacoes] = useState<Viabilizacao[]>([]);
  const [atendidos, setAtendidos] = useState<PredioAtendido[]>([]);
  const [semViab, setSemViab] = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("ftth_ap");
  const [searches, setSearches] = useState<Record<TabKey, string>>({ ftth_ap: "", ftth_rej: "", predios: "", condominios: "", estruturados: "", sem_viab: "" });
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [showMap, setShowMap] = useState(false);

  function setSearch(tab: TabKey, v: string) { setSearches((p) => ({ ...p, [tab]: v })); }

  async function buildMapPoints(
    viabs: Viabilizacao[],
    atnd: PredioAtendido[],
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

    // FTTH aprovadas (excluindo UTP)
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && ["aprovado", "finalizado"].includes(v.status) && !isUTP(v)).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_ap_${v.id}`, ...geo, category: "ftth_ap", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.auditado_por ? `Auditor: ${v.auditado_por}` : undefined });
    });

    // FTTH rejeitadas
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && v.status === "rejeitado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_rej_${v.id}`, ...geo, category: "ftth_rej", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.motivo_rejeicao ?? undefined });
    });

    // UTP (todos os tipos)
    viabs.filter(isUTP).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `utp_${v.id}`, ...geo, category: "utp", cliente: v.nome_cliente ?? v.predio_ftta ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria) });
    });

    // FTTA aprovados (Prédio ou Condomínio estruturado)
    viabs.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status_predio === "estruturado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftta_ap_${v.id}`, ...geo, category: "ftta_ap", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria) });
    });

    // FTTA rejeitados (Prédio ou Condomínio sem viabilidade)
    viabs.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status === "rejeitado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftta_rej_${v.id}`, ...geo, category: "ftta_rej", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.motivo_rejeicao ?? undefined });
    });

    // Prédios sem viabilidade (cadastro)
    svs.forEach((s) => {
      const geo = decode(s.localizacao);
      if (geo) points.push({ id: `sem_viab_${s.id}`, ...geo, category: "sem_viab", cliente: s.condominio, plusCode: locationToPlusCode(s.localizacao), extra: s.observacao });
    });

    setMapPoints(points);
    setLoadingMap(false);
  }

  function load() {
    setLoading(true);
    Promise.all([getAllViabilizacoes(), getPrediosAtendidos(), getPrediosSemViabilidade()])
      .then(([v, a, s]) => { setViabilizacoes(v); setAtendidos(a); setSemViab(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (user?.nivel === 1) load(); }, [user]);

  // Rebuilds map whenever date filter or data changes while map is open
  useEffect(() => {
    if (showMap && !loading) buildMapPoints(filtrado, atendidos, semViab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim, showMap, loading]);

  if (!canAccess(user ?? null, "relatorios")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  // ── Date filter ──────────────────────────────────────────────
  function inRange(dateStr?: string): boolean {
    const d = dateStr ?? "";
    if (dataInicio && d < dataInicio) return false;
    if (dataFim && d > dataFim + "T23:59:59") return false;
    return true;
  }

  const filtrado = viabilizacoes.filter((v) => inRange(v.data_auditoria ?? v.data_solicitacao));

  // ── Derived data ─────────────────────────────────────────────
  // FTTH
  const ftthAprovadas  = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && (
    v.status === "aprovado" ||
    (v.status === "finalizado" && v.status_instalacao === "instalado")
  ));
  const ftthRejeitadas = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && v.status === "rejeitado");

  const taxaAprovacaoFTTH = ftthAprovadas.length + ftthRejeitadas.length > 0
    ? ((ftthAprovadas.length / (ftthAprovadas.length + ftthRejeitadas.length)) * 100).toFixed(1)
    : "0.0";

  // FTTA (Prédio + Condomínio estruturados/rejeitados)
  const fttaAprovados  = filtrado.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status_predio === "estruturado");
  const fttaRejeitados = filtrado.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && v.status === "rejeitado");

  // UTP
  const utpTotal = filtrado.filter((v) => v.status === "utp" || v.motivo_rejeicao === "Atendemos UTP").length;

  // Prédios e Condomínios estruturados (separados)
  const prediosEstruturados     = filtrado.filter((v) => v.tipo_instalacao === "Prédio"     && v.status_predio === "estruturado");
  const condominiosEstruturados = filtrado.filter((v) => v.tipo_instalacao === "Condomínio" && v.status_predio === "estruturado");

  // Para tabs de detalhamento
  const prediosViab    = filtrado.filter((v) => v.tipo_instalacao === "Prédio"     && v.status_predio !== "estruturado");
  const condominiosViab = filtrado.filter((v) => v.tipo_instalacao === "Condomínio" && v.status_predio !== "estruturado");

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
    if (v.status !== "finalizado") return statusLabelRel[v.status] ?? v.status;
    if (v.status_instalacao === "instalado")      return "Instalado";
    if (v.status_predio === "estruturado")        return "Estruturado";
    if (v.motivo_rejeicao === "Atendemos UTP")    return "UTP";
    if (v.motivo_rejeicao)                        return "Sem viabilidade";
    return "Finalizado";
  };

  // ── Rows for CSV / table ──────────────────────────────────────
  const rowsFtthAp = ftthAprovadas.map((v) => ({
    Data:         formatDateTime(v.data_auditoria),
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
    Data:         formatDateTime(v.data_auditoria),
    "Plus Code":  locationToPlusCode(v.plus_code_cliente),
    Cliente:      v.nome_cliente ?? "-",
    Motivo:       v.motivo_rejeicao ?? "-",
    Usuário:      v.usuario,
    Auditor:      v.auditado_por ?? "-",
  }));

  const mapPredioRow = (v: Viabilizacao) => ({
    Data:        formatDateTime(v.data_auditoria ?? v.data_solicitacao),
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
    Data:          formatDateTime(v.data_auditoria ?? v.data_solicitacao),
    Condomínio:    v.predio_ftta ?? "-",
    "Casa/Lote":   v.andar_predio ?? "-",
    Status:        labelForStatus(v),
    "Plus Code":   locationToPlusCode(v.plus_code_cliente),
    Solicitante:   v.usuario,
    Cliente:       v.nome_cliente ?? "-",
    CTO:           v.cto_numero ?? "-",
    OLT:           v.olt ?? "-",
    Portas:        v.portas_disponiveis ?? "-",
    "Menor RX":    v.menor_rx ? `${v.menor_rx} dBm` : "-",
    Distância:     v.distancia_cliente ?? "-",
    Auditor:       v.auditado_por ?? "-",
  }));

  const rowsEstru = atendidos.map((a) => ({
    Data:        formatDateTime(a.data_estruturacao),
    Condomínio:  a.condominio,
    Tecnologia:  a.tecnologia,
    Giga:        a.tecnologia === "FTTA" || a.giga ? "Sim" : "Não",
    Localização: locationToPlusCode(a.localizacao),
    Observação:  a.observacao ?? "-",
    Técnico:     a.estruturado_por,
  }));

  const rowsSemViab = semViab.map((s) => ({
    Data:           formatDateTime(s.data_registro),
    Condomínio:     s.condominio,
    Localização:    locationToPlusCode(s.localizacao),
    Motivo:         s.observacao,
    "Registrado Por": s.registrado_por,
  }));

  // Tab config
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "ftth_ap",      label: "✅ FTTH Aprovadas",    count: ftthAprovadas.length },
    { key: "ftth_rej",     label: "❌ FTTH Rejeitadas",   count: ftthRejeitadas.length },
    { key: "predios",      label: "🏢 Prédios",           count: prediosViab.length },
    { key: "condominios",  label: "🏘️ Condomínios",       count: condominiosViab.length },
    { key: "estruturados", label: "🏗️ Estruturados",      count: atendidos.length },
    { key: "sem_viab",     label: "🚫 Sem Viabilidade",   count: semViab.length },
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
  type RowType = Record<string, string | number | undefined>;
  const allRows: Record<TabKey, RowType[]> = { ftth_ap: rowsFtthAp, ftth_rej: rowsFtthRej, predios: rowsPredios, condominios: rowsCondominios, estruturados: rowsEstru, sem_viab: rowsSemViab };
  const csvNames: Record<TabKey, string> = { ftth_ap: "ftth_aprovadas.csv", ftth_rej: "ftth_rejeitadas.csv", predios: "viabilizacoes_predios.csv", condominios: "viabilizacoes_condominios.csv", estruturados: "predios_estruturados.csv", sem_viab: "predios_sem_viabilidade.csv" };
  const currentRows = allRows[activeTab].filter((r) => matchSearch(r, searches[activeTab]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📊 Relatórios e Análises</h1>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Filtro de data */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data Início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data Fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        {(dataInicio || dataFim) && (
          <button onClick={() => { setDataInicio(""); setDataFim(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">Limpar</button>
        )}
        {(dataInicio || dataFim) && (
          <p className="text-xs text-indigo-600 self-center">
            📊 {dataInicio ? new Date(dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "início"} até {dataFim ? new Date(dataFim + "T12:00:00").toLocaleDateString("pt-BR") : "hoje"}
          </p>
        )}
      </div>

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
          <p className="text-5xl font-bold text-gray-900">{utpTotal}</p>
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
                  {Object.keys(currentRows[0]).map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {currentRows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs max-w-[200px] truncate">
                        {String(val ?? "-")}
                      </td>
                    ))}
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
    </div>
  );
}
