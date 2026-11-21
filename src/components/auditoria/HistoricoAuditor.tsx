"use client";

import { useMemo, useState } from "react";
import { ChevronDown, History, Loader2, Search } from "lucide-react";
import { getViabilizacoesRelatorio, reabrirAprovacao } from "@/lib/firestore";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import { semAcento } from "@/lib/localizacao";
import { statusDe } from "@/lib/statusViabilizacao";
import type { Viabilizacao } from "@/types";
import DadosAprovados from "@/components/resultados/DadosAprovados";
import { Botao, Caixa, campo, MsgErro, useAcao } from "@/components/comum/ui";
import type { Auditor } from "./tipos";

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

/** Situação vista pelo auditor: a decisão que ele tomou */
function decisao(v: Viabilizacao): { rotulo: string; cor: string } {
  if (v.status === "em_auditoria" && v.revisao_tipo === "reaberto") return { rotulo: "Reaberto", cor: "bg-amber-100 text-amber-700" };
  if (v.status === "aprovado") return { rotulo: "Aprovado", cor: "bg-green-100 text-green-700" };
  if (v.status === "rejeitado") return { rotulo: "Sem viabilidade", cor: "bg-red-100 text-red-700" };
  if (v.status === "utp") return { rotulo: "UTP", cor: "bg-purple-100 text-purple-700" };
  const s = statusDe(v);
  return { rotulo: s.rotulo, cor: s.cor };
}

function ItemHistorico({ v, auditor }: { v: Viabilizacao; auditor: Auditor }) {
  const [aberto, setAberto] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [feito, setFeito] = useState(false);
  const acao = useAcao();
  const d = decisao(v);

  return (
    <div className="overflow-hidden rounded-lg border">
      <button type="button" onClick={() => setAberto(!aberto)} className="w-full px-4 py-3 text-left hover:bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {v.nome_cliente ?? locationToPlusCode(v.plus_code_cliente)}
              {v.predio_ftta && <span className="font-normal text-gray-500"> · {v.predio_ftta}</span>}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">{v.tipo_instalacao === "FTTH" ? "Casa" : v.tipo_instalacao} · auditado em {formatDateTime(v.data_auditoria)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${d.cor}`}>{d.rotulo}</span>
        </div>
      </button>
      {aberto && (
        <div className="space-y-2 border-t px-4 pb-4 pt-3 text-sm text-gray-700">
          <DadosAprovados r={v} />
          {v.motivo_desistencia && <p className="text-xs text-gray-600">{v.motivo_desistencia}</p>}
          <p className="text-xs text-gray-400">Pedido por <strong>{v.usuario}</strong> em {formatDateTime(v.data_solicitacao)}</p>

          {v.status === "aprovado" && (feito ? (
            <Caixa tom="amarelo"><p className="text-yellow-800">Reaberto: o pedido voltou para a sua lista.</p></Caixa>
          ) : !reabrindo ? (
            <Botao tipo="borda" onClick={() => setReabrindo(true)} className="text-xs text-amber-700">Reabrir para correção</Botao>
          ) : (
            <Caixa tom="amarelo" titulo="O que precisa ser corrigido?">
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ex.: CTO errada, número de portas incorreto…" className={`${campo()} bg-white`} />
              <p className="text-xs text-yellow-800">O pedido volta para a sua lista e o agendamento da instalação, se começou, é cancelado.</p>
              <MsgErro erro={acao.erro} />
              <div className="flex gap-2">
                <Botao tipo="laranja" ocupado={acao.ocupado} disabled={!motivo.trim()} className="flex-1"
                  onClick={() => acao.rodar(() => reabrirAprovacao(v.id, motivo.trim(), auditor.nome, v.mensagens), () => setFeito(true))}>
                  Confirmar reabertura
                </Botao>
                <Botao tipo="borda" onClick={() => setReabrindo(false)}>Voltar</Botao>
              </div>
            </Caixa>
          ))}
        </div>
      )}
    </div>
  );
}

/** Meu histórico: decisões deste auditor no período (pelo id do login, ou pelo nome nos registros antigos) */
export default function HistoricoAuditor({ auditor }: { auditor: Auditor }) {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(() => diasAtras(7));
  const [ate, setAte] = useState(hoje);
  const [lista, setLista] = useState<Viabilizacao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [situacao, setSituacao] = useState("todos");

  async function buscar() {
    setCarregando(true);
    setErro("");
    try {
      const todos = await getViabilizacoesRelatorio(de, ate);
      setLista(todos.filter((v) => v.auditado_por_id === auditor.uid || (!v.auditado_por_id && v.auditado_por === auditor.nome)));
    } catch {
      setErro("Não foi possível buscar o histórico.");
    } finally {
      setCarregando(false);
    }
  }

  const situacoes = useMemo(() => [...new Set((lista ?? []).map((v) => decisao(v).rotulo))], [lista]);
  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    return (lista ?? [])
      .filter((v) => tipo === "todos" || v.tipo_instalacao === tipo)
      .filter((v) => situacao === "todos" || decisao(v).rotulo === situacao)
      .filter((v) => !q || semAcento([v.nome_cliente, v.plus_code_cliente, v.predio_ftta, v.cto_numero, v.cdoi].filter(Boolean).join(" ")).includes(q))
      .sort((a, b) => (b.data_auditoria ?? "").localeCompare(a.data_auditoria ?? ""));
  }, [lista, busca, tipo, situacao]);

  const sel = "rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50" aria-expanded={aberto}>
        <span className="flex items-center gap-2 font-semibold text-gray-800"><History className="h-5 w-5 text-indigo-600" /> Meu histórico de auditorias</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={`${sel} px-2`} />
              até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={`${sel} px-2`} />
            </span>
            <Botao ocupado={carregando} disabled={!de || !ate} onClick={buscar}>Buscar</Botao>
          </div>
          {lista && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, plus code, prédio, CTO…" className={`${sel} w-full pl-9`} />
              </div>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={sel} aria-label="Tipo">
                <option value="todos">Todos os tipos</option><option value="FTTH">Casa</option><option value="Prédio">Prédio</option><option value="Condomínio">Condomínio</option>
              </select>
              <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={sel} aria-label="Decisão">
                <option value="todos">Todas as decisões</option>
                {situacoes.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {carregando ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
          ) : !lista ? (
            <p className="py-6 text-center text-sm text-gray-400">Escolha o período e clique em Buscar.</p>
          ) : filtrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nada encontrado nesse período e filtros.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">{filtrados.length} de {lista.length} decisão(ões)</p>
              {filtrados.map((v) => <ItemHistorico key={v.id} v={v} auditor={auditor} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
