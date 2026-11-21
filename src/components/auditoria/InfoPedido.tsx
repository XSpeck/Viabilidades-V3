"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Pencil, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import {
  cancelarPeloAuditor, corrigirDadosViabilizacao, deleteViabilizacao, devolverComMensagem, devolverViabilizacao,
} from "@/lib/firestore";
import { findPredioEstruturado, findPredioSemViab, type MatchPredio, type MatchPredioSemViab } from "@/lib/predios";
import { locationToPlusCode } from "@/lib/pluscode";
import type { TipoInstalacao } from "@/types";
import { Botao, BotaoConfirmar, Caixa, campo, Linha, MsgErro, useAcao } from "@/components/comum/ui";
import type { PropsEtapa } from "./tipos";

const TIPOS: { v: TipoInstalacao; r: string }[] = [
  { v: "FTTH", r: "Casa (FTTH)" },
  { v: "Prédio", r: "Prédio (FTTA)" },
  { v: "Condomínio", r: "Condomínio" },
];

/** Coluna de informações: dados do pedido, avisos do prédio e ações (fila, devolver, cancelar, excluir) */
export default function InfoPedido({ v, auditor, onFeito, tipo, nome, onTipo, onNome }: PropsEtapa & {
  tipo: TipoInstalacao; nome: string; onTipo: (t: TipoInstalacao) => void; onNome: (n: string) => void;
}) {
  const acao = useAcao();
  const [editando, setEditando] = useState(false);
  const [painel, setPainel] = useState<"" | "devolver" | "cancelar">("");
  const [texto, setTexto] = useState("");
  const [match, setMatch] = useState<{ est: MatchPredio | null; sem: MatchPredioSemViab | null } | null>(null);
  const ehPredio = v.tipo_instalacao !== "FTTH";
  const cond = tipo === "Condomínio";

  // Prédio já estruturado ou já recusado no mesmo local
  useEffect(() => {
    if (!ehPredio || v.status_predio) return;
    let vivo = true;
    const nomePredio = v.predio_ftta ?? undefined;
    Promise.all([findPredioEstruturado(v.plus_code_cliente, nomePredio), findPredioSemViab(v.plus_code_cliente, nomePredio)])
      .then(([est, sem]) => { if (vivo) setMatch({ est, sem }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [ehPredio, v.status_predio, v.plus_code_cliente, v.predio_ftta]);

  const abrir = (p: typeof painel) => { setPainel(painel === p ? "" : p); setTexto(""); acao.setErro(""); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Informações</h4>
        {!editando && !v.status_predio && (
          <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            <Pencil className="h-3 w-3" /> Editar
          </button>
        )}
      </div>

      {match?.est && !v.status_predio && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">Prédio já estruturado: {match.est.predio.predio_ftta}</p>
            <p>{Math.round(match.est.distancia)} m daqui · nome parecido{match.est.predio.data_auditoria && ` · ${new Date(match.est.predio.data_auditoria).toLocaleDateString("pt-BR")}`}</p>
          </div>
        </div>
      )}
      {match?.sem && !v.status_predio && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold">Já avaliado como sem viabilidade: {match.sem.predio.predio_ftta}</p>
            {match.sem.predio.motivo_rejeicao && <p>Motivo: {match.sem.predio.motivo_rejeicao}</p>}
          </div>
        </div>
      )}

      {editando ? (
        <div className="space-y-2">
          <select value={tipo} onChange={(e) => onTipo(e.target.value as TipoInstalacao)} className={campo()} aria-label="Tipo de instalação">
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
          </select>
          <input value={nome} onChange={(e) => onNome(e.target.value)} placeholder="Nome do cliente" className={campo()} />
          <MsgErro erro={acao.erro} />
          <div className="flex gap-2">
            <Botao ocupado={acao.ocupado} className="flex-1"
              onClick={() => acao.rodar(() => corrigirDadosViabilizacao(v.id, { nome_cliente: nome.trim() || undefined, tipo_instalacao: tipo }), () => { setEditando(false); onFeito("Dados do pedido corrigidos."); })}>
              Salvar
            </Botao>
            <Botao tipo="borda" onClick={() => { setEditando(false); onTipo(v.tipo_instalacao); onNome(v.nome_cliente ?? ""); }}>Cancelar</Botao>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm text-gray-600">
          <Linha r="Cliente" v={nome} />
          {v.telefone_cliente && (
            <p><span className="text-gray-500">Telefone:</span> <a href={`tel:${v.telefone_cliente.replace(/\D/g, "")}`} className="font-medium text-gray-800 hover:text-indigo-600 hover:underline">{v.telefone_cliente}</a></p>
          )}
          <p>
            <span className="text-gray-500">Local:</span>{" "}
            <a href={`https://maps.google.com/?q=${encodeURIComponent(v.plus_code_cliente)}`} target="_blank" rel="noopener noreferrer" className="font-mono font-medium text-gray-800 hover:text-indigo-600 hover:underline">
              {locationToPlusCode(v.plus_code_cliente)}
            </a>
          </p>
          <p>
            <span className="text-gray-500">Tipo:</span> <strong className="font-medium text-gray-800">{TIPOS.find((t) => t.v === tipo)?.r}</strong>
            {tipo !== v.tipo_instalacao && <span className="ml-1 text-xs font-medium text-amber-600">(alterado, não salvo)</span>}
          </p>
          <Linha r={cond ? "Condomínio" : "Prédio"} v={v.predio_ftta} />
          <Linha r={cond ? "Quadra" : "Bloco"} v={v.bloco_predio} />
          <Linha r={cond ? "Casa" : "Apto"} v={v.andar_predio} />
          {v.obs_usuario && (
            <div className="mt-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="mb-0.5 text-xs font-semibold text-orange-700">Observação do atendente</p>
              <p className="whitespace-pre-wrap text-orange-900">{v.obs_usuario}</p>
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2 pt-1">
        {!v.status_predio && (
          <>
            <BotaoConfirmar rotulo={<><RotateCcw className="h-3 w-3" /> Fila</>} pergunta="Devolver para a fila?" ocupado={acao.ocupado}
              onConfirmar={() => acao.rodar(() => devolverViabilizacao(v.id), () => onFeito("Pedido devolvido para a fila."))} />
            <Botao tipo="borda" onClick={() => abrir("devolver")} className="text-xs text-indigo-700"><Undo2 className="h-3 w-3" /> Devolver ao atendente</Botao>
          </>
        )}
        <Botao tipo="borda" onClick={() => abrir("cancelar")} className="text-xs text-red-600"><X className="h-3 w-3" /> Cancelar pedido</Botao>
        {auditor.adm && (
          <BotaoConfirmar rotulo={<><Trash2 className="h-3 w-3" /> Excluir de vez</>} pergunta="Apagar de vez? Some até do histórico." confirmar="Apagar" ocupado={acao.ocupado}
            onConfirmar={() => acao.rodar(() => deleteViabilizacao(v.id), () => onFeito("Pedido apagado."))} />
        )}
      </div>

      {painel === "devolver" && (
        <Caixa tom="indigo" titulo="Devolver ao atendente">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="O que ele precisa corrigir (endereço, tipo, nome…)" className={`${campo()} bg-white`} />
          <MsgErro erro={acao.erro} />
          <Botao ocupado={acao.ocupado} disabled={!texto.trim()} className="w-full"
            onClick={() => acao.rodar(() => devolverComMensagem(v.id, texto.trim(), auditor.nome, v.mensagens), () => onFeito("Pedido devolvido ao atendente com a mensagem."))}>
            Devolver com mensagem
          </Botao>
        </Caixa>
      )}
      {painel === "cancelar" && (
        <Caixa tom="vermelho" titulo="Cancelar este pedido?">
          <p className="text-xs text-red-700">Ele sai da sua lista e fica no histórico como “Cancelado”, com o motivo. Nada é apagado.</p>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Motivo (ex.: pedido duplicado, cliente desistiu)" className={`${campo()} bg-white`} />
          <MsgErro erro={acao.erro} />
          <Botao tipo="vermelho" ocupado={acao.ocupado} disabled={!texto.trim()} className="w-full"
            onClick={() => acao.rodar(() => cancelarPeloAuditor(v.id, texto, auditor.nome, auditor.uid), () => onFeito("Pedido cancelado."))}>
            Cancelar pedido
          </Botao>
        </Caixa>
      )}
      {!painel && <MsgErro erro={acao.erro} />}
    </div>
  );
}
