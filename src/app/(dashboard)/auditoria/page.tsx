"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getViabilizacoesAuditor, aprovarFTTH, aprovarFTTA, rejeitarViabilizacao,
  marcarUTP, deleteViabilizacao, devolverViabilizacao,
  solicitarViabilizacaoPredio, agendarVisita, rejeitarPredio,
} from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, Trash2, RotateCcw } from "lucide-react";
import CtoBusca from "@/components/auditoria/CtoBusca";

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setItems(await getViabilizacoesAuditor(user.nome)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (user?.nivel !== 1) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const urgentes = items.filter((i) => i.urgente);
  const ftth = items.filter((i) => i.tipo_instalacao === "FTTH" && !i.urgente);
  const prediosNovos = items.filter((i) => ["Prédio", "Condomínio"].includes(i.tipo_instalacao) && !i.urgente && !i.status_predio);
  const aguardandoDados = items.filter((i) => i.status_predio === "aguardando_dados");
  const prontosAgendar = items.filter((i) => i.status_predio === "pronto_auditoria");

  const tabs = [
    urgentes.length > 0 && { key: "urgentes", label: `🔥 Urgentes (${urgentes.length})`, items: urgentes },
    ftth.length > 0 && { key: "ftth", label: `🏠 FTTH (${ftth.length})`, items: ftth },
    prediosNovos.length > 0 && { key: "predios", label: `🏢 Prédios (${prediosNovos.length})`, items: prediosNovos },
    aguardandoDados.length > 0 && { key: "aguardando", label: `⏳ Ag. dados (${aguardandoDados.length})`, items: aguardandoDados },
    prontosAgendar.length > 0 && { key: "agendar", label: `📅 Agendar (${prontosAgendar.length})`, items: prontosAgendar },
  ].filter(Boolean) as { key: string; label: string; items: Viabilizacao[] }[];

  const [activeTab, setActiveTab] = useState(0);
  const activeItems = tabs[activeTab]?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔍 Auditoria</h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} solicitação(ões) em análise</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border text-gray-400">✅ Nenhuma solicitação pendente.</div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tabs.map((tab, i) => (
              <button key={tab.key} onClick={() => setActiveTab(i)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === i ? "bg-indigo-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {activeItems.map((v) => (
              <AuditoriaCard key={v.id} v={v} userName={user!.nome} onRefresh={load} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AuditoriaCard({ v, userName, onRefresh }: { v: Viabilizacao; userName: string; onRefresh: () => void }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  // Campos FTTH
  const [cto, setCto] = useState(v.cto_numero ?? "");
  const [distancia, setDistancia] = useState(v.distancia_cliente ?? "");
  const [localizacao, setLocalizacao] = useState(v.localizacao_caixa ?? "");
  const [portas, setPortas] = useState(v.portas_disponiveis ?? 0);
  const [rx, setRx] = useState(v.menor_rx ?? "");
  const [obs, setObs] = useState(v.observacoes ?? "");

  // Campos FTTA
  const [cdoi, setCdoi] = useState(v.cdoi ?? "");
  const [predioNome, setPredioNome] = useState(v.predio_ftta ?? "");
  const [portasFtta, setPortasFtta] = useState(v.portas_disponiveis ?? 0);
  const [mediaRx, setMediaRx] = useState(v.media_rx ?? "");
  const [obsFtta, setObsFtta] = useState(v.observacoes ?? "");

  // Agendamento
  const [dataVisita, setDataVisita] = useState("");
  const [periodo, setPeriodo] = useState("Manhã");
  const [tecnico, setTecnico] = useState("");
  const [tecnologia, setTecnologia] = useState("FTTA");
  const [giga, setGiga] = useState(false);

  // Rejeição
  const [showRejeitar, setShowRejeitar] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Busca de CTOs
  const [showCtoBusca, setShowCtoBusca] = useState(false);

  async function handleAprovarFTTH() {
    if (!cto || !distancia || !localizacao || !portas || !rx) { alert("Preencha todos os campos!"); return; }
    setLoading(true);
    try { await aprovarFTTH(v.id, { cto_numero: cto, portas_disponiveis: portas, menor_rx: rx, distancia_cliente: distancia, localizacao_caixa: localizacao, observacoes: obs }, userName); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleAprovarFTTA() {
    if (!cdoi || !predioNome || !portasFtta || !mediaRx) { alert("Preencha todos os campos!"); return; }
    setLoading(true);
    try { await aprovarFTTA(v.id, { cdoi, predio_ftta: predioNome, portas_disponiveis: portasFtta, media_rx: mediaRx, observacoes: obsFtta }, userName); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleRejeitar() {
    if (!motivo.trim()) { alert("Informe o motivo!"); return; }
    setLoading(true);
    try { await rejeitarViabilizacao(v.id, motivo, userName); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleUTP() {
    setLoading(true);
    try { await marcarUTP(v.id, userName); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    setLoading(true);
    try { await deleteViabilizacao(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleDevolver() {
    setLoading(true);
    try { await devolverViabilizacao(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleSolicitarPredio() {
    setLoading(true);
    try { await solicitarViabilizacaoPredio(v.id); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleAgendar() {
    if (!dataVisita || !tecnico) { alert("Preencha data e técnico!"); return; }
    setLoading(true);
    try { await agendarVisita(v.id, { data_visita: dataVisita, periodo_visita: periodo, tecnico_responsavel: tecnico, tecnologia_predio: tecnologia, giga }); onRefresh(); }
    finally { setLoading(false); }
  }

  async function handleRejeitarPredio() {
    if (!motivo.trim()) { alert("Informe o motivo!"); return; }
    setLoading(true);
    try { await rejeitarPredio(v.id, v.predio_ftta ?? "Prédio", v.plus_code_cliente, motivo, userName); onRefresh(); }
    finally { setLoading(false); }
  }

  const tipoIcon = v.tipo_instalacao === "FTTH" ? "🏠" : v.tipo_instalacao === "Prédio" ? "🏢" : "🏘️";
  const titulo = `${tipoIcon} ${v.nome_cliente ?? "Cliente"} | ${v.plus_code_cliente}${v.predio_ftta ? ` | 🏢 ${v.predio_ftta}` : ""}${v.urgente ? " 🔥 URGENTE" : ""}`;

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${v.urgente ? "border-red-500" : "border-indigo-400"}`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-900">{titulo}</p>
          <span className="text-gray-400 text-xs">👤 {v.usuario} · {formatDateTime(v.data_solicitacao)}</span>
        </div>
      </button>

      {open && (
        <div className={`px-5 pb-5 border-t pt-4 ${mapExpanded ? "block" : "grid grid-cols-1 md:grid-cols-2 gap-6"}`}>
          {/* Info — oculto quando mapa expandido */}
          <div className={`space-y-3 ${mapExpanded ? "hidden" : ""}`}>
            <h4 className="font-medium text-gray-700">📋 Informações</h4>
            <div className="text-sm text-gray-600 space-y-1">
              {v.nome_cliente && <p>🙋 Cliente: {v.nome_cliente}</p>}
              <p>📍 Plus Code: <span className="font-mono">{v.plus_code_cliente}</span></p>
              <p>🏷️ Tipo: {v.tipo_instalacao}</p>
              {v.predio_ftta && <p>🏢 Prédio: {v.predio_ftta}</p>}
              {v.andar_predio && <p>🚪 Apto: {v.andar_predio}</p>}
            </div>

            {/* Ações gerais */}
            <div className="flex gap-2 pt-2">
              <button onClick={handleDevolver} disabled={loading} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Devolver
              </button>
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
          </div>

          {/* Formulário */}
          <div className="space-y-3">
            {/* FTTH */}
            {v.tipo_instalacao === "FTTH" && !v.status_predio && (
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
                    onConfirm={(data) => { setCto(data.cto_numero); setDistancia(data.distancia_cliente); setLocalizacao(data.localizacao_caixa); setShowCtoBusca(false); }}
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

            {/* FTTA (Prédio) — estado inicial */}
            {v.tipo_instalacao === "Prédio" && !v.status_predio && (
              <>
                <h4 className="font-medium text-gray-700">🏢 Dados FTTA</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="CDOI *" value={cdoi} onChange={(e) => setCdoi(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 col-span-2" />
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

            {/* Condomínio — igual FTTH */}
            {v.tipo_instalacao === "Condomínio" && !v.status_predio && (
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
                    onConfirm={(data) => { setCto(data.cto_numero); setDistancia(data.distancia_cliente); setLocalizacao(data.localizacao_caixa); setShowCtoBusca(false); }}
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
                      <input placeholder="Distância *" value={distancia} onChange={(e) => setDistancia(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Loc. Caixa *" value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input type="number" placeholder="Portas *" value={portas || ""} onChange={(e) => setPortas(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <input placeholder="Menor RX *" value={rx} onChange={(e) => setRx(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleAprovarFTTH} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm">✅ Viabilizar</button>
                      <button onClick={handleSolicitarPredio} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm">🏗️ Estrutura</button>
                    </div>
                    <button onClick={() => setShowRejeitar(!showRejeitar)} className="w-full border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm">❌ Sem Viabilidade</button>
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
                  <p className="font-medium text-blue-800">✅ Dados recebidos — agendar visita</p>
                  <p>👤 Síndico: {v.nome_sindico} | {v.contato_sindico}</p>
                  <p>🏠 Cliente: {v.nome_cliente_predio} | {v.contato_cliente_predio}</p>
                  <p>🚪 Apto: {v.apartamento}</p>
                  {v.obs_agendamento && <p>📝 {v.obs_agendamento}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>Manhã</option><option>Tarde</option>
                  </select>
                  <input placeholder="Técnico *" value={tecnico} onChange={(e) => setTecnico(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={tecnologia} onChange={(e) => setTecnologia(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option>FTTA</option><option>UTP</option><option>FTTH</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={giga} onChange={(e) => setGiga(e.target.checked)} /> ⚡ Prédio Giga?</label>
                <div className="flex gap-2">
                  <button onClick={handleAgendar} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm">📅 Agendar</button>
                  <button onClick={() => setShowRejeitar(!showRejeitar)} className="flex-1 border border-red-300 text-red-600 hover:bg-red-50 py-2 rounded-lg text-sm">❌ Sem Viabilidade</button>
                </div>
              </>
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
