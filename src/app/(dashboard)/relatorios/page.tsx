"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllViabilizacoes, getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao, PredioAtendido, PredioSemViabilidade } from "@/types";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

export default function RelatoriosPage() {
  const { user } = useAuth();
  const [viabilizacoes, setViabilizacoes] = useState<Viabilizacao[]>([]);
  const [atendidos, setAtendidos] = useState<PredioAtendido[]>([]);
  const [semViab, setSemViab] = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  useEffect(() => {
    if (user?.nivel !== 1) return;
    Promise.all([getAllViabilizacoes(), getPrediosAtendidos(), getPrediosSemViabilidade()])
      .then(([v, a, s]) => { setViabilizacoes(v); setAtendidos(a); setSemViab(s); })
      .finally(() => setLoading(false));
  }, [user]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  // Filtrar por data
  const filtrado = viabilizacoes.filter((v) => {
    const data = v.data_auditoria ?? v.data_solicitacao ?? "";
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim + "T23:59:59") return false;
    return true;
  });

  const ftthAprovadas = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && ["aprovado", "finalizado"].includes(v.status));
  const ftthRejeitadas = filtrado.filter((v) => v.tipo_instalacao === "FTTH" && v.status === "rejeitado");
  const taxaAprovacao = ftthAprovadas.length + ftthRejeitadas.length > 0
    ? ((ftthAprovadas.length / (ftthAprovadas.length + ftthRejeitadas.length)) * 100).toFixed(1)
    : "0.0";

  const pieData = [
    { name: "Aprovadas", value: ftthAprovadas.length, color: "#22c55e" },
    { name: "Rejeitadas", value: ftthRejeitadas.length, color: "#ef4444" },
  ];

  const fttaCount = atendidos.filter((a) => a.tecnologia === "FTTA").length;
  const utpCount = atendidos.filter((a) => a.tecnologia === "UTP").length;
  const ftthCondCount = atendidos.filter((a) => a.tecnologia === "FTTH").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">📊 Relatórios e Análises</h1>

      {/* Filtro de data */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data Início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data Fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        {(dataInicio || dataFim) && (
          <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="text-sm text-gray-500 hover:text-gray-700 underline">Limpar</button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "✅ FTTH Aprovadas", value: ftthAprovadas.length, color: "green" },
          { label: "🏢 Prédios Estruturados", value: atendidos.length, color: "blue" },
          { label: "📈 Taxa de Aprovação", value: `${taxaAprovacao}%`, color: "indigo" },
          { label: "📍 Sem Viabilidade", value: ftthRejeitadas.length, color: "red" },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Gráficos FTTH */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">🥧 Aprovadas vs Rejeitadas</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold text-gray-700 mb-4">📊 Comparativo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pieData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KPIs Prédios */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-semibold text-gray-700 mb-4">🏢 Prédios / Condomínios</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Total Estruturados", value: atendidos.length },
            { label: "FTTA", value: fttaCount },
            { label: "UTP", value: utpCount },
            { label: "FTTH (Cond.)", value: ftthCondCount },
            { label: "Sem Viabilidade", value: semViab.length },
          ].map((k) => (
            <div key={k.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela FTTH aprovadas */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-700">✅ FTTH Aprovadas ({ftthAprovadas.length})</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Plus Code</th>
                <th className="px-4 py-3 text-left">CTO</th>
                <th className="px-4 py-3 text-left">Distância</th>
                <th className="px-4 py-3 text-left">Auditor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ftthAprovadas.slice(0, 50).map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(v.data_auditoria)}</td>
                  <td className="px-4 py-3">{v.nome_cliente ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{v.plus_code_cliente}</td>
                  <td className="px-4 py-3">{v.cto_numero ?? "-"}</td>
                  <td className="px-4 py-3">{v.distancia_cliente ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500">{v.auditado_por ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
