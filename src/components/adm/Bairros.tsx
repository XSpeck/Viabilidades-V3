"use client";

import { useState, useEffect } from "react";
import { getBairros, createBairro, renameBairro, deleteBairro } from "@/lib/firestore";
import type { BairroRede } from "@/types";
import { Loader2, Plus, Pencil, Trash2 as TrashIcon } from "lucide-react";

// =====================
// Card: Bairros de Rede
// =====================
export default function GerenciarBairros() {
  const [bairros, setBairros]           = useState<BairroRede[]>([]);
  const [loading, setLoading]           = useState(true);
  const [erroAcao, setErroAcao] = useState("");
  const [novoNome, setNovoNome]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [editId, setEditId]             = useState<string | null>(null);
  const [editNome, setEditNome]         = useState("");
  const [confirmDel, setConfirmDel]     = useState<BairroRede | null>(null);

  async function load() {
    setLoading(true);
    try { setBairros(await getBairros()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!novoNome.trim()) return;
    setSaving(true);
    try { await createBairro(novoNome); setNovoNome(""); await load(); }
    catch (e) { setErroAcao(e instanceof Error ? e.message : "Erro ao criar bairro."); }
    finally { setSaving(false); }
  }

  async function handleRename() {
    if (!editId || !editNome.trim()) return;
    setSaving(true);
    try { await renameBairro(editId, editNome); setEditId(null); await load(); }
    catch (e) { setErroAcao(e instanceof Error ? e.message : "Erro ao renomear."); }
    finally { setSaving(false); }
  }

  async function handleDelete(b: BairroRede) {
    setSaving(true);
    try { await deleteBairro(b.id); setConfirmDel(null); await load(); }
    catch (e) { setErroAcao(e instanceof Error ? e.message : "Erro ao excluir."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
          <span className="text-xl">🏘️</span>
          <div>
            <h3 className="font-semibold text-gray-800">Bairros — Análise de Rede</h3>
            <p className="text-xs text-gray-500">Lista de bairros disponíveis para filtrar demandas</p>
          </div>
        </div>

        <div className="p-5 space-y-4">

          {erroAcao && (

            <div className="flex items-start justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">

              <span>{erroAcao}</span>

              <button type="button" onClick={() => setErroAcao("")} className="text-xs underline">ok</button>

            </div>

          )}
          {/* Adicionar novo */}
          <div className="flex gap-2">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Nome do bairro..."
              className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleCreate}
              disabled={saving || !novoNome.trim()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium px-3 py-2 rounded-lg"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar
            </button>
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : bairros.length === 0 ? (
            <p className="text-center py-6 text-sm text-gray-400">Nenhum bairro cadastrado.</p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {bairros.map((b) => (
                <div key={b.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50">
                  {editId === b.id ? (
                    <>
                      <input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditId(null); }}
                        autoFocus
                        className="flex-1 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <button onClick={handleRename} disabled={saving}
                        className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg disabled:opacity-50">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Salvar"}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="text-xs border px-2 py-1 rounded-lg text-gray-500 hover:bg-white">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{b.nome}</span>
                      <button onClick={() => { setEditId(b.id); setEditNome(b.nome); }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDel(b)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Excluir bairro?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmDel.nome}</strong> será removido. Demandas já cadastradas não serão afetadas.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmDel)} disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

