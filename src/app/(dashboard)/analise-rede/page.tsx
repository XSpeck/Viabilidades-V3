"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import { getDemandas, createDemanda, updateDemanda, avancarStatusDemanda, deleteDemanda } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode, validatePlusCode } from "@/lib/pluscode";
import type { DemandaRede, TecnicoRede, PrioridadeDemanda } from "@/types";
import { TECNICOS_REDE } from "@/types";
import { Loader2, Plus, RefreshCw, Trash2, ChevronRight, CheckCircle, XCircle } from "lucide-react";

const LocationPicker = dynamic(() => import("@/components/home/LocationPicker"), { ssr: false });

// ── Constantes ────────────────────────────────────────────
const TIPOS_SERVICO = [
  "Splitter",
  "Fusão",
  "Puxada de cabo",
  "Manutenção CTO",
  "Manutenção ODN",
  "Troca de equipamento",
  "Levantamento de rede",
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
  em_andamento: "🟡 Em andamento",
  concluida:    "✅ Concluída",
};

const STATUS_COLOR: Record<string, string> = {
  aberta:       "bg-red-100 text-red-700",
  em_andamento: "bg-yellow-100 text-yellow-700",
  concluida:    "bg-green-100 text-green-700",
};

// ── Componente principal ──────────────────────────────────
export default function AnaliseRedePage() {
  const { user } = useAuth();
  const [demandas, setDemandas]     = useState<DemandaRede[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [tecnicoTab, setTecnicoTab] = useState<"todos" | TecnicoRede>("todos");
  const [statusFiltro, setStatusFiltro] = useState<"todas" | "aberta" | "em_andamento" | "concluida">("todas");

  if (!canAccess(user ?? null, "analise-rede")) return (
    <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>
  );

  const load = useCallback(async () => {
    setLoading(true);
    try { setDemandas(await getDemandas()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtradas = demandas
    .filter((d) => tecnicoTab === "todos" || d.tecnico === tecnicoTab)
    .filter((d) => statusFiltro === "todas" || d.status === statusFiltro);

  const counts = {
    aberta:       demandas.filter((d) => (tecnicoTab === "todos" || d.tecnico === tecnicoTab) && d.status === "aberta").length,
    em_andamento: demandas.filter((d) => (tecnicoTab === "todos" || d.tecnico === tecnicoTab) && d.status === "em_andamento").length,
    concluida:    demandas.filter((d) => (tecnicoTab === "todos" || d.tecnico === tecnicoTab) && d.status === "concluida").length,
  };

  const countTecnico = (t: TecnicoRede) =>
    demandas.filter((d) => d.tecnico === t && d.status !== "concluida").length;

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
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nova Demanda
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Abertas",       value: demandas.filter((d) => d.status === "aberta").length,       color: "red"    },
          { label: "Em andamento",  value: demandas.filter((d) => d.status === "em_andamento").length, color: "yellow" },
          { label: "Concluídas",    value: demandas.filter((d) => d.status === "concluida").length,    color: "green"  },
        ].map((k) => (
          <div key={k.label} className="bg-white border rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold text-${k.color}-600`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs técnico */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {(["todos", ...TECNICOS_REDE] as ("todos" | TecnicoRede)[]).map((t) => {
            const pendentes = t === "todos"
              ? demandas.filter((d) => d.status !== "concluida").length
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
            { key: "todas",       label: `Todas (${filtradas.length + (statusFiltro !== "todas" ? 0 : 0)})` },
            { key: "aberta",       label: `🔴 Abertas (${counts.aberta})` },
            { key: "em_andamento", label: `🟡 Em andamento (${counts.em_andamento})` },
            { key: "concluida",    label: `✅ Concluídas (${counts.concluida})` },
          ] as { key: typeof statusFiltro; label: string }[]).map((f) => (
            <button key={f.key} onClick={() => setStatusFiltro(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFiltro === f.key ? "bg-indigo-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-100"}`}>
              {f.key === "todas"
                ? `Todas (${demandas.filter((d) => tecnicoTab === "todos" || d.tecnico === tecnicoTab).length})`
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
  const [concluindo, setConcluindo]     = useState(false);
  const [obsConc, setObsConc]           = useState("");
  const [showObsConc, setShowObsConc]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleAvancar() {
    if (d.status === "em_andamento" && !showObsConc) {
      setShowObsConc(true);
      return;
    }
    setSaving(true);
    try {
      await avancarStatusDemanda(d, obsConc || undefined);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleReabrir() {
    setSaving(true);
    try {
      await updateDemanda(d.id, { status: "aberta", data_conclusao: undefined, obs_conclusao: undefined });
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

  const acaoLabel = d.status === "aberta" ? "▶ Iniciar" : "✅ Concluir";
  const acaoColor = d.status === "aberta"
    ? "bg-blue-600 hover:bg-blue-700 text-white"
    : "bg-green-600 hover:bg-green-700 text-white";

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
          <p className="font-medium text-gray-900 text-sm">👷 {d.tecnico}</p>
          <p className="text-sm text-gray-700">{d.descricao}</p>

          {/* Local */}
          {d.local && (
            <p className="text-xs text-gray-500 font-mono">📍 {locationToPlusCode(d.local)}</p>
          )}

          {/* Meta */}
          <p className="text-xs text-gray-400 mt-1">
            Criado em {formatDateTime(d.data_criacao)} por {d.criado_por}
            {d.data_conclusao && ` · Concluído em ${formatDateTime(d.data_conclusao)}`}
          </p>

          {/* Obs conclusão */}
          {d.obs_conclusao && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 mt-1">
              📝 {d.obs_conclusao}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {d.status !== "concluida" && (
            <button onClick={handleAvancar} disabled={saving}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${acaoColor} disabled:opacity-50`}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
              {acaoLabel}
            </button>
          )}
          {d.status === "concluida" && (
            <button onClick={handleReabrir} disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-700 underline">
              ↩ Reabrir
            </button>
          )}
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

      {/* Textarea de obs ao concluir */}
      {showObsConc && (
        <div className="mt-3 space-y-2">
          <textarea
            placeholder="Observação de conclusão (opcional)..."
            value={obsConc}
            onChange={(e) => setObsConc(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <div className="flex gap-2">
            <button onClick={handleAvancar} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✅ Confirmar conclusão"}
            </button>
            <button onClick={() => setShowObsConc(false)}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-gray-50">
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
  const [tecnico, setTecnico]       = useState<TecnicoRede>("Eduardo");
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
        tecnico,
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Técnico *</label>
                <select value={tecnico} onChange={(e) => setTecnico(e.target.value as TecnicoRede)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {TECNICOS_REDE.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
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
