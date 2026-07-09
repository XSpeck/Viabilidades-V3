"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess, getCargo } from "@/lib/access";
import {
  listTiposServico, createTipoServico, updateTipoServico, deleteTipoServico,
  criarServicoFinanceiro, updateServicoFinanceiro, deleteServicoFinanceiro,
  listServicosPorTecnico, listServicosPendentesAuditoria,
  listServicosAuditadosPor, listServicosAprovadosNaoPagos, auditarServico, atualizarNumeroOS,
  fecharPagamentoMensal, listFechamentos, listServicosPagos,
} from "@/lib/financeiro";
import { uploadFoto } from "@/lib/cloudinary";
import { listUsers } from "@/lib/users";
import type { AppUser, TipoServicoFinanceiro, ServicoFinanceiro, StatusServicoFinanceiro, FechamentoPagamento } from "@/types";
import {
  Wallet, Camera, CheckCircle, XCircle, Loader2, Plus, History,
  Users as UsersIcon, Settings, ClipboardList, ImageIcon, Trash2, Pencil, AlertTriangle, X,
  ChevronLeft, ChevronRight, Copy,
} from "lucide-react";

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDataBR(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}

function formatMesReferenciaBR(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}/${ano}`;
}

function dataHaDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function FotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="Foto ampliada"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
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
  const [financeiroSubTab, setFinanceiroSubTab] = useState<"aguardando" | "historico">("aguardando");
  const [tipos, setTipos] = useState<TipoServicoFinanceiro[]>([]);
  const [servicos, setServicos] = useState<ServicoFinanceiro[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    tipo_servico_id: "", cliente: "",
    data_servico: new Date().toISOString().slice(0, 10), observacoes: "",
  });
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [fotosExistentes, setFotosExistentes] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [reenviarDeId, setReenviarDeId] = useState<string | null>(null);
  const [confirmExcluirServico, setConfirmExcluirServico] = useState<ServicoFinanceiro | null>(null);
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
      const limite = MAX_FOTOS - fotosExistentes.length;
      if (combined.length > limite) {
        setError(`Máximo de ${MAX_FOTOS} fotos por serviço.`);
        return combined.slice(0, limite);
      }
      return combined;
    });
    e.target.value = "";
  }

  function removeFoto(index: number) {
    setFotos((prev) => prev.filter((_, i) => i !== index));
  }

  function removeFotoExistente(index: number) {
    setFotosExistentes((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setForm({ tipo_servico_id: "", cliente: "", data_servico: new Date().toISOString().slice(0, 10), observacoes: "" });
    setFotos([]);
    setFotosExistentes([]);
    setEditandoId(null);
    setReenviarDeId(null);
    setError(null);
  }

  function iniciarEdicao(s: ServicoFinanceiro) {
    setForm({
      tipo_servico_id: s.tipo_servico_id,
      cliente: s.cliente,
      data_servico: s.data_servico,
      observacoes: s.observacoes ?? "",
    });
    setFotos([]);
    setFotosExistentes(s.foto_urls ?? []);
    setEditandoId(s.id);
    setReenviarDeId(null);
    setError(null);
    setServicoSelecionado(null);
    setTab("registro");
  }

  function iniciarReenvio(s: ServicoFinanceiro) {
    setForm({
      tipo_servico_id: s.tipo_servico_id,
      cliente: s.cliente,
      data_servico: new Date().toISOString().slice(0, 10),
      observacoes: s.motivo_rejeicao ? `Reenvio — motivo da rejeição anterior: ${s.motivo_rejeicao}` : "",
    });
    setFotos([]);
    setFotosExistentes([]);
    setEditandoId(null);
    setReenviarDeId(s.id);
    setError(null);
    setServicoSelecionado(null);
    setTab("registro");
  }

  async function handleExcluirServico(s: ServicoFinanceiro) {
    setSaving(true);
    try {
      await deleteServicoFinanceiro(s.id, s.foto_urls);
      setConfirmExcluirServico(null);
      setServicoSelecionado(null);
      await load();
    } finally {
      setSaving(false);
    }
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

  // ── Filtros: A receber (serviços aprovados aguardando pagamento) ──
  const [pendDataInicio, setPendDataInicio] = useState(() => dataHaDias(30));
  const [pendDataFim, setPendDataFim] = useState(hojeISO);
  const [paginaAguardando, setPaginaAguardando] = useState(1);

  const aprovados = servicos.filter((s) => s.status === "aprovado");

  const aprovadosFiltrados = aprovados.filter((s) => {
    if (pendDataInicio && s.data_servico < pendDataInicio) return false;
    if (pendDataFim && s.data_servico > pendDataFim) return false;
    return true;
  });

  const totalAprovadosFiltrados = aprovadosFiltrados.reduce((sum, s) => sum + valorDe(s), 0);
  const temFiltroPendente = !!(pendDataInicio || pendDataFim);

  const POR_PAGINA = 20;
  const totalPaginasAguardando = Math.max(1, Math.ceil(aprovadosFiltrados.length / POR_PAGINA));
  const paginaAguardandoAtual = Math.min(paginaAguardando, totalPaginasAguardando);
  const aguardandoPagina = aprovadosFiltrados.slice(
    (paginaAguardandoAtual - 1) * POR_PAGINA,
    paginaAguardandoAtual * POR_PAGINA
  );

  useEffect(() => { setPaginaAguardando(1); }, [pendDataInicio, pendDataFim]);

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
        !s.tipo_servico_nome.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const temFiltroServico = !!(buscaServico.trim() || servicoDataInicio || servicoDataFim);

  const SERVICOS_POR_PAGINA = 10;
  const [paginaServicos, setPaginaServicos] = useState(1);
  const [servicoSelecionado, setServicoSelecionado] = useState<ServicoFinanceiro | null>(null);
  const [fechamentoSelecionado, setFechamentoSelecionado] = useState<FechamentoPagamento | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const totalPaginasServicos = Math.max(1, Math.ceil(servicosFiltrados.length / SERVICOS_POR_PAGINA));
  const paginaServicosAtual = Math.min(paginaServicos, totalPaginasServicos);
  const servicosPagina = servicosFiltrados.slice(
    (paginaServicosAtual - 1) * SERVICOS_POR_PAGINA,
    paginaServicosAtual * SERVICOS_POR_PAGINA
  );

  useEffect(() => { setPaginaServicos(1); }, [buscaServico, servicoDataInicio, servicoDataFim]);

  // ── Filtros: Parte Financeira (histórico de pagamentos) ──
  const [fechamentoDataInicio, setFechamentoDataInicio] = useState(() => dataHaDias(30));
  const [fechamentoDataFim, setFechamentoDataFim] = useState(hojeISO);
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const fechamentosFiltrados = fechamentos.filter((f) => {
    const data = f.data_fechamento.slice(0, 10);
    if (fechamentoDataInicio && data < fechamentoDataInicio) return false;
    if (fechamentoDataFim && data > fechamentoDataFim) return false;
    return true;
  });

  const temFiltroFechamento = !!(fechamentoDataInicio || fechamentoDataFim);
  const totalFechamentosFiltrados = fechamentosFiltrados.reduce((sum, f) => sum + f.total, 0);

  const totalPaginasHistorico = Math.max(1, Math.ceil(fechamentosFiltrados.length / POR_PAGINA));
  const paginaHistoricoAtual = Math.min(paginaHistorico, totalPaginasHistorico);
  const historicoPagina = fechamentosFiltrados.slice(
    (paginaHistoricoAtual - 1) * POR_PAGINA,
    paginaHistoricoAtual * POR_PAGINA
  );

  useEffect(() => { setPaginaHistorico(1); }, [fechamentoDataInicio, fechamentoDataFim]);

  async function handleSubmit() {
    if (!user) return;
    const tipo = tipos.find((t) => t.id === form.tipo_servico_id);
    if (!tipo) { setError("Selecione o tipo de serviço."); return; }
    if (!form.cliente.trim() || !form.data_servico) {
      setError("Preencha cliente e data.");
      return;
    }
    if (!form.observacoes.trim()) {
      setError("Preencha a descrição do serviço.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let novasUrls: string[] = [];
      if (fotos.length > 0) {
        setUploading(true);
        novasUrls = await Promise.all(fotos.map((f) => uploadFoto(f)));
        setUploading(false);
      }
      const foto_urls = [...fotosExistentes, ...novasUrls];

      if (editandoId) {
        await updateServicoFinanceiro(editandoId, {
          tipo_servico_id: tipo.id,
          tipo_servico_nome: tipo.nome,
          valor: tipo.valor,
          cliente: form.cliente.trim(),
          data_servico: form.data_servico,
          foto_urls,
          observacoes: form.observacoes.trim(),
        });
      } else {
        await criarServicoFinanceiro({
          tecnico_uid: user.uid,
          tecnico_nome: user.nome,
          tipo_servico_id: tipo.id,
          tipo_servico_nome: tipo.nome,
          valor: tipo.valor,
          cliente: form.cliente.trim(),
          data_servico: form.data_servico,
          foto_urls: foto_urls.length > 0 ? foto_urls : undefined,
          observacoes: form.observacoes.trim(),
          reenviado_de: reenviarDeId ?? undefined,
        });
      }
      resetForm();
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
    { key: "financeiro", label: "Financeiro" },
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              {editandoId ? "Editar serviço" : reenviarDeId ? "Reenviar serviço rejeitado" : "Registrar serviço prestado"}
            </h3>
            {(editandoId || reenviarDeId) && (
              <button onClick={resetForm} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Cancelar
              </button>
            )}
          </div>
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
              className="w-full min-w-0 h-11 px-3 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:col-span-2"
            />
          </div>
          <textarea
            placeholder="Descrição do serviço"
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            className="w-full px-3 py-2.5 text-base border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            rows={2}
          />
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-1.5">
              <Camera className="w-4 h-4" /> Fotos do serviço (opcional, até {MAX_FOTOS})
            </label>

            {(fotosExistentes.length > 0 || fotoPreviews.length > 0) && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-2">
                {fotosExistentes.map((url, i) => (
                  <div key={url} className="relative aspect-square">
                    <img src={url} alt={`Foto existente ${i + 1}`} className="w-full h-full object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => removeFotoExistente(i)}
                      aria-label="Remover foto"
                      className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
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

            {fotosExistentes.length + fotos.length < MAX_FOTOS && (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-3 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                <Camera className="w-4 h-4" />
                {fotosExistentes.length + fotos.length > 0
                  ? `Adicionar mais (${fotosExistentes.length + fotos.length}/${MAX_FOTOS})`
                  : "Tirar foto ou escolher da galeria"}
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
            {uploading
              ? "Enviando foto..."
              : saving
              ? "Enviando..."
              : editandoId
              ? "Salvar alterações"
              : reenviarDeId
              ? "Reenviar serviço"
              : "Enviar serviço"}
          </button>
        </div>
      )}

      {tab === "financeiro" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFinanceiroSubTab("aguardando")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-medium ${financeiroSubTab === "aguardando" ? "bg-emerald-600 text-white" : "bg-white border text-gray-600"}`}
            >
              Aguardando pagamento
            </button>
            <button
              onClick={() => setFinanceiroSubTab("historico")}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-medium ${financeiroSubTab === "historico" ? "bg-emerald-600 text-white" : "bg-white border text-gray-600"}`}
            >
              Histórico de pagamentos
            </button>
          </div>

          {financeiroSubTab === "aguardando" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Serviços</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-1">{aprovadosFiltrados.length}</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total a receber</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">{formatBRL(totalAprovadosFiltrados)}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-gray-50">
                  <h3 className="font-semibold text-gray-800">Serviços aprovados</h3>
                  <p className="text-xs text-gray-500">Já aprovados, aguardando o próximo fechamento</p>
                </div>
                <div className="p-5 space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data do serviço</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={pendDataInicio}
                        onChange={(e) => setPendDataInicio(e.target.value)}
                        className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <span className="text-xs text-gray-400 shrink-0">até</span>
                      <input
                        type="date"
                        value={pendDataFim}
                        onChange={(e) => setPendDataFim(e.target.value)}
                        className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex items-center gap-2 text-gray-400 py-6 justify-center text-sm">
                      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
                    </div>
                  ) : aprovados.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Nenhum serviço aprovado aguardando pagamento.</div>
                  ) : aprovadosFiltrados.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      {temFiltroPendente ? "Nenhum serviço encontrado para esse filtro." : "Nenhum serviço aprovado aguardando pagamento."}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {aguardandoPagina.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setServicoSelecionado(s)}
                            className="w-full flex items-center justify-between gap-2 border rounded-lg p-3 text-sm text-left hover:bg-gray-50 active:bg-gray-100"
                          >
                            <div>
                              <p className="font-medium text-gray-800">{s.tipo_servico_nome}</p>
                              <p className="text-xs text-gray-500">{s.cliente} · {formatDataBR(s.data_servico)}</p>
                            </div>
                            <span className="font-semibold text-blue-700">{formatBRL(valorDe(s))}</span>
                          </button>
                        ))}
                      </div>

                      {totalPaginasAguardando > 1 && (
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => setPaginaAguardando((p) => Math.max(1, p - 1))}
                            disabled={paginaAguardandoAtual === 1}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                          >
                            <ChevronLeft className="w-4 h-4" /> Anterior
                          </button>
                          <span className="text-xs text-gray-500">
                            Página {paginaAguardandoAtual} de {totalPaginasAguardando}
                          </span>
                          <button
                            onClick={() => setPaginaAguardando((p) => Math.min(totalPaginasAguardando, p + 1))}
                            disabled={paginaAguardandoAtual === totalPaginasAguardando}
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
            </div>
          )}

          {financeiroSubTab === "historico" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Pagamentos</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-1">{fechamentosFiltrados.length}</p>
                </div>
                <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Total recebido</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600 mt-1">{formatBRL(totalFechamentosFiltrados)}</p>
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
                    <>
                      <div className="space-y-2">
                        {historicoPagina.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setFechamentoSelecionado(f)}
                            className="w-full flex items-center justify-between gap-2 border rounded-lg p-3 text-sm text-left hover:bg-gray-50 active:bg-gray-100"
                          >
                            <div>
                              <p className="font-medium text-gray-800">{formatMesReferenciaBR(f.mes_referencia)}</p>
                              <p className="text-xs text-gray-500">Pago em {new Date(f.data_fechamento).toLocaleDateString("pt-BR")}</p>
                              <p className="text-xs text-gray-500">{f.servicos_ids.length} serviço{f.servicos_ids.length === 1 ? "" : "s"}</p>
                            </div>
                            <span className="font-semibold text-green-700">{formatBRL(f.total)}</span>
                          </button>
                        ))}
                      </div>

                      {totalPaginasHistorico > 1 && (
                        <div className="flex items-center justify-between pt-1">
                          <button
                            onClick={() => setPaginaHistorico((p) => Math.max(1, p - 1))}
                            disabled={paginaHistoricoAtual === 1}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                          >
                            <ChevronLeft className="w-4 h-4" /> Anterior
                          </button>
                          <span className="text-xs text-gray-500">
                            Página {paginaHistoricoAtual} de {totalPaginasHistorico}
                          </span>
                          <button
                            onClick={() => setPaginaHistorico((p) => Math.min(totalPaginasHistorico, p + 1))}
                            disabled={paginaHistoricoAtual === totalPaginasHistorico}
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
            </div>
          )}
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
                  {servicosPagina.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setServicoSelecionado(s)}
                      className="w-full text-left border rounded-lg p-3 space-y-1 hover:bg-gray-50 active:bg-gray-100"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-gray-800 text-sm">{s.tipo_servico_nome}</p>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{s.cliente}</p>
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{formatDataBR(s.data_servico)}</span>
                        <span className="font-medium text-gray-700">{formatBRL(valorDe(s))}</span>
                      </div>
                    </button>
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
                      {servicosPagina.map((s) => (
                        <tr
                          key={s.id}
                          onClick={() => setServicoSelecionado(s)}
                          className="border-b last:border-0 cursor-pointer hover:bg-gray-50"
                        >
                          <td className="py-2.5 pr-4 font-medium text-gray-800">{s.tipo_servico_nome}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{s.cliente}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{formatDataBR(s.data_servico)}</td>
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

                {totalPaginasServicos > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setPaginaServicos((p) => Math.max(1, p - 1))}
                      disabled={paginaServicosAtual === 1}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>
                    <span className="text-xs text-gray-500">
                      Página {paginaServicosAtual} de {totalPaginasServicos}
                    </span>
                    <button
                      onClick={() => setPaginaServicos((p) => Math.min(totalPaginasServicos, p + 1))}
                      disabled={paginaServicosAtual === totalPaginasServicos}
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
      )}

      {/* Modal de detalhes do serviço */}
      {servicoSelecionado && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setServicoSelecionado(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-800">{servicoSelecionado.tipo_servico_nome}</h3>
              <button
                onClick={() => setServicoSelecionado(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[servicoSelecionado.status]}`}>
                {STATUS_LABEL[servicoSelecionado.status]}
              </span>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">Cliente</p>
                  <p className="font-medium text-gray-800">{servicoSelecionado.cliente}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Data do serviço</p>
                  <p className="font-medium text-gray-800">{formatDataBR(servicoSelecionado.data_servico)}</p>
                </div>
                {servicoSelecionado.endereco && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-xs">Endereço</p>
                    <p className="font-medium text-gray-800">{servicoSelecionado.endereco}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-xs">Valor</p>
                  <p className="font-medium text-gray-800">{formatBRL(valorDe(servicoSelecionado))}</p>
                </div>
                {servicoSelecionado.pago_em && (
                  <div>
                    <p className="text-gray-400 text-xs">Pago em</p>
                    <p className="font-medium text-gray-800">{new Date(servicoSelecionado.pago_em).toLocaleDateString("pt-BR")}</p>
                  </div>
                )}
              </div>

              {servicoSelecionado.observacoes && (
                <div className="text-sm">
                  <p className="text-gray-400 text-xs mb-0.5">Descrição do serviço</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{servicoSelecionado.observacoes}</p>
                </div>
              )}

              {servicoSelecionado.motivo_rejeicao && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs font-medium mb-0.5">Motivo da rejeição</p>
                  <p className="text-red-600 text-sm whitespace-pre-wrap">{servicoSelecionado.motivo_rejeicao}</p>
                </div>
              )}

              {servicoSelecionado.observacao_auditoria && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-green-700 text-xs font-medium mb-0.5">Observação da auditoria</p>
                  <p className="text-green-700 text-sm whitespace-pre-wrap">{servicoSelecionado.observacao_auditoria}</p>
                </div>
              )}

              <div>
                <p className="text-gray-400 text-xs mb-1.5">Fotos</p>
                {servicoSelecionado.foto_urls && servicoSelecionado.foto_urls.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {servicoSelecionado.foto_urls.map((url, i) => (
                      <button key={url} onClick={() => setFotoAmpliada(url)}>
                        <img
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <ImageIcon className="w-3.5 h-3.5" /> Sem foto
                  </div>
                )}
              </div>

              {servicoSelecionado.status === "pendente_auditoria" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => iniciarEdicao(servicoSelecionado)}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-indigo-300 text-indigo-600 hover:bg-indigo-50 text-sm font-medium py-2 rounded-lg"
                  >
                    <Pencil className="w-4 h-4" /> Editar
                  </button>
                  <button
                    onClick={() => setConfirmExcluirServico(servicoSelecionado)}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir
                  </button>
                </div>
              )}

              {servicoSelecionado.status === "rejeitado" && (
                <button
                  onClick={() => iniciarReenvio(servicoSelecionado)}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 rounded-lg"
                >
                  <Copy className="w-4 h-4" /> Duplicar e reenviar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhes do fechamento */}
      {fechamentoSelecionado && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setFechamentoSelecionado(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-800">Pagamento — {formatMesReferenciaBR(fechamentoSelecionado.mes_referencia)}</h3>
              <button
                onClick={() => setFechamentoSelecionado(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">Pago em</p>
                  <p className="font-medium text-gray-800">
                    {new Date(fechamentoSelecionado.data_fechamento).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Total</p>
                  <p className="font-medium text-green-700">{formatBRL(fechamentoSelecionado.total)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs">Quantidade de serviços</p>
                  <p className="font-medium text-gray-800">{fechamentoSelecionado.servicos_ids.length}</p>
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-xs mb-1.5">Serviços incluídos</p>
                <div className="space-y-2">
                  {servicos
                    .filter((s) => s.fechamento_id === fechamentoSelecionado.id)
                    .map((s) => (
                      <div key={s.id} className="border rounded-lg p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-800">{s.tipo_servico_nome}</p>
                          <span className="font-medium text-gray-700 shrink-0">{formatBRL(valorDe(s))}</span>
                        </div>
                        <p className="text-gray-600">{s.cliente}</p>
                        <p className="text-xs text-gray-500">{formatDataBR(s.data_servico)}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmExcluirServico && (
        <div className="fixed inset-0 bg-black/40 z-[55] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Excluir serviço?</h3>
            <p className="text-sm text-gray-600">
              <strong>{confirmExcluirServico.tipo_servico_nome}</strong> — {confirmExcluirServico.cliente} será removido. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmExcluirServico(null)}
                className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExcluirServico(confirmExcluirServico)}
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

      {fotoAmpliada && <FotoLightbox url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
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
  const [aprovando, setAprovando] = useState<ServicoFinanceiro | null>(null);
  const [observacaoAprovacao, setObservacaoAprovacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [servicoDetalhe, setServicoDetalhe] = useState<ServicoFinanceiro | null>(null);
  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [auditDataInicio, setAuditDataInicio] = useState("");
  const [auditDataFim, setAuditDataFim] = useState("");
  const [numeroOS, setNumeroOS] = useState("");
  const [savingOS, setSavingOS] = useState(false);

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

  async function confirmarAprovacao() {
    if (!user || !aprovando) return;
    setSaving(true);
    try {
      await auditarServico(aprovando.id, "aprovado", user.uid, observacaoAprovacao.trim() || undefined);
      setAprovando(null);
      setObservacaoAprovacao("");
      setServicoDetalhe(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function confirmarRejeicao() {
    if (!user || !rejeitando) return;
    setSaving(true);
    try {
      await auditarServico(rejeitando.id, "rejeitado", user.uid, motivo.trim() || undefined);
      setRejeitando(null);
      setMotivo("");
      setServicoDetalhe(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function salvarNumeroOS() {
    if (!servicoDetalhe) return;
    setSavingOS(true);
    try {
      await atualizarNumeroOS(servicoDetalhe.id, numeroOS);
      setServicoDetalhe({ ...servicoDetalhe, numero_os: numeroOS.trim() || undefined });
      await load();
    } finally {
      setSavingOS(false);
    }
  }

  const lista = tab === "fila" ? fila : historico;
  const tecnicos = Array.from(new Set(lista.map((s) => s.tecnico_nome))).sort();
  const listaFiltrada = lista.filter((s) => {
    if (filtroTecnico && s.tecnico_nome !== filtroTecnico) return false;
    if (auditDataInicio && s.data_servico < auditDataInicio) return false;
    if (auditDataFim && s.data_servico > auditDataFim) return false;
    return true;
  });
  const temFiltroAuditoria = !!(filtroTecnico || auditDataInicio || auditDataFim);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => { setTab("fila"); setFiltroTecnico(""); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "fila" ? "bg-orange-600 text-white" : "bg-white border text-gray-600"}`}
        >
          Fila ({fila.length})
        </button>
        <button
          onClick={() => { setTab("historico"); setFiltroTecnico(""); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === "historico" ? "bg-orange-600 text-white" : "bg-white border text-gray-600"}`}
        >
          <History className="w-4 h-4" /> Histórico
        </button>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <select
          value={filtroTecnico}
          onChange={(e) => setFiltroTecnico(e.target.value)}
          className="w-full h-10 px-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Período</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={auditDataInicio}
              onChange={(e) => setAuditDataInicio(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <span className="text-xs text-gray-400 shrink-0">até</span>
            <input
              type="date"
              value={auditDataFim}
              onChange={(e) => setAuditDataFim(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm text-center py-10 text-gray-400 text-sm">
          {temFiltroAuditoria
            ? "Nenhum serviço encontrado para esse filtro."
            : tab === "fila" ? "Nenhum serviço pendente de auditoria." : "Nenhum serviço auditado ainda."}
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm divide-y">
          {listaFiltrada.map((s) => (
            <button
              key={s.id}
              onClick={() => { setServicoDetalhe(s); setNumeroOS(s.numero_os ?? ""); }}
              className="w-full text-left flex items-center justify-between gap-3 p-4 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{s.tipo_servico_nome}</p>
                <p className="text-xs text-gray-500 truncate">{s.tecnico_nome} · {s.cliente}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">{formatDataBR(s.data_servico)}</span>
                {tab === "historico" && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal de detalhes do serviço */}
      {servicoDetalhe && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setServicoDetalhe(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-800">{servicoDetalhe.tipo_servico_nome}</h3>
              <button
                onClick={() => setServicoDetalhe(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {tab === "historico" && (
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[servicoDetalhe.status]}`}>
                  {STATUS_LABEL[servicoDetalhe.status]}
                </span>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs">Técnico</p>
                  <p className="font-medium text-gray-800">{servicoDetalhe.tecnico_nome}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Cliente</p>
                  <p className="font-medium text-gray-800">{servicoDetalhe.cliente}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Data do serviço</p>
                  <p className="font-medium text-gray-800">{formatDataBR(servicoDetalhe.data_servico)}</p>
                </div>
                {servicoDetalhe.endereco && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-xs">Endereço</p>
                    <p className="font-medium text-gray-800">{servicoDetalhe.endereco}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-400 text-xs mb-1">
                  Nº da OS <span className="normal-case text-gray-400">(identificação no sistema do financeiro)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={numeroOS}
                    onChange={(e) => setNumeroOS(e.target.value)}
                    placeholder="Nº da OS"
                    className="flex-1 min-w-0 h-9 px-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                  <button
                    onClick={salvarNumeroOS}
                    disabled={savingOS || numeroOS.trim() === (servicoDetalhe.numero_os ?? "")}
                    className="shrink-0 flex items-center gap-1.5 px-3 h-9 border border-orange-300 text-orange-600 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium rounded-lg"
                  >
                    {savingOS && <Loader2 className="w-4 h-4 animate-spin" />}
                    Salvar
                  </button>
                </div>
              </div>

              {servicoDetalhe.observacoes && (
                <div className="text-sm">
                  <p className="text-gray-400 text-xs mb-0.5">Descrição do serviço</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{servicoDetalhe.observacoes}</p>
                </div>
              )}

              {servicoDetalhe.motivo_rejeicao && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-xs font-medium mb-0.5">Motivo da rejeição</p>
                  <p className="text-red-600 text-sm whitespace-pre-wrap">{servicoDetalhe.motivo_rejeicao}</p>
                </div>
              )}

              {servicoDetalhe.observacao_auditoria && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-green-700 text-xs font-medium mb-0.5">Observação da auditoria</p>
                  <p className="text-green-700 text-sm whitespace-pre-wrap">{servicoDetalhe.observacao_auditoria}</p>
                </div>
              )}

              <div>
                <p className="text-gray-400 text-xs mb-1.5">Fotos</p>
                {servicoDetalhe.foto_urls && servicoDetalhe.foto_urls.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {servicoDetalhe.foto_urls.map((url, i) => (
                      <button key={url} onClick={() => setFotoAmpliada(url)}>
                        <img src={url} alt={`Evidência ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <ImageIcon className="w-3.5 h-3.5" /> Sem foto
                  </div>
                )}
              </div>

              {tab === "fila" && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setAprovando(servicoDetalhe); setObservacaoAprovacao(""); }}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium py-2 rounded-lg"
                  >
                    <CheckCircle className="w-4 h-4" /> Aprovar
                  </button>
                  <button
                    onClick={() => { setRejeitando(servicoDetalhe); setMotivo(""); }}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm font-medium py-2 rounded-lg"
                  >
                    <XCircle className="w-4 h-4" /> Rejeitar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {aprovando && (
        <div className="fixed inset-0 bg-black/40 z-[55] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Aprovar serviço</h3>
            <p className="text-sm text-gray-600">{aprovando.tipo_servico_nome} — {aprovando.tecnico_nome}</p>
            <textarea
              value={observacaoAprovacao}
              onChange={(e) => setObservacaoAprovacao(e.target.value)}
              placeholder="Observação (opcional)"
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
              rows={3}
            />
            <div className="flex gap-2">
              <button onClick={() => setAprovando(null)} className="flex-1 border border-gray-300 text-gray-600 hover:bg-gray-50 py-2 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmarAprovacao}
                disabled={saving}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white py-2 rounded-lg text-sm font-medium"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {rejeitando && (
        <div className="fixed inset-0 bg-black/40 z-[55] flex items-center justify-center p-4">
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

      {fotoAmpliada && <FotoLightbox url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
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
  const [servicoDetalhe, setServicoDetalhe] = useState<ServicoFinanceiro | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

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
                    <button
                      onClick={() => setServicoDetalhe(i)}
                      className="flex-1 text-left text-gray-700 hover:text-emerald-700 hover:underline truncate"
                    >
                      {i.tipo_servico_nome} — {i.cliente} ({formatDataBR(i.data_servico)}){i.numero_os ? ` · OS ${i.numero_os}` : ""}
                    </button>
                    <input
                      value={valores[i.id] ?? ""}
                      onChange={(e) => setValores((f) => ({ ...f, [i.id]: e.target.value }))}
                      className="w-24 h-9 px-2 text-sm border rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-400"
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

      {/* Modal de detalhes do serviço */}
      {servicoDetalhe && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setServicoDetalhe(null)}
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-800">{servicoDetalhe.tipo_servico_nome}</h3>
              <button
                onClick={() => setServicoDetalhe(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[servicoDetalhe.status]}`}>
                {STATUS_LABEL[servicoDetalhe.status]}
              </span>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs">Técnico</p>
                  <p className="font-medium text-gray-800">{servicoDetalhe.tecnico_nome}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Cliente</p>
                  <p className="font-medium text-gray-800">{servicoDetalhe.cliente}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Data do serviço</p>
                  <p className="font-medium text-gray-800">{formatDataBR(servicoDetalhe.data_servico)}</p>
                </div>
                {servicoDetalhe.endereco && (
                  <div className="col-span-2">
                    <p className="text-gray-400 text-xs">Endereço</p>
                    <p className="font-medium text-gray-800">{servicoDetalhe.endereco}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400 text-xs">Valor</p>
                  <p className="font-medium text-gray-800">{formatBRL(servicoDetalhe.valor_ajustado ?? servicoDetalhe.valor)}</p>
                </div>
                {servicoDetalhe.numero_os && (
                  <div>
                    <p className="text-gray-400 text-xs">Nº da OS</p>
                    <p className="font-medium text-gray-800">{servicoDetalhe.numero_os}</p>
                  </div>
                )}
              </div>

              {servicoDetalhe.observacoes && (
                <div className="text-sm">
                  <p className="text-gray-400 text-xs mb-0.5">Descrição do serviço</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{servicoDetalhe.observacoes}</p>
                </div>
              )}

              {servicoDetalhe.observacao_auditoria && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-green-700 text-xs font-medium mb-0.5">Observação da auditoria</p>
                  <p className="text-green-700 text-sm whitespace-pre-wrap">{servicoDetalhe.observacao_auditoria}</p>
                </div>
              )}

              <div>
                <p className="text-gray-400 text-xs mb-1.5">Fotos</p>
                {servicoDetalhe.foto_urls && servicoDetalhe.foto_urls.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {servicoDetalhe.foto_urls.map((url, i) => (
                      <button key={url} onClick={() => setFotoAmpliada(url)}>
                        <img src={url} alt={`Evidência ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <ImageIcon className="w-3.5 h-3.5" /> Sem foto
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {fotoAmpliada && <FotoLightbox url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
    </div>
  );
}

function HistoricoFechamentos() {
  const [servicos, setServicos] = useState<ServicoFinanceiro[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroTipoServico, setFiltroTipoServico] = useState("");
  const [dataServicoInicio, setDataServicoInicio] = useState("");
  const [dataServicoFim, setDataServicoFim] = useState("");
  const [dataPagamentoInicio, setDataPagamentoInicio] = useState("");
  const [dataPagamentoFim, setDataPagamentoFim] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    Promise.all([listServicosPagos(), listFechamentos()])
      .then(([s, f]) => { setServicos(s); setFechamentos(f); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [filtroTecnico, filtroTipoServico, dataServicoInicio, dataServicoFim, dataPagamentoInicio, dataPagamentoFim]);

  const fechamentoPorId = new Map(fechamentos.map((f) => [f.id, f]));
  const tecnicos = Array.from(new Set(servicos.map((s) => s.tecnico_nome))).sort();
  const tiposServico = Array.from(new Set(servicos.map((s) => s.tipo_servico_nome))).sort();

  const servicosFiltrados = servicos.filter((s) => {
    if (filtroTecnico && s.tecnico_nome !== filtroTecnico) return false;
    if (filtroTipoServico && s.tipo_servico_nome !== filtroTipoServico) return false;
    if (dataServicoInicio && s.data_servico < dataServicoInicio) return false;
    if (dataServicoFim && s.data_servico > dataServicoFim) return false;
    const dataPagamento = (s.pago_em ?? "").slice(0, 10);
    if (dataPagamentoInicio && dataPagamento < dataPagamentoInicio) return false;
    if (dataPagamentoFim && dataPagamento > dataPagamentoFim) return false;
    return true;
  });

  const temFiltro = !!(
    filtroTecnico || filtroTipoServico || dataServicoInicio || dataServicoFim || dataPagamentoInicio || dataPagamentoFim
  );

  const totalValor = servicosFiltrados.reduce((sum, s) => sum + (s.valor_ajustado ?? s.valor), 0);

  const POR_PAGINA = 15;
  const totalPaginas = Math.max(1, Math.ceil(servicosFiltrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const servicosPagina = servicosFiltrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-10 justify-center text-sm">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={filtroTecnico}
            onChange={(e) => setFiltroTecnico(e.target.value)}
            className="w-full h-10 px-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">Todos os técnicos</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filtroTipoServico}
            onChange={(e) => setFiltroTipoServico(e.target.value)}
            className="w-full h-10 px-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">Todos os tipos de serviço</option>
            {tiposServico.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data do serviço</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataServicoInicio}
              onChange={(e) => setDataServicoInicio(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs text-gray-400 shrink-0">até</span>
            <input
              type="date"
              value={dataServicoFim}
              onChange={(e) => setDataServicoFim(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Data do pagamento</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dataPagamentoInicio}
              onChange={(e) => setDataPagamentoInicio(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <span className="text-xs text-gray-400 shrink-0">até</span>
            <input
              type="date"
              value={dataPagamentoFim}
              onChange={(e) => setDataPagamentoFim(e.target.value)}
              className="flex-1 min-w-0 h-9 appearance-none px-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Número de serviços</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{servicosFiltrados.length}</p>
        </div>
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total pago</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatBRL(totalValor)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-5">
          {servicosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {temFiltro ? "Nenhum serviço encontrado para esse filtro." : "Nenhum pagamento fechado ainda."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-2 pr-4 font-medium">Tipo</th>
                      <th className="text-left py-2 pr-4 font-medium">Técnico</th>
                      <th className="text-left py-2 pr-4 font-medium">Cliente</th>
                      <th className="text-left py-2 pr-4 font-medium">Nº OS</th>
                      <th className="text-left py-2 pr-4 font-medium">Data serviço</th>
                      <th className="text-left py-2 pr-4 font-medium">Mês ref.</th>
                      <th className="text-left py-2 pr-4 font-medium">Pago em</th>
                      <th className="text-left py-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicosPagina.map((s) => {
                      const fechamento = s.fechamento_id ? fechamentoPorId.get(s.fechamento_id) : undefined;
                      return (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2.5 pr-4 font-medium text-gray-800">{s.tipo_servico_nome}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{s.tecnico_nome}</td>
                          <td className="py-2.5 pr-4 text-gray-600">{s.cliente}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{s.numero_os ?? "—"}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{formatDataBR(s.data_servico)}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{fechamento ? formatMesReferenciaBR(fechamento.mes_referencia) : "—"}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{s.pago_em ? new Date(s.pago_em).toLocaleDateString("pt-BR") : "—"}</td>
                          <td className="py-2.5 font-medium text-gray-700">{formatBRL(s.valor_ajustado ?? s.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-between pt-3">
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
    </div>
  );
}
