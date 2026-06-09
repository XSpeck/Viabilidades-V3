"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { parseCtoKml, importCtosToFirestore, countCtosInFirestore } from "@/lib/ctos";
import { importRedeToFirestore, listRedesImportadas, EMPRESAS } from "@/lib/redes";
import { listUsers, createUser, updateUser, deleteUser } from "@/lib/users";
import {
  getPrediosAtendidos, createPredioAtendido, updatePredioAtendido, deletePredioAtendido,
  deleteAllPrediosAtendidos, batchCreatePrediosAtendidos,
  getPrediosSemViabilidade, createPredioSemViabilidade, updatePredioSemViabilidade, deletePredioSemViabilidade,
  batchImportViabilizacoes,
} from "@/lib/firestore";
import type { AppUser, UserCargo, PredioAtendido, PredioSemViabilidade, Viabilizacao, TipoInstalacao, StatusViabilizacao, StatusPredio } from "@/types";
import { Loader2, Upload, CheckCircle, AlertTriangle, MapPin, Settings, Network, Users, Plus, Pencil, Trash2 as TrashIcon, Building2, Search, XCircle, Database, RefreshCw } from "lucide-react";
import { canAccess } from "@/lib/access";

export default function AdminPage() {
  const { user } = useAuth();

  if (!canAccess(user ?? null, "adm")) {
    return (
      <div className="text-center py-20 text-red-500">
        🚫 Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administração</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configurações e ferramentas do sistema</p>
        </div>
      </div>

      {/* Grid de seções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Importação de CTOs */}
        <ImportCtos />

        {/* Importação de redes das distribuidoras */}
        <ImportRedes />

        {/* Gestão de Usuários — full width */}
        <GestaoUsuarios />

        {/* Prédios atendidos */}
        <GerenciarPrediosAtendidos />

        {/* Prédios sem viabilidade */}
        <GerenciarPrediosSemViabilidade />

        {/* Importação Supabase */}
        <ImportacaoSupabase />

        <PlaceholderCard
          icon="🔔"
          title="Notificações Telegram"
          desc="Configurar bot e grupos de notificação"
        />
      </div>
    </div>
  );
}

// =====================
// Card: Importar CTOs
// =====================
function ImportCtos() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctosNoFirebase, setCtosNoFirebase] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    countCtosInFirestore()
      .then(setCtosNoFirebase)
      .catch(() => setCtosNoFirebase(0))
      .finally(() => setLoadingCount(false));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const ctos = parseCtoKml(text);
        if (ctos.length === 0) {
          setParseError("Nenhuma CTO encontrada no arquivo. Verifique se é um KML válido com Placemarks.");
        } else {
          setPreview({ count: ctos.length });
        }
      } catch (err) {
        setParseError(`Erro ao ler o arquivo: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!file || !preview) return;
    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: preview.count });

    try {
      const text = await file.text();
      const ctos = parseCtoKml(text);

      await importCtosToFirestore(ctos, (done, total) => {
        setProgress({ done, total });
      });

      setCtosNoFirebase(ctos.length);
      setResult({ ok: true, msg: `✅ ${ctos.length} CTOs importadas com sucesso!` });
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";

      // Limpar cache de sessão para forçar recarregamento
      try { sessionStorage.removeItem("viab_ctos_v3"); } catch {}
    } catch (err) {
      setResult({ ok: false, msg: `❌ Erro: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setImporting(false);
    }
  }

  async function handleIxcSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/ixcsoft/sync-ctos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const { ctos } = data as { ctos: import("@/lib/ctos").Cto[]; total: number };
      if (!ctos?.length) throw new Error("Nenhuma CTO retornada pelo IXC Soft.");

      await importCtosToFirestore(ctos, (done, total) => setProgress({ done, total }));
      setCtosNoFirebase(ctos.length);
      setSyncResult({ ok: true, msg: `✅ ${ctos.length} CTOs sincronizadas do IXC Soft!` });
      try { sessionStorage.removeItem("viab_ctos_v3"); } catch {}
    } catch (e) {
      setSyncResult({ ok: false, msg: `❌ Erro: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncing(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header do card */}
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <MapPin className="w-5 h-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Importar CTOs</h3>
          <p className="text-xs text-gray-500">Carregar arquivo KML com posições das caixas</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Status atual */}
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-600">CTOs no Firebase:</span>
          {loadingCount ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          ) : (
            <span className={`text-sm font-bold ${(ctosNoFirebase ?? 0) > 0 ? "text-green-700" : "text-red-600"}`}>
              {(ctosNoFirebase ?? 0) > 0 ? `✅ ${ctosNoFirebase} CTOs` : "⚠️ Nenhuma CTO importada"}
            </span>
          )}
        </div>

        {/* Sincronizar via IXC Soft — só funciona rodando localmente (IP liberado no IXC) */}
        {process.env.NODE_ENV === "development" && (
        <div className="space-y-2 border border-teal-200 bg-teal-50 rounded-lg p-3">
          <p className="text-xs text-teal-800 font-medium">
            IXC Soft — busca todas as CTOs direto do sistema de gestão.
          </p>
          {syncing && progress.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-teal-600">
                <span>Salvando...</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="w-full bg-teal-200 rounded-full h-1.5">
                <div className="bg-teal-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
          {syncResult && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${syncResult.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {syncResult.msg}
            </div>
          )}
          <button onClick={handleIxcSync} disabled={syncing}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-2">
            {syncing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sincronizando...</> : <><RefreshCw className="w-3.5 h-3.5" /> Sincronizar CTOs via IXC Soft</>}
          </button>
        </div>
        )}

        {/* Upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
        >
          <Upload className="w-8 h-8 text-gray-400 group-hover:text-indigo-500 mx-auto mb-2 transition-colors" />
          <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
            {file ? file.name : "Clique para selecionar o arquivo KML"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Apenas arquivos .kml</p>
          <input
            ref={fileRef}
            type="file"
            accept=".kml"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Erro de parse */}
        {parseError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {parseError}
          </div>
        )}

        {/* Preview */}
        {preview && !parseError && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700">
              <strong>{preview.count} CTOs</strong> encontradas no arquivo. Pronto para importar.
            </p>
          </div>
        )}

        {/* Progresso */}
        {importing && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Importando...</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {result.ok
              ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            {result.msg}
          </div>
        )}

        {/* Botão */}
        <button
          onClick={handleImport}
          disabled={!preview || importing}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {importing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
          ) : (
            <><Upload className="w-4 h-4" /> Importar CTOs</>
          )}
        </button>

        {(ctosNoFirebase ?? 0) > 0 && !importing && (
          <p className="text-xs text-gray-400 text-center">
            ⚠️ A importação substitui todas as CTOs existentes.
          </p>
        )}
      </div>
    </div>
  );
}

// =====================
// Card: Importar Redes Distribuidoras
// =====================
function ImportRedes() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [empresa, setEmpresa] = useState<string>(Object.keys(EMPRESAS)[0]);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importadas, setImportadas] = useState<{ empresa: string; cor: string; atualizado_em: string }[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    listRedesImportadas()
      .then(setImportadas)
      .catch(() => setImportadas([]))
      .finally(() => setLoadingList(false));
  }, []);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      await importRedeToFirestore(empresa, text);
      setResult({ ok: true, msg: `✅ Rede ${empresa} importada!` });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // Atualiza lista + limpa cache
      const lista = await listRedesImportadas();
      setImportadas(lista);
      try { sessionStorage.removeItem("viab_redes_v1"); } catch {}
    } catch (e) {
      setResult({ ok: false, msg: `❌ Erro: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setImporting(false);
    }
  }

  const empresasNomes = Object.keys(EMPRESAS);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <Network className="w-5 h-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Redes de Distribuidoras</h3>
          <p className="text-xs text-gray-500">KMLs das empresas de energia (linhas no mapa)</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Status importadas */}
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Status</p>
          {loadingList ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {empresasNomes.map((e) => {
                const imp = importadas.find((i) => i.empresa === e);
                return (
                  <div key={e} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: EMPRESAS[e].cor }} />
                    <span className="font-medium text-gray-700 truncate">{EMPRESAS[e].label}</span>
                    {imp ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto shrink-0" />
                    ) : (
                      <span className="text-gray-300 ml-auto">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Seleção de empresa */}
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Empresa</label>
          <select
            value={empresa}
            onChange={(e) => { setEmpresa(e.target.value); setFile(null); setResult(null); }}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {empresasNomes.map((e) => (
              <option key={e} value={e}>{EMPRESAS[e].label}</option>
            ))}
          </select>
        </div>

        {/* Upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition-colors group"
        >
          <Upload className="w-6 h-6 text-gray-400 group-hover:text-indigo-500 mx-auto mb-1 transition-colors" />
          <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
            {file ? file.name : `Selecionar KML da ${EMPRESAS[empresa].label}`}
          </p>
          <input ref={fileRef} type="file" accept=".kml" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        </div>

        {result && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${result.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {result.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            {result.msg}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
        >
          {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : <><Upload className="w-4 h-4" /> Importar {EMPRESAS[empresa].label}</>}
        </button>
      </div>
    </div>
  );
}

// =====================
// Card: Gestão de Usuários
// =====================
const CARGO_LABEL: Record<UserCargo, string> = {
  adm: "ADM",
  auditor: "Auditor",
  agendamento: "Agendamento",
  usuario: "Usuário",
};
const CARGO_COLOR: Record<UserCargo, string> = {
  adm: "bg-purple-100 text-purple-700",
  auditor: "bg-blue-100 text-blue-700",
  agendamento: "bg-green-100 text-green-700",
  usuario: "bg-gray-100 text-gray-700",
};

type ModalState = { mode: "create" } | { mode: "edit"; user: AppUser };

function GestaoUsuarios() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", cargo: "usuario" as UserCargo });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);

  async function load() {
    setLoading(true);
    try { setUsers(await listUsers()); }
    catch (e) { alert(`Erro ao carregar usuários: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ nome: "", email: "", senha: "", cargo: "usuario" });
    setFormError(null);
    setModal({ mode: "create" });
  }

  function openEdit(u: AppUser) {
    setForm({ nome: u.nome, email: u.login, senha: "", cargo: u.cargo ?? (u.nivel === 1 ? "auditor" : "usuario") });
    setFormError(null);
    setModal({ mode: "edit", user: u });
  }

  async function handleSave() {
    if (!form.nome.trim()) { setFormError("Informe o nome."); return; }
    if (modal?.mode === "create") {
      if (!form.email.trim()) { setFormError("Informe o email."); return; }
      if (form.senha.length < 6) { setFormError("Senha deve ter no mínimo 6 caracteres."); return; }
    }
    setSaving(true);
    setFormError(null);
    try {
      if (modal?.mode === "create") {
        await createUser(form.email, form.senha, form.nome, form.cargo);
      } else if (modal?.mode === "edit") {
        await updateUser(modal.user.uid, { nome: form.nome, cargo: form.cargo });
      }
      setModal(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: AppUser) {
    setSaving(true);
    try {
      await deleteUser(u.uid);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-semibold text-gray-800">Gestão de Usuários</h3>
              <p className="text-xs text-gray-500">Criar, editar e remover usuários do sistema</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Novo usuário
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-6 justify-center text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum usuário cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">Nome</th>
                    <th className="text-left py-2 pr-4 font-medium">Email</th>
                    <th className="text-left py-2 pr-4 font-medium">Cargo</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const cargo: UserCargo = u.cargo ?? (u.nivel === 1 ? "auditor" : "usuario");
                    return (
                      <tr key={u.uid} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{u.nome}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{u.login}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CARGO_COLOR[cargo]}`}>
                            {CARGO_LABEL[cargo]}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDelete(u)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal criar / editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">
              {modal.mode === "create" ? "Novo Usuário" : "Editar Usuário"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Nome completo"
                />
              </div>
              {modal.mode === "create" && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="email@empresa.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Senha</label>
                    <input
                      type="password"
                      value={form.senha}
                      onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cargo</label>
                <select
                  value={form.cargo}
                  onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value as UserCargo }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="usuario">Usuário</option>
                  <option value="auditor">Auditor</option>
                  <option value="agendamento">Agendamento</option>
                  <option value="adm">ADM</option>
                </select>
              </div>
            </div>
            {formError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {formError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modal.mode === "create" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Excluir usuário?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmDelete.nome}</strong> ({confirmDelete.login}) será removido do sistema e não poderá mais fazer login.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
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

// ── Supabase CSV/TSV parser ───────────────────────────────────────
function parseSupabaseTSVOrCSV(text: string): { headers: string[]; rows: string[][] } {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  if (firstLine.includes("\t")) {
    const lines = text.split(/\r?\n/);
    const headers = firstLine.split("\t").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1)
      .filter((l) => l.trim())
      .map((l) => l.split("\t").map((v) => v.trim().replace(/^"|"$/g, "")));
    return { headers, rows };
  }
  const all = parseCSV(text);
  return all.length < 2 ? { headers: [], rows: [] } : { headers: all[0], rows: all.slice(1) };
}

function supabaseRowToViabilizacao(row: string[], headers: string[]): Viabilizacao | null {
  const g = (col: string) => { const i = headers.indexOf(col); return i >= 0 ? (row[i]?.trim() ?? "") : ""; };
  const s = (col: string): string | undefined => g(col) || undefined;
  const b = (col: string): boolean | undefined => {
    const v = g(col);
    return v === "true" || v === "t" ? true : v === "false" || v === "f" ? false : undefined;
  };
  const n = (col: string): number | undefined => { const v = g(col); return v ? (parseInt(v) || undefined) : undefined; };
  const d = (col: string): string | undefined => {
    const v = g(col); if (!v) return undefined;
    try { const dt = new Date(v); return isNaN(dt.getTime()) ? undefined : dt.toISOString(); } catch { return undefined; }
  };

  const id = g("id");
  if (!id) return null;

  return {
    id,
    usuario:            (() => { const u = g("usuario"); return u ? (u.includes("@") ? u : `${u}@viabilidade.com`) : "importado"; })(),
    plus_code_cliente:  g("plus_code_cliente"),
    tipo_instalacao:    (g("tipo_instalacao") || "FTTH") as TipoInstalacao,
    urgente:            b("urgente") ?? false,
    status:             (g("status") || "pendente") as StatusViabilizacao,
    nome_cliente:          s("nome_cliente"),
    auditor_responsavel:   s("auditor_responsavel"),
    auditado_por:          s("auditado_por"),
    status_predio:         s("status_predio") as StatusPredio | undefined,
    status_busca:          s("status_busca"),
    predio_ftta:           s("predio_ftta"),
    andar_predio:          s("andar_predio"),
    bloco_predio:          s("bloco_predio"),
    cto_numero:            s("cto_numero"),
    portas_disponiveis:    n("portas_disponiveis"),
    menor_rx:              s("menor_rx"),
    distancia_cliente:     s("distancia_cliente"),
    localizacao_caixa:     s("localizacao_caixa"),
    cdoi:                  s("cdoi"),
    media_rx:              s("media_rx"),
    nome_sindico:          s("nome_sindico"),
    contato_sindico:       s("contato_sindico"),
    nome_cliente_predio:   s("nome_cliente_predio"),
    contato_cliente_predio:s("contato_cliente_predio"),
    apartamento:           s("apartamento"),
    obs_agendamento:       s("obs_agendamento"),
    data_visita:           s("data_visita"),
    periodo_visita:        s("periodo_visita"),
    tecnico_responsavel:   s("tecnico_responsavel"),
    tecnologia_predio:     s("tecnologia_predio"),
    status_agendamento:    s("status_agendamento"),
    data_agendamento:      d("data_agendamento"),
    historico_reagendamento: s("historico_reagendamento"),
    giga:                  b("giga"),
    motivo_rejeicao:       s("motivo_rejeicao"),
    observacoes:           s("observacoes"),
    data_solicitacao:      d("data_solicitacao") ?? d("created_at"),
    data_auditoria:        d("data_auditoria"),
    data_finalizacao:      d("data_finalizacao"),
    data_solicitacao_predio: d("data_solicitacao_predio"),
  };
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

function GerenciarPrediosAtendidos() {
  const { user } = useAuth();
  const [items, setItems]             = useState<PredioAtendido[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState("");
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
      if (parsed.length === 0) { alert("Nenhum registro encontrado no arquivo."); return; }
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
    catch (e) { alert(e instanceof Error ? e.message : "Erro ao excluir."); }
    finally { setSaving(false); }
  }

  const filtrados = items.filter((i) =>
    !busca || i.condominio.toLowerCase().includes(busca.toLowerCase())
  );

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
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
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
                  {filtrados.map((item) => (
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
              <p className="text-xs text-gray-400 mt-3">{filtrados.length} prédio(s) encontrado(s)</p>
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

// =====================
// Card: Prédios Sem Viabilidade
// =====================
type PredioSemViabForm = { condominio: string; localizacao: string; observacao: string; registrado_por: string; };
const BLANK_PSV: PredioSemViabForm = { condominio: "", localizacao: "", observacao: "", registrado_por: "" };

function GerenciarPrediosSemViabilidade() {
  const { user } = useAuth();
  const [items, setItems]             = useState<PredioSemViabilidade[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState("");
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
    catch (e) { alert(e instanceof Error ? e.message : "Erro ao excluir."); }
    finally { setSaving(false); }
  }

  const filtrados = items.filter((i) =>
    !busca || i.condominio.toLowerCase().includes(busca.toLowerCase())
  );

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
              <input value={busca} onChange={(e) => setBusca(e.target.value)}
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
                  {filtrados.map((item) => (
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
              <p className="text-xs text-gray-400 mt-3">{filtrados.length} prédio(s) encontrado(s)</p>
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

// =====================
// Card: Importação Supabase → Firebase
// =====================
const STATUS_VIAB_COLOR: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-700",
  em_auditoria: "bg-blue-100 text-blue-700",
  em_revisao: "bg-orange-100 text-orange-700",
  aprovado: "bg-green-100 text-green-700",
  rejeitado: "bg-red-100 text-red-700",
  utp: "bg-purple-100 text-purple-700",
  finalizado: "bg-gray-100 text-gray-600",
};

function ImportacaoSupabase() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ items: Viabilizacao[]; skipped: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseSupabaseTSVOrCSV(text);
      if (headers.length === 0) { alert("Arquivo inválido ou vazio."); return; }
      if (!headers.includes("id") || !headers.includes("status")) {
        alert('Colunas "id" e "status" não encontradas. Exporte direto do Supabase (CSV ou TSV).');
        return;
      }
      let skipped = 0;
      const items: Viabilizacao[] = [];
      rows.forEach((row) => {
        const v = supabaseRowToViabilizacao(row, headers);
        if (v) items.push(v); else skipped++;
      });
      if (items.length === 0) { alert("Nenhuma linha válida encontrada."); return; }
      setPreview({ items, skipped });
      setResult(null);
    };
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    setProgress({ done: 0, total: preview.items.length });
    try {
      await batchImportViabilizacoes(preview.items, (done, total) => setProgress({ done, total }));
      setResult(`✅ ${preview.items.length} viabilizações importadas com sucesso!`);
      setPreview(null);
    } catch (e) {
      setResult(`❌ Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  // preview stats
  const byTipo = preview ? preview.items.reduce<Record<string, number>>((acc, v) => {
    acc[v.tipo_instalacao] = (acc[v.tipo_instalacao] ?? 0) + 1; return acc;
  }, {}) : {};
  const byStatus = preview ? preview.items.reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1; return acc;
  }, {}) : {};

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
          <Database className="w-5 h-5 text-violet-600" />
          <div>
            <h3 className="font-semibold text-gray-800">Importar Viabilizações (Supabase)</h3>
            <p className="text-xs text-gray-500">Migrar dados do banco anterior — CSV ou TSV exportado do Supabase</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-700 space-y-1">
            <p className="font-semibold">Como exportar do Supabase:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-violet-600">
              <li>Table Editor → tabela <code className="bg-violet-100 px-1 rounded">viabilizacoes</code></li>
              <li>Botão <strong>Export</strong> → <strong>Export to CSV</strong></li>
              <li>Faça upload do arquivo aqui</li>
            </ol>
            <p className="text-violet-500 mt-1">O ID do Supabase é preservado como ID do documento no Firebase — reimportar é seguro.</p>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-violet-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
          >
            <Upload className="w-8 h-8 text-gray-400 group-hover:text-violet-500 mx-auto mb-2 transition-colors" />
            <p className="text-sm font-medium text-gray-600 group-hover:text-violet-600">
              Clique para selecionar o arquivo CSV ou TSV
            </p>
            <p className="text-xs text-gray-400 mt-1">.csv, .tsv ou .txt</p>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
          </div>

          {result && (
            <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
              result.startsWith("✅") ? "bg-green-50 border border-green-200 text-green-700"
                                      : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {result.startsWith("✅") ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
              {result}
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-5 rounded-t-xl">
              <h3 className="text-lg font-bold text-white">Importar Viabilizações do Supabase</h3>
              <p className="text-violet-100 text-sm mt-0.5">
                {preview.items.length} registros prontos para importar
                {preview.skipped > 0 && ` · ${preview.skipped} ignorados (sem ID)`}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 border">
                  <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Por Tipo</p>
                  <div className="space-y-1">
                    {Object.entries(byTipo).map(([tipo, count]) => (
                      <div key={tipo} className="flex justify-between text-sm">
                        <span className="text-gray-700">{tipo}</span>
                        <span className="font-semibold text-gray-800">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border">
                  <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Por Status</p>
                  <div className="space-y-1">
                    {Object.entries(byStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-sm gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_VIAB_COLOR[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {status}
                        </span>
                        <span className="font-semibold text-gray-800">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview table */}
              <div>
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
                  Primeiros {Math.min(8, preview.items.length)} registros
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["ID", "Usuário", "Tipo", "Status", "Plus Code", "Nome"].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.items.slice(0, 8).map((v) => (
                        <tr key={v.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-gray-400">{v.id.slice(0, 8)}…</td>
                          <td className="px-3 py-2 text-gray-700">{v.usuario}</td>
                          <td className="px-3 py-2">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">{v.tipo_instalacao}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_VIAB_COLOR[v.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-500">{v.plus_code_cliente || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[140px] truncate">{v.nome_cliente || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.items.length > 8 && (
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    + {preview.items.length - 8} registros não exibidos
                  </p>
                )}
              </div>

              {/* Progresso */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Importando para Firebase...</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-violet-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2 justify-end border-t pt-4">
              <button onClick={() => setPreview(null)} disabled={importing}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleImport} disabled={importing}
                className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-sm font-semibold">
                {importing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
                  : <><Database className="w-4 h-4" /> Importar {preview.items.length} viabilizações</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =====================
// Card placeholder
// =====================
function PlaceholderCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden opacity-60">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <span className="text-xl">{icon}</span>
        <div>
          <h3 className="font-semibold text-gray-700">{title}</h3>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
      </div>
      <div className="px-5 py-8 text-center text-gray-400 text-sm">
        🚧 Em desenvolvimento
      </div>
    </div>
  );
}
