"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import CampoLocalizacao from "@/components/home/CampoLocalizacao";
import { interpretarLocalizacao } from "@/lib/localizacao";
import { MODULOS } from "@/lib/modulos";
import PainelEstrutura from "@/components/analise-rede/PainelEstrutura";
import { updateDemanda, agendarDemanda, deleteDemanda, arquivarDemanda, reabrirDemanda, addNotaDemanda } from "@/lib/firestore";
import { uploadFoto, deleteFotos } from "@/lib/cloudinary";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { DemandaRede, BairroRede, PrioridadeDemanda } from "@/types";
import { Loader2, Trash2, ChevronRight, Pencil } from "lucide-react";
import { FotoLightbox, FotoPicker } from "@/components/analise-rede/Fotos";
import { TIPOS_SERVICO, PRIORIDADE_LABEL, PRIORIDADE_COLOR, STATUS_LABEL, STATUS_COLOR, corTecnico } from "@/components/analise-rede/constantes";


// ── Card de demanda ───────────────────────────────────────

export default function DemandaCard({ demanda: d, bairros, tecnicosRede, onRefresh, atraso = 0, destaque = false }: { demanda: DemandaRede; bairros: BairroRede[]; tecnicosRede: string[]; onRefresh: () => void; atraso?: number; destaque?: boolean }) {
  const { user } = useAuth();
  const [saving, setSaving]               = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fotoAmpliada, setFotoAmpliada]   = useState<string | null>(null);

  // Notas de andamento
  const [showNotas, setShowNotas]   = useState((d.notas_atividade?.length ?? 0) > 0);
  const [notaTexto, setNotaTexto]   = useState("");
  const [savingNota, setSavingNota] = useState(false);

  async function handleAddNota() {
    if (!notaTexto.trim()) return;
    setSavingNota(true);
    try {
      await addNotaDemanda(d.id, notaTexto.trim(), user?.nome ?? "—");
      setNotaTexto("");
      onRefresh();
    } catch { setErro("Erro ao salvar a nota."); }
    finally { setSavingNota(false); }
  }

  // Editar
  const [showEditar, setShowEditar]         = useState(false);
  const [editTecnicos, setEditTecnicos]     = useState<string[]>(d.tecnicos);
  const [editBairro, setEditBairro]         = useState(d.bairro ?? "");
  const [editTipo, setEditTipo]             = useState(TIPOS_SERVICO.includes(d.tipo) ? d.tipo : "Outro");
  const [editTipoCustom, setEditTipoCustom] = useState(TIPOS_SERVICO.includes(d.tipo) ? "" : d.tipo);
  const [editPrioridade, setEditPrioridade] = useState<PrioridadeDemanda>(d.prioridade);
  const [editDescricao, setEditDescricao]   = useState(d.descricao);
  const [editTextoLocal, setEditTextoLocal] = useState(d.local ?? "");
  const editLocal = useMemo(() => interpretarLocalizacao(editTextoLocal), [editTextoLocal]);
  /** Erro da última ação (mostrado no cartão, sem alert) */
  const [erro, setErro] = useState("");

  // Fotos
  const [editFotos, setEditFotos]                 = useState<File[]>([]);
  const [editFotosExistentes, setEditFotosExistentes] = useState<string[]>(d.foto_urls ?? []);
  const [uploadingFotos, setUploadingFotos]       = useState(false);

  function removeEditFotoExistente(index: number) {
    setEditFotosExistentes((prev) => prev.filter((_, i) => i !== index));
  }


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
  const [tecnicosAtribuir, setTecnicosAtribuir]       = useState<string[]>(d.tecnicos);

  async function handleEditar() {
    const tipoFinal = editTipo === "Outro" ? editTipoCustom.trim() : editTipo;
    if (!tipoFinal) { setErro("Informe o tipo de serviço."); return; }
    if (!editDescricao.trim()) { setErro("Informe a descrição."); return; }
    if (!editBairro) { setErro("Selecione o bairro."); return; }
    if (editTextoLocal.trim() && !editLocal) { setErro("A localização não foi reconhecida (ou apague o campo)."); return; }
    setErro("");
    setSaving(true);
    try {
      let novasUrls: string[] = [];
      if (editFotos.length > 0) {
        setUploadingFotos(true);
        novasUrls = await Promise.all(editFotos.map((f) => uploadFoto(f)));
        setUploadingFotos(false);
      }
      const foto_urls = [...editFotosExistentes, ...novasUrls];
      const removedUrls = (d.foto_urls ?? []).filter((u) => !foto_urls.includes(u));
      await updateDemanda(d.id, { tecnicos: editTecnicos, bairro: editBairro, tipo: tipoFinal, prioridade: editPrioridade, descricao: editDescricao.trim(), local: editLocal?.plusCode, foto_urls });
      if (removedUrls.length > 0) deleteFotos(removedUrls);
      setEditFotosExistentes(foto_urls);
      setEditFotos([]);
      setShowEditar(false);
      onRefresh();
    } catch (e) {
      setErro("Erro ao salvar: " + (e instanceof Error ? e.message : "tente novamente."));
    } finally { setSaving(false); setUploadingFotos(false); }
  }

  async function handleAgendar() {
    if (!dataAgendar) { setErro("Informe a data."); return; }
    setErro("");
    setSaving(true);
    try {
      await agendarDemanda(d.id, dataAgendar, periodoAgendar);
      setShowAgendar(false);
      onRefresh();
    } catch (e) {
      setErro("Erro ao agendar: " + (e instanceof Error ? e.message : "verifique as permissões e tente novamente."));
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
    if (tecnicosAtribuir.length === 0) { setErro("Selecione ao menos um técnico."); return; }
    setErro("");
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
      await deleteDemanda(d.id, d.foto_urls);
      onRefresh();
    } finally { setSaving(false); }
  }

  const isMirror = !!d.viabilizacao_id;

  return (
    <div id={`demanda-${d.id}`} className={`scroll-mt-24 p-4 transition-colors ${d.status === "concluida" ? "opacity-70" : ""} ${atraso > 0 ? "border-l-4 border-l-red-500 bg-red-50/40" : ""} ${destaque ? "ring-2 ring-inset ring-indigo-400" : ""}`}>
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
            {atraso > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                Atrasada há {atraso} dia{atraso > 1 ? "s" : ""}
              </span>
            )}
            {d.bairro && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                📍 {d.bairro}
              </span>
            )}
            {isMirror && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700"
                title={MODULOS.agendamento ? "Espelho automático de uma visita de estruturação — data, técnico e status são gerenciados na Agenda/Auditoria." : "Estrutura de prédio/condomínio vinda de um pedido de viabilidade — agende e conclua no painel abaixo."}>
                🔗 Estruturação
              </span>
            )}
          </div>

          {/* Técnico + descrição */}
          <div className="flex flex-wrap items-center gap-2">
            {d.tecnicos.length === 0 ? (
              <span className="text-xs text-gray-400 italic">Sem técnico atribuído</span>
            ) : (
              d.tecnicos.map((t) => (
                <span key={t} className="flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${corTecnico(t)}`} />
                  {t}
                </span>
              ))
            )}
            {!isMirror && (
              <button
                onClick={() => { setTecnicosAtribuir(d.tecnicos); setShowAtribuirTecnico((s) => !s); setShowEditar(false); setShowAgendar(false); setShowStatusChange(false); }}
                title={d.tecnicos.length === 0 ? "Atribuir técnico" : "Editar técnicos"}
                className="text-gray-300 hover:text-indigo-500 transition-colors">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.descricao}</p>

          {/* Fotos */}
          {(d.foto_urls?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.foto_urls!.map((url, i) => (
                <button key={url} type="button" onClick={() => setFotoAmpliada(url)}
                  className="w-12 h-12 rounded-lg overflow-hidden border shrink-0">
                  <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

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
          {d.status === "aberta" && !isMirror && (
            <button onClick={() => setShowAgendar(!showAgendar)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50">
              <ChevronRight className="w-3 h-3" /> 📅 Agendar
            </button>
          )}
          {(d.status === "agendada" || d.status === "em_andamento") && !isMirror && (
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
              {!isMirror && (
                <button onClick={handleReabrir} disabled={saving}
                  className="text-xs text-gray-400 hover:text-gray-600 underline">
                  ↩ Reabrir
                </button>
              )}
            </div>
          )}
          {!isMirror && (
            <button
              onClick={() => { setShowStatusChange((s) => !s); setShowConcluir(false); setShowEditar(false); setShowAgendar(false); }}
              title="Mudar status"
              className={`transition-colors text-sm font-medium px-2 py-1 rounded-lg border ${showStatusChange ? "bg-indigo-50 border-indigo-300 text-indigo-600" : "border-gray-200 text-gray-400 hover:text-indigo-500 hover:border-indigo-300"}`}>
              🔄
            </button>
          )}
          <button onClick={() => { setShowEditar((s) => !s); setShowAgendar(false); setShowStatusChange(false); setShowAtribuirTecnico(false); }}
            className={`transition-colors ${showEditar ? "text-indigo-500" : "text-gray-300 hover:text-indigo-500"}`}>
            <Pencil className="w-4 h-4" />
          </button>
          {!isMirror && (!confirmDelete ? (
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
          ))}
        </div>
      </div>

      {erro && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro("")} className="underline">ok</button>
        </div>
      )}

      {isMirror && !MODULOS.agendamento && d.status !== "concluida" && (
        <PainelEstrutura demanda={d} tecnicosRede={tecnicosRede} onRefresh={onRefresh} />
      )}

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
            {Array.from(new Set([...tecnicosRede, ...tecnicosAtribuir])).map((t) => {
              const sel = tecnicosAtribuir.includes(t);
              const naLista = tecnicosRede.includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => setTecnicosAtribuir(sel ? tecnicosAtribuir.filter((x) => x !== t) : [...tecnicosAtribuir, t])}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors ${sel ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:bg-indigo-50"}`}>
                  <span className={`w-2 h-2 rounded-full ${corTecnico(t)}`} />{t}{!naLista ? " (atual)" : ""}
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
          {isMirror ? (
            <p className="text-xs text-gray-400 italic">
              👷 {MODULOS.agendamento ? "Técnico definido na Agenda/Auditoria — não editável aqui." : "Técnicos definidos no agendamento da estrutura (painel abaixo)."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5 col-span-2">
              {Array.from(new Set([...tecnicosRede, ...editTecnicos])).map((t) => {
                const sel = editTecnicos.includes(t);
                const naLista = tecnicosRede.includes(t);
                return (
                  <button key={t} type="button"
                    onClick={() => setEditTecnicos(sel ? editTecnicos.filter((x) => x !== t) : [...editTecnicos, t])}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors ${sel ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    <span className={`w-2 h-2 rounded-full ${corTecnico(t)}`} />{t}{!naLista ? " (atual)" : ""}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <select value={editBairro} onChange={(e) => setEditBairro(e.target.value)}
              className="col-span-2 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">Selecione o bairro *</option>
              {bairros.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
            </select>
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
            <span className="mb-1 block text-xs text-gray-500">Localização (opcional)</span>
            <CampoLocalizacao texto={editTextoLocal} local={editLocal} onTexto={setEditTextoLocal} />
          </div>

          <textarea value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)}
            rows={3} placeholder="Descrição *"
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />

          {/* Fotos */}
          <FotoPicker fotos={editFotos} onFotosChange={setEditFotos}
            existentes={editFotosExistentes} onRemoveExistente={removeEditFotoExistente} />

          <div className="flex gap-2">
            <button onClick={handleEditar} disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : uploadingFotos ? "Enviando foto..." : "Salvar"}
            </button>
            <button onClick={() => setShowEditar(false)}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-white">
              Cancelar
            </button>
          </div>
        </div>
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

      {/* Andamento / notas */}
      <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowNotas((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <span className="text-xs font-semibold text-gray-600">
            📋 Andamento
            {(d.notas_atividade?.length ?? 0) > 0 && (
              <span className="ml-1.5 text-gray-400 font-normal">{d.notas_atividade!.length} nota(s)</span>
            )}
          </span>
          <span className="text-gray-400 text-xs">{showNotas ? "▲" : "▼"}</span>
        </button>

        {showNotas && (
          <div className="p-3 space-y-3">
            {(d.notas_atividade?.length ?? 0) > 0 && (
              <div className="divide-y">
                {[...(d.notas_atividade ?? [])].sort((a, b) => b.data.localeCompare(a.data)).map((n, i) => (
                  <div key={i} className="flex gap-3 py-2.5 first:pt-0">
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.texto}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {n.por} · {new Date(n.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
                placeholder="Adicionar nota de andamento..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
              <button
                onClick={handleAddNota}
                disabled={savingNota || !notaTexto.trim()}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg text-sm font-medium self-end"
              >
                {savingNota ? <Loader2 className="w-4 h-4 animate-spin" /> : "✓"}
              </button>
            </div>
          </div>
        )}
      </div>

      {fotoAmpliada && <FotoLightbox url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
    </div>
  );
}

