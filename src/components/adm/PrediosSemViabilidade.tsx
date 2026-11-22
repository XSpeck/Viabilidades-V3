"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPrediosSemViabilidade, createPredioSemViabilidade, updatePredioSemViabilidade, deletePredioSemViabilidade } from "@/lib/firestore";
import type { PredioSemViabilidade } from "@/types";
import { Loader2, AlertTriangle, Plus, Pencil, Trash2 as TrashIcon, Search, XCircle } from "lucide-react";

// =====================
// Card: Prédios Sem Viabilidade
// =====================
type PredioSemViabForm = { condominio: string; localizacao: string; observacao: string; registrado_por: string; };
const BLANK_PSV: PredioSemViabForm = { condominio: "", localizacao: "", observacao: "", registrado_por: "" };

export default function GerenciarPrediosSemViabilidade() {
  const { user } = useAuth();
  const [items, setItems]             = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erroAcao, setErroAcao] = useState("");
  const [busca, setBusca]             = useState("");
  const [pagina, setPagina]           = useState(1);
  const [modal, setModal]             = useState<{ mode: "create" | "edit"; item?: PredioSemViabilidade } | null>(null);
  const [form, setForm]               = useState<PredioSemViabForm>(BLANK_PSV);
  const [saving, setSaving]           = useState(false);
  const [confirmDel, setConfirmDel]   = useState<PredioSemViabilidade | null>(null);
  const [formErr, setFormErr]         = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await getPrediosSemViabilidade()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ ...BLANK_PSV, registrado_por: user?.nome ?? "" });
    setFormErr(null); setModal({ mode: "create" });
  }
  function openEdit(item: PredioSemViabilidade) {
    setForm({ condominio: item.condominio, localizacao: item.localizacao, observacao: item.observacao, registrado_por: item.registrado_por });
    setFormErr(null); setModal({ mode: "edit", item });
  }

  async function handleSave() {
    if (!form.condominio.trim()) { setFormErr("Informe o nome do condomínio."); return; }
    setSaving(true); setFormErr(null);
    try {
      if (modal?.mode === "create") {
        await createPredioSemViabilidade({
          condominio: form.condominio.trim(), localizacao: form.localizacao.trim(),
          observacao: form.observacao.trim(), registrado_por: form.registrado_por || (user?.nome ?? "adm"),
        });
      } else if (modal?.item) {
        await updatePredioSemViabilidade(modal.item.id, {
          condominio: form.condominio.trim(), localizacao: form.localizacao.trim(),
          observacao: form.observacao.trim(),
        });
      }
      setModal(null); await load();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  async function handleDelete(item: PredioSemViabilidade) {
    setSaving(true);
    try { await deletePredioSemViabilidade(item.id); setConfirmDel(null); await load(); }
    catch (e) { setErroAcao(e instanceof Error ? e.message : "Erro ao excluir."); }
    finally { setSaving(false); }
  }

  const filtrados = items.filter((i) =>
    !busca || i.condominio.toLowerCase().includes(busca.toLowerCase())
  );
  const POR_PAGINA = 10;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginados = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-semibold text-gray-800">Prédios Sem Viabilidade</h3>
              <p className="text-xs text-gray-500">Locais sem cobertura registrados para consulta rápida</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                placeholder="Buscar condomínio..."
                className="pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 w-48" />
            </div>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>
        </div>

        <div className="p-5">

          {erroAcao && (

            <div className="flex items-start justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">

              <span>{erroAcao}</span>

              <button type="button" onClick={() => setErroAcao("")} className="text-xs underline">ok</button>

            </div>

          )}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : filtrados.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">
              {items.length === 0 ? "Nenhum prédio sem viabilidade cadastrado." : "Nenhum resultado para a busca."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">Condomínio</th>
                    <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Localização</th>
                    <th className="text-left py-2 pr-4 font-medium">Observação</th>
                    <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Registrado por</th>
                    <th className="text-left py-2 pr-4 font-medium hidden lg:table-cell">Data</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{item.condominio}</td>
                      <td className="py-2.5 pr-4 text-gray-500 font-mono text-xs hidden sm:table-cell max-w-[140px] truncate">
                        {item.localizacao || "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600 max-w-[220px] truncate">{item.observacao || "—"}</td>
                      <td className="py-2.5 pr-4 text-gray-500 hidden md:table-cell">{item.registrado_por}</td>
                      <td className="py-2.5 pr-4 text-gray-400 text-xs hidden lg:table-cell">
                        {item.data_registro ? new Date(item.data_registro).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDel(item)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-400">{filtrados.length} prédio(s) encontrado(s)</p>
                {totalPaginas > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1}
                      className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">‹</button>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                      <button key={p} onClick={() => setPagina(p)}
                        className={`px-2.5 py-1 text-xs border rounded ${p === paginaAtual ? "bg-red-600 text-white border-red-600" : "hover:bg-gray-50"}`}>
                        {p}
                      </button>
                    ))}
                    <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas}
                      className="px-2 py-1 text-xs border rounded disabled:opacity-40 hover:bg-gray-50">›</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">
              {modal.mode === "create" ? "Novo Prédio Sem Viabilidade" : "Editar Prédio Sem Viabilidade"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Condomínio *</label>
                <input value={form.condominio} onChange={(e) => setForm((f) => ({ ...f, condominio: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="Nome do condomínio / prédio" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Localização (Plus Code / coordenadas)</label>
                <input value={form.localizacao} onChange={(e) => setForm((f) => ({ ...f, localizacao: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 font-mono"
                  placeholder="ex: 8J3G+WGV ou -28.677,-49.369" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Observação</label>
                <textarea value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="Motivo, detalhes da situação..." />
              </div>
              {modal.mode === "create" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Registrado por</label>
                  <input value={form.registrado_por} onChange={(e) => setForm((f) => ({ ...f, registrado_por: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="Nome do responsável" />
                </div>
              )}
            </div>
            {formErr && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{formErr}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modal.mode === "create" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Excluir registro?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmDel.condominio}</strong> será removido da lista permanentemente.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDel)} disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

