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
import {
  RefreshCw, Loader2, ChevronLeft, ChevronRight, X, Pencil, Check,
} from "lucide-react";
import { canAccess } from "@/lib/access";

const PRIORIDADE_COLOR: Record<PrioridadeDemanda, string> = {
  baixa:   "bg-gray-100 text-gray-500",
  media:   "bg-blue-100 text-blue-700",
  alta:    "bg-orange-100 text-orange-700",
  urgente: "bg-red-100 text-red-700",
};
const PRIORIDADE_LABEL: Record<PrioridadeDemanda, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

// ─── Helpers ──────────────────────────────────────────────────────
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO(): string { return toISODate(new Date()); }
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function getWeekDays(iso: string): string[] {
  const d   = new Date(iso + "T12:00:00");
  const dow = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(mon);
    nd.setDate(mon.getDate() + i);
    return toISODate(nd);
  });
}
const WD_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function fWdShort(iso: string) { return WD_SHORT[new Date(iso + "T12:00:00").getDay()]; }
function fDayNum(iso: string)  { return iso.slice(8); }
function fDayFull(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}
function fDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
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

  if (!canAccess(user ?? null, "agenda"))
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const today    = todayISO();
  const weekDays = getWeekDays(selectedDate);

  const tecnicosVisitas = Array.from(new Set(items.map((v) => v.tecnico_responsavel).filter(Boolean))) as string[];
  const allTecnicos     = Array.from(new Set([...TECNICOS_REDE, ...tecnicosVisitas]));

  const visitasDay  = items.filter((v) => v.data_visita === selectedDate);
  const demandasDay = demandas.filter((d) => d.data_agendamento === selectedDate);

  const atrasadasV = items.filter((v)   => v.data_visita       && v.data_visita       < today);
  const atrasadasD = demandas.filter((d) => d.data_agendamento && d.data_agendamento  < today);
  const totalAtr   = atrasadasV.length + atrasadasD.length;

  function countDay(iso: string) {
    return items.filter((v) => v.data_visita === iso).length +
           demandas.filter((d) => d.data_agendamento === iso).length;
  }
  function vCell(tec: string, per: string) {
    return visitasDay.filter((v) => v.tecnico_responsavel === tec && v.periodo_visita === per);
  }
  function dCell(tec: string, per: string) {
    return demandasDay.filter((d) => d.tecnico === tec && d.periodo_agendamento === per);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📅 Agenda Técnica</h1>
          <p className="text-gray-500 text-sm mt-1">
            {items.length} visita(s) · {demandas.length} demanda(s) em andamento
            {totalAtr > 0 && <span className="text-red-600 font-medium"> · {totalAtr} atrasada(s)</span>}
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
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {weekDays.map((iso) => {
              const cnt  = countDay(iso);
              const sel  = iso === selectedDate;
              const isT  = iso === today;
              return (
                <button key={iso} onClick={() => setSelectedDate(iso)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all ${
                    sel ? "bg-indigo-600 shadow-sm" : isT ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"
                  }`}>
                  <span className={`text-xs font-medium ${sel ? "text-indigo-200" : "text-gray-400"}`}>
                    {fWdShort(iso)}
                  </span>
                  <span className={`text-sm font-bold ${sel ? "text-white" : isT ? "text-indigo-700" : "text-gray-800"}`}>
                    {fDayNum(iso)}
                  </span>
                  <span className={`text-xs font-semibold h-4 leading-4 ${
                    cnt > 0 ? (sel ? "text-indigo-200" : "text-indigo-500") : "text-transparent"
                  }`}>{cnt || "·"}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setSelectedDate((d) => addDays(d, 7))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <p className="text-sm font-semibold text-gray-700 capitalize">{fDayFull(selectedDate)}</p>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)}
              className="text-xs text-indigo-600 hover:underline font-medium">Ir para hoje</button>
          )}
        </div>
      </div>

      {/* Atrasadas */}
      {totalAtr > 0 && (
        <AtrasadasPanel visitas={atrasadasV} demandas={atrasadasD} userName={user!.nome} onRefresh={load} />
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : visitasDay.length === 0 && demandasDay.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="font-medium text-gray-400">Nenhum item agendado para este dia.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: `${allTecnicos.length * 160 + 88}px` }}>
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="w-20 py-3 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide border-r sticky left-0 bg-gray-50 z-10" />
                  {allTecnicos.map((t) => {
                    const isRede = (TECNICOS_REDE as readonly string[]).includes(t);
                    return (
                      <th key={t} className="py-3 px-3 text-center border-r last:border-r-0 min-w-[160px]">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-sm">{isRede ? "🔧" : "📡"}</span>
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
                    <td className="py-5 px-3 border-r bg-gray-50 align-middle sticky left-0 z-10">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-base">{periodo === "Manhã" ? "🌅" : "🌇"}</span>
                        <span className="text-xs font-semibold text-gray-600">{periodo}</span>
                      </div>
                    </td>
                    {allTecnicos.map((tec) => {
                      const vs      = vCell(tec, periodo);
                      const ds      = dCell(tec, periodo);
                      const total   = vs.length + ds.length;
                      const conflict = total > 1;
                      return (
                        <td key={tec}
                          className={`py-3 px-3 border-r last:border-r-0 align-top min-h-[80px] ${conflict ? "bg-red-50" : ""}`}>
                          {total === 0 ? (
                            <div className="h-12 flex items-center justify-center text-gray-200 text-lg select-none">—</div>
                          ) : (
                            <div className="space-y-1.5">
                              {conflict && (
                                <p className="text-xs text-red-500 font-semibold text-center mb-1">⚠️ Conflito</p>
                              )}
                              {vs.map((v) => <VisitaChip key={v.id} v={v} userName={user!.nome} onRefresh={load} />)}
                              {ds.map((d) => <DemandaChip key={d.id} d={d} onRefresh={load} />)}
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

// ─── Atrasadas ────────────────────────────────────────────────────
function AtrasadasPanel({ visitas, demandas, userName, onRefresh }: {
  visitas: Viabilizacao[]; demandas: DemandaRede[];
  userName: string; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const total = visitas.length + demandas.length;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-100 transition-colors">
        <span className="text-sm font-semibold text-red-700">🔴 Atrasadas — {total} item(s)</span>
        <span className="text-xs text-red-400">{open ? "Ocultar ▲" : "Mostrar ▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {visitas.map((v) => <VisitaChip key={v.id} v={v} userName={userName} onRefresh={onRefresh} />)}
          {demandas.map((d) => <DemandaChip key={d.id} d={d} onRefresh={onRefresh} />)}
        </div>
      )}
    </div>
  );
}

// ─── Chip de visita ───────────────────────────────────────────────
function VisitaChip({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const tecnologia = v.tecnologia_predio ?? "N/A";
  const corBorder  = tecnologia === "FTTA" ? "border-blue-300"
                   : tecnologia === "UTP"  ? "border-green-300"
                   :                         "border-orange-300";
  const corDot     = tecnologia === "FTTA" ? "bg-blue-500"
                   : tecnologia === "UTP"  ? "bg-green-500"
                   :                         "bg-orange-500";
  return (
    <>
      <button onClick={() => setOpen(true)}
        className={`w-full text-left bg-white border ${corBorder} rounded-lg px-2.5 py-2 hover:shadow-md hover:scale-[1.02] transition-all group`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${corDot}`} />
          <span className="text-xs font-semibold text-gray-800 truncate flex-1">{v.predio_ftta ?? "Prédio"}</span>
          {(v.giga || v.tecnologia_predio === "FTTA" || v.tipo_instalacao === "Condomínio") && (
            <span className="text-xs text-yellow-500 shrink-0">⚡</span>
          )}
        </div>
        {v.nome_cliente_predio && (
          <p className="text-xs text-gray-400 truncate mt-0.5 pl-3.5">{v.nome_cliente_predio}</p>
        )}
      </button>
      {open && (
        <VisitaModal v={v} userName={userName} onRefresh={onRefresh} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── Chip de demanda ──────────────────────────────────────────────
function DemandaChip({ d, onRefresh }: { d: DemandaRede; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full text-left bg-white border border-purple-300 rounded-lg px-2.5 py-2 hover:shadow-md hover:scale-[1.02] transition-all">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-800 truncate flex-1">{d.tipo}</span>
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${PRIORIDADE_COLOR[d.prioridade]}`}>
            {PRIORIDADE_LABEL[d.prioridade]}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5 pl-3.5">{d.descricao}</p>
      </button>
      {open && (
        <DemandaModal d={d} onRefresh={onRefresh} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ─── Modal base ───────────────────────────────────────────────────
function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── Modal de visita ──────────────────────────────────────────────
type VisitaAction = "estruturar" | "reagendar" | "rejeitar" | null;

function VisitaModal({ v, userName, onRefresh, onClose }: {
  v: Viabilizacao; userName: string; onRefresh: () => void; onClose: () => void;
}) {
  const [action, setAction]           = useState<VisitaAction>(null);
  const [busy, setBusy]               = useState(false);
  const [successMsg, setSuccessMsg]   = useState<string | null>(null);

  const [obsEstruturacao, setObsEstruturacao] = useState("");
  const isAlwaysGiga = v.tecnologia_predio === "FTTA" || v.tipo_instalacao === "Condomínio";
  const [gigaEst, setGigaEst]         = useState(isAlwaysGiga || (v.giga ?? false));

  const [novaData, setNovaData]       = useState("");
  const [novoPeriodo, setNovoPeriodo] = useState("Manhã");
  const [novoTecnico, setNovoTecnico] = useState(v.tecnico_responsavel ?? "");
  const [motivoRea, setMotivoRea]     = useState("");

  const [motivoRej, setMotivoRej]     = useState("");

  const [editingObs, setEditingObs]   = useState(false);
  const [obsRasc, setObsRasc]         = useState(v.obs_agendamento ?? "");
  const [savingObs, setSavingObs]     = useState(false);

  function done(msg: string) {
    setSuccessMsg(msg);
    setAction(null);
    setTimeout(() => { onRefresh(); onClose(); }, 2000);
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
        giga: gigaEst,
      });
      done(`🎉 ${v.predio_ftta ?? "Prédio"} registrado como estruturado!`);
    } finally { setBusy(false); }
  }

  async function handleReagendar() {
    if (!novaData || !novoTecnico.trim()) { alert("Preencha data e técnico!"); return; }
    setBusy(true);
    try {
      await reagendarVisita(v.id, novaData, novoPeriodo, novoTecnico, motivoRea, {
        data_visita: v.data_visita, periodo_visita: v.periodo_visita, tecnico_responsavel: v.tecnico_responsavel,
      });
      done(`🔄 Reagendado para ${fDate(novaData)} — ${novoPeriodo} — ${novoTecnico}.`);
    } finally { setBusy(false); }
  }

  async function handleRejeitar() {
    if (!motivoRej.trim()) { alert("Informe o motivo!"); return; }
    setBusy(true);
    try {
      await rejeitarPredio(v.id, v.predio_ftta ?? "Prédio", v.plus_code_cliente, motivoRej, userName);
      done("❌ Registrado como sem viabilidade.");
    } finally { setBusy(false); }
  }

  async function handleSalvarObs() {
    setSavingObs(true);
    try {
      await atualizarObsAgendamento(v.id, obsRasc.trim());
      setEditingObs(false);
      onRefresh();
    } catch { alert("Erro ao salvar."); }
    finally { setSavingObs(false); }
  }

  const isCond    = v.tipo_instalacao === "Condomínio";
  const tecnologia = v.tecnologia_predio ?? "N/A";
  const corHeader  = tecnologia === "FTTA" ? "from-blue-600 to-blue-700"
                   : tecnologia === "UTP"  ? "from-green-600 to-green-700"
                   :                         "from-orange-500 to-orange-600";
  const corBadge   = tecnologia === "FTTA" ? "bg-blue-500/30 text-white"
                   : tecnologia === "UTP"  ? "bg-green-500/30 text-white"
                   :                         "bg-orange-500/30 text-white";

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${corHeader} px-6 py-4 flex items-start justify-between shrink-0`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white text-lg">{isCond ? "🏘️" : "🏢"}</span>
            <h2 className="font-bold text-white text-lg leading-tight">{v.predio_ftta ?? "Prédio"}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${corBadge}`}>{tecnologia}</span>
            {(v.giga || isAlwaysGiga) && <span className="text-yellow-300 text-sm font-bold">⚡</span>}
          </div>
          {v.nome_cliente_predio && (
            <p className="text-white/70 text-sm">{v.nome_cliente_predio}</p>
          )}
          {v.historico_reagendamento && (
            <p className="text-yellow-200 text-xs mt-1">🔄 {v.historico_reagendamento}</p>
          )}
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white ml-4 mt-0.5 shrink-0 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4">
          <InfoBox title="📍 Localização">
            <p className="font-mono text-xs text-indigo-600 font-semibold">{locationToPlusCode(v.plus_code_cliente)}</p>
            <p className="mt-1">{isCond ? "Condomínio" : "Edifício"}: <span className="font-medium">{v.predio_ftta}</span></p>
            {v.apartamento && <p>Apto/Casa: <span className="font-medium">{v.apartamento}</span></p>}
          </InfoBox>
          <InfoBox title="📅 Visita agendada">
            <p>Data: <span className="font-semibold text-gray-800">{fDate(v.data_visita)}</span></p>
            <p>Período: <span className="font-medium">{v.periodo_visita}</span></p>
            <p>Técnico: <span className="font-medium">{v.tecnico_responsavel}</span></p>
          </InfoBox>
        </div>

        <InfoBox title="👥 Contatos">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <p className="text-xs text-gray-400">{isCond ? "Responsável" : "Síndico"}</p>
              <p className="font-medium text-gray-800">{v.nome_sindico || "—"}</p>
              <p className="text-gray-500">{v.contato_sindico || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Cliente</p>
              <p className="font-medium text-gray-800">{v.nome_cliente_predio || "—"}</p>
              <p className="text-gray-500">{v.contato_cliente_predio || "—"}</p>
            </div>
          </div>
        </InfoBox>

        {/* Obs */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">💬 Observações do agendamento</span>
            {!editingObs && (
              <button onClick={() => { setObsRasc(v.obs_agendamento ?? ""); setEditingObs(true); }}
                className="text-yellow-500 hover:text-yellow-700 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {editingObs ? (
            <div className="space-y-2">
              <textarea value={obsRasc} onChange={(e) => setObsRasc(e.target.value)} rows={3}
                placeholder="Adicione observações..."
                className="w-full px-3 py-2 text-sm border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white" />
              <div className="flex gap-2">
                <button onClick={handleSalvarObs} disabled={savingObs}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-medium rounded-lg">
                  {savingObs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
                </button>
                <button onClick={() => setEditingObs(false)}
                  className="px-3 py-1.5 border rounded-lg text-xs text-gray-500 hover:bg-white">Cancelar</button>
              </div>
            </div>
          ) : v.obs_agendamento ? (
            <p className="text-sm text-gray-700 italic">"{v.obs_agendamento}"</p>
          ) : (
            <p className="text-sm text-yellow-400 italic">Sem observação — clique no lápis para adicionar.</p>
          )}
        </div>

        {/* Checklist */}
        {v.checklist_previsita && (
          <InfoBox title="📋 Checklist pré-visita">
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: "sindico_avisado",      label: isCond ? "Resp. avisado" : "Síndico avisado" },
                { key: "portaria_informada",   label: "Portaria informada" },
                { key: "acesso_confirmado",    label: "Acesso confirmado" },
                { key: "data_confirmada",      label: "Data confirmada" },
                { key: "equipamento_separado", label: "Equipamento separado" },
              ].map(({ key, label }) => {
                const ok = v.checklist_previsita?.[key as keyof typeof v.checklist_previsita];
                return (
                  <div key={key} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${ok ? "bg-green-100 text-green-700" : "bg-red-50 text-red-500"}`}>
                    {ok ? "✅" : "❌"} {label}
                  </div>
                );
              })}
            </div>
          </InfoBox>
        )}

        {/* Sucesso */}
        {successMsg && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 font-medium">
            <span className="text-xl">🎉</span> {successMsg}
          </div>
        )}

        {/* Formulário da ação selecionada */}
        {action === "estruturar" && (
          <ActionForm title="✅ Registrar como Estruturado" color="green" onCancel={() => setAction(null)}>
            <textarea placeholder="Observações da estruturação *" value={obsEstruturacao}
              onChange={(e) => setObsEstruturacao(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={gigaEst} onChange={(e) => setGigaEst(e.target.checked)} disabled={isAlwaysGiga} />
              ⚡ {isCond ? "Condomínio" : "Prédio"} Giga?
              {isAlwaysGiga && <span className="text-xs text-blue-500">(automático)</span>}
            </label>
            <button onClick={handleEstruturar} disabled={busy}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Estruturação"}
            </button>
          </ActionForm>
        )}

        {action === "reagendar" && (
          <ActionForm title="🔄 Reagendar Visita" color="yellow" onCancel={() => setAction(null)}>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg focus:outline-none">
                <option>Manhã</option><option>Tarde</option>
              </select>
            </div>
            <input placeholder="Técnico *" value={novoTecnico} onChange={(e) => setNovoTecnico(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
            <textarea placeholder="Motivo (opcional)" value={motivoRea} onChange={(e) => setMotivoRea(e.target.value)}
              rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none" />
            <button onClick={handleReagendar} disabled={busy}
              className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Reagendamento"}
            </button>
          </ActionForm>
        )}

        {action === "rejeitar" && (
          <ActionForm title="❌ Registrar Sem Viabilidade" color="red" onCancel={() => setAction(null)}>
            <textarea placeholder="Motivo da não viabilidade *" value={motivoRej}
              onChange={(e) => setMotivoRej(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400" />
            <button onClick={handleRejeitar} disabled={busy}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Sem Viabilidade"}
            </button>
          </ActionForm>
        )}
      </div>

      {/* Footer de ações */}
      {!successMsg && !action && (
        <div className="shrink-0 px-6 py-4 border-t bg-gray-50 flex gap-2">
          <button onClick={() => setAction("estruturar")}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors">
            ✅ Estruturado
          </button>
          <button onClick={() => setAction("reagendar")}
            className="flex-1 py-2.5 border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl text-sm font-semibold transition-colors hover:bg-white">
            🔄 Reagendar
          </button>
          <button onClick={() => setAction("rejeitar")}
            className="flex-1 py-2.5 border-2 border-red-300 hover:border-red-400 text-red-600 rounded-xl text-sm font-semibold transition-colors hover:bg-red-50">
            ❌ Sem Viab.
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Modal de demanda ─────────────────────────────────────────────
type DemandaAction = "concluir" | "reagendar" | null;

function DemandaModal({ d, onRefresh, onClose }: {
  d: DemandaRede; onRefresh: () => void; onClose: () => void;
}) {
  const [action, setAction]         = useState<DemandaAction>(null);
  const [saving, setSaving]         = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [obsConc, setObsConc]       = useState("");
  const [novaData, setNovaData]     = useState(d.data_agendamento ?? "");
  const [novoPeriodo, setNovoPeriodo] = useState(d.periodo_agendamento ?? "Manhã");

  function done(msg: string) {
    setSuccessMsg(msg);
    setAction(null);
    setTimeout(() => { onRefresh(); onClose(); }, 2000);
  }

  async function handleConcluir() {
    setSaving(true);
    try {
      await concluirDemanda(d.id, obsConc || undefined);
      done("✅ Demanda concluída com sucesso!");
    } catch { alert("Erro ao concluir."); }
    finally { setSaving(false); }
  }

  async function handleReagendar() {
    if (!novaData) { alert("Informe a data!"); return; }
    setSaving(true);
    try {
      await agendarDemanda(d.id, novaData, novoPeriodo);
      done(`🔄 Reagendado para ${fDate(novaData)} — ${novoPeriodo}.`);
    } catch { alert("Erro ao reagendar."); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-start justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white text-lg">🔧</span>
            <h2 className="font-bold text-white text-lg">{d.tipo}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white`}>
              {PRIORIDADE_LABEL[d.prioridade]}
            </span>
          </div>
          <p className="text-white/70 text-sm">👷 {d.tecnico}</p>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white ml-4 mt-0.5 shrink-0 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InfoBox title="📋 Serviço">
            <p className="font-semibold text-gray-800">{d.tipo}</p>
            <p className="text-gray-600 mt-1">{d.descricao}</p>
          </InfoBox>
          <InfoBox title="📅 Agendamento">
            <p>Data: <span className="font-semibold text-gray-800">{fDate(d.data_agendamento)}</span></p>
            <p>Período: <span className="font-medium">{d.periodo_agendamento}</span></p>
          </InfoBox>
        </div>

        {d.local && (
          <InfoBox title="📍 Localização">
            <p className="font-mono text-xs text-indigo-600 font-semibold">{locationToPlusCode(d.local)}</p>
          </InfoBox>
        )}

        <InfoBox title="⚡ Prioridade">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-semibold ${PRIORIDADE_COLOR[d.prioridade]}`}>
            {PRIORIDADE_LABEL[d.prioridade]}
          </span>
        </InfoBox>

        {successMsg && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 font-medium">
            <span className="text-xl">🎉</span> {successMsg}
          </div>
        )}

        {action === "concluir" && (
          <ActionForm title="✅ Confirmar Conclusão" color="green" onCancel={() => setAction(null)}>
            <textarea placeholder="Observação sobre o que foi feito (opcional)" value={obsConc}
              onChange={(e) => setObsConc(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400" />
            <button onClick={handleConcluir} disabled={saving}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Conclusão"}
            </button>
          </ActionForm>
        )}

        {action === "reagendar" && (
          <ActionForm title="🔄 Reagendar Demanda" color="yellow" onCancel={() => setAction(null)}>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" />
              <select value={novoPeriodo} onChange={(e) => setNovoPeriodo(e.target.value)}
                className="px-3 py-2 text-sm border rounded-lg focus:outline-none">
                <option>Manhã</option><option>Tarde</option>
              </select>
            </div>
            <button onClick={handleReagendar} disabled={saving || !novaData}
              className="w-full py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Reagendamento"}
            </button>
          </ActionForm>
        )}
      </div>

      {/* Footer */}
      {!successMsg && !action && (
        <div className="shrink-0 px-6 py-4 border-t bg-gray-50 flex gap-2">
          <button onClick={() => setAction("concluir")}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition-colors">
            ✅ Concluído
          </button>
          <button onClick={() => setAction("reagendar")}
            className="flex-1 py-2.5 border-2 border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl text-sm font-semibold transition-colors hover:bg-white">
            🔄 Reagendar
          </button>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Helpers de UI ─────────────────────────────────────────────────
function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3.5">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="text-sm text-gray-600 space-y-0.5">{children}</div>
    </div>
  );
}

function ActionForm({ title, color, onCancel, children }: {
  title: string; color: "green" | "yellow" | "red";
  onCancel: () => void; children: React.ReactNode;
}) {
  const border = { green: "border-green-200 bg-green-50", yellow: "border-yellow-200 bg-yellow-50", red: "border-red-200 bg-red-50" }[color];
  const text   = { green: "text-green-800", yellow: "text-yellow-800", red: "text-red-800" }[color];
  return (
    <div className={`border rounded-xl p-4 space-y-3 ${border}`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-bold ${text}`}>{title}</p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  );
}
