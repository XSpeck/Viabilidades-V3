"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getViabilizacoesAuditor, aprovarFTTH, aprovarFTTA, rejeitarViabilizacao,
  marcarUTP, deleteViabilizacao, devolverViabilizacao,
  solicitarViabilizacaoPredio, agendarVisita, rejeitarPredio, salvarCTOEscolhida,
  iniciarAgendamentoInstalacao, devolverComMensagem, corrigirDadosViabilizacao,
  manterDecisaoContestacao, revisarContestacao, proporDataVisita,
} from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { Viabilizacao, TipoInstalacao } from "@/types";
import { RefreshCw, Loader2, Trash2, RotateCcw, Search } from "lucide-react";
import CtoBusca from "@/components/auditoria/CtoBusca";
import FttaMap from "@/components/auditoria/FttaMap";

type AuditoriaFilter = "todos" | "urgentes" | "ftth" | "predios" | "aguardando" | "agendar" | "agendado" | "contestado";

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AuditoriaFilter>("todos");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setItems(await getViabilizacoesAuditor(user.nome)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const counts = {
    todos:      items.length,
    urgentes:   items.filter((i) => i.urgente).length,
    ftth:       items.filter((i) => i.tipo_instalacao === "FTTH" && !i.urgente).length,
    predios:    items.filter((i) => ["Prédio", "Condomínio"].includes(i.tipo_instalacao) && !i.urgente && !i.status_predio).length,
    aguardando:  items.filter((i) => i.status_predio === "aguardando_dados").length,
    agendar:     items.filter((i) => ["pronto_auditoria", "proposta_visita"].includes(i.status_predio ?? "")).length,
    agendado:    items.filter((i) => i.status_predio === "agendado").length,
    contestado:  items.filter((i) => i.status === "em_revisao" && i.revisao_tipo === "contestado").length,
  };

  const chips = (
    [
      { key: "todos",      label: `Todos (${counts.todos})` },
      { key: "urgentes",   label: `🔥 Urgentes (${counts.urgentes})` },
      { key: "ftth",       label: `🏠 FTTH (${counts.ftth})` },
      { key: "predios",    label: `🏢 Prédios (${counts.predios})` },
      { key: "aguardando",  label: `⏳ Ag. dados (${counts.aguardando})` },
      { key: "agendar",     label: `📅 Agendar (${counts.agendar})` },
      { key: "agendado",    label: `✅ Agendado (${counts.agendado})` },
      { key: "contestado",  label: `💬 Contestações (${counts.contestado})` },
    ] as { key: AuditoriaFilter; label: string }[]
  ).filter((c) => c.key === "todos" || counts[c.key] > 0);

  function matchesFilter(v: Viabilizacao): boolean {
    switch (filter) {
      case "urgentes":   return !!v.urgente;
      case "ftth":       return v.tipo_instalacao === "FTTH" && !v.urgente;
      case "predios":    return ["Prédio", "Condomínio"].includes(v.tipo_instalacao) && !v.urgente && !v.status_predio;
      case "aguardando":  return v.status_predio === "aguardando_dados";
      case "agendar":     return ["pronto_auditoria", "proposta_visita"].includes(v.status_predio ?? "");
      case "agendado":    return v.status_predio === "agendado";
      case "contestado":  return v.status === "em_revisao" && v.revisao_tipo === "contestado";
      default:           return true;
    }
  }

  const filtered = items
    .filter(matchesFilter)
    .filter((v) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.nome_cliente?.toLowerCase().includes(q) ||
        v.plus_code_cliente.toLowerCase().includes(q) ||
        v.predio_ftta?.toLowerCase().includes(q) ||
        v.usuario.toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔍 Auditoria</h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} solicitação(ões) em análise</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, plus code, prédio ou solicitante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === c.key
                  ? c.key === "urgentes" ? "bg-red-600 text-white" : "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border text-gray-400">✅ Nenhuma solicitação em análise.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border text-gray-400">
          Nenhum resultado para os filtros aplicados.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((v) => (
            <AuditoriaCard key={v.id} v={v} userName={user!.nome} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditoriaCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function finishWithSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(onRefresh, 2000);
  }

  // ── Edição inline ──────────────────────────────────────
  const [tipoLocal, setTipoLocal] = useState<TipoInstalacao>(v.tipo_instalacao);
  const [nomeClienteLocal, setNomeClienteLocal] = useState(v.nome_cliente ?? "");
  const [editandoInfo, setEditandoInfo] = useState(false);

  useEffect(() => {
    setTipoLocal(v.tipo_instalacao);
    setNomeClienteLocal(v.nome_cliente ?? "");
    setOlt(v.olt ?? "");
    setOltFtta(v.olt ?? "");
  }, [v.tipo_instalacao, v.nome_cliente, v.olt]);

  async function handleSalvarInfo() {
    setLoading(true);
    try {
      await corrigirDadosViabilizacao(v.id, { nome_cliente: nomeClienteLocal || undefined, tipo_instalacao: tipoLocal });
      setEditandoInfo(false);
      onRefresh();
    } finally { setLoading(false); }
  }

  // ── Devolução com mensagem ─────────────────────────────
  const [showDevolver, setShowDevolver] = useState(false);
  const [msgDevolver, setMsgDevolver] = useState("");

  async function handleDevolver() {
    setLoading(true);
    try { await devolverViabilizacao(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleDevolverComMensagem() {
    if (!msgDevolver.trim()) { alert("Escreva a mensagem!"); return; }
    setLoading(true);
    try {
      await devolverComMensagem(v.id, msgDevolver, userName, v.mensagens);
      finishWithSuccess("↩️ Devolvida com mensagem ao usuário.");
    } finally { setLoading(false); }
  }

  // ── Resposta a contestação ─────────────────────────────
  const [showResponderContest, setShowResponderContest] = useState(false);
  const [msgRespContest, setMsgRespContest] = useState("");

  async function handleManterDecisao() {
    if (!msgRespContest.trim()) { alert("Escreva a resposta!"); return; }
    setLoading(true);
    try {
      await manterDecisaoContestacao(v.id, msgRespContest, userName, v.status_anterior ?? "rejeitado", v.mensagens);
      finishWithSuccess("✅ Decisão mantida. Resposta enviada ao usuário.");
    } finally { setLoading(false); }
  }

  async function handleRevisarContestacao() {
    setLoading(true);
    try { await revisarContestacao(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  // ── Campos FTTH ────────────────────────────────────────
  const [cto, setCto] = useState(v.cto_numero ?? "");
  const [distancia, setDistancia] = useState(v.distancia_cliente ?? "");
  const [localizacao, setLocalizacao] = useState(v.localizacao_caixa ?? "");
  const [portas, setPortas] = useState(v.portas_disponiveis ?? 0);
  const [rx, setRx] = useState(v.menor_rx ?? "");
  const [obs, setObs] = useState(v.observacoes ?? "");
  const [olt, setOlt] = useState(v.olt ?? "");

  // ── Campos FTTA ────────────────────────────────────────
  const [cdoi, setCdoi] = useState(v.cdoi ?? "");
  const [predioNome, setPredioNome] = useState(v.predio_ftta ?? "");
  const [portasFtta, setPortasFtta] = useState(v.portas_disponiveis ?? 0);
  const [mediaRx, setMediaRx] = useState(v.media_rx ?? "");
  const [obsFtta, setObsFtta] = useState(v.observacoes ?? "");
  const [oltFtta, setOltFtta] = useState(v.olt ?? "");

  // ── Agendamento prédio ─────────────────────────────────
  const [dataVisita, setDataVisita] = useState(v.data_preferencia_visita ?? "");
  const [periodo, setPeriodo] = useState(v.periodo_preferencia_visita ?? "Manhã");
  const [tecnico, setTecnico] = useState("");
  const [tecnologia, setTecnologia] = useState(v.tipo_instalacao === "Condomínio" ? "FTTH" : "FTTA");
  const [giga, setGiga] = useState(true);
  const [obsVisita, setObsVisita] = useState("");
  // ── Rejeição ───────────────────────────────────────────
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [motivo, setMotivo] = useState("");

  // ── Busca de CTOs ──────────────────────────────────────
  const [showCtoBusca, setShowCtoBusca] = useState(false);
  const [showFttaMap, setShowFttaMap] = useState(false);

  // ── Handlers aprovação ─────────────────────────────────
  async function handleAprovarFTTH() {
    if (!cto || !distancia || !localizacao || !portas || !rx) { alert("Preencha todos os campos!"); return; }
    setLoading(true);
    try {
      await aprovarFTTH(v.id, { cto_numero: cto, portas_disponiveis: portas, menor_rx: rx, distancia_cliente: distancia, localizacao_caixa: localizacao, observacoes: obs, olt: olt || undefined, tipo_instalacao: tipoLocal, nome_cliente: nomeClienteLocal || undefined }, userName);
      await iniciarAgendamentoInstalacao(v.id);
      finishWithSuccess("✅ Viabilidade FTTH aprovada! Enviada para agendamento técnico.");
    } finally { setLoading(false); }
  }

  async function handleAprovarFTTA() {
    if (!cdoi || !predioNome || !portasFtta || !mediaRx) { alert("Preencha todos os campos!"); return; }
    setLoading(true);
    try {
      await aprovarFTTA(v.id, { cdoi, predio_ftta: predioNome, portas_disponiveis: portasFtta, media_rx: mediaRx, observacoes: obsFtta, olt: oltFtta || undefined, tipo_instalacao: tipoLocal, nome_cliente: nomeClienteLocal || undefined }, userName);
      await iniciarAgendamentoInstalacao(v.id);
      finishWithSuccess("✅ Viabilidade FTTA aprovada! Enviada para Agenda Técnica.");
    } finally { setLoading(false); }
  }

  async function handleRejeitar() {
    if (!motivo.trim()) { alert("Informe o motivo!"); return; }
    setLoading(true);
    try { await rejeitarViabilizacao(v.id, motivo, userName); finishWithSuccess("❌ Sem viabilidade registrada."); }
    finally { setLoading(false); }
  }

  async function handleUTP() {
    setLoading(true);
    try { await marcarUTP(v.id, userName); finishWithSuccess("📡 Marcado como UTP."); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    setLoading(true);
    try { await deleteViabilizacao(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleSolicitarPredio() {
    setLoading(true);
    try { await solicitarViabilizacaoPredio(v.id); finishWithSuccess("🏗️ Solicitação de dados do prédio enviada ao usuário."); }
    finally { setLoading(false); }
  }

  const dataDiferePref = !!v.data_preferencia_visita && (
    dataVisita !== v.data_preferencia_visita || periodo !== (v.periodo_preferencia_visita ?? "Manhã")
  );

  async function handleAgendar() {
    if (!dataVisita || !tecnico) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try {
      await agendarVisita(v.id, { data_visita: dataVisita, periodo_visita: periodo, tecnico_responsavel: tecnico, tecnologia_predio: tecnologia, giga, obs_agendamento: obsVisita || undefined }, v.historico_visita);
      finishWithSuccess(`📅 Visita agendada para ${new Date(dataVisita + "T12:00:00").toLocaleDateString("pt-BR")} — ${periodo} — ${tecnico}.`);
    } finally { setLoading(false); }
  }

  async function handleProporData() {
    if (!dataVisita) { alert("Preencha a data!"); return; }
    setLoading(true);
    try {
      await proporDataVisita(v.id, { proposta_visita_data: dataVisita, proposta_visita_periodo: periodo, tecnologia_predio: tecnologia, giga, obs_agendamento: obsVisita || undefined }, v.historico_visita);
      finishWithSuccess(`📤 Nova data proposta ao usuário: ${new Date(dataVisita + "T12:00:00").toLocaleDateString("pt-BR")} — ${periodo}.`);
    } finally { setLoading(false); }
  }

  async function handleRejeitarPredio() {
    if (!motivo.trim()) { alert("Informe o motivo!"); return; }
    setLoading(true);
    try { await rejeitarPredio(v.id, v.predio_ftta ?? "Prédio", v.plus_code_cliente, motivo, userName); finishWithSuccess("❌ Prédio sem viabilidade registrado."); }
    finally { setLoading(false); }
  }

  const isContestacao = v.status === "em_revisao" && v.revisao_tipo === "contestado";
  const tipoIcon = tipoLocal === "FTTH" ? "🏠" : tipoLocal === "Prédio" ? "🏢" : "🏘️";
  const titulo = `${tipoIcon} ${nomeClienteLocal || "Cliente"} | ${locationToPlusCode(v.plus_code_cliente)}${v.predio_ftta ? ` | 🏢 ${v.predio_ftta}` : ""}${v.urgente ? " 🔥 URGENTE" : ""}`;

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${v.urgente ? "border-red-500" : isContestacao ? "border-orange-400" : "border-indigo-400"}`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-gray-900">{titulo}</p>
          <div className="flex items-center gap-2 shrink-0">
            {isContestacao && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">💬 Contestação</span>}
            <span className="text-gray-400 text-xs">👤 {v.usuario} · {formatDateTime(v.data_solicitacao)}</span>
          </div>
        </div>
      </button>

      {open && (
        <div className={`px-5 pb-5 border-t pt-4 ${mapExpanded ? "block" : "grid grid-cols-1 md:grid-cols-2 gap-6"}`}>

          {/* Banner de sucesso */}
          {successMsg && (
            <div className="col-span-2 flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-green-800 text-sm font-medium">
              <span className="text-xl">🎉</span><span>{successMsg}</span>
            </div>
          )}

          {/* ── Thread de mensagens ── */}
          {!successMsg && v.mensagens && v.mensagens.length > 0 && (
            <div className={`col-span-2 space-y-2 pb-2 ${mapExpanded ? "hidden" : ""}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">💬 Histórico de mensagens</p>
              {v.mensagens.map((m, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 text-sm ${
                  m.tipo === "auditoria"   ? "bg-blue-50 border border-blue-200" :
                  m.tipo === "contestacao" ? "bg-orange-50 border border-orange-200" :
                  "bg-gray-50 border border-gray-200"
                }`}>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">{m.de} · {formatDateTime(m.data)}</p>
                  <p className="text-gray-800">{m.texto}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Painel de contestação ── */}
          {isContestacao && !successMsg && (
            <div className={`col-span-2 space-y-3 ${mapExpanded ? "hidden" : ""}`}>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-orange-800">⚠️ O usuário contestou a decisão anterior
                  {v.status_anterior ? ` (${v.status_anterior})` : ""}.
                </p>
                <p className="text-orange-700 text-xs mt-1">Leia as mensagens acima e escolha como proceder.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRevisarContestacao} disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium">
                  🔍 Revisar viabilidade
                </button>
                <button onClick={() => setShowResponderContest(!showResponderContest)}
                  className="flex-1 border border-orange-300 text-orange-700 hover:bg-orange-50 py-2 rounded-lg text-sm font-medium">
                  ✉️ Manter e responder
                </button>
              </div>
              {showResponderContest && (
                <div className="space-y-2">
                  <textarea
                    placeholder="Explique ao usuário por que a decisão se mantém..."
                    value={msgRespContest}
                    onChange={(e) => setMsgRespContest(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  <button onClick={handleManterDecisao} disabled={loading || !msgRespContest.trim()}
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white py-2 rounded-lg text-sm font-medium">
                    {loading ? "Enviando..." : "✅ Confirmar e enviar resposta"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Painel de informações ── */}
          <div className={`space-y-3 ${mapExpanded || successMsg || isContestacao ? "hidden" : ""}`}>
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-700">📋 Informações</h4>
              {!editandoInfo && !v.status_predio && (
                <button onClick={() => setEditandoInfo(true)} className="text-xs text-indigo-600 hover:underline">✏️ Editar</button>
              )}
            </div>

            {editandoInfo ? (
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Tipo de instalação</p>
                  <select value={tipoLocal} onChange={(e) => setTipoLocal(e.target.value as TipoInstalacao)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="FTTH">🏠 FTTH</option>
                    <option value="Prédio">🏢 Prédio (FTTA)</option>
                    <option value="Condomínio">🏘️ Condomínio</option>
                  </select>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Nome do cliente</p>
                  <input type="text" value={nomeClienteLocal} onChange={(e) => setNomeClienteLocal(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSalvarInfo} disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded-lg text-sm">
                    {loading ? "..." : "✅ Salvar"}
                  </button>
                  <button onClick={() => { setEditandoInfo(false); setTipoLocal(v.tipo_instalacao); setNomeClienteLocal(v.nome_cliente ?? ""); }}
                    className="flex-1 border py-1.5 rounded-lg text-sm">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 space-y-1">
                {nomeClienteLocal && <p>🙋 Cliente: {nomeClienteLocal}</p>}
                <p>📍 Plus Code: <span className="font-mono">{locationToPlusCode(v.plus_code_cliente)}</span></p>
                <p>🏷️ Tipo: {tipoLocal}{tipoLocal !== v.tipo_instalacao && <span className="ml-1 text-xs text-amber-600 font-medium">(alterado — não salvo)</span>}</p>
                {v.predio_ftta && <p>🏢 Prédio: {v.predio_ftta}</p>}
                {v.bloco_predio && <p>🏗️ Bloco: {v.bloco_predio}</p>}
                {v.andar_predio && <p>🚪 Apto: {v.andar_predio}</p>}
              </div>
            )}

            {/* Ações gerais */}
            <div className="flex flex-wrap gap-2 pt-2">
              {!v.status_predio && (
                <>
                  <button onClick={handleDevolver} disabled={loading}
                    className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Fila
                  </button>
                  <button onClick={() => setShowDevolver(!showDevolver)} disabled={loading}
                    className="text-xs px-3 py-1.5 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 flex items-center gap-1">
                    ↩️ Devolver c/ msg
                  </button>
                </>
              )}
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button onClick={handleDelete} disabled={loading} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg">Confirmar</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs px-3 py-1.5 border rounded-lg">Cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Excluir
                </button>
              )}
            </div>

            {/* Formulário de devolução */}
            {showDevolver && !v.status_predio && (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700">↩️ Devolver viabilização</p>
                <textarea
                  placeholder="Mensagem para o usuário (ex: endereço incorreto, tipo errado...)"
                  value={msgDevolver}
                  onChange={(e) => setMsgDevolver(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex gap-2">
                  <button onClick={handleDevolverComMensagem} disabled={loading || !msgDevolver.trim()}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-1.5 rounded-lg text-sm">
                    {loading ? "..." : "↩️ Devolver com mensagem"}
                  </button>
                  <button onClick={() => setShowDevolver(false)} className="px-3 border rounded-lg text-sm">✕</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Formulário técnico ── */}
          <div className={`space-y-3 ${successMsg || isContestacao ? "hidden" : ""}`}>

            {/* FTTH */}
            {tipoLocal === "FTTH" && !v.status_predio && (
              <>
                <h4 className="font-medium text-gray-700">🏠 Dados FTTH</h4>
                {cto && !showCtoBusca && (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-700">✅ <strong>{cto}</strong> — {distancia}</p>
                    <button onClick={() => setShowCtoBusca(true)} className="text-xs text-indigo-600 underline">Trocar</button>
                  </div>
                )}
                {showCtoBusca ? (
                  <CtoBusca
                    plusCode={v.plus_code_cliente}
                    nomeCliente={v.nome_cliente}
                    initialCto={cto || undefined}
                    onConfirm={async (data) => { setCto(data.cto_numero); setDistancia(data.distancia_cliente); setLocalizacao(data.localizacao_caixa); setShowCtoBusca(false); try { await salvarCTOEscolhida(v.id, data); } catch { alert("Erro ao salvar CTO. Verifique a conexão e tente novamente."); } }}
                    onClose={() => setShowCtoBusca(false)}
                    onExpandChange={setMapExpanded}
                  />
                ) : (
                  <>
                    <button onClick={() => setShowCtoBusca(true)} className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                      🔍 {cto ? "Buscar outra CTO" : "Buscar CTOs Próximas"}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="N° CTO *" value={cto} onChange={(e) => setCto(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                      <input placeholder="OLT *" value={olt} onChange={(e) => setOlt(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                      <input placeholder="Distância *" value={distancia} onChange={(e) => setDistancia(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Loc. Caixa *" value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input type="number" placeholder="Portas *" value={portas || ""} onChange={(e) => setPortas(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Menor RX *" value={rx} onChange={(e) => setRx(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <textarea placeholder="Observações" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAprovarFTTH} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">✅ Viabilizar</button>
                      <button onClick={() => setShowRejeitar(!showRejeitar)} className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm font-medium">❌ Sem Viabilidade</button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* FTTA (Prédio) */}
            {tipoLocal === "Prédio" && !v.status_predio && (
              <>
                <h4 className="font-medium text-gray-700">🏢 Dados FTTA</h4>
                <button onClick={() => setShowFttaMap(!showFttaMap)}
                  className={`w-full border-2 border-dashed py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${showFttaMap ? "border-blue-400 text-blue-700 bg-blue-50" : "border-blue-300 text-blue-600 hover:bg-blue-50"}`}>
                  🗺️ {showFttaMap ? "Ocultar Mapa" : "Ver Redes e CDOIs no Mapa"}
                </button>
                {showFttaMap && <FttaMap plusCode={v.plus_code_cliente} nomeCliente={v.nome_cliente} onSelectCdoi={(name) => setCdoi(name)} onConfirm={() => setShowFttaMap(false)} onExpandChange={setMapExpanded} />}
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="CDOI *" value={cdoi} onChange={(e) => setCdoi(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                  <input placeholder="OLT *" value={oltFtta} onChange={(e) => setOltFtta(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                  <input placeholder="Nome do prédio" value={predioNome} onChange={(e) => setPredioNome(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                  <input type="number" placeholder="Portas" value={portasFtta || ""} onChange={(e) => setPortasFtta(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input placeholder="Média RX" value={mediaRx} onChange={(e) => setMediaRx(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <textarea placeholder="Observações" value={obsFtta} onChange={(e) => setObsFtta(e.target.value)} rows={2} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleAprovarFTTA} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium">✅ Viabilizar</button>
                  <button onClick={handleUTP} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium">📡 UTP</button>
                  <button onClick={handleSolicitarPredio} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">🏗️ Estrutura</button>
                </div>
                <button onClick={() => setShowRejeitar(!showRejeitar)} className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm">❌ Sem Viabilidade</button>
              </>
            )}

            {/* Condomínio */}
            {tipoLocal === "Condomínio" && !v.status_predio && (
              <>
                <h4 className="font-medium text-gray-700">🏘️ Dados Condomínio</h4>
                {cto && !showCtoBusca && (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-700">✅ <strong>{cto}</strong> — {distancia}</p>
                    <button onClick={() => setShowCtoBusca(true)} className="text-xs text-indigo-600 underline">Trocar</button>
                  </div>
                )}
                {showCtoBusca ? (
                  <CtoBusca
                    plusCode={v.plus_code_cliente}
                    nomeCliente={v.nome_cliente}
                    initialCto={cto || undefined}
                    onConfirm={async (data) => { setCto(data.cto_numero); setDistancia(data.distancia_cliente); setLocalizacao(data.localizacao_caixa); setShowCtoBusca(false); try { await salvarCTOEscolhida(v.id, data); } catch { alert("Erro ao salvar CTO. Verifique a conexão e tente novamente."); } }}
                    onClose={() => setShowCtoBusca(false)}
                    onExpandChange={setMapExpanded}
                  />
                ) : (
                  <>
                    <button onClick={() => setShowCtoBusca(true)} className="w-full border-2 border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                      🔍 {cto ? "Buscar outra CTO" : "Buscar CTOs Próximas"}
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <input placeholder="N° CTO *" value={cto} onChange={(e) => setCto(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                      <input placeholder="OLT *" value={olt} onChange={(e) => setOlt(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
                      <input placeholder="Distância *" value={distancia} onChange={(e) => setDistancia(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Loc. Caixa *" value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input type="number" placeholder="Portas *" value={portas || ""} onChange={(e) => setPortas(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Menor RX *" value={rx} onChange={(e) => setRx(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAprovarFTTH} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">✅ Viabilizar</button>
                      <button onClick={() => setShowRejeitar(!showRejeitar)} className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm">❌ Sem Viabilidade</button>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                      🔧 Temos projeto na rua mas sem estrutura pronta no condomínio?
                    </div>
                    <button onClick={handleSolicitarPredio} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium">
                      🏘️ Solicitar Viabilização da Estrutura do Condomínio
                    </button>
                  </>
                )}
              </>
            )}

            {/* Aguardando dados */}
            {v.status_predio === "aguardando_dados" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                ⏳ <strong>Aguardando dados do usuário.</strong> O usuário está preenchendo o formulário.
              </div>
            )}

            {/* Pronto para agendar */}
            {v.status_predio === "pronto_auditoria" && (
              <>
                <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium text-blue-800 mb-1">✅ Dados recebidos — agendar visita</p>
                  <p>👤 {tipoLocal === "Condomínio" ? "Responsável" : "Síndico"}: <strong>{v.nome_sindico}</strong> · {v.contato_sindico}</p>
                  <p>🏠 Cliente: <strong>{v.nome_cliente_predio}</strong> · {v.contato_cliente_predio}</p>
                  <p>🚪 {tipoLocal === "Condomínio" ? "Casa/Lote" : "Apto"}: <strong>{v.apartamento}</strong></p>
                </div>
                {v.obs_agendamento && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-1">💬 Observação do usuário</p>
                    <p className="text-gray-700 italic">"{v.obs_agendamento}"</p>
                  </div>
                )}
                {v.data_preferencia_visita && (
                  <div className={`rounded-lg p-2.5 text-sm flex items-center gap-2 ${dataDiferePref ? "bg-orange-50 border border-orange-200 text-orange-800" : "bg-green-50 border border-green-200 text-green-800"}`}>
                    <span>{dataDiferePref ? "⚠️" : "✅"}</span>
                    <span>
                      Preferência do usuário: <strong>{new Date(v.data_preferencia_visita + "T12:00:00").toLocaleDateString("pt-BR")}</strong> — {v.periodo_preferencia_visita ?? "Manhã"}
                      {dataDiferePref && <span className="ml-1 font-medium"> (data alterada)</span>}
                    </span>
                  </div>
                )}
                {v.historico_visita && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-400 hover:text-gray-600">📋 Histórico de negociação</summary>
                    <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-gray-50 border rounded-lg p-2.5 leading-relaxed">{v.historico_visita}</pre>
                  </details>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>Manhã</option><option>Tarde</option>
                  </select>
                  <input placeholder="Técnico *" value={tecnico} onChange={(e) => setTecnico(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={tecnologia} onChange={(e) => { setTecnologia(e.target.value); if (e.target.value === "FTTA") setGiga(true); }} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {tipoLocal === "Condomínio" ? <option>FTTH</option> : <><option>FTTA</option><option>UTP</option><option>FTTH</option></>}
                  </select>
                </div>
                {(() => {
                  const alwaysGiga = tecnologia === "FTTA" || tipoLocal === "Condomínio";
                  return (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={giga} onChange={(e) => setGiga(e.target.checked)} disabled={alwaysGiga} />
                      ⚡ {tipoLocal === "Condomínio" ? "Condomínio" : "Prédio"} Giga?
                      {alwaysGiga && <span className="text-xs text-blue-600">{tipoLocal === "Condomínio" ? "(sempre ativo em Condomínio)" : "(sempre ativo em FTTA)"}</span>}
                    </label>
                  );
                })()}
                <textarea
                  placeholder="Observações (opcional)"
                  value={obsVisita}
                  onChange={(e) => setObsVisita(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleAgendar} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm">📅 Agendar</button>
                  {dataDiferePref && (
                    <button onClick={handleProporData} disabled={loading} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded-lg text-sm">📤 Propor</button>
                  )}
                  <button onClick={() => setShowRejeitar(!showRejeitar)} className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm">❌ Sem Viabilidade</button>
                </div>
              </>
            )}

            {/* Proposta enviada — aguardando confirmação do usuário */}
            {v.status_predio === "proposta_visita" && (
              <div className="space-y-2">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm space-y-1">
                  <p className="font-medium text-orange-800">⏳ Aguardando confirmação do usuário</p>
                  <p>📆 Data proposta: <strong>{v.proposta_visita_data ? new Date(v.proposta_visita_data + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</strong> — {v.proposta_visita_periodo}</p>
                  {v.proposta_visita_tecnico && <p>👷 Técnico: {v.proposta_visita_tecnico}</p>}
                  {v.data_preferencia_visita && (
                    <p className="text-xs text-orange-600">Preferência original: {new Date(v.data_preferencia_visita + "T12:00:00").toLocaleDateString("pt-BR")} — {v.periodo_preferencia_visita ?? "Manhã"}</p>
                  )}
                  {v.historico_visita && (
                    <details className="text-xs mt-1">
                      <summary className="cursor-pointer text-orange-500 hover:text-orange-700">📋 Histórico de negociação</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap text-gray-500 bg-white border rounded-lg p-2 leading-relaxed">{v.historico_visita}</pre>
                    </details>
                  )}
                </div>
              </div>
            )}

            {/* Formulário de rejeição */}
            {showRejeitar && (
              <div className="border border-red-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-red-700">❌ Confirmar sem viabilidade</p>
                <textarea
                  placeholder="Motivo da não viabilidade *"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <div className="flex gap-2">
                  <button onClick={v.status_predio === "pronto_auditoria" ? handleRejeitarPredio : handleRejeitar} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm">Confirmar</button>
                  <button onClick={() => setShowRejeitar(false)} className="flex-1 border py-2 rounded-lg text-sm">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
