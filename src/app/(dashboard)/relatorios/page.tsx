"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllViabilizacoes, getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao, PredioAtendido, PredioSemViabilidade } from "@/types";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2, Download, Search, RefreshCw, MapPin } from "lucide-react";
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
type TabKey = "ftth_ap" | "ftth_rej" | "predios" | "estruturados" | "sem_viab";

export default function RelatoriosPage() {
  const { user } = useAuth();
  const [viabilizacoes, setViabilizacoes] = useState<Viabilizacao[]>([]);
  const [atendidos, setAtendidos] = useState<PredioAtendido[]>([]);
  const [semViab, setSemViab] = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("ftth_ap");
  const [searches, setSearches] = useState<Record<TabKey, string>>({ ftth_ap: "", ftth_rej: "", predios: "", estruturados: "", sem_viab: "" });
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showMap, setShowMap] = useState(false);

  function setSearch(tab: TabKey, v: string) { setSearches((p) => ({ ...p, [tab]: v })); }

  async function buildMapPoints(
    viabs: Viabilizacao[],
    atnd: PredioAtendido[],
    svs: PredioSemViabilidade[]
  ) {
    if (mapReady) return;
    setLoadingMap(true);
    const REFERENCE_LAT = -28.6775;
    const REFERENCE_LON = -49.3696;

    function decode(plusCode: string): { lat: number; lon: number } | null {
      try {
        const { OpenLocationCode } = require("open-location-code");
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

    // FTTH aprovadas
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && ["aprovado", "finalizado"].includes(v.status)).forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_ap_${v.id}`, ...geo, category: "ftth_ap", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.auditado_por ? `Auditor: ${v.auditado_por}` : undefined });
    });

    // FTTH rejeitadas
    viabs.filter((v) => v.tipo_instalacao === "FTTH" && v.status === "rejeitado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `ftth_rej_${v.id}`, ...geo, category: "ftth_rej", cliente: v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria), extra: v.motivo_rejeicao ?? undefined });
    });

    // Prédio aprovado
    viabs.filter((v) => v.tipo_instalacao === "Prédio" && v.status === "aprovado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `predio_ap_${v.id}`, ...geo, category: "predio_ap", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria) });
    });

    // Condomínio aprovado
    viabs.filter((v) => v.tipo_instalacao === "Condomínio" && v.status === "aprovado").forEach((v) => {
      const geo = decode(v.plus_code_cliente);
      if (geo) points.push({ id: `cond_ap_${v.id}`, ...geo, category: "cond_ap", cliente: v.predio_ftta ?? v.nome_cliente ?? "-", plusCode: locationToPlusCode(v.plus_code_cliente), data: formatDateTime(v.data_auditoria) });
    });

    // Prédios sem viabilidade
    svs.forEach((s) => {
      const geo = decode(s.localizacao);
      if (geo) points.push({ id: `sem_viab_${s.id}`, ...geo, category: "sem_viab", cliente: s.condominio, plusCode: locationToPlusCode(s.localizacao), extra: s.observacao });
    });

    setMapPoints(points);
    setMapReady(true);
    setLoadingMap(false);
  }

  function load() {
    setLoading(true);
    Promise.all([getAllViabilizacoes(), getPrediosAtendidos(), getPrediosSemViabilidade()])
      .then(([v, a, s]) => { setViabilizacoes(v); setAtendidos(a); setSemViab(s); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (user?.nivel === 1) load(); }, [user]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;
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
  const ftthAprovadas  = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && ["aprovado", "finalizado"].includes(v.status));
  const ftthRejeitadas = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && v.status === "rejeitado");
  const prediosViab    = filtrado.filter((v) => ["Prédio", "Condomínio"].includes(v.tipo_instalacao));

  const taxaAprovacao = ftthAprovadas.length + ftthRejeitadas.length > 0
    ? ((ftthAprovadas.length / (ftthAprovadas.length + ftthRejeitadas.length)) * 100).toFixed(1)
    : "0.0";

  const fttaCount     = atendidos.filter((a) => a.tecnologia === "FTTA").length;
  const utpCount      = atendidos.filter((a) => a.tecnologia === "UTP").length;
  const ftthCondCount = atendidos.filter((a) => a.tecnologia === "FTTH").length;
  const gigaCount     = atendidos.filter((a) => a.tecnologia === "FTTA" || a.giga).length;

  const statusLabelRel: Record<string, string> = {
    pendente:     "Pendente",
    em_auditoria: "Em auditoria",
    em_revisao:   "Em revisão",
    aprovado:     "Aprovado",
    rejeitado:    "Sem viabilidade",
    utp:          "UTP",
    finalizado:   "Finalizado",
  };

  // ── Rows for CSV / table ──────────────────────────────────────
  const rowsFtthAp = ftthAprovadas.map((v) => ({
    Data:         formatDateTime(v.data_auditoria),
    "Plus Code":  locationToPlusCode(v.plus_code_cliente),
    Cliente:      v.nome_cliente ?? "-",
    Usuário:      v.usuario,
    CTO:          v.cto_numero ?? "-",
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

  const rowsPredios = prediosViab.map((v) => ({
    Data:        formatDateTime(v.data_auditoria ?? v.data_solicitacao),
    Tipo:        v.tipo_instalacao,
    "Prédio/Cond.": v.predio_ftta ?? "-",
    "Casa/Apto": v.andar_predio ?? "-",
    Bloco:       v.bloco_predio ?? "-",
    Status:      statusLabelRel[v.status] ?? v.status,
    "Plus Code": locationToPlusCode(v.plus_code_cliente),
    Solicitante: v.usuario,
    Cliente:     v.nome_cliente ?? "-",
    CDOI:        v.cdoi ?? "-",
    Portas:      v.portas_disponiveis ?? "-",
    "Média RX":  v.media_rx ? `${v.media_rx} dBm` : "-",
    Auditor:     v.auditado_por ?? "-",
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
    { key: "ftth_ap",      label: "✅ FTTH Aprovadas",      count: ftthAprovadas.length },
    { key: "ftth_rej",     label: "❌ FTTH Rejeitadas",     count: ftthRejeitadas.length },
    { key: "predios",      label: "🏢 Prédios/Cond.",       count: prediosViab.length },
    { key: "estruturados", label: "🏗️ Estruturados",        count: atendidos.length },
    { key: "sem_viab",     label: "🚫 Sem Viabilidade",     count: semViab.length },
  ];

  const pieData = [
    { name: "Aprovadas",  value: ftthAprovadas.length,  color: "#22c55e" },
    { name: "Rejeitadas", value: ftthRejeitadas.length, color: "#ef4444" },
  ];

  const barPredios = [
    { name: "FTTA",  value: fttaCount,     fill: "#3b82f6" },
    { name: "UTP",   value: utpCount,      fill: "#22c55e" },
    { name: "FTTH",  value: ftthCondCount, fill: "#f97316" },
  ];

  // Row for active tab
  type RowType = Record<string, string | number | undefined>;
  const allRows: Record<TabKey, RowType[]> = { ftth_ap: rowsFtthAp, ftth_rej: rowsFtthRej, predios: rowsPredios, estruturados: rowsEstru, sem_viab: rowsSemViab };
  const csvNames: Record<TabKey, string> = { ftth_ap: "ftth_aprovadas.csv", ftth_rej: "ftth_rejeitadas.csv", predios: "viabilizacoes_predios.csv", estruturados: "predios_estruturados.csv", sem_viab: "predios_sem_viabilidade.csv" };
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

      {/* KPIs FTTH */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "✅ FTTH Aprovadas",     value: ftthAprovadas.length,  color: "green" },
          { label: "🏢 Prédios Estruturados",value: atendidos.length,      color: "blue"  },
          { label: "📈 Taxa de Aprovação",   value: `${taxaAprovacao}%`,   color: "indigo"},
          { label: "📍 FTTH Sem Viabilidade",value: ftthRejeitadas.length, color: "red"   },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">🥧 FTTH — Aprovadas vs Rejeitadas</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                label={({ name, value, percent }) => `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">📊 Prédios Estruturados por Tecnologia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barPredios} barSize={48}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 12 }}>
                {barPredios.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KPIs Prédios */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-700 mb-4">🏢 Resumo de Prédios / Condomínios</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
          {[
            { label: "Total Estruturados", value: atendidos.length  },
            { label: "⚡ Giga",            value: gigaCount          },
            { label: "FTTA",               value: fttaCount          },
            { label: "UTP",                value: utpCount           },
            { label: "FTTH (Cond.)",       value: ftthCondCount      },
            { label: "Sem Viabilidade",    value: semViab.length     },
          ].map((k) => (
            <div key={k.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500">{k.label}</p>
            </div>
          ))}
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
            setShowMap((s) => {
              if (!s && !mapReady) buildMapPoints(viabilizacoes, atendidos, semViab);
              return !s;
            });
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
