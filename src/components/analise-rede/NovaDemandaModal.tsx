"use client";

import { useMemo, useState } from "react";
import CampoLocalizacao from "@/components/home/CampoLocalizacao";
import { interpretarLocalizacao } from "@/lib/localizacao";
import { MsgErro } from "@/components/comum/ui";
import { createDemanda } from "@/lib/firestore";
import { uploadFoto } from "@/lib/cloudinary";
import type { BairroRede, PrioridadeDemanda } from "@/types";
import { Loader2 } from "lucide-react";
import { FotoPicker } from "@/components/analise-rede/Fotos";
import { TIPOS_SERVICO, corTecnico } from "@/components/analise-rede/constantes";


// ── Modal nova demanda ────────────────────────────────────

export default function NovaDemandaModal({ auditorNome, bairros, tecnicosRede, onClose, onSaved }: {
  auditorNome: string; bairros: BairroRede[]; tecnicosRede: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [tecnicos, setTecnicos]     = useState<string[]>([]);
  const [bairro, setBairro]         = useState("");
  const [tipo, setTipo]             = useState(TIPOS_SERVICO[0]);
  const [tipoCustom, setTipoCustom] = useState("");
  const [prioridade, setPrioridade] = useState<PrioridadeDemanda>("media");
  const [descricao, setDescricao]   = useState("");
  const [saving, setSaving]         = useState(false);

  // ── Fotos ─────────────────────────────────────────────────
  const [fotos, setFotos]                 = useState<File[]>([]);
  const [uploadingFotos, setUploadingFotos] = useState(false);

  // ── Localização ──────────────────────────────────────────
  const [textoLocal, setTextoLocal] = useState("");
  const local = useMemo(() => interpretarLocalizacao(textoLocal), [textoLocal]);
  const [erro, setErro] = useState("");

  async function handleSave() {
    const tipoFinal = tipo === "Outro" ? tipoCustom.trim() : tipo;
    if (!tipoFinal) { setErro("Informe o tipo de serviço."); return; }
    if (!bairro) { setErro("Selecione o bairro."); return; }
    if (!descricao.trim()) { setErro("Informe a descrição."); return; }
    if (textoLocal.trim() && !local) { setErro("A localização não foi reconhecida (ou deixe em branco)."); return; }
    setErro("");
    setSaving(true);
    try {
      let foto_urls: string[] | undefined;
      if (fotos.length > 0) {
        setUploadingFotos(true);
        foto_urls = await Promise.all(fotos.map((f) => uploadFoto(f)));
        setUploadingFotos(false);
      }
      await createDemanda({
        tecnicos,
        bairro,
        tipo: tipoFinal,
        prioridade,
        local: local?.plusCode,
        descricao: descricao.trim(),
        status: "aberta",
        criado_por: auditorNome,
        data_criacao: new Date().toISOString(),
        foto_urls,
      });
      onSaved();
    } catch (e) { setErro("Erro ao criar demanda: " + (e instanceof Error ? e.message : "tente novamente.")); }
    finally { setSaving(false); setUploadingFotos(false); }
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
                {tecnicosRede.map((t) => {
                  const sel = tecnicos.includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={() => setTecnicos(sel ? tecnicos.filter((x) => x !== t) : [...tecnicos, t])}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${sel ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                      <span className={`w-2 h-2 rounded-full ${corTecnico(t)}`} />{t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bairro *</label>
              <select value={bairro} onChange={(e) => setBairro(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">Selecione o bairro...</option>
                {bairros.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
              </select>
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
              <CampoLocalizacao texto={textoLocal} local={local} onTexto={setTextoLocal} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Descrição *</label>
              <textarea placeholder="Detalhe o serviço a ser executado..."
                value={descricao} onChange={(e) => setDescricao(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>

            {/* Fotos */}
            <FotoPicker fotos={fotos} onFotosChange={setFotos} />

            <MsgErro erro={erro} />
            <div className="flex gap-2 pt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : uploadingFotos ? "Enviando foto..." : "Criar demanda"}
              </button>
              <button onClick={onClose}
                className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

