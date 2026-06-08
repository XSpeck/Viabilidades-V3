"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAgendamentos, finalizarEstruturado, reagendarVisita, rejeitarPredio, atualizarObsAgendamento,
  getDemandasAgendadas, agendarDemanda, concluirDemanda,
} from "@/lib/firestore";
import { locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao, DemandaRede, PrioridadeDemanda } from "@/types";
import { TECNICOS_REDE } from "@/types";
import { RefreshCw, Loader2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Pencil, Check, X } from "lucide-react";
import { canAccess } from "@/lib/access";

const PRIORIDADE_COLOR: Record<PrioridadeDemanda, string> = {
  baixa:   "bg-gray-100 text-gray-600",
  media:   "bg-blue-100 text-blue-700",
  alta:    "bg-orange-100 text-orange-700",
  urgente: "bg-red-100 text-red-700",
};

// ─── Date helpers ─────────────────────────────────────────────────
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO(): string { return toISODate(new Date()); }
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function getWeekDays(iso: string): string[] {
  const d = new Date(iso + "T12:00:00");
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(monday);
    nd.setDate(monday.getDate() + i);
    return toISODate(nd);
  });
}
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function formatWeekdayShort(iso: string): string {
  return WEEKDAY_SHORT[new Date(iso + "T12:00:00").getDay()];
}
function formatDayNum(iso: string): string { return iso.slice(8); }
function formatDayFull(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

// ─── Page ─────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { user } = useAuth();
  const [items, setItems]       = useState<Viabilizacao[]>([]);
  const [demandas, setDemandas] = useState<DemandaRede[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [viabs, dems] = await Promise.all([getAgendamentos(), getDemandasAgendadas()]);
      setItems(viabs);
      setDemandas(dems);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!canAccess(user ?? null, "agenda")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const today    = todayISO();
  const weekDays = getWeekDays(selectedDate);

  // Colunas: técnicos de rede fixos + técnicos das visitas
  const tecnicosVisitas = Array.from(new Set(items.map((v) => v.tecnico_responsavel).filter(Boolean))) as string[];
  const allTecnicos     = Array.from(new Set([...TECNICOS_REDE, ...tecnicosVisitas]));

  // Itens do dia selecionado
  const visitasDay  = items.filter((v) => v.data_visita === selectedDate);
  const demandasDay = demandas.filter((d) => d.data_agendamento === selectedDate);

  // Atrasadas
  const atrasadasVisitas  = items.filter((v) => v.data_visita && v.data_visita < today);
  const atrasadasDemandas = demandas.filter((d) => d.data_agendamento && d.data_agendamento < today);
  const totalAtrasadas    = atrasadasVisitas.length + atrasadasDemandas.length;

  function countForDay(iso: string): number {
    return items.filter((v) => v.data_visita === iso).length +
           demandas.filter((d) => d.data_agendamento === iso).length;
  }
  function visitasCell(tecnico: string, periodo: string): Viabilizacao[] {
    return visitasDay.filter((v) => v.tecnico_responsavel === tecnico && v.periodo_visita === periodo);
  }
  function demandasCell(tecnico: string, periodo: string): DemandaRede[] {
    return demandasDay.filter((d) => d.tecnico === tecnico && d.periodo_agendamento === periodo);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Agenda Técnica</h1>
          <p className="text-gray-500 text-sm mt-1">
            {items.length} visita(s) · {demandas.length} demanda(s) em andamento
            {totalAtrasadas > 0 && <span className="text-red-600 font-medium"> · {totalAtrasadas} atrasada(s)</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Navegação semanal */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelectedDate((d) => addDays(d, -7))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map((iso) => {
              const count      = countForDay(iso);
              const isSelected = iso === selectedDate;
              const isToday    = iso === today;
              return (
                <button key={iso} onClick={() => setSelectedDate(iso)}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-colors ${
                    isSelected ? "bg-indigo-600 text-white shadow-sm" :
                    isToday    ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" :
                                 "hover:bg-gray-50 text-gray-600"
                  }`}>
                  <span className="text-xs font-medium">{formatWeekdayShort(iso)}</span>
                  <span className={`text-sm font-bold ${isSelected ? "text-white" : isToday ? "text-indigo-700" : "text-gray-800"}`}>
                    {formatDayNum(iso)}
                  </span>
                  <span className={`text-xs font-semibold h-4 ${count > 0 ? (isSelected ? "text-indigo-200" : "text-indigo-500") : "text-transparent"}`}>
                    {count > 0 ? count : "0"}
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setSelectedDate((d) => addDays(d, 7))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <p className="text-sm font-semibold text-gray-700 capitalize">{formatDayFull(selectedDate)}</p>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)}
              className="text-xs text-indigo-600 hover:underline font-medium">Ir para hoje</button>
          )}
        </div>
      </div>

      {/* Atrasadas */}
      {totalAtrasadas > 0 && (
        <AtrasadasPanel
          visitas={atrasadasVisitas}
          demandas={atrasadasDemandas}
          userName={user!.nome}
          onRefresh={load}
        />
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : visitasDay.length === 0 && demandasDay.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border text-gray-400">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="font-medium text-gray-500">Nenhum item agendado para este dia.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: `${allTecnicos.length * 180 + 96}px` }}>
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="w-24 py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-r sticky left-0 bg-gray-50 z-10">
                    Período
                  </th>
                  {allTecnicos.map((t) => {
                    const isRede = (TECNICOS_REDE as readonly string[]).includes(t);
                    return (
                      <th key={t} className="py-3 px-4 text-center border-r last:border-r-0 min-w-[180px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{isRede ? "🔧" : "📡"}</span>
                          <span className="text-xs font-semibold text-gray-700">{t}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(["Manhã", "Tarde"] as const).map((periodo, idx) => (
                  <tr key={periodo} className={idx === 0 ? "border-b" : ""}>
                    <td className="py-4 px-4 border-r bg-gray-50 align-top sticky left-0 z-10">
                      <span className="text-sm font-semibold text-gray-700">
                        {periodo === "Manhã" ? "🌅" : "🌇"} {periodo}
                      </span>
                    </td>
                    {allTecnicos.map((tecnico) => {
                      const vs      = visitasCell(tecnico, periodo);
                      const ds      = demandasCell(tecnico, periodo);
                      const total   = vs.length + ds.length;
                      const conflict = total > 1;
                      return (
                        <td key={tecnico}
                          className={`py-3 px-3 border-r last:border-r-0 align-top ${conflict ? "bg-red-50" : ""}`}>
                          {total === 0 ? (
                            <div className="flex items-center justify-center h-14 text-gray-200 text-xl select-none">—</div>
                          ) : (
                            <div className="space-y-2">
                              {conflict && (
                                <div className="text-xs text-red-600 font-semibold">⚠️ Conflito ({total})</div>
                              )}
                              {vs.map((v) => (
                                <VisitaCellCard key={v.id} v={v} userName={user!.nome} onRefresh={load} />
                              ))}
                              {ds.map((d) => (
                                <DemandaCellCard key={d.id} d={d} onRefresh={load} />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Painel de atrasadas ───────────────────────────────────────────
function AtrasadasPanel({ visitas, demandas, userName, onRefresh }: {
  visitas: Viabilizacao[]; demandas: DemandaRede[];
  userName: string; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const total = visitas.length + demandas.length;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-100 transition-colors text-left">
        <span className="text-red-600 font-bold text-sm flex-1">
          🔴 Atrasadas — {total} item(s) pendente(s)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {visitas.map((v) => <VisitaCellCard key={v.id} v={v} userName={userName} onRefresh={onRefresh} />)}
          {demandas.map((d) => <DemandaCellCard key={d.id} d={d} onRefresh={onRefresh} />)}
        </div>
      )}
    </div>
  );
}

// ─── Card de visita (célula do grid) ──────────────────────────────
function VisitaCellCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showEstruturar, setShowEstruturar]   = useState(false);
  const [obsEstruturacao, setObsEstruturacao] = useState("");
  const isAlwaysGiga = v.tecnologia_predio === "FTTA" || v.tipo_instalacao === "Condomínio";
  const [gigaEstrutura, setGigaEstrutura]     = useState(isAlwaysGiga || (v.giga ?? false));

  const [showReagendar, setShowReagendar]   = useState(false);
  const [novaData, setNovaData]             = useState("");
  const [novoPeriodo, setNovoPeriodo]       = useState("Manhã");
  const [novoTecnico, setNovoTecnico]       = useState(v.tecnico_responsavel ?? "");
  const [motivoReagend, setMotivoReagend]   = useState("");

  const [showRejeitar, setShowRejeitar]     = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const [editingObs, setEditingObs]   = useState(false);
  const [obsRascunho, setObsRascunho] = useState(v.obs_agendamento ?? "");
  const [savingObs, setSavingObs]     = useState(false);

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  async function handleEstruturar() {
    if (!obsEstruturacao.trim()) { alert("Adicione observações!"); return; }
    setBusy(true);
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
    } finally { setBusy(false); }
  }

  async function handleReagendar() {
    if (!novaData || !novoTecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setBusy(true);
    try {
      await reagendarVisita(v.id, novaData, novoPeriodo, novoTecnico, motivoReagend, {
        data_visita: v.data_visita, periodo_visita: v.periodo_visita, tecnico_responsavel: v.tecnico_responsavel,
      });
      finishWithSuccess(`🔄 Reagendado para ${new Date(novaData + "T12:00:00").toLocaleDateString("pt-BR")}.`);
    } finally { setBusy(false); }
  }

  async function handleRejeitar() {
    if (!motivoRejeicao.trim()) { alert("Informe o motivo!"); return; }
    setBusy(true);
    try {
      await rejeitarPredio(v.id, v.predio_ftta ?? "Prédio", v.plus_code_cliente, motivoRejeicao, userName);
      finishWithSuccess("❌ Registrado como sem viabilidade.");
    } finally { setBusy(false); }
  }

  async function handleSalvarObs() {
    setSavingObs(true);
    try {
      await atualizarObsAgendamento(v.id, obsRascunho.trim());
      setEditingObs(false);
      onRefresh();
    } catch { alert("Erro ao salvar."); }
    finally { setSavingObs(false); }
  }

  const isCond    = v.tipo_instalacao === "Condomínio";
  const tecnologia = v.tecnologia_predio ?? "N/A";
  const corTech   = tecnologia === "FTTA" ? "bg-blue-100 text-blue-700"
                  : tecnologia === "UTP"  ? "bg-green-100 text-green-700"
                  :                          "bg-orange-100 text-orange-700";

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-gray-900 truncate">{v.predio_ftta ?? "Prédio"}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${corTech}`}>{tecnologia}</span>
            {(v.giga || isAlwaysGiga) && <span className="text-xs text-yellow-600 shrink-0">⚡</span>}
          </div>
          {v.nome_cliente_predio && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{v.nome_cliente_predio}</p>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
               : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t pt-2.5 space-y-3">
          {/* Detalhes */}
          <div className="space-y-1 text-xs text-gray-600">
            <p>📍 <span className="font-mono">{locationToPlusCode(v.plus_code_cliente)}</span></p>
            {v.apartamento && <p>🏠 Apto: {v.apartamento}</p>}
            <p>📞 {isCond ? "Resp." : "Síndico"}: {v.nome_sindico} · {v.contato_sindico}</p>
            {v.nome_cliente_predio && <p>👤 {v.nome_cliente_predio} · {v.contato_cliente_predio}</p>}
            {v.historico_reagendamento && <p className="text-orange-600">🔄 {v.historico_reagendamento}</p>}
          </div>

          {/* Obs */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-2 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-yellow-700 uppercase">💬 Obs.</span>
              {!editingObs && (
                <button onClick={() => { setObsRascunho(v.obs_agendamento ?? ""); setEditingObs(true); }}
                  className="text-yellow-600 hover:text-yellow-800">
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            {editingObs ? (
              <div className="space-y-1.5">
                <textarea value={obsRascunho} onChange={(e) => setObsRascunho(e.target.value)} rows={2}
                  className="w-full px-2 py-1 text-xs border border-yellow-300 rounded focus:outline-none" />
                <div className="flex gap-1.5">
                  <button onClick={handleSalvarObs} disabled={savingObs}
                    className="flex items-center gap-1 px-2 py-1 bg-yellow-600 text-white text-xs rounded">
                    {savingObs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
                  </button>
                  <button onClick={() => setEditingObs(false)} className="px-2 py-1 border rounded text-xs text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : v.obs_agendamento ? (
              <p className="text-gray-700 italic">"{v.obs_agendamento}"</p>
            ) : (
              <p className="text-yellow-400 italic">Sem observação.</p>
            )}
          </div>

          {/* Checklist */}
          {v.checklist_previsita && (
            <div className="border rounded-lg p-2 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">📋 Checklist</p>
              <div className="space-y-1 text-xs">
                {[
                  { key: "sindico_avisado",      label: isCond ? "Resp. avisado" : "Síndico avisado" },
                  { key: "portaria_informada",   label: "Portaria informada" },
                  { key: "acesso_confirmado",    label: "Acesso confirmado" },
                  { key: "data_confirmada",      label: "Data confirmada" },
                  { key: "equipamento_separado", label: "Equipamento separado" },
                ].map((item) => {
                  const ok = v.checklist_previsita?.[item.key as keyof typeof v.checklist_previsita];
                  return (
                    <div key={item.key} className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${ok ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
                      <span>{ok ? "✅" : "❌"}</span><span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sucesso */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-800 text-xs font-medium">
              {successMsg}
            </div>
          )}

          {/* Ações */}
          {!successMsg && (
            <div className="flex gap-1.5">
              <button onClick={() => { setShowEstruturar(!showEstruturar); setShowReagendar(false); setShowRejeitar(false); }}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
                ✅ Estruturado
              </button>
              <button onClick={() => { setShowReagendar(!showReagendar); setShowEstruturar(false); setShowRejeitar(false); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showReagendar ? "bg-yellow-50 border-yellow-400 text-yellow-700" : "hover:bg-gray-50 text-gray-700"}`}>
                🔄 Reagendar
              </button>
              <button onClick={() => { setShowRejeitar(!showRejeitar); setShowEstruturar(false); setShowReagendar(false); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showRejeitar ? "bg-red-50 border-red-400 text-red-700" : "border-red-300 hover:bg-red-50 text-red-600"}`}>
                ❌ Sem Viab.
              </button>
            </div>
          )}

          {showEstruturar && (
            <div className="border border-green-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-green-800">✅ Registrar como Estruturado</p>
              <textarea placeholder="Observações da estruturação *" value={obsEstruturacao}
                onChange={(e) => setObsEstruturacao(e.target.value)} rows={2}
                className="w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-green-400" />
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={gigaEstrutura} onChange={(e) => setGigaEstrutura(e.target.checked)} disabled={isAlwaysGiga} />
                ⚡ Giga?
                {isAlwaysGiga && <span className="text-blue-500">(automático)</span>}
              </label>
              <div className="flex gap-1.5">
                <button onClick={handleEstruturar} disabled={busy}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmar"}
                </button>
                <button onClick={() => setShowEstruturar(false)} className="flex-1 border py-1.5 rounded text-xs">Cancelar</button>
              </div>
            </div>
          )}

          {showReagendar && (
            <div className="border border-yellow-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-yellow-800">🔄 Reagendar Visita</p>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                  className="px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-yellow-400" />
                <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)}
                  className="px-2 py-1.5 text-xs border rounded">
                  <option>Manhã</option><option>Tarde</option>
                </select>
                <input placeholder="Técnico *" value={novoTecnico} onChange={(e) => setNovoTecnico(e.target.value)}
                  className="col-span-2 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-yellow-400" />
                <textarea placeholder="Motivo (opcional)" value={motivoReagend} onChange={(e) => setMotivoReagend(e.target.value)}
                  rows={2} className="col-span-2 px-2 py-1.5 text-xs border rounded focus:outline-none" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleReagendar} disabled={busy}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmar"}
                </button>
                <button onClick={() => setShowReagendar(false)} className="flex-1 border py-1.5 rounded text-xs">Cancelar</button>
              </div>
            </div>
          )}

          {showRejeitar && (
            <div className="border border-red-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-red-800">❌ Registrar Sem Viabilidade</p>
              <textarea placeholder="Motivo *" value={motivoRejeicao}
                onChange={(e) => setMotivoRejeicao(e.target.value)} rows={2}
                className="w-full px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-red-400" />
              <div className="flex gap-1.5">
                <button onClick={handleRejeitar} disabled={busy}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1">
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmar"}
                </button>
                <button onClick={() => setShowRejeitar(false)} className="flex-1 border py-1.5 rounded text-xs">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Card de demanda (célula do grid) ─────────────────────────────
function DemandaCellCard({ d, onRefresh }: { d: DemandaRede; onRefresh: () => void }) {
  const [open, setOpen]               = useState(false);
  const [saving, setSaving]           = useState(false);
  const [showObsConc, setShowObsConc] = useState(false);
  const [obsConc, setObsConc]         = useState("");
  const [showReagendar, setShowReagendar] = useState(false);
  const [novaData, setNovaData]       = useState(d.data_agendamento ?? "");
  const [novoPeriodo, setNovoPeriodo] = useState(d.periodo_agendamento ?? "Manhã");

  async function handleConcluir() {
    setSaving(true);
    try {
      await concluirDemanda(d.id, obsConc || undefined);
      onRefresh();
    } catch { alert("Erro ao concluir."); }
    finally { setSaving(false); }
  }

  async function handleReagendar() {
    if (!novaData) { alert("Informe a data!"); return; }
    setSaving(true);
    try {
      await agendarDemanda(d.id, novaData, novoPeriodo);
      onRefresh();
    } catch { alert("Erro ao reagendar."); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-lg border border-purple-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-purple-50 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs">🔧</span>
            <span className="text-xs font-bold text-gray-900 truncate">{d.tipo}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${PRIORIDADE_COLOR[d.prioridade]}`}>
              {d.prioridade}
            </span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{d.descricao}</p>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
               : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 border-t pt-2.5 space-y-3 text-xs">
          <div className="space-y-1 text-gray-600">
            <p className="font-medium">{d.descricao}</p>
            {d.local && <p className="font-mono text-gray-500">📍 {locationToPlusCode(d.local)}</p>}
          </div>

          <div className="flex gap-1.5">
            <button onClick={() => { setShowObsConc(!showObsConc); setShowReagendar(false); }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">
              ✅ Concluído
            </button>
            <button onClick={() => { setShowReagendar(!showReagendar); setShowObsConc(false); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${showReagendar ? "bg-yellow-50 border-yellow-400 text-yellow-700" : "hover:bg-gray-50 text-gray-700"}`}>
              🔄 Reagendar
            </button>
          </div>

          {showObsConc && (
            <div className="border border-green-200 rounded-lg p-2.5 space-y-2">
              <p className="text-xs font-semibold text-green-800">✅ Confirmar conclusão</p>
              <textarea placeholder="Observação (opcional)" value={obsConc} onChange={(e) => setObsConc(e.target.value)}
                rows={2} className="w-full px-2 py-1.5 text-xs border rounded focus:outline-none" />
              <div className="flex gap-1.5">
                <button onClick={handleConcluir} disabled={saving}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmar"}
                </button>
                <button onClick={() => setShowObsConc(false)} className="flex-1 border py-1.5 rounded text-xs">Cancelar</button>
              </div>
            </div>
          )}

          {showReagendar && (
            <div className="border border-yellow-200 rounded-lg p-2.5 space-y-2">
              <p className="text-xs font-semibold text-yellow-800">🔄 Reagendar demanda</p>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                  className="px-2 py-1.5 text-xs border rounded focus:outline-none" />
                <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)}
                  className="px-2 py-1.5 text-xs border rounded">
                  <option>Manhã</option><option>Tarde</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleReagendar} disabled={saving || !novaData}
                  className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirmar"}
                </button>
                <button onClick={() => setShowReagendar(false)} className="flex-1 border py-1.5 rounded text-xs">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
