"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAgendamentos, finalizarEstruturado, reagendarVisita, rejeitarPredio,
} from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, CalendarDays, Search, ChevronDown, ChevronUp } from "lucide-react";
import { canAccess } from "@/lib/access";

// ─── Helpers de data ──────────────────────────────────────────────
function toDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function classifyDate(dataVisita?: string): "atrasada" | "hoje" | "futura" {
  if (!dataVisita) return "futura";
  const today = todayDate();
  const d = toDay(dataVisita);
  if (d < today) return "atrasada";
  if (d.getTime() === today.getTime()) return "hoje";
  return "futura";
}

function formatDayLabel(iso: string): string {
  const d = toDay(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function sortByDatePeriod(a: Viabilizacao, b: Viabilizacao) {
  const dateA = a.data_visita ?? "";
  const dateB = b.data_visita ?? "";
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  // Manhã before Tarde
  const periodOrder = (p?: string) => p === "Manhã" ? 0 : 1;
  return periodOrder(a.periodo_visita) - periodOrder(b.periodo_visita);
}

// ─── Page ─────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tecnicoFilter, setTecnicoFilter] = useState("todos");
  const [techFilter, setTechFilter] = useState("todos");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getAgendamentos());
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!canAccess(user ?? null, "agenda")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  // Unique technicians for filter
  const tecnicos = ["todos", ...Array.from(new Set(items.map((v) => v.tecnico_responsavel).filter(Boolean))) as string[]];

  const filtered = items
    .filter((v) => tecnicoFilter === "todos" || v.tecnico_responsavel === tecnicoFilter)
    .filter((v) => techFilter === "todos" || v.tecnologia_predio === techFilter)
    .filter((v) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.predio_ftta?.toLowerCase().includes(q) ||
        v.nome_cliente_predio?.toLowerCase().includes(q) ||
        v.tecnico_responsavel?.toLowerCase().includes(q)
      );
    });

  const atrasadas  = filtered.filter((v) => classifyDate(v.data_visita) === "atrasada").sort(sortByDatePeriod);
  const hoje       = filtered.filter((v) => classifyDate(v.data_visita) === "hoje").sort(sortByDatePeriod);
  const futuras    = filtered.filter((v) => classifyDate(v.data_visita) === "futura").sort(sortByDatePeriod);

  // Group futuras by day
  const futureGroups: { label: string; iso: string; items: Viabilizacao[] }[] = [];
  for (const v of futuras) {
    const iso = v.data_visita!;
    const existing = futureGroups.find((g) => g.iso === iso);
    if (existing) existing.items.push(v);
    else futureGroups.push({ label: formatDayLabel(iso), iso, items: [v] });
  }

  const total = items.length;
  const totalHoje = items.filter((v) => classifyDate(v.data_visita) === "hoje").length;
  const totalAtrasadas = items.filter((v) => classifyDate(v.data_visita) === "atrasada").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Agenda FTTA/UTP</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} visita(s) agendada(s)
            {totalHoje > 0 && <span className="text-yellow-600 font-medium"> · {totalHoje} hoje</span>}
            {totalAtrasadas > 0 && <span className="text-red-600 font-medium"> · {totalAtrasadas} atrasada(s)</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por prédio, cliente ou técnico..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Tecnologia */}
          {["todos", "FTTA", "UTP", "FTTH"].map((t) => (
            <button key={t} onClick={() => setTechFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${techFilter === t ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "todos" ? "Todas tecnologias" : t}
            </button>
          ))}
          <div className="w-px bg-gray-200 self-stretch mx-1" />
          {/* Técnico */}
          {tecnicos.map((t) => (
            <button key={t} onClick={() => setTecnicoFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tecnicoFilter === t ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "todos" ? "Todos os técnicos" : `👷 ${t}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border">
          <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Nenhuma visita agendada.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border text-gray-400">
          Nenhum resultado para os filtros aplicados.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Atrasadas */}
          {atrasadas.length > 0 && (
            <DateGroup label="🔴 Atrasadas" color="red" items={atrasadas} userName={user!.nome} onRefresh={load} />
          )}
          {/* Hoje */}
          {hoje.length > 0 && (
            <DateGroup label="🟡 Hoje" color="yellow" items={hoje} userName={user!.nome} onRefresh={load} />
          )}
          {/* Futuras agrupadas por dia */}
          {futureGroups.map((g) => (
            <DateGroup key={g.iso} label={`🔵 ${g.label}`} color="blue" items={g.items} userName={user!.nome} onRefresh={load} />
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Grupo de data ─────────────────────────────────────────────────
function DateGroup({ label, color, items, userName, onRefresh }: {
  label: string; color: "red" | "yellow" | "blue";
  items: Viabilizacao[]; userName: string; onRefresh: () => void;
}) {
  const borderColor = { red: "border-red-300", yellow: "border-yellow-300", blue: "border-blue-200" }[color];
  const textColor   = { red: "text-red-700",   yellow: "text-yellow-700",   blue: "text-blue-700"  }[color];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={`text-sm font-bold uppercase tracking-wide ${textColor}`}>{label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${borderColor} ${textColor}`}>{items.length}</span>
        <div className={`flex-1 h-px ${borderColor} border-t`} />
      </div>
      <div className="space-y-2">
        {items.map((v) => (
          <AgendaCard key={v.id} v={v} userName={userName} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────
function AgendaCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
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
  const isAlwaysGiga = v.tecnologia_predio === "FTTA" || v.tipo_instalacao === "Condomínio";
  const [gigaEstrutura, setGigaEstrutura] = useState(isAlwaysGiga ? true : (v.giga ?? false));
  const [novaData, setNovaData] = useState("");
  const [novoPeriodo, setNovoPeriodo] = useState("Manhã");
  const [novoTecnico, setNovoTecnico] = useState(v.tecnico_responsavel ?? "");
  const [motivoReagend, setMotivoReagend] = useState("");
  const [motivoRejeicao, setMotivoRejeicao] = useState("");

  const isCond    = v.tipo_instalacao === "Condomínio";
  const tecnologia = v.tecnologia_predio ?? "N/A";
  const corTech   = tecnologia === "FTTA" ? "bg-blue-100 text-blue-700" : tecnologia === "UTP" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700";
  const tipoIcon  = isCond ? "🏘️" : "🏢";
  const isAtrasada = classifyDate(v.data_visita) === "atrasada";

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
      finishWithSuccess(`🔄 Reagendado para ${new Date(novaData + "T12:00:00").toLocaleDateString("pt-BR")} — ${novoPeriodo} — ${novoTecnico}.`);
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
    <div className={`bg-white rounded-xl shadow-sm border-l-4 overflow-hidden ${isAtrasada ? "border-l-red-500" : "border-l-green-500"}`}>

      {/* Header compacto — sempre visível */}
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
        <span className="text-lg shrink-0">{tipoIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{v.predio_ftta ?? "Prédio"}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${corTech}`}>{tecnologia}</span>
            {(v.giga || isAlwaysGiga) && <span className="text-xs text-yellow-600 font-medium shrink-0">⚡ Giga</span>}
            {isAtrasada && <span className="text-xs text-red-600 font-medium shrink-0">⚠️ Atrasada</span>}
            {v.historico_reagendamento && <span className="text-xs text-orange-500 shrink-0">🔄 Reagendado</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
            <span>🕐 {v.periodo_visita ?? "N/A"}</span>
            <span>👷 {v.tecnico_responsavel ?? "N/A"}</span>
            {v.nome_cliente_predio && <span>👤 {v.nome_cliente_predio}</span>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {/* Conteúdo expandido */}
      {open && (
        <div className="px-4 pb-4 border-t pt-3 space-y-3">

          {/* Detalhes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-gray-400 uppercase font-medium">📍 Localização</p>
              <p className="font-mono text-xs">{locationToPlusCode(v.plus_code_cliente)}</p>
              <p>{isCond ? "Condomínio" : "Edifício"}: {v.predio_ftta}</p>
              {v.apartamento && <p>Apto/Casa: {v.apartamento}</p>}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-400 uppercase font-medium">📅 Visita</p>
              <p>Data: <strong>{v.data_visita ? new Date(v.data_visita + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</strong></p>
              <p>Período: {v.periodo_visita}</p>
              <p>Técnico: {v.tecnico_responsavel}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-400 uppercase font-medium">👥 Contatos</p>
              <p>{isCond ? "Responsável" : "Síndico"}: {v.nome_sindico}</p>
              <p>Tel: {v.contato_sindico}</p>
              <p>Cliente: {v.nome_cliente_predio} · {v.contato_cliente_predio}</p>
            </div>
          </div>

          {v.obs_agendamento && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">💬 Obs. do agendamento</p>
              <p className="text-gray-700 italic">"{v.obs_agendamento}"</p>
            </div>
          )}

          {v.historico_reagendamento && (
            <div className="bg-orange-50 rounded-lg px-3 py-2 text-xs text-orange-700">🔄 {v.historico_reagendamento}</div>
          )}

          {/* Checklist */}
          {v.checklist_previsita && (
            <div className="border rounded-xl p-3 bg-gray-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">📋 Checklist pré-visita</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                {[
                  { key: "sindico_avisado",      label: isCond ? "Responsável avisado" : "Síndico avisado" },
                  { key: "portaria_informada",   label: "Portaria informada" },
                  { key: "acesso_confirmado",    label: "Acesso confirmado" },
                  { key: "data_confirmada",      label: "Data confirmada" },
                  { key: "equipamento_separado", label: "Equipamento separado" },
                ].map((item) => {
                  const ok = v.checklist_previsita?.[item.key as keyof typeof v.checklist_previsita];
                  return (
                    <div key={item.key} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${ok ? "bg-green-100 text-green-700" : "bg-red-50 text-red-600"}`}>
                      <span>{ok ? "✅" : "❌"}</span><span>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Banner de sucesso */}
          {successMsg && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm font-medium">
              <span className="text-xl">🎉</span><span>{successMsg}</span>
            </div>
          )}

          {/* Botões de ação */}
          {!successMsg && (
            <div className="flex gap-2">
              <button onClick={() => { setShowEstruturar(!showEstruturar); setShowReagendar(false); setShowRejeitar(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${showEstruturar ? "bg-green-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}`}>
                ✅ Estruturado
              </button>
              <button onClick={() => { setShowReagendar(!showReagendar); setShowEstruturar(false); setShowRejeitar(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${showReagendar ? "bg-yellow-50 border-yellow-400 text-yellow-700" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>
                🔄 Reagendar
              </button>
              <button onClick={() => { setShowRejeitar(!showRejeitar); setShowEstruturar(false); setShowReagendar(false); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${showRejeitar ? "bg-red-50 border-red-400 text-red-700" : "border-red-300 hover:bg-red-50 text-red-600"}`}>
                ❌ Sem Viab.
              </button>
            </div>
          )}

          {/* Formulário estruturado */}
          {showEstruturar && (
            <div className="border border-green-200 rounded-lg p-4 space-y-3">
              <p className="font-medium text-green-800 text-sm">✅ Registrar como Estruturado</p>
              <textarea placeholder="Observações da estruturação *" value={obsEstruturacao}
                onChange={(e) => setObsEstruturacao(e.target.value)}
                rows={3} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={gigaEstrutura} onChange={(e) => setGigaEstrutura(e.target.checked)} disabled={isAlwaysGiga} />
                ⚡ {isCond ? "Condomínio" : "Prédio"} Giga?
                {isAlwaysGiga && <span className="text-xs text-blue-600">{isCond ? "(sempre ativo em Condomínio)" : "(sempre ativo em FTTA)"}</span>}
              </label>
              <div className="flex gap-2">
                <button onClick={handleEstruturar} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                <button onClick={() => setShowEstruturar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* Formulário reagendar */}
          {showReagendar && (
            <div className="border border-yellow-200 rounded-lg p-4 space-y-3">
              <p className="font-medium text-yellow-800 text-sm">🔄 Reagendar Visita</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg">
                  <option>Manhã</option><option>Tarde</option>
                </select>
                <input placeholder="Técnico *" value={novoTecnico} onChange={(e) => setNovoTecnico(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 col-span-2" />
                <textarea placeholder="Motivo (opcional)" value={motivoReagend} onChange={(e) => setMotivoReagend(e.target.value)}
                  rows={2} className="px-3 py-2 text-sm border rounded-lg focus:outline-none col-span-2" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleReagendar} disabled={loading} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                <button onClick={() => setShowReagendar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {/* Formulário rejeitar */}
          {showRejeitar && (
            <div className="border border-red-200 rounded-lg p-4 space-y-3">
              <p className="font-medium text-red-800 text-sm">❌ Registrar Sem Viabilidade</p>
              <textarea placeholder="Motivo da não viabilidade *" value={motivoRejeicao}
                onChange={(e) => setMotivoRejeicao(e.target.value)}
                rows={3} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={handleRejeitar} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                <button onClick={() => setShowRejeitar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
