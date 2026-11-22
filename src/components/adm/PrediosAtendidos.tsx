"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPrediosAtendidos, createPredioAtendido, updatePredioAtendido, deletePredioAtendido, deleteAllPrediosAtendidos, batchCreatePrediosAtendidos } from "@/lib/firestore";
import type { PredioAtendido } from "@/types";
import { Loader2, Upload, AlertTriangle, Plus, Pencil, Trash2 as TrashIcon, Building2, Search } from "lucide-react";

// ── CSV parser ────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field.trim()); field = ""; }
      else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
        if (c === '\r') i++;
        row.push(field.trim());
        if (row.some((v) => v)) rows.push(row);
        row = []; field = "";
      } else field += c;
    }
  }
  if (field || row.length) { row.push(field.trim()); if (row.some((v) => v)) rows.push(row); }
  return rows;
}

type PredioCSVItem = Omit<PredioAtendido, "id" | "data_estruturacao">;

function csvToPredios(rows: string[][], autor: string): PredioCSVItem[] {
  return rows.slice(1) // pula cabeçalho
    .filter((r) => r.length >= 2 && r[1])
    .map((r) => ({
      condominio:      r[1]?.trim() ?? "",
      tecnologia:      r[2]?.trim() ?? "",
      giga:            r[3]?.trim().toLowerCase() === "sim",
      localizacao:     r[4]?.trim() ?? "",
      observacao:      r[5]?.trim() ?? "",
      estruturado_por: autor,
      viabilizacao_id: "manual",
    }));
}

// =====================
// Card: Prédios Atendidos
// =====================
type PredioAtendidoForm = {
  condominio: string; tecnologia: string; giga: boolean;
  localizacao: string; observacao: string; estruturado_por: string;
};

const BLANK_PA: PredioAtendidoForm = {
  condominio: "", tecnologia: "", giga: false,
  localizacao: "", observacao: "", estruturado_por: "",
};

export default function GerenciarPrediosAtendidos() {
  const { user } = useAuth();
  const [items, setItems]             = useState<PredioAtendido[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erroAcao, setErroAcao] = useState("");
  const [busca, setBusca]             = useState("");
  const [pagina, setPagina]           = useState(1);
  const [modal, setModal]             = useState<{ mode: "create" | "edit"; item?: PredioAtendido } | null>(null);
  const [form, setForm]               = useState<PredioAtendidoForm>(BLANK_PA);
  const [saving, setSaving]           = useState(false);
  const [confirmDel, setConfirmDel]   = useState<PredioAtendido | null>(null);
  const [formErr, setFormErr]         = useState<string | null>(null);

  // CSV import
  const csvRef                                = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview]           = useState<{ items: PredioCSVItem[]; replace: boolean } | null>(null);
  const [importing, setImporting]             = useState(false);
  const [importProgress, setImportProgress]   = useState({ done: 0, total: 0 });
  const [importResult, setImportResult]       = useState<string | null>(null);

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      const parsed = csvToPredios(rows, user?.nome ?? "importado");
      if (parsed.length === 0) { setErroAcao("Nenhum registro encontrado no arquivo."); return; }
      setCsvPreview({ items: parsed, replace: true });
    };
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  }

  async function handleImportCSV() {
    if (!csvPreview) return;
    setImporting(true);
    setImportProgress({ done: 0, total: csvPreview.items.length });
    setImportResult(null);
    try {
      if (csvPreview.replace) await deleteAllPrediosAtendidos();
      await batchCreatePrediosAtendidos(csvPreview.items, (done, total) => {
        setImportProgress({ done, total });
      });
      setImportResult(`✅ ${csvPreview.items.length} prédios importados com sucesso!`);
      setCsvPreview(null);
      await load();
    } catch (e) {
      setImportResult(`❌ Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  async function load() {
    setLoading(true);
    try { setItems(await getPrediosAtendidos()); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ ...BLANK_PA, estruturado_por: user?.nome ?? "" });
    setFormErr(null);
    setModal({ mode: "create" });
  }
  function openEdit(item: PredioAtendido) {
    setForm({
      condominio: item.condominio, tecnologia: item.tecnologia,
      giga: item.giga ?? false, localizacao: item.localizacao,
      observacao: item.observacao ?? "", estruturado_por: item.estruturado_por,
    });
    setFormErr(null);
    setModal({ mode: "edit", item });
  }

  async function handleSave() {
    if (!form.condominio.trim()) { setFormErr("Informe o nome do condomínio."); return; }
    if (!form.tecnologia.trim()) { setFormErr("Informe a tecnologia."); return; }
    setSaving(true); setFormErr(null);
    try {
      if (modal?.mode === "create") {
        await createPredioAtendido({
          condominio: form.condominio.trim(), tecnologia: form.tecnologia.trim(),
          giga: form.giga, localizacao: form.localizacao.trim(),
          observacao: form.observacao.trim(), estruturado_por: form.estruturado_por || (user?.nome ?? "adm"),
          viabilizacao_id: "manual",
        });
      } else if (modal?.item) {
        await updatePredioAtendido(modal.item.id, {
          condominio: form.condominio.trim(), tecnologia: form.tecnologia.trim(),
          giga: form.giga, localizacao: form.localizacao.trim(),
          observacao: form.observacao.trim(),
        });
      }
      setModal(null);
      await load();
    } catch (e) { setFormErr(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }

  async function handleDelete(item: PredioAtendido) {
    setSaving(true);
    try { await deletePredioAtendido(item.id); setConfirmDel(null); await load(); }
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
            <Building2 className="w-5 h-5 text-green-600" />
            <div>
              <h3 className="font-semibold text-gray-800">Prédios Atendidos</h3>
              <p className="text-xs text-gray-500">Editar tecnologia, localização e observações manualmente</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                placeholder="Buscar condomínio..."
                className="pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 w-48" />
            </div>
            <button onClick={() => csvRef.current?.click()}
              className="flex items-center gap-1.5 bg-white border border-green-400 text-green-700 hover:bg-green-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
              <Upload className="w-4 h-4" /> Importar CSV
            </button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVFile} />
            <button onClick={openCreate}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          </div>
        </div>

        {/* Resultado de importação */}
        {importResult && (
          <div className={`mx-5 mb-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
            importResult.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"
          }`}>
            {importResult}
            <button onClick={() => setImportResult(null)} className="ml-auto text-xs underline opacity-70">fechar</button>
          </div>
        )}

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
              {items.length === 0 ? "Nenhum prédio atendido cadastrado." : "Nenhum resultado para a busca."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">Condomínio</th>
                    <th className="text-left py-2 pr-4 font-medium">Tecnologia</th>
                    <th className="text-left py-2 pr-4 font-medium">Giga</th>
                    <th className="text-left py-2 pr-4 font-medium hidden md:table-cell">Observação</th>
                    <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Localização</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {paginados.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{item.condominio}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.tecnologia === "FTTA" ? "bg-blue-100 text-blue-700"
                          : item.tecnologia === "UTP" ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                        }`}>
                          {item.tecnologia}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs">
                        {item.tecnologia === "FTTA" || item.giga ? "⚡ Giga" : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 text-xs hidden md:table-cell max-w-[200px] truncate">
                        {item.observacao ?? "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500 font-mono text-xs hidden sm:table-cell max-w-[160px] truncate">
                        {item.localizacao || "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-green-600 rounded">
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
                        className={`px-2.5 py-1 text-xs border rounded ${p === paginaAtual ? "bg-green-600 text-white border-green-600" : "hover:bg-gray-50"}`}>
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

      {/* Modal de importação CSV */}
      {csvPreview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-5 rounded-t-xl">
              <h3 className="text-lg font-bold text-white">📥 Importar CSV — Prédios Atendidos</h3>
              <p className="text-green-100 text-sm mt-0.5">{csvPreview.items.length} registros encontrados</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Modo de importação */}
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-red-50"
                  style={{ borderColor: csvPreview.replace ? "#ef4444" : "#e5e7eb" }}>
                  <input type="radio" checked={csvPreview.replace} onChange={() => setCsvPreview((p) => p && ({ ...p, replace: true }))}
                    className="mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">🔄 Substituir lista completa</p>
                    <p className="text-xs text-gray-500">Apaga todos os registros existentes e importa o CSV do zero</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-green-50"
                  style={{ borderColor: !csvPreview.replace ? "#16a34a" : "#e5e7eb" }}>
                  <input type="radio" checked={!csvPreview.replace} onChange={() => setCsvPreview((p) => p && ({ ...p, replace: false }))}
                    className="mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">➕ Adicionar aos existentes</p>
                    <p className="text-xs text-gray-500">Mantém os registros atuais e adiciona os do CSV</p>
                  </div>
                </label>
              </div>

              {/* Preview primeiros 6 */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                  Primeiros {Math.min(6, csvPreview.items.length)} registros
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Condomínio", "Tecnologia", "Giga", "Localização", "Observação"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {csvPreview.items.slice(0, 6).map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium text-gray-800 max-w-[150px] truncate">{item.condominio}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              item.tecnologia === "FTTA" ? "bg-blue-100 text-blue-700"
                              : item.tecnologia === "FTTH" ? "bg-purple-100 text-purple-700"
                              : "bg-green-100 text-green-700"
                            }`}>{item.tecnologia}</span>
                          </td>
                          <td className="px-3 py-2">{item.giga ? "⚡ Sim" : "—"}</td>
                          <td className="px-3 py-2 font-mono text-gray-500 max-w-[100px] truncate">{item.localizacao || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{item.observacao || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreview.items.length > 6 && (
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    + {csvPreview.items.length - 6} registros não exibidos
                  </p>
                )}
              </div>

              {/* Progresso */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Importando...</span>
                    <span>{importProgress.done} / {importProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.total > 0 ? Math.round(importProgress.done / importProgress.total * 100) : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-2 justify-end border-t pt-4">
              <button onClick={() => setCsvPreview(null)} disabled={importing}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleImportCSV} disabled={importing}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-sm font-semibold">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : `Importar ${csvPreview.items.length} prédios`}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-800">
              {modal.mode === "create" ? "Novo Prédio Atendido" : "Editar Prédio Atendido"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Condomínio *</label>
                <input value={form.condominio} onChange={(e) => setForm((f) => ({ ...f, condominio: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="Nome do condomínio / prédio" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tecnologia *</label>
                  <select value={form.tecnologia} onChange={(e) => setForm((f) => ({ ...f, tecnologia: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="">Selecione...</option>
                    <option value="FTTA">FTTA</option>
                    <option value="UTP">UTP</option>
                    <option value="FTTH">FTTH</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer py-2">
                    <input type="checkbox" checked={form.giga} onChange={(e) => setForm((f) => ({ ...f, giga: e.target.checked }))}
                      className="w-4 h-4 accent-amber-500" />
                    <span className="text-sm text-gray-700 font-medium">GIGA</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Localização (Plus Code / coordenadas)</label>
                <input value={form.localizacao} onChange={(e) => setForm((f) => ({ ...f, localizacao: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
                  placeholder="ex: 8J3G+WGV ou -28.677,-49.369" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Observação</label>
                <textarea value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                  rows={2} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                  placeholder="Informações adicionais..." />
              </div>
              {modal.mode === "create" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Registrado por</label>
                  <input value={form.estruturado_por} onChange={(e) => setForm((f) => ({ ...f, estruturado_por: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
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
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
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
            <h3 className="font-semibold text-gray-800">Excluir prédio atendido?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmDel.condominio}</strong> será removido da lista permanentemente.
              Isso não afeta a viabilização original.
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

