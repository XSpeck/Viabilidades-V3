"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import { getDemandas, createDemanda, updateDemanda, agendarDemanda, deleteDemanda, getDemandasArquivadas, arquivarDemanda, desarquivarDemanda, reabrirDemanda, bustCacheAnaliseRede } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode, validatePlusCode } from "@/lib/pluscode";
import type { DemandaRede, TecnicoRede, PrioridadeDemanda } from "@/types";
import { TECNICOS_REDE } from "@/types";
import { Loader2, Plus, RefreshCw, Trash2, ChevronRight, CheckCircle, XCircle, Search, Pencil } from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/home/LocationPicker"), { ssr: false });
const DemandasMap    = dynamic(() => import("@/components/analise-rede/DemandasMap"),  { ssr: false });

// ── Constantes ────────────────────────────────────────────
const TIPOS_SERVICO = [
  "Troca de Splitter",
  "Melhoria de Sinal",
  "Lançamento de Fibra",
  "Manutenção CTO",
  "Readequação",
  "Mutirão",
  "Migração",
  "Outro",
];

const PRIORIDADE_LABEL: Record<PrioridadeDemanda, string> = {
  baixa:   "Baixa",
  media:   "Média",
  alta:    "Alta",
  urgente: "Urgente",
};

const PRIORIDADE_COLOR: Record<PrioridadeDemanda, string> = {
  baixa:   "bg-gray-100 text-gray-600",
  media:   "bg-blue-100 text-blue-700",
  alta:    "bg-orange-100 text-orange-700",
  urgente: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  aberta:       "🔴 Aberta",
  agendada:     "📅 Agendada",
  em_andamento: "🟡 Em andamento",
  concluida:    "✅ Concluída",
};

const STATUS_COLOR: Record<string, string> = {
  aberta:       "bg-red-100 text-red-700",
  agendada:     "bg-indigo-100 text-indigo-700",
  em_andamento: "bg-yellow-100 text-yellow-700",
  concluida:    "bg-green-100 text-green-700",
};

const TECNICO_DOT: Record<string, string> = {
  Eduardo: "bg-blue-500",
  Ulisses: "bg-green-600",
  Zilli:   "bg-orange-500",
  Andre:   "bg-purple-600",
};

// ── Componente principal ──────────────────────────────────
export default function AnaliseRedePage() {
  const { user } = useAuth();
  const [demandas, setDemandas]     = useState<DemandaRede[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [showMap, setShowMap]       = useState(false);
  const [tecnicoTab, setTecnicoTab] = useState<"todos" | TecnicoRede>("todos");
  const [statusFiltro, setStatusFiltro] = useState<"todas" | "aberta" | "agendada" | "em_andamento" | "concluida">("todas");

  const load = useCallback(async () => {
    bustCacheAnaliseRede();
    setLoading(true);
    try { setDemandas(await getDemandas()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!canAccess(user ?? null, "analise-rede")) return (
    <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>
  );

  const filtradas = demandas
    .filter((d) => d.status !== "arquivada")
    .filter((d) => tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab))
    .filter((d) => statusFiltro === "todas" || d.status === statusFiltro);

  const counts = {
    aberta:       demandas.filter((d) => (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab)) && d.status === "aberta").length,
    agendada:     demandas.filter((d) => (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab)) && d.status === "agendada").length,
    em_andamento: demandas.filter((d) => (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab)) && d.status === "em_andamento").length,
    concluida:    demandas.filter((d) => (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab)) && d.status === "concluida").length,
  };

  const countTecnico = (t: TecnicoRede) =>
    demandas.filter((d) => d.tecnicos.includes(t) && d.status !== "concluida" && d.status !== "arquivada").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">🔧 Análise da Rede</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setShowMap((s) => !s)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
              showMap ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "hover:bg-gray-50 text-gray-700"
            }`}>
            🗺️ {showMap ? "Fechar mapa" : "Ver mapa"}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nova Demanda
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Abertas",       value: counts.aberta,       color: "red"    },
          { label: "Agendadas",     value: counts.agendada,     color: "indigo" },
          { label: "Em andamento",  value: counts.em_andamento, color: "yellow" },
          { label: "Concluídas",    value: counts.concluida,    color: "green"  },
        ].map((k) => (
          <div key={k.label} className="bg-white border rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold text-${k.color}-600`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Mapa de demandas */}
      {showMap && (
        <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-gray-800">🗺️ Mapa de Demandas</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {filtradas.filter((d) => d.local).length} de {filtradas.length} demanda(s) com localização · pin maior = maior prioridade
            </p>
          </div>
          <DemandasMap demandas={filtradas} />
        </div>
      )}

      {/* Tabs técnico */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {(["todos", ...TECNICOS_REDE] as ("todos" | TecnicoRede)[]).map((t) => {
            const pendentes = t === "todos"
              ? demandas.filter((d) => d.status !== "concluida" && d.status !== "arquivada").length
              : countTecnico(t);
            return (
              <button key={t} onClick={() => setTecnicoTab(t)}
                className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  tecnicoTab === t ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-50"
                }`}>
                {t === "todos" ? "Todos" : t}
                {pendentes > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tecnicoTab === t ? "bg-indigo-100 text-indigo-700" : "bg-red-100 text-red-600"}`}>
                    {pendentes}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtro status */}
        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap gap-2">
          {([
            { key: "todas",       label: "" },
            { key: "aberta",       label: `🔴 Abertas (${counts.aberta})` },
            { key: "agendada",     label: `📅 Agendadas (${counts.agendada})` },
            { key: "em_andamento", label: `🟡 Em andamento (${counts.em_andamento})` },
            { key: "concluida",    label: `✅ Concluídas (${counts.concluida})` },
          ] as { key: typeof statusFiltro; label: string }[]).map((f) => (
            <button key={f.key} onClick={() => setStatusFiltro(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFiltro === f.key ? "bg-indigo-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-100"}`}>
              {f.key === "todas"
                ? `Todas (${demandas.filter((d) => d.status !== "arquivada" && (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab as TecnicoRede))).length})`
                : f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nenhuma demanda encontrada.</div>
        ) : (
          <div className="divide-y">
            {filtradas.map((d) => (
              <DemandaCard key={d.id} demanda={d} onRefresh={load} />
            ))}
          </div>
        )}
      </div>

      <ArquivoPanel onRestored={load} />

      {showModal && (
        <NovaDemandaModal
          auditorNome={user?.nome ?? ""}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Card de demanda ───────────────────────────────────────
function DemandaCard({ demanda: d, onRefresh }: { demanda: DemandaRede; onRefresh: () => void }) {
  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editar
  const [showEditar, setShowEditar]         = useState(false);
  const [editTecnicos, setEditTecnicos]     = useState<TecnicoRede[]>(d.tecnicos);
  const [editTipo, setEditTipo]             = useState(TIPOS_SERVICO.includes(d.tipo) ? d.tipo : "Outro");
  const [editTipoCustom, setEditTipoCustom] = useState(TIPOS_SERVICO.includes(d.tipo) ? "" : d.tipo);
  const [editPrioridade, setEditPrioridade] = useState<PrioridadeDemanda>(d.prioridade);
  const [editDescricao, setEditDescricao]   = useState(d.descricao);
  const [editInputMethod, setEditInputMethod]             = useState<InputMethod>(d.local?.includes(",") && !d.local.includes("+") ? "coords" : "pluscode");
  const [editLocationInput, setEditLocationInput]         = useState(d.local ?? "");
  const [editValidatedPlusCode, setEditValidatedPlusCode] = useState<string | null>(d.local ?? null);
  const [editInputValid, setEditInputValid]               = useState<boolean | null>(d.local ? true : null);
  const [editShowLocationPicker, setEditShowLocationPicker] = useState(false);

  useEffect(() => {
    if (!editLocationInput) { setEditInputValid(null); setEditValidatedPlusCode(null); return; }
    if (editInputMethod === "pluscode") {
      const valid = validatePlusCode(editLocationInput);
      setEditInputValid(valid);
      setEditValidatedPlusCode(valid ? editLocationInput.trim().toUpperCase() : null);
    } else {
      const parts = editLocationInput.split(",");
      if (parts.length === 2) {
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          setEditInputValid(true);
          setEditValidatedPlusCode(`${lat.toFixed(6)},${lon.toFixed(6)}`);
        } else { setEditInputValid(false); setEditValidatedPlusCode(null); }
      } else { setEditInputValid(false); setEditValidatedPlusCode(null); }
    }
  }, [editLocationInput, editInputMethod]);

  // Agendar (aberta → agendada)
  const [showAgendar, setShowAgendar]     = useState(false);
  const [dataAgendar, setDataAgendar]     = useState("");
  const [periodoAgendar, setPeriodoAgendar] = useState("Manhã");

  // Mudança manual de status
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showConcluir, setShowConcluir]         = useState(false);
  const [obsConclusao, setObsConclusao]         = useState("");

  // Atribuir técnico
  const [showAtribuirTecnico, setShowAtribuirTecnico] = useState(false);
  const [tecnicosAtribuir, setTecnicosAtribuir]       = useState<TecnicoRede[]>(d.tecnicos);

  async function handleEditar() {
    const tipoFinal = editTipo === "Outro" ? editTipoCustom.trim() : editTipo;
    if (!tipoFinal) { alert("Informe o tipo de serviço."); return; }
    if (!editDescricao.trim()) { alert("Informe a descrição."); return; }
    if (editTecnicos.length === 0) { alert("Selecione ao menos um técnico!"); return; }
    setSaving(true);
    try {
      await updateDemanda(d.id, { tecnicos: editTecnicos, tipo: tipoFinal, prioridade: editPrioridade, descricao: editDescricao.trim(), local: editValidatedPlusCode ?? undefined });
      setShowEditar(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleAgendar() {
    if (!dataAgendar) { alert("Informe a data!"); return; }
    setSaving(true);
    try {
      await agendarDemanda(d.id, dataAgendar, periodoAgendar);
      setShowAgendar(false);
      onRefresh();
    } catch (e) {
      alert("Erro ao agendar: " + (e instanceof Error ? e.message : "verifique as permissões e tente novamente."));
    } finally { setSaving(false); }
  }

  async function handleMudarStatus(novoStatus: string) {
    if (novoStatus === d.status) { setShowStatusChange(false); return; }
    if (novoStatus === "agendada") { setShowStatusChange(false); setShowConcluir(false); setShowAgendar(true); return; }
    if (novoStatus === "concluida") { setShowConcluir(true); return; }
    setSaving(true);
    try {
      if (novoStatus === "aberta") {
        await reabrirDemanda(d.id);
      } else {
        await updateDemanda(d.id, { status: novoStatus as DemandaRede["status"] });
      }
      setShowStatusChange(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleConcluir() {
    setSaving(true);
    try {
      await updateDemanda(d.id, {
        status: "concluida",
        data_conclusao: new Date().toISOString(),
        obs_conclusao: obsConclusao.trim() || undefined,
      });
      setShowConcluir(false);
      setShowStatusChange(false);
      setObsConclusao("");
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleReabrir() {
    setSaving(true);
    try {
      await reabrirDemanda(d.id);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleAtribuirTecnico() {
    if (tecnicosAtribuir.length === 0) { alert("Selecione ao menos um técnico!"); return; }
    setSaving(true);
    try {
      await updateDemanda(d.id, { tecnicos: tecnicosAtribuir });
      setShowAtribuirTecnico(false);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleArquivar() {
    setSaving(true);
    try {
      await arquivarDemanda(d.id);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteDemanda(d.id);
      onRefresh();
    } finally { setSaving(false); }
  }

  return (
    <div className={`p-4 ${d.status === "concluida" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1 min-w-0">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORIDADE_COLOR[d.prioridade]}`}>
              {PRIORIDADE_LABEL[d.prioridade]}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              {d.tipo}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.status]}`}>
              {STATUS_LABEL[d.status]}
            </span>
          </div>

          {/* Técnico + descrição */}
          <div className="flex flex-wrap items-center gap-2">
            {d.tecnicos.length === 0 ? (
              <span className="text-xs text-gray-400 italic">Sem técnico atribuído</span>
            ) : (
              d.tecnicos.map((t) => (
                <span key={t} className="flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TECNICO_DOT[t] ?? "bg-gray-400"}`} />
                  {t}
                </span>
              ))
            )}
            <button
              onClick={() => { setTecnicosAtribuir(d.tecnicos); setShowAtribuirTecnico((s) => !s); setShowEditar(false); setShowAgendar(false); setShowStatusChange(false); }}
              title={d.tecnicos.length === 0 ? "Atribuir técnico" : "Editar técnicos"}
              className="text-gray-300 hover:text-indigo-500 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.descricao}</p>

          {/* Local */}
          {d.local && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(d.local)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 font-mono hover:text-indigo-600 hover:underline" title="Ver no Google Maps">📍 {locationToPlusCode(d.local)}</a>
          )}

          {/* Data agendada */}
          {d.data_agendamento && (
            <p className="text-xs text-indigo-600 font-medium">
              📅 {new Date(d.data_agendamento + "T12:00:00").toLocaleDateString("pt-BR")} — {d.periodo_agendamento}
            </p>
          )}

          {/* Meta */}
          <p className="text-xs text-gray-400 mt-1">
            Criado em {formatDateTime(d.data_criacao)} por {d.criado_por}
            {d.data_conclusao && ` · Concluído em ${formatDateTime(d.data_conclusao)}`}
          </p>

          {/* Obs conclusão */}
          {d.obs_conclusao && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 mt-1 whitespace-pre-wrap">
              📝 {d.obs_conclusao}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {d.status === "aberta" && (
            <button onClick={() => setShowAgendar(!showAgendar)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50">
              <ChevronRight className="w-3 h-3" /> 📅 Agendar
            </button>
          )}
          {(d.status === "agendada" || d.status === "em_andamento") && (
            <button onClick={handleReabrir} disabled={saving}
              className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50">
              ↩ Cancelar agendamento
            </button>
          )}
          {d.status === "concluida" && (
            <div className="flex flex-col gap-1 items-end">
              <button onClick={handleArquivar} disabled={saving}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50">
                📦 Arquivar
              </button>
              <button onClick={handleReabrir} disabled={saving}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                ↩ Reabrir
              </button>
            </div>
          )}
          <button
            onClick={() => { setShowStatusChange((s) => !s); setShowConcluir(false); setShowEditar(false); setShowAgendar(false); }}
            title="Mudar status"
            className={`transition-colors text-sm font-medium px-2 py-1 rounded-lg border ${showStatusChange ? "bg-indigo-50 border-indigo-300 text-indigo-600" : "border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-300"}`}>
            🔄
          </button>
          <button onClick={() => { setShowEditar((s) => !s); setShowAgendar(false); setShowStatusChange(false); setShowAtribuirTecnico(false); }}
            className={`transition-colors ${showEditar ? "text-indigo-500" : "text-gray-300 hover:text-indigo-500"}`}>
            <Pencil className="w-4 h-4" />
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex gap-1">
              <button onClick={handleDelete} disabled={saving}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg">
                Excluir
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-xs border px-2 py-1 rounded-lg">
                Não
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Painel de mudança de status */}
      {showStatusChange && (
        <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
          <p className="text-xs font-semibold text-gray-700">🔄 Alterar status</p>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "aberta",       label: "🔴 Aberta"        },
              { key: "agendada",     label: "📅 Agendada"      },
              { key: "em_andamento", label: "🟡 Em andamento"  },
              { key: "concluida",    label: "✅ Concluída"     },
            ] as { key: string; label: string }[]).map((s) => (
              <button
                key={s.key}
                onClick={() => handleMudarStatus(s.key)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                  d.status === s.key
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {showConcluir && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-gray-500">Observação de conclusão (opcional)</p>
              <textarea
                value={obsConclusao}
                onChange={(e) => setObsConclusao(e.target.value)}
                rows={2}
                placeholder="Descreva o que foi executado..."
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleConcluir} disabled={saving}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✅ Confirmar conclusão"}
                </button>
                <button onClick={() => setShowConcluir(false)} className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-white">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Atribuir / editar técnico */}
      {showAtribuirTecnico && (
        <div className="mt-3 border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-2">
          <p className="text-xs font-semibold text-indigo-800">👷 {d.tecnicos.length === 0 ? "Atribuir técnico" : "Editar técnicos"}</p>
          <div className="flex flex-wrap gap-1.5">
            {TECNICOS_REDE.map((t) => {
              const sel = tecnicosAtribuir.includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => setTecnicosAtribuir(sel ? tecnicosAtribuir.filter((x) => x !== t) : [...tecnicosAtribuir, t])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-indigo-50"}`}>
                  <span className={`w-2 h-2 rounded-full ${TECNICO_DOT[t]}`} />{t}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAtribuirTecnico} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </button>
            <button onClick={() => setShowAtribuirTecnico(false)}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Form editar */}
      {showEditar && (
        <div className="mt-3 space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700">✏️ Editar demanda</p>
          <div className="flex flex-wrap gap-1.5 col-span-2">
            {TECNICOS_REDE.map((t) => {
              const sel = editTecnicos.includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => setEditTecnicos(sel ? editTecnicos.filter((x) => x !== t) : [...editTecnicos, t])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors ${sel ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  <span className={`w-2 h-2 rounded-full ${TECNICO_DOT[t]}`} />{t}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={editPrioridade} onChange={(e) => setEditPrioridade(e.target.value as PrioridadeDemanda)}
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {(["baixa", "media", "alta", "urgente"] as PrioridadeDemanda[]).map((p) => (
                <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>
              ))}
            </select>
            <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2">
              {TIPOS_SERVICO.map((t) => <option key={t}>{t}</option>)}
            </select>
            {editTipo === "Outro" && (
              <input value={editTipoCustom} onChange={(e) => setEditTipoCustom(e.target.value)}
                placeholder="Descreva o tipo *" className="col-span-2 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            )}
          </div>
          {/* Localização */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Localização (opcional)</span>
              {editLocationInput && (
                <button type="button" onClick={() => { setEditLocationInput(""); setEditInputValid(null); setEditValidatedPlusCode(null); }}
                  className="text-xs text-red-400 hover:text-red-600">Remover</button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap mb-2">
              {(["pluscode", "coords"] as InputMethod[]).map((m) => (
                <button key={m} type="button"
                  onClick={() => { setEditInputMethod(m); setEditLocationInput(""); setEditInputValid(null); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${editInputMethod === m ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {m === "pluscode" ? "Plus Code" : "Coordenadas"}
                </button>
              ))}
              <button type="button" onClick={() => setEditShowLocationPicker(true)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                🛰️ Mapa
              </button>
            </div>
            <input type="text" value={editLocationInput}
              onChange={(e) => setEditLocationInput(e.target.value.toUpperCase())}
              placeholder={editInputMethod === "pluscode" ? "Ex: 8J3G+WGV" : "Ex: -28.695133, -49.373710"}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 font-mono transition-colors ${
                editInputValid === null ? "border-gray-300 focus:ring-indigo-400"
                : editInputValid ? "border-green-400 focus:ring-green-400 bg-green-50"
                : "border-red-400 focus:ring-red-400 bg-red-50"
              }`} />
            {editInputValid === true && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> {editValidatedPlusCode}
              </p>
            )}
            {editInputValid === false && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Formato inválido
              </p>
            )}
          </div>

          <textarea value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)}
            rows={3} placeholder="Descrição *"
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
          <div className="flex gap-2">
            <button onClick={handleEditar} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
            </button>
            <button onClick={() => setShowEditar(false)}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {editShowLocationPicker && (
        <LocationPicker
          onConfirm={(code) => {
            setEditLocationInput(code);
            setEditInputMethod("pluscode");
            setEditInputValid(true);
            setEditValidatedPlusCode(code);
            setEditShowLocationPicker(false);
          }}
          onClose={() => setEditShowLocationPicker(false)}
        />
      )}

      {/* Form agendar */}
      {showAgendar && (
        <div className="mt-3 space-y-2 border border-indigo-200 rounded-lg p-3 bg-indigo-50">
          <p className="text-xs font-semibold text-indigo-800">📅 Agendar para a agenda técnica</p>
          <div className="flex gap-2">
            <input type="date" value={dataAgendar} onChange={(e) => setDataAgendar(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <select value={periodoAgendar} onChange={(e) => setPeriodoAgendar(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option>Manhã</option><option>Tarde</option><option>Noturno</option><option>Dia todo</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAgendar} disabled={saving || !dataAgendar}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
            </button>
            <button onClick={() => setShowAgendar(false)}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Modal nova demanda ────────────────────────────────────
type InputMethod = "pluscode" | "coords";

function NovaDemandaModal({ auditorNome, onClose, onSaved }: {
  auditorNome: string; onClose: () => void; onSaved: () => void;
}) {
  const [tecnicos, setTecnicos]     = useState<TecnicoRede[]>([]);
  const [tipo, setTipo]             = useState(TIPOS_SERVICO[0]);
  const [tipoCustom, setTipoCustom] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeDemanda>("media");
  const [descricao, setDescricao]   = useState("");
  const [saving, setSaving]         = useState(false);

  // ── Localização ──────────────────────────────────────────
  const [inputMethod, setInputMethod]         = useState<InputMethod>("pluscode");
  const [locationInput, setLocationInput]     = useState("");
  const [validatedPlusCode, setValidatedPlusCode] = useState<string | null>(null);
  const [inputValid, setInputValid]           = useState<boolean | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    if (!locationInput) { setInputValid(null); setValidatedPlusCode(null); return; }
    if (inputMethod === "pluscode") {
      const valid = validatePlusCode(locationInput);
      setInputValid(valid);
      setValidatedPlusCode(valid ? locationInput.trim().toUpperCase() : null);
    } else {
      const parts = locationInput.split(",");
      if (parts.length === 2) {
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          setInputValid(true);
          setValidatedPlusCode(`${lat.toFixed(6)},${lon.toFixed(6)}`);
        } else { setInputValid(false); setValidatedPlusCode(null); }
      } else { setInputValid(false); setValidatedPlusCode(null); }
    }
  }, [locationInput, inputMethod]);

  async function handleSave() {
    const tipoFinal = tipo === "Outro" ? tipoCustom.trim() : tipo;
    if (!tipoFinal) { alert("Informe o tipo de serviço."); return; }
    if (!descricao.trim()) { alert("Informe a descrição."); return; }
    setSaving(true);
    try {
      await createDemanda({
        tecnicos,
        tipo: tipoFinal,
        prioridade,
        local: validatedPlusCode ?? undefined,
        descricao: descricao.trim(),
        status: "aberta",
        criado_por: auditorNome,
        data_criacao: new Date().toISOString(),
      });
      onSaved();
    } catch { alert("Erro ao criar demanda."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 rounded-t-2xl flex items-center justify-between sticky top-0 z-10">
            <h3 className="text-lg font-bold text-white">🔧 Nova Demanda de Rede</h3>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
          </div>

          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Técnico(s) *</label>
              <div className="flex flex-wrap gap-1.5">
                {TECNICOS_REDE.map((t) => {
                  const sel = tecnicos.includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={() => setTecnicos(sel ? tecnicos.filter((x) => x !== t) : [...tecnicos, t])}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${sel ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                      <span className={`w-2 h-2 rounded-full ${TECNICO_DOT[t]}`} />{t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prioridade *</label>
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as PrioridadeDemanda)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de serviço *</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {TIPOS_SERVICO.map((t) => <option key={t}>{t}</option>)}
              </select>
              {tipo === "Outro" && (
                <input type="text" placeholder="Descreva o tipo..." value={tipoCustom}
                  onChange={(e) => setTipoCustom(e.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              )}
            </div>

            {/* ── Localização ── */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Localização (opcional)</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {(["pluscode", "coords"] as InputMethod[]).map((m) => (
                  <button key={m} type="button"
                    onClick={() => { setInputMethod(m); setLocationInput(""); setInputValid(null); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${inputMethod === m ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {m === "pluscode" ? "Plus Code" : "Coordenadas"}
                  </button>
                ))}
                <button type="button" onClick={() => setShowLocationPicker(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  🛰️ Selecionar no Mapa
                </button>
              </div>
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value.toUpperCase())}
                placeholder={inputMethod === "pluscode" ? "Ex: 8J3G+WGV" : "Ex: -28.695133, -49.373710"}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 font-mono transition-colors ${
                  inputValid === null ? "border-gray-300 focus:ring-indigo-400"
                  : inputValid ? "border-green-400 focus:ring-green-400 bg-green-50"
                  : "border-red-400 focus:ring-red-400 bg-red-50"
                }`}
              />
              {inputValid === true && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Localização válida — {validatedPlusCode}
                </p>
              )}
              {inputValid === false && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Formato inválido
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Descrição *</label>
              <textarea placeholder="Detalhe o serviço a ser executado..."
                value={descricao} onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar demanda"}
              </button>
              <button onClick={onClose}
                className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>

      {showLocationPicker && (
        <LocationPicker
          onConfirm={(code) => {
            setLocationInput(code);
            setInputMethod("pluscode");
            setInputValid(true);
            setValidatedPlusCode(code);
            setShowLocationPicker(false);
          }}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </>
  );
}

// ── Painel de arquivo ─────────────────────────────────────
function ArquivoPanel({ onRestored }: { onRestored: () => void }) {
  const [open, setOpen]               = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [demandas, setDemandas]       = useState<DemandaRede[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState<DemandaRede | null>(null);

  // Filtros próprios do arquivo
  const [busca, setBusca]             = useState("");
  const [filtroTec, setFiltroTec]     = useState<"todos" | TecnicoRede>("todos");
  const [dataInicio, setDataInicio]   = useState("");
  const [dataFim, setDataFim]         = useState("");
  const [page, setPage]               = useState(1);
  const PER_PAGE = 20;

  async function load() {
    setLoading(true);
    try {
      setDemandas(await getDemandasArquivadas());
      setLoaded(true);
    } finally { setLoading(false); }
  }

  function toggle() {
    if (!open && !loaded) load();
    setOpen((v) => !v);
  }

  const filtradas = demandas
    .filter((d) => filtroTec === "todos" || d.tecnicos.includes(filtroTec as TecnicoRede))
    .filter((d) => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (
        d.descricao.toLowerCase().includes(q) ||
        d.tipo.toLowerCase().includes(q) ||
        d.tecnicos.some((t) => t.toLowerCase().includes(q)) ||
        (d.obs_conclusao ?? "").toLowerCase().includes(q)
      );
    })
    .filter((d) => {
      const dt = (d.data_conclusao ?? d.data_criacao).slice(0, 10);
      if (dataInicio && dt < dataInicio) return false;
      if (dataFim   && dt > dataFim)     return false;
      return true;
    })
    .sort((a, b) =>
      (b.data_conclusao ?? b.data_criacao) > (a.data_conclusao ?? a.data_criacao) ? 1 : -1
    );

  async function handleRestaurar(id: string) {
    await desarquivarDemanda(id);
    setSelected(null);
    await load();
    onRestored();
  }

  async function handleExcluir(id: string) {
    await deleteDemanda(id);
    setSelected(null);
    setDemandas((prev) => prev.filter((d) => d.id !== id));
  }

  useEffect(() => { setPage(1); }, [busca, filtroTec, dataInicio, dataFim]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PER_PAGE));
  const pageItems  = filtradas.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const hasFilters = busca || filtroTec !== "todos" || dataInicio || dataFim;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header colapsável */}
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span>📦 Arquivo de Demandas</span>
          {loaded && demandas.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {demandas.length}
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="border-t">
          {/* Filtros */}
          <div className="px-4 py-3 bg-gray-50 border-b space-y-2">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descrição, tipo, técnico..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>
            {/* Técnico + datas */}
            <div className="flex flex-wrap gap-2 items-center">
              {(["todos", ...TECNICOS_REDE] as ("todos" | TecnicoRede)[]).map((t) => (
                <button key={t} onClick={() => setFiltroTec(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filtroTec === t
                      ? "bg-amber-500 text-white"
                      : "bg-white border text-gray-600 hover:bg-gray-100"
                  }`}>
                  {t !== "todos" && (
                    <span className={`w-2 h-2 rounded-full ${TECNICO_DOT[t] ?? "bg-gray-400"}`} />
                  )}
                  {t === "todos" ? "Todos" : t}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-400">De</span>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {hasFilters && (
                  <button onClick={() => { setBusca(""); setFiltroTec("todos"); setDataInicio(""); setDataFim(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
                    Limpar
                  </button>
                )}
              </div>
            </div>
            {loaded && (
              <p className="text-xs text-gray-400">
                {filtradas.length} de {demandas.length} demanda(s)
              </p>
            )}
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">
              {demandas.length === 0 ? "Nenhuma demanda arquivada." : "Nenhum resultado para os filtros aplicados."}
            </p>
          ) : (
            <>
              <div className="divide-y">
                {pageItems.map((d) => (
                  <ArquivoRow key={d.id} demanda={d} onClick={() => setSelected(d)} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-gray-400">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">«</button>
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">‹</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                        ) : (
                          <button key={p} onClick={() => setPage(p as number)}
                            className={`px-2.5 py-1 text-xs border rounded-lg ${page === p ? "bg-indigo-600 text-white border-indigo-600" : "hover:bg-gray-50"}`}>
                            {p}
                          </button>
                        )
                      )}
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">›</button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal de detalhes */}
      {selected && (
        <ArquivoDetalheModal
          demanda={selected}
          onClose={() => setSelected(null)}
          onRestaurar={() => handleRestaurar(selected.id)}
          onExcluir={() => handleExcluir(selected.id)}
        />
      )}
    </div>
  );
}

function ArquivoRow({ demanda: d, onClick }: { demanda: DemandaRede; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-amber-50 transition-colors text-left">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORIDADE_COLOR[d.prioridade]}`}>
            {PRIORIDADE_LABEL[d.prioridade]}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
            {d.tipo}
          </span>
          {d.tecnicos.map((t) => (
            <span key={t} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${TECNICO_DOT[t] ?? "bg-gray-400"}`} />
              {t}
            </span>
          ))}
          {(d.notas_atividade?.length ?? 0) > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              🗒️ {d.notas_atividade!.length} nota(s)
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 truncate">{d.descricao}</p>
        {d.obs_conclusao && (
          <p className="text-xs text-gray-500 truncate mt-0.5">📝 {d.obs_conclusao}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          Concluído em {d.data_conclusao ? formatDateTime(d.data_conclusao) : "—"}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
    </button>
  );
}

// ── Modal de detalhes do arquivo ──────────────────────────
function ArquivoDetalheModal({ demanda: d, onClose, onRestaurar, onExcluir }: {
  demanda: DemandaRede;
  onClose: () => void;
  onRestaurar: () => Promise<void>;
  onExcluir:  () => Promise<void>;
}) {
  const [busy, setBusy]           = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const notas = [...(d.notas_atividade ?? [])].sort((a, b) => b.data.localeCompare(a.data));

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {PRIORIDADE_LABEL[d.prioridade]}
                </span>
                <span className="bg-white/20 text-white/90 text-xs px-2 py-0.5 rounded-full">
                  📦 Arquivada
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">{d.tipo}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {d.tecnicos.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full border border-white/40 ${TECNICO_DOT[t] ?? "bg-gray-400"}`} />
                    <span className="text-white/80 text-sm font-medium">{t}</span>
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClose}
              className="text-white/70 hover:text-white text-xl leading-none shrink-0 mt-1">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Descrição */}
          <div>
            <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Descrição</p>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
          </div>

          {/* Local */}
          {d.local && (
            <div>
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Localização</p>
              <p className="text-sm font-mono text-gray-700">📍 {d.local}</p>
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Criado em</p>
              <p className="text-sm font-medium text-gray-700">{formatDateTime(d.data_criacao)}</p>
              <p className="text-xs text-gray-500 mt-0.5">por {d.criado_por}</p>
            </div>
            {d.data_conclusao && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Concluído em</p>
                <p className="text-sm font-medium text-green-700">{formatDateTime(d.data_conclusao)}</p>
              </div>
            )}
          </div>

          {/* Agendamento */}
          {d.data_agendamento && (
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-indigo-400 mb-0.5 font-semibold">Agendado para</p>
              <p className="text-sm font-medium text-indigo-700">
                {new Date(d.data_agendamento + "T12:00:00").toLocaleDateString("pt-BR")}
                {" — "}{d.periodo_agendamento}
              </p>
            </div>
          )}

          {/* Obs conclusão */}
          {d.obs_conclusao && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600 mb-1 font-semibold">📝 Observação de conclusão</p>
              <p className="text-sm text-green-800 leading-relaxed whitespace-pre-wrap">{d.obs_conclusao}</p>
            </div>
          )}

          {/* Notas de atividade */}
          {notas.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">
                Registro de atividade ({notas.length})
              </p>
              <div className="space-y-0">
                {notas.map((n, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white shadow mt-1.5 shrink-0" />
                      {i < notas.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.texto}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {n.por} · {new Date(n.data).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-2 border-t pt-4">
          <div className="flex gap-2">
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            ) : (
              <>
                <button
                  onClick={async () => { setBusy(true); await onExcluir(); setBusy(false); }}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar exclusão"}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-3 py-2 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
              Fechar
            </button>
            <button
              onClick={async () => { setBusy(true); await onRestaurar(); setBusy(false); }}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "↩ Restaurar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
