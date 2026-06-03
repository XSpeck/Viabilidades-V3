"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAgendamentos, finalizarEstruturado, reagendarVisita, rejeitarPredio } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, CalendarDays } from "lucide-react";

export default function AgendaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getAgendamentos()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Agenda FTTA/UTP</h1>
          <p className="text-gray-500 text-sm mt-1">Visitas técnicas agendadas</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border">
          <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma visita agendada.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((v) => <AgendaCard key={v.id} v={v} userName={user!.nome} onRefresh={load} />)}
        </div>
      )}
    </div>
  );
}

function AgendaCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showEstruturar, setShowEstruturar] = useState(false);
  const [showReagendar, setShowReagendar] = useState(false);
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  const [obsEstruturacao, setObsEstruturacao] = useState("");
  const [gigaEstrutura, setGigaEstrutura] = useState(v.giga ?? false);
  const [novaData, setNovaData] = useState("");
  const [novoPeriodo, setNovoPeriodo] = useState("Manhã");
  const [novoTecnico, setNovoTecnico] = useState("");
  const [motivoReagend, setMotivoReagend] = useState("");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const isCond = v.tipo_instalacao === "Condomínio";
  const icon = isCond ? "🏘️" : "🏢";
  const tecnologia = v.tecnologia_predio ?? "N/A";
  const corTech = tecnologia === "FTTA" ? "bg-blue-100 text-blue-700" : tecnologia === "UTP" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700";

  const dataFormatada = v.data_visita
    ? new Date(v.data_visita + "T12:00:00").toLocaleDateString("pt-BR")
    : "N/A";

  async function handleEstruturar() {
    if (!obsEstruturacao.trim()) { alert("Adicione observações!"); return; }
    setLoading(true);
    try {
      await finalizarEstruturado(v.id, {
        condominio: v.predio_ftta ?? "Prédio",
        tecnologia: v.tecnologia_predio ?? "N/A",
        localizacao: v.plus_code_cliente,
        observacao: obsEstruturacao,
        tecnico: v.tecnico_responsavel ?? userName,
        giga: gigaEstrutura,
      });
      finishWithSuccess(`🎉 ${v.predio_ftta ?? "Prédio"} registrado como estruturado!`);
    } finally { setLoading(false); }
  }

  async function handleReagendar() {
    if (!novaData || !novoTecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await reagendarVisita(v.id, novaData, novoPeriodo, novoTecnico, motivoReagend, {
        data_visita: v.data_visita, periodo_visita: v.periodo_visita, tecnico_responsavel: v.tecnico_responsavel,
      });
      finishWithSuccess(`🔄 Visita reagendada para ${new Date(novaData + "T12:00:00").toLocaleDateString("pt-BR")} — ${novoPeriodo} — ${novoTecnico}.`);
    } finally { setLoading(false); }
  }

  async function handleRejeitar() {
    if (!motivoRejeicao.trim()) { alert("Informe o motivo!"); return; }
    setLoading(true);
    try {
      await rejeitarPredio(v.id, v.predio_ftta ?? "Prédio", v.plus_code_cliente, motivoRejeicao, userName);
      finishWithSuccess("❌ Registrado como sem viabilidade.");
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-l-4 border-l-green-500">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{icon} {v.predio_ftta ?? "Prédio"}</h3>
            {v.historico_reagendamento && (
              <p className="text-xs text-orange-600 mt-0.5">🔄 {v.historico_reagendamento}</p>
            )}
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${corTech}`}>{tecnologia}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">📍 Localização</p>
            <p className="font-mono text-xs">{v.plus_code_cliente}</p>
            <p>{isCond ? "Condomínio" : "Edifício"}: {v.predio_ftta}</p>
            <p>Apto/Casa: {v.apartamento ?? "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">📅 Agendamento</p>
            <p>Data: <strong>{dataFormatada}</strong></p>
            <p>Período: {v.periodo_visita}</p>
            <p>Técnico: {v.tecnico_responsavel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">👥 Contatos</p>
            <p>{isCond ? "Responsável" : "Síndico"}: {v.nome_sindico} | {v.contato_sindico}</p>
            <p>Cliente: {v.nome_cliente_predio} | {v.contato_cliente_predio}</p>
          </div>
        </div>

        {v.obs_agendamento && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            📝 {v.obs_agendamento}
          </div>
        )}

        {v.giga && <p className="mt-2 text-xs text-yellow-600 font-medium">⚡ Giga</p>}

        {/* Checklist pré-visita */}
        {v.checklist_previsita && (
          <div className="mt-3 border rounded-xl p-3 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">📋 Checklist pré-visita</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { key: "sindico_avisado",      label: "Síndico avisado" },
                { key: "portaria_informada",   label: "Portaria informada" },
                { key: "acesso_confirmado",    label: "Acesso confirmado" },
                { key: "data_confirmada",      label: "Data confirmada" },
                { key: "equipamento_separado", label: "Equipamento separado" },
              ].map((item) => {
                const ok = v.checklist_previsita?.[item.key as keyof typeof v.checklist_previsita];
                return (
                  <div key={item.key} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${ok ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
                    <span>{ok ? "✅" : "❌"}</span>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Banner de sucesso */}
        {successMsg && (
          <div className="mt-4 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-green-800 text-sm font-medium">
            <span className="text-xl">🎉</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Botões de ação */}
        <div className={`flex gap-2 mt-4 ${successMsg ? "hidden" : ""}`}>
          <button onClick={() => { setShowEstruturar(!showEstruturar); setShowReagendar(false); setShowRejeitar(false); }}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">✅ Estruturado</button>
          <button onClick={() => { setShowReagendar(!showReagendar); setShowEstruturar(false); setShowRejeitar(false); }}
            className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium">🔄 Reagendar</button>
          <button onClick={() => { setShowRejeitar(!showRejeitar); setShowEstruturar(false); setShowReagendar(false); }}
            className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm font-medium">❌ Sem Viab.</button>
        </div>

        {/* Formulário estruturado */}
        {showEstruturar && (
          <div className="mt-4 border border-green-200 rounded-lg p-4 space-y-3">
            <p className="font-medium text-green-800 text-sm">✅ Registrar como Estruturado</p>
            <textarea placeholder="Observações da estruturação *" value={obsEstruturacao} onChange={(e) => setObsEstruturacao(e.target.value)}
              rows={3} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gigaEstrutura} onChange={(e) => setGigaEstrutura(e.target.checked)} />
              ⚡ {isCond ? "Condomínio" : "Prédio"} Giga?
            </label>
            <div className="flex gap-2">
              <button onClick={handleEstruturar} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
              <button onClick={() => setShowEstruturar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulário reagendar */}
        {showReagendar && (
          <div className="mt-4 border border-yellow-200 rounded-lg p-4 space-y-3">
            <p className="font-medium text-yellow-800 text-sm">🔄 Reagendar Visita</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg">
                <option>Manhã</option><option>Tarde</option>
              </select>
              <input placeholder="Novo técnico *" value={novoTecnico} onChange={(e) => setNovoTecnico(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 col-span-2" />
              <textarea placeholder="Motivo (opcional)" value={motivoReagend} onChange={(e) => setMotivoReagend(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg focus:outline-none col-span-2" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleReagendar} disabled={loading} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
              <button onClick={() => setShowReagendar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulário rejeitar */}
        {showRejeitar && (
          <div className="mt-4 border border-red-200 rounded-lg p-4 space-y-3">
            <p className="font-medium text-red-800 text-sm">❌ Registrar Sem Viabilidade</p>
            <textarea placeholder="Motivo da não viabilidade *" value={motivoRejeicao} onChange={(e) => setMotivoRejeicao(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex gap-2">
              <button onClick={handleRejeitar} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
              <button onClick={() => setShowRejeitar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
