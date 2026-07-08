"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, getCargo } from "@/lib/access";
import {
  listTiposServico, createTipoServico, updateTipoServico, deleteTipoServico,
  criarServicoFinanceiro, listServicosPorTecnico, listServicosPendentesAuditoria,
  listServicosAuditadosPor, listServicosAprovadosNaoPagos, auditarServico,
  fecharPagamentoMensal, listFechamentos,
} from "@/lib/financeiro";
import { uploadFoto } from "@/lib/cloudinary";
import { listUsers } from "@/lib/users";
import type { AppUser, TipoServicoFinanceiro, ServicoFinanceiro, StatusServicoFinanceiro, FechamentoPagamento } from "@/types";
import {
  Wallet, Camera, CheckCircle, XCircle, Loader2, Plus, History,
  Users as UsersIcon, Settings, ClipboardList, ImageIcon, Trash2, Pencil, AlertTriangle, X,
} from "lucide-react";

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<StatusServicoFinanceiro, string> = {
  pendente_auditoria: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  pago: "Pago",
};
const STATUS_COLOR: Record<StatusServicoFinanceiro, string> = {
  pendente_auditoria: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-blue-100 text-blue-700",
  rejeitado: "bg-red-100 text-red-700",
  pago: "bg-green-100 text-green-700",
};

export default function FinanceiroPage() {
  const { user } = useAuth();

  if (!canAccess(user ?? null, "financeiro")) {
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;
  }

  const cargo = getCargo(user!);
  const papel = user!.papel_financeiro;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="w-7 h-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-500 text-sm mt-0.5">Serviços prestados, auditoria e pagamento de técnicos</p>
        </div>
      </div>

      {cargo === "tecnico" && <TecnicoView />}
      {papel === "auditor_servico" && <AuditorServicoView />}
      {(papel === "financeiro" || cargo === "adm") && <FinanceiroAdminView />}
    </div>
  );
}

// =====================
// Visão do Técnico
// =====================
function TecnicoView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"registro" | "financeiro" | "meus-servicos">("registro");
  const [tipos, setTipos] = useState<TipoServicoFinanceiro[]>([]);
  const [servicos, setServicos] = useState<ServicoFinanceiro[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    tipo_servico_id: "", cliente: "", endereco: "",
    data_servico: new Date().toISOString().slice(0, 10), observacoes: "",
  });
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const MAX_FOTOS = 5;

  useEffect(() => {
    const urls = fotos.map((f) => URL.createObjectURL(f));
    setFotoPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [fotos]);

  function handleFotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFotos((prev) => {
      const combined = [...prev, ...selected];
      if (combined.length > MAX_FOTOS) {
        setError(`Máximo de ${MAX_FOTOS} fotos por serviço.`);
        return combined.slice(0, MAX_FOTOS);
      }
      return combined;
    });
    e.target.value = "";
  }

  function removeFoto(index: number) {
    setFotos((prev) => prev.filter((_, i) => i !== index));
  }

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [t, s, f] = await Promise.all([listTiposServico(), listServicosPorTecnico(user.uid), listFechamentos(user.uid)]);
      setTipos(t.filter((x) => x.ativo));
      setServicos(s);
      setFechamentos(f);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const valorDe = (s: ServicoFinanceiro) => s.valor_ajustado ?? s.valor;
  const aReceber = servicos.filter((s) => s.status === "aprovado").reduce((sum, s) => sum + valorDe(s), 0);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const recebidoMes = servicos
    .filter((s) => s.status === "pago" && s.pago_em?.startsWith(mesAtual))
    .reduce((sum, s) => sum + valorDe(s), 0);

  // ── Filtros: Meus Serviços ──────────────────────────────
  const [buscaServico, setBuscaServico] = useState("");
  const [servicoDataInicio, setServicoDataInicio] = useState("");
  const [servicoDataFim, setServicoDataFim] = useState("");

  const servicosFiltrados = servicos.filter((s) => {
    if (servicoDataInicio && s.data_servico < servicoDataInicio) return false;
    if (servicoDataFim && s.data_servico > servicoDataFim) return false;
    if (buscaServico.trim()) {
      const q = buscaServico.trim().toLowerCase();
      if (
        !s.cliente.toLowerCase().includes(q) &&
        !s.endereco.toLowerCase().includes(q) &&
        !s.tipo_servico_nome.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const temFiltroServico = !!(buscaServico.trim() || servicoDataInicio || servicoDataFim);

  // ── Filtros: Parte Financeira (histórico de pagamentos) ──
  const [fechamentoDataInicio, setFechamentoDataInicio] = useState("");
  const [fechamentoDataFim, setFechamentoDataFim] = useState("");

  const fechamentosFiltrados = fechamentos.filter((f) => {
    const data = f.data_fechamento.slice(0, 10);
    if (fechamentoDataInicio && data < fechamentoDataInicio) return false;
    if (fechamentoDataFim && data > fechamentoDataFim) return false;
    return true;
  });

  const temFiltroFechamento = !!(fechamentoDataInicio || fechamentoDataFim);

  async function handleSubmit() {
    if (!user) return;
    const tipo = tipos.find((t) => t.id === form.tipo_servico_id);
    if (!tipo) { setError("Selecione o tipo de serviço."); return; }
    if (!form.cliente.trim() || !form.endereco.trim() || !form.data_servico) {
      setError("Preencha cliente, endereço e data.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let foto_urls: string[] | undefined;
      if (fotos.length > 0) {
        setUploading(true);
        foto_urls = await Promise.all(fotos.map((f) => uploadFoto(f)));
        setUploading(false);
      }
      await criarServicoFinanceiro({
        tecnico_uid: user.uid,
        tecnico_nome: user.nome,
        tipo_servico_id: tipo.id,
        tipo_servico_nome: tipo.nome,
        valor: tipo.valor,
        cliente: form.cliente.trim(),
        endereco: form.endereco.trim(),
        data_servico: form.data_servico,
        foto_urls,
        observacoes: form.observacoes.trim() || undefined,
      });
      setForm({ tipo_servico_id: "", cliente: "", endereco: "", data_servico: new Date().toISOString().slice(0, 10), observacoes: "" });
      setFotos([]);
      await load();
      setTab("meus-servicos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar serviço.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  const chips: { key: typeof tab; label: string }[] = [
    { key: "registro", label: "Registro de Serviços" },
    { key: "financeiro", label: "Parte Financeira" },
    { key: "meus-servicos", label: "Meus Serviços" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === c.key ? "bg-emerald-600 text-white" : "bg-white border text-gray-600"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {tab === "registro" && (
        <div className="bg-white rounded-xl border shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">Registrar serviço prestado</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={form.tipo_servico_id}
              onChange={(e) => setForm((f) => ({ ...f, tipo_servico_id: e.target.value }))}
              className="w-full min-w-0 h-11 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">Tipo de serviço</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <input
              type="date"
              value={form.data_servico}
              onChange={(e) => setForm((f) => ({ ...f, data_servico: e.target.value }))}
              className="w-full min-w-0 h-11 appearance-none px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <input
              placeholder="Cliente"
              value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
              className="w-full min-w-0 h-11 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <input
              placeholder="Endereço"
              value={form.endereco}
              onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))}
              className="w-full min-w-0 h-11 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <textarea
            placeholder="Observações (opcional)"
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            className="w-full px-3 py-2.5 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            rows={2}
          />
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-1.5">
              <Camera className="w-4 h-4" /> Fotos do serviço (opcional, até {MAX_FOTOS})
            </label>

            {fotoPreviews.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                {fotoPreviews.map((url, i) => (
                  <div key={url} className="relative aspect-square">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => removeFoto(i)}
                      aria-label="Remover foto"
                      className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {fotos.length < MAX_FOTOS && (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-3 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                <Camera className="w-4 h-4" />
                {fotos.length > 0 ? `Adicionar mais (${fotos.length}/${MAX_FOTOS})` : "Tirar foto ou escolher da galeria"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFotosChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-base font-medium px-4 py-3 rounded-lg"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? "Enviando foto..." : saving ? "Enviando..." : "Enviar serviço"}
          </button>
        </div>
      )}

      {tab === "financeiro" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">A receber</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{formatBRL(aReceber)}</p>
            </div>
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Recebido este mês</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatBRL(recebidoMes)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800">Histórico de pagamentos</h3>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Período</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fechamentoDataInicio}
                    onChange={(e) => setFechamentoDataInicio(e.target.value)}
                    className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <span className="text-xs text-gray-400 shrink-0">até</span>
                  <input
                    type="date"
                    value={fechamentoDataFim}
                    onChange={(e) => setFechamentoDataFim(e.target.value)}
                    className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 py-6 justify-center text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
                </div>
              ) : fechamentosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {temFiltroFechamento ? "Nenhum pagamento encontrado para o período." : "Nenhum pagamento fechado ainda."}
                </div>
              ) : (
                <div className="space-y-2">
                  {fechamentosFiltrados.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 border rounded-lg p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{f.mes_referencia}</p>
                        <p className="text-xs text-gray-500">Pago em {new Date(f.data_fechamento).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <span className="font-semibold text-green-700">{formatBRL(f.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "meus-servicos" && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800">Meus serviços</h3>
          </div>
          <div className="p-5 space-y-3">
            <input
              placeholder="Buscar por cliente, endereço ou tipo de serviço"
              value={buscaServico}
              onChange={(e) => setBuscaServico(e.target.value)}
              className="w-full min-w-0 h-11 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Período</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={servicoDataInicio}
                  onChange={(e) => setServicoDataInicio(e.target.value)}
                  className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-xs text-gray-400 shrink-0">até</span>
                <input
                  type="date"
                  value={servicoDataFim}
                  onChange={(e) => setServicoDataFim(e.target.value)}
                  className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-gray-400 py-6 justify-center text-sm">
                <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
              </div>
            ) : servicosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                {temFiltroServico ? "Nenhum serviço encontrado para esse filtro." : "Nenhum serviço registrado ainda."}
              </div>
            ) : (
              <>
                {/* Cards — mobile */}
                <div className="space-y-2 md:hidden">
                  {servicosFiltrados.map((s) => (
                    <div key={s.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-800 text-sm">{s.tipo_servico_nome}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{s.cliente}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{s.data_servico}</span>
                        <span className="font-medium text-gray-700">{formatBRL(valorDe(s))}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabela — desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left py-2 pr-4 font-medium">Tipo</th>
                        <th className="text-left py-2 pr-4 font-medium">Cliente</th>
                        <th className="text-left py-2 pr-4 font-medium">Data</th>
                        <th className="text-left py-2 pr-4 font-medium">Valor</th>
                        <th className="text-left py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicosFiltrados.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2.5 pr-4 font-medium text-gray-800">{s.tipo_servico_nome}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{s.cliente}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{s.data_servico}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{formatBRL(valorDe(s))}</td>
                          <td className="py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                              {STATUS_LABEL[s.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// Visão do Auditor de Serviço
// =====================
function AuditorServicoView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"fila" | "historico">("fila");
  const [fila, setFila] = useState<ServicoFinanceiro[]>([]);
  const [historico, setHistorico] = useState<ServicoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejeitando, setRejeitando] = useState<ServicoFinanceiro | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [f, h] = await Promise.all([listServicosPendentesAuditoria(), listServicosAuditadosPor(user.uid)]);
      setFila(f);
      setHistorico(h);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function aprovar(s: ServicoFinanceiro) {
    if (!user) return;
    setSaving(true);
    try { await auditarServico(s.id, "aprovado", user.uid); await load(); }
    finally { setSaving(false); }
  }

  async function confirmarRejeicao() {
    if (!user || !rejeitando) return;
    setSaving(true);
    try {
      await auditarServico(rejeitando.id, "rejeitado", user.uid, motivo.trim() || undefined);
      setRejeitando(null);
      setMotivo("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const lista = tab === "fila" ? fila : historico;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("fila")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "fila" ? "bg-orange-600 text-white" : "bg-white border text-gray-600"}`}
        >
          Fila ({fila.length})
        </button>
        <button
          onClick={() => setTab("historico")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "historico" ? "bg-orange-600 text-white" : "bg-white border text-gray-600"}`}
        >
          <History className="w-4 h-4" /> Histórico
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm text-center py-10 text-gray-400 text-sm">
          {tab === "fila" ? "Nenhum serviço pendente de auditoria." : "Nenhum serviço auditado ainda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lista.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{s.tipo_servico_nome}</p>
                  <p className="text-xs text-gray-500">Técnico: {s.tecnico_nome}</p>
                </div>
                {tab === "historico" && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600 space-y-0.5">
                <p><span className="text-gray-400">Cliente:</span> {s.cliente}</p>
                <p><span className="text-gray-400">Endereço:</span> {s.endereco}</p>
                <p><span className="text-gray-400">Data:</span> {s.data_servico}</p>
                {s.observacoes && <p><span className="text-gray-400">Obs:</span> {s.observacoes}</p>}
                {s.motivo_rejeicao && <p className="text-red-600"><span className="text-gray-400">Motivo:</span> {s.motivo_rejeicao}</p>}
              </div>
              {s.foto_urls && s.foto_urls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {s.foto_urls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Evidência ${i + 1}`} className="w-16 h-16 rounded-lg border object-cover" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <ImageIcon className="w-3.5 h-3.5" /> Sem foto
                </div>
              )}
              {tab === "fila" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => aprovar(s)}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium py-1.5 rounded-lg"
                  >
                    <CheckCircle className="w-4 h-4" /> Aprovar
                  </button>
                  <button
                    onClick={() => { setRejeitando(s); setMotivo(""); }}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-medium py-1.5 rounded-lg"
                  >
                    <XCircle className="w-4 h-4" /> Rejeitar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejeitando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Rejeitar serviço</h3>
            <p className="text-sm text-gray-600">{rejeitando.tipo_servico_nome} — {rejeitando.tecnico_nome}</p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo da rejeição (opcional)"
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={() => setRejeitando(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmarRejeicao}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// Visão do Financeiro (e ADM)
// =====================
function FinanceiroAdminView() {
  const [tab, setTab] = useState<"fechamento" | "auditoria" | "cadastros" | "historico">("fechamento");

  const chips: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: "fechamento", label: "Fechamento", icon: <Wallet className="w-4 h-4" /> },
    { key: "auditoria", label: "Auditoria", icon: <CheckCircle className="w-4 h-4" /> },
    { key: "cadastros", label: "Cadastros", icon: <Settings className="w-4 h-4" /> },
    { key: "historico", label: "Histórico", icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === c.key ? "bg-emerald-600 text-white" : "bg-white border text-gray-600"}`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {tab === "fechamento" && <FechamentoPagamentoView />}
      {tab === "auditoria" && <AuditorServicoView />}
      {tab === "cadastros" && <CadastrosFinanceiro />}
      {tab === "historico" && <HistoricoFechamentos />}
    </div>
  );
}

type ModalStateTipo = { mode: "create" } | { mode: "edit"; tipo: TipoServicoFinanceiro };

function CadastrosFinanceiro() {
  const [tipos, setTipos] = useState<TipoServicoFinanceiro[]>([]);
  const [tecnicos, setTecnicos] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalStateTipo | null>(null);
  const [form, setForm] = useState({ nome: "", valor: "", ativo: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TipoServicoFinanceiro | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, u] = await Promise.all([listTiposServico(), listUsers()]);
      setTipos(t);
      setTecnicos(u.filter((x) => x.cargo === "tecnico"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm({ nome: "", valor: "", ativo: true });
    setFormError(null);
    setModal({ mode: "create" });
  }

  function openEdit(t: TipoServicoFinanceiro) {
    setForm({ nome: t.nome, valor: String(t.valor), ativo: t.ativo });
    setFormError(null);
    setModal({ mode: "edit", tipo: t });
  }

  async function handleSave() {
    if (!form.nome.trim()) { setFormError("Informe o nome."); return; }
    const valor = parseFloat(form.valor.replace(",", "."));
    if (Number.isNaN(valor) || valor <= 0) { setFormError("Informe um valor válido."); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (modal?.mode === "create") {
        await createTipoServico(form.nome.trim(), valor);
      } else if (modal?.mode === "edit") {
        await updateTipoServico(modal.tipo.id, { nome: form.nome.trim(), valor, ativo: form.ativo });
      }
      setModal(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TipoServicoFinanceiro) {
    setSaving(true);
    try {
      await deleteTipoServico(t.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-gray-800">Tipos de serviço e valores</h3>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Novo tipo
          </button>
        </div>
        <div className="p-5">
          {tipos.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum tipo de serviço cadastrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left py-2 pr-4 font-medium">Nome</th>
                    <th className="text-left py-2 pr-4 font-medium">Valor</th>
                    <th className="text-left py-2 pr-4 font-medium">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tipos.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-800">{t.nome}</td>
                      <td className="py-2.5 pr-4 text-gray-600">{formatBRL(t.valor)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {t.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDelete(t)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Excluir">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-800">Função dos técnicos</h3>
        </div>
        <div className="p-5 space-y-2">
          {tecnicos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Nenhum técnico cadastrado. Crie usuários com o cargo &quot;Técnico&quot; na página de Administração.
            </p>
          ) : (
            <div className="space-y-2">
              {tecnicos.map((t) => (
                <div key={t.uid} className="flex items-center justify-between gap-2 p-2 rounded-lg border">
                  <span className="text-sm font-medium text-gray-700">{t.nome}</span>
                  {t.funcao_tecnico ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-100 text-cyan-700">{t.funcao_tecnico}</span>
                  ) : (
                    <span className="text-xs text-gray-300">Sem função definida</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">A função é definida em Administração → Gestão de Usuários.</p>
        </div>
      </div>
    </div>

    {/* Modal criar / editar */}
    {modal && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
          <h3 className="font-semibold text-gray-800">
            {modal.mode === "create" ? "Novo tipo de serviço" : "Editar tipo de serviço"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nome</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ex: Instalação FTTH"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor</label>
              <input
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="0,00"
              />
            </div>
            {modal.mode === "edit" && (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                />
                Ativo
              </label>
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
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
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
          <h3 className="font-semibold text-gray-800">Excluir tipo de serviço?</h3>
          <p className="text-sm text-gray-600">
            <strong>{confirmDelete.nome}</strong> será removido da tabela de preços. Serviços já lançados com esse tipo não são afetados.
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

function FechamentoPagamentoView() {
  const { user } = useAuth();
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [aprovados, setAprovados] = useState<ServicoFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [fechando, setFechando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await listServicosAprovadosNaoPagos();
      setAprovados(s);
      setValores(Object.fromEntries(s.map((x) => [x.id, String(x.valor_ajustado ?? x.valor)])));
      setSelecionados(Object.fromEntries(s.map((x) => [x.id, true])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const porTecnico = new Map<string, { tecnico_nome: string; itens: ServicoFinanceiro[] }>();
  for (const s of aprovados) {
    if (!porTecnico.has(s.tecnico_uid)) porTecnico.set(s.tecnico_uid, { tecnico_nome: s.tecnico_nome, itens: [] });
    porTecnico.get(s.tecnico_uid)!.itens.push(s);
  }

  async function fechar(tecnicoUid: string, tecnicoNome: string, itens: ServicoFinanceiro[]) {
    if (!user) return;
    const selecionadosItens = itens.filter((i) => selecionados[i.id]);
    if (selecionadosItens.length === 0) return;
    setFechando(tecnicoUid);
    try {
      await fecharPagamentoMensal({
        tecnico_uid: tecnicoUid,
        tecnico_nome: tecnicoNome,
        mes_referencia: mes,
        servicos: selecionadosItens.map((i) => ({ id: i.id, valorFinal: parseFloat((valores[i.id] ?? "").replace(",", ".")) || i.valor })),
        fechado_por: user.uid,
      });
      await load();
    } finally {
      setFechando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
        <label className="text-sm text-gray-600">Mês de referência do fechamento</label>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : porTecnico.size === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm text-center py-10 text-gray-400 text-sm">
          Nenhum serviço aprovado aguardando pagamento.
        </div>
      ) : (
        Array.from(porTecnico.entries()).map(([uid, { tecnico_nome, itens }]) => {
          const total = itens
            .filter((i) => selecionados[i.id])
            .reduce((sum, i) => sum + (parseFloat((valores[i.id] ?? "").replace(",", ".")) || i.valor), 0);
          return (
            <div key={uid} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">{tecnico_nome}</h3>
                <span className="text-sm font-semibold text-emerald-700">{formatBRL(total)}</span>
              </div>
              <div className="p-5 space-y-2">
                {itens.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selecionados[i.id] ?? false}
                      onChange={(e) => setSelecionados((f) => ({ ...f, [i.id]: e.target.checked }))}
                    />
                    <span className="flex-1 text-gray-700">{i.tipo_servico_nome} — {i.cliente} ({i.data_servico})</span>
                    <input
                      value={valores[i.id] ?? ""}
                      onChange={(e) => setValores((f) => ({ ...f, [i.id]: e.target.value }))}
                      className="w-24 px-2 py-1 text-sm border rounded-lg text-right"
                    />
                  </div>
                ))}
                <button
                  onClick={() => fechar(uid, tecnico_nome, itens)}
                  disabled={fechando === uid}
                  className="mt-2 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {fechando === uid && <Loader2 className="w-4 h-4 animate-spin" />}
                  Fechar pagamento do mês
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function HistoricoFechamentos() {
  const [fechamentos, setFechamentos] = useState<FechamentoPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listFechamentos().then(setFechamentos).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="p-5">
        {fechamentos.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">Nenhum pagamento fechado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-2 pr-4 font-medium">Técnico</th>
                  <th className="text-left py-2 pr-4 font-medium">Mês</th>
                  <th className="text-left py-2 pr-4 font-medium">Total</th>
                  <th className="text-left py-2 pr-4 font-medium">Fechado em</th>
                </tr>
              </thead>
              <tbody>
                {fechamentos.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{f.tecnico_nome}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{f.mes_referencia}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{formatBRL(f.total)}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{new Date(f.data_fechamento).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
