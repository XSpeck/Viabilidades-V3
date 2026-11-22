"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listUsers, createUser, updateUser, changeUserPassword, definirUsuarioAtivo } from "@/lib/users";
import type { AppUser, UserCargo, PapelFinanceiro, FuncaoTecnico } from "@/types";
import { FUNCOES_TECNICO_LABEL } from "@/types";
import { Loader2, AlertTriangle, Users, Plus, Pencil, UserX, UserCheck, Search, KeyRound, ChevronLeft, ChevronRight } from "lucide-react";

// =====================
// Card: Gestão de Usuários
// =====================
const CARGO_LABEL: Record<UserCargo, string> = {
  adm: "ADM",
  auditor: "Auditor",
  agendamento: "Agendamento",
  usuario: "Usuário",
  tecnico: "Técnico",
};
const CARGO_COLOR: Record<UserCargo, string> = {
  adm: "bg-purple-100 text-purple-700",
  auditor: "bg-blue-100 text-blue-700",
  agendamento: "bg-green-100 text-green-700",
  usuario: "bg-gray-100 text-gray-700",
  tecnico: "bg-cyan-100 text-cyan-700",
};

const PAPEL_FINANCEIRO_LABEL: Record<PapelFinanceiro, string> = {
  auditor_servico: "Auditor de Serviço",
  financeiro: "Financeiro",
};
const PAPEL_FINANCEIRO_COLOR: Record<PapelFinanceiro, string> = {
  auditor_servico: "bg-orange-100 text-orange-700",
  financeiro: "bg-emerald-100 text-emerald-700",
};

type ModalState = { mode: "create" } | { mode: "edit"; user: AppUser };

export default function GestaoUsuarios() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", cargo: "usuario" as UserCargo, funcoesTecnico: [] as FuncaoTecnico[], papelFinanceiro: "" as PapelFinanceiro | "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AppUser | null>(null);
  const [senhaModal, setSenhaModal] = useState<AppUser | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [senhaError, setSenhaError] = useState<string | null>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [busca, setBusca] = useState("");
  const [verDesativados, setVerDesativados] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const [pagina, setPagina] = useState(1);

  async function load() {
    setLoading(true);
    try { setUsers(await listUsers()); }
    catch (e) { setErroLista(`Erro ao carregar usuários: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ nome: "", email: "", senha: "", cargo: "usuario", funcoesTecnico: [], papelFinanceiro: "" });
    setFormError(null);
    setModal({ mode: "create" });
  }

  function openEdit(u: AppUser) {
    setForm({
      nome: u.nome,
      email: u.login,
      senha: "",
      cargo: u.cargo ?? (u.nivel === 1 ? "auditor" : "usuario"),
      funcoesTecnico: u.funcoes_tecnico ?? [],
      papelFinanceiro: u.papel_financeiro ?? "",
    });
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
      const funcoesTecnico = form.cargo === "tecnico" ? form.funcoesTecnico : undefined;
      const papelFinanceiro = form.cargo !== "tecnico" ? form.papelFinanceiro || undefined : undefined;
      if (modal?.mode === "create") {
        await createUser(form.email, form.senha, form.nome, form.cargo, funcoesTecnico, papelFinanceiro);
      } else if (modal?.mode === "edit") {
        await updateUser(modal.user.uid, {
          nome: form.nome,
          cargo: form.cargo,
          funcoes_tecnico: form.cargo === "tecnico" ? (funcoesTecnico ?? null) : null,
          papel_financeiro: papelFinanceiro ?? null,
        });
      }
      setModal(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  /** Desativa (bloqueia o login, mantém o nome no histórico) ou reativa */
  async function handleAtivo(u: AppUser, ativo: boolean) {
    setSaving(true);
    setErroLista("");
    try {
      await definirUsuarioAtivo(u.uid, ativo);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Erro ao salvar.");
      setConfirmDelete(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeSenha() {
    if (!senhaModal || !currentUser) return;
    if (novaSenha.length < 6) { setSenhaError("Mínimo 6 caracteres."); return; }
    setSalvandoSenha(true);
    setSenhaError(null);
    try {
      await changeUserPassword(senhaModal.uid, novaSenha);
      setSenhaModal(null);
      setNovaSenha("");
    } catch (e) {
      setSenhaError(e instanceof Error ? e.message : "Erro ao alterar senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  const desativados = users.filter((u) => u.ativo === false).length;
  const usersFiltrados = users.filter((u) => {
    if (!verDesativados && u.ativo === false) return false;
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return u.nome.toLowerCase().includes(q) || u.login.toLowerCase().includes(q);
  });

  const POR_PAGINA = 10;
  const totalPaginas = Math.max(1, Math.ceil(usersFiltrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const usersPagina = usersFiltrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  useEffect(() => { setPagina(1); }, [busca]);

  return (
    <>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-semibold text-gray-800">Gestão de Usuários</h3>
              <p className="text-xs text-gray-500">Criar, editar e desativar usuários do sistema</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Novo usuário
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou email"
              className="w-full h-10 pl-9 pr-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {desativados > 0 && (
            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={verDesativados} onChange={(e) => setVerDesativados(e.target.checked)} className="h-3.5 w-3.5" />
              Mostrar desativados ({desativados})
            </label>
          )}
          {erroLista && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{erroLista}</p>}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 py-6 justify-center text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum usuário cadastrado.</div>
          ) : usersFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum usuário encontrado para essa busca.</div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">Nome</th>
                    <th className="text-left py-2 pr-4 font-medium">Email</th>
                    <th className="text-left py-2 pr-4 font-medium">Cargo</th>
                    <th className="text-left py-2 pr-4 font-medium hidden sm:table-cell">Funções</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {usersPagina.map((u) => {
                    const cargo: UserCargo = u.cargo ?? (u.nivel === 1 ? "auditor" : "usuario");
                    return (
                      <tr key={u.uid} className="border-b last:border-0 hover:bg-gray-50">
                        <td className={`py-2.5 pr-4 font-medium ${u.ativo === false ? "text-gray-400 line-through" : "text-gray-800"}`}>{u.nome}{u.ativo === false && <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 no-underline">Desativado</span>}</td>
                        <td className="py-2.5 pr-4 text-gray-500">{u.login}</td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-wrap gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CARGO_COLOR[cargo]}`}>
                              {CARGO_LABEL[cargo]}
                            </span>
                            {u.papel_financeiro && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAPEL_FINANCEIRO_COLOR[u.papel_financeiro]}`}>
                                {PAPEL_FINANCEIRO_LABEL[u.papel_financeiro]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 hidden sm:table-cell">
                          {(u.funcoes_tecnico?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.funcoes_tecnico!.map((f) => (
                                <span key={f} className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
                                  {FUNCOES_TECNICO_LABEL[f]}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded" title="Editar">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setSenhaModal(u); setNovaSenha(""); setSenhaError(null); }} className="p-1.5 text-gray-400 hover:text-amber-600 rounded" title="Alterar senha">
                              <KeyRound className="w-4 h-4" />
                            </button>
                            {u.ativo === false ? (
                              <button onClick={() => handleAtivo(u, true)} disabled={saving} className="p-1.5 text-gray-400 hover:text-green-600 rounded" title="Reativar">
                                <UserCheck className="w-4 h-4" />
                              </button>
                            ) : u.uid !== currentUser?.uid && (
                              <button onClick={() => setConfirmDelete(u)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Desativar">
                                <UserX className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <span className="text-xs text-gray-500">
                  Página {paginaAtual} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Próxima <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            </>
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
                  <option value="tecnico">Técnico</option>
                  <option value="adm">ADM</option>
                </select>
              </div>
              {form.cargo === "tecnico" ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Função do técnico</label>
                  <div className="flex gap-4">
                    {(["rede", "manutencao"] as FuncaoTecnico[]).map((f) => (
                      <label key={f} className="flex items-center gap-1.5 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.funcoesTecnico.includes(f)}
                          onChange={(e) => setForm((s) => ({
                            ...s,
                            funcoesTecnico: e.target.checked
                              ? [...s.funcoesTecnico, f]
                              : s.funcoesTecnico.filter((x) => x !== f),
                          }))}
                        />
                        {FUNCOES_TECNICO_LABEL[f]}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Papel financeiro <span className="font-normal">(opcional, além do cargo acima)</span>
                  </label>
                  <select
                    value={form.papelFinanceiro}
                    onChange={(e) => setForm((f) => ({ ...f, papelFinanceiro: e.target.value as PapelFinanceiro | "" }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="">Nenhum</option>
                    <option value="auditor_servico">Auditor de Serviço</option>
                    <option value="financeiro">Financeiro</option>
                  </select>
                </div>
              )}
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
            <h3 className="font-semibold text-gray-800">Desativar usuário?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmDelete.nome}</strong> ({confirmDelete.login}) não poderá mais fazer login. O nome continua nos pedidos e no histórico, e dá para reativar depois.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleAtivo(confirmDelete, false)}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Desativar
              </button>
            </div>
          </div>
        </div>
      )}

      {senhaModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-gray-800">Alterar senha</h3>
            </div>
            <p className="text-sm text-gray-500">
              Definir nova senha para <strong>{senhaModal.nome}</strong>
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChangeSenha()}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Mínimo 6 caracteres"
                autoFocus
              />
            </div>
            {senhaError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {senhaError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setSenhaModal(null); setNovaSenha(""); setSenhaError(null); }}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangeSenha}
                disabled={salvandoSenha || novaSenha.length < 6}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {salvandoSenha && <Loader2 className="w-4 h-4 animate-spin" />}
                {salvandoSenha ? "Salvando..." : "✅ Alterar senha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

