"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesUsuario, finalizarViabilizacao, enviarDadosPredio } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { RefreshCw, Loader2, CheckCircle, XCircle, Clock, Building2 } from "lucide-react";
import FluxoStepper from "@/components/resultados/FluxoStepper";

export default function ResultadosPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setResults(await getViabilizacoesUsuario(user.nome)); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const aprovadas = results.filter((r) => r.status === "aprovado");
  const rejeitadas = results.filter((r) => r.status === "rejeitado");
  const utp = results.filter((r) => r.status === "utp");
  const emAnalise = results.filter((r) => ["pendente", "em_auditoria"].includes(r.status) && !r.status_predio);
  const predios = results.filter((r) => ["aguardando_dados", "pronto_auditoria", "agendado"].includes(r.status_predio ?? ""));
  const estruturados = results.filter((r) => r.status_predio === "estruturado");

  async function handleFinalizar(id: string) {
    await finalizarViabilizacao(id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Meus Resultados</h1>
          <p className="text-gray-500 text-sm mt-1">Viabilizações de <strong>{user?.nome}</strong></p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Em Análise", count: emAnalise.length, color: "blue", icon: <Clock className="w-5 h-5" /> },
          { label: "Aprovadas", count: aprovadas.length + estruturados.length, color: "green", icon: <CheckCircle className="w-5 h-5" /> },
          { label: "Sem Viabilidade", count: rejeitadas.length, color: "red", icon: <XCircle className="w-5 h-5" /> },
          { label: "Prédio/Cond.", count: predios.length, color: "purple", icon: <Building2 className="w-5 h-5" /> },
        ].map((item) => (
          <div key={item.label} className={`bg-white border rounded-xl p-4 flex items-center gap-3`}>
            <div className={`text-${item.color}-600`}>{item.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{item.count}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : results.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border text-gray-400">
          Nenhuma solicitação encontrada.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Em análise */}
          {emAnalise.length > 0 && (
            <Section title="🔍 Em Análise Técnica" color="blue">
              {emAnalise.map((r) => (
                <ResultCard key={r.id} r={r} onFinalizar={handleFinalizar} />
              ))}
            </Section>
          )}

          {/* Aprovadas */}
          {(aprovadas.length > 0 || estruturados.length > 0) && (
            <Section title="✅ Aprovadas" color="green">
              {[...aprovadas, ...estruturados].map((r) => (
                <ResultCard key={r.id} r={r} onFinalizar={handleFinalizar} showData />
              ))}
            </Section>
          )}

          {/* Sem viabilidade */}
          {rejeitadas.length > 0 && (
            <Section title="❌ Sem Viabilidade" color="red">
              {rejeitadas.map((r) => (
                <ResultCard key={r.id} r={r} onFinalizar={handleFinalizar} />
              ))}
            </Section>
          )}

          {/* UTP */}
          {utp.length > 0 && (
            <Section title="📡 Atendemos UTP" color="purple">
              {utp.map((r) => (
                <ResultCard key={r.id} r={r} onFinalizar={handleFinalizar} />
              ))}
            </Section>
          )}

          {/* Prédios pendentes */}
          {predios.length > 0 && (
            <Section title="🏢 Prédio / Condomínio" color="orange">
              {predios.map((r) => (
                <ResultCard key={r.id} r={r} onFinalizar={handleFinalizar} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className={`px-4 py-3 border-b bg-gray-50`}>
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function ResultCard({ r, onFinalizar, showData }: {
  r: Viabilizacao; onFinalizar: (id: string) => void; showData?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Formulário de dados do síndico
  const [nomeSindico, setNomeSindico] = useState("");
  const [contatoSindico, setContatoSindico] = useState("");
  const [nomeClientePredio, setNomeClientePredio] = useState("");
  const [contatoClientePredio, setContatoClientePredio] = useState("");
  const [apartamento, setApartamento] = useState(r.andar_predio ?? "");
  const [obsAgendamento, setObsAgendamento] = useState("");
  const [nomePredioInput, setNomePredioInput] = useState(r.predio_ftta ?? "");

  const isFtta = ["Prédio", "Condomínio"].includes(r.tipo_instalacao);
  const isCond = r.tipo_instalacao === "Condomínio";
  const aguardandoDados = r.status_predio === "aguardando_dados";
  const isAprovado = r.status === "aprovado";
  const canExpand = ["aprovado", "rejeitado", "utp"].includes(r.status) || isFtta;

  const statusLabel: Record<string, string> = {
    pendente: "⏳ Na fila",
    em_auditoria: "🔍 Em análise",
    aprovado: "✅ Aprovado",
    rejeitado: "❌ Sem viabilidade",
    utp: "📡 UTP",
    finalizado: "📦 Finalizado",
  };

  async function handleEnviarDados() {
    if (!nomeSindico || !contatoSindico || !nomeClientePredio || !contatoClientePredio || !apartamento) {
      alert("Preencha todos os campos obrigatórios (*)"); return;
    }
    setSubmitting(true);
    try {
      await enviarDadosPredio(r.id, {
        predio_ftta: nomePredioInput,
        nome_sindico: nomeSindico,
        contato_sindico: contatoSindico,
        nome_cliente_predio: nomeClientePredio,
        contato_cliente_predio: contatoClientePredio,
        apartamento,
        obs_agendamento: obsAgendamento,
      });
      onFinalizar(r.id); // força reload
    } catch { alert("Erro ao enviar. Tente novamente."); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="p-4">
      <FluxoStepper v={r} />

      <button onClick={() => setOpen(!open)} className="w-full text-left mt-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-gray-900">
              {r.tipo_instalacao === "FTTH" ? "🏠" : isCond ? "🏘️" : "🏢"}{" "}
              {r.nome_cliente ?? r.plus_code_cliente}
              {r.urgente && " 🔥"}
            </p>
            <p className="text-xs text-gray-400">
              📍 {r.plus_code_cliente} · {formatDateTime(r.data_solicitacao)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {statusLabel[r.status] ?? r.status}
            </span>
            {canExpand && (
              <span className="text-gray-400 text-sm">{open ? "▲" : "▼"}</span>
            )}
          </div>
        </div>
        {isAprovado && !open && !isFtta && (
          <p className="text-xs text-indigo-500 mt-1.5 font-medium">
            👆 Toque para ver os dados da viabilidade
          </p>
        )}
        {aguardandoDados && !open && (
          <p className="text-xs text-orange-500 mt-1.5 font-medium">
            ⚠️ Ação necessária — preencha os dados do {isCond ? "responsável" : "síndico"}
          </p>
        )}
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t space-y-3 text-sm text-gray-600">

          {/* ===== FTTH aprovado ===== */}
          {r.status === "aprovado" && r.tipo_instalacao === "FTTH" && (
            <div className="bg-green-50 rounded-lg p-3 space-y-1">
              <p><strong>CTO:</strong> {r.cto_numero}</p>
              <p><strong>Portas:</strong> {r.portas_disponiveis}</p>
              <p><strong>Menor RX:</strong> {r.menor_rx} dBm</p>
              <p><strong>Distância:</strong> {r.distancia_cliente}</p>
              <p><strong>Localização CTO:</strong> {r.localizacao_caixa}</p>
              {r.observacoes && <p><strong>Obs:</strong> {r.observacoes}</p>}
            </div>
          )}

          {/* ===== FTTA aprovado direto ===== */}
          {r.status === "aprovado" && r.tipo_instalacao === "Prédio" && (
            <div className="bg-green-50 rounded-lg p-3 space-y-1">
              <p><strong>CDOI:</strong> {r.cdoi}</p>
              <p><strong>Prédio:</strong> {r.predio_ftta}</p>
              <p><strong>Portas:</strong> {r.portas_disponiveis}</p>
              <p><strong>Média RX:</strong> {r.media_rx} dBm</p>
            </div>
          )}

          {/* ===== Rejeitado ===== */}
          {r.status === "rejeitado" && (
            <div className="bg-red-50 rounded-lg p-3">
              <p><strong>Motivo:</strong> {r.motivo_rejeicao ?? "Não temos projeto neste ponto."}</p>
            </div>
          )}

          {/* ===== UTP ===== */}
          {r.status === "utp" && (
            <div className="bg-purple-50 rounded-lg p-3">
              <p>Atendemos esta área via UTP (cabo de rede).</p>
            </div>
          )}

          {/* ===== AGUARDANDO DADOS DO SÍNDICO ===== */}
          {aguardandoDados && (
            <div className="space-y-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="font-medium text-orange-800 text-sm">
                  🏗️ Precisamos viabilizar a estrutura no {isCond ? "condomínio" : "prédio"}
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  Preencha os dados abaixo para que possamos agendar a visita técnica.
                </p>
              </div>

              <div className="space-y-2">
                <input type="text" placeholder={`Nome do ${isCond ? "condomínio" : "prédio"} *`}
                  value={nomePredioInput} onChange={(e) => setNomePredioInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">
                  {isCond ? "👤 Responsável do condomínio" : "👤 Síndico"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder={`Nome do ${isCond ? "responsável" : "síndico"} *`}
                    value={nomeSindico} onChange={(e) => setNomeSindico(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="text" placeholder="Telefone *"
                    value={contatoSindico} onChange={(e) => setContatoSindico(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">🏠 Cliente</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Nome do cliente *"
                    value={nomeClientePredio} onChange={(e) => setNomeClientePredio(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <input type="text" placeholder="Telefone *"
                    value={contatoClientePredio} onChange={(e) => setContatoClientePredio(e.target.value)}
                    className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <input type="text" placeholder={`${isCond ? "Casa/Lote" : "Apartamento"} *`}
                  value={apartamento} onChange={(e) => setApartamento(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <textarea placeholder="📅 Melhores dias e horários para a visita técnica"
                  value={obsAgendamento} onChange={(e) => setObsAgendamento(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>

              <button onClick={handleEnviarDados} disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  : "📤 Enviar para verificação técnica"}
              </button>
            </div>
          )}

          {/* ===== PRONTO PARA AGENDAR ===== */}
          {r.status_predio === "pronto_auditoria" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-800">✅ Dados enviados!</p>
              <p className="text-blue-700 mt-1">Aguardando o agendamento da visita técnica pelo nosso time.</p>
            </div>
          )}

          {/* ===== AGENDADO ===== */}
          {r.status_predio === "agendado" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1 text-sm">
              <p className="font-medium text-green-800">📅 Visita técnica agendada!</p>
              <p>📆 Data: <strong>{r.data_visita ? new Date(r.data_visita + "T12:00:00").toLocaleDateString("pt-BR") : "N/A"}</strong></p>
              <p>🕐 Período: {r.periodo_visita}</p>
              <p>👷 Técnico: {r.tecnico_responsavel}</p>
              <p>🔧 Tecnologia: {r.tecnologia_predio}</p>
              {r.giga && <p>⚡ Giga: Sim</p>}
            </div>
          )}

          {/* ===== ESTRUTURADO ===== */}
          {r.status_predio === "estruturado" && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-green-800">🎉 Estrutura instalada!</p>
              <p>🔧 Tecnologia: {r.tecnologia_predio}</p>
              <p>👷 Técnico: {r.tecnico_responsavel}</p>
            </div>
          )}

          {r.auditado_por && (
            <p className="text-xs text-gray-400">
              🔍 Auditado por: <strong>{r.auditado_por}</strong> · {formatDateTime(r.data_auditoria)}
            </p>
          )}

          {["aprovado", "rejeitado", "utp"].includes(r.status) && (
            <button onClick={() => onFinalizar(r.id)} className="mt-2 text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors">
              ✅ {r.status === "aprovado" ? "Finalizar" : "OK, Entendi"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
