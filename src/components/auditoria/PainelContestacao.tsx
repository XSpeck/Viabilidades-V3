"use client";

import { useState } from "react";
import { manterDecisaoContestacao, revisarContestacao } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import { Botao, Caixa, campo, MsgErro, useAcao } from "@/components/comum/ui";
import { STATUS_ANTERIOR, type PropsEtapa } from "./tipos";

const COR_MSG = {
  auditoria: "border-blue-200 bg-blue-50",
  contestacao: "border-orange-200 bg-orange-50",
  resposta: "border-gray-200 bg-gray-50",
} as const;

/** Conversa com o atendente e o painel de contestação (revisar ou manter e responder) */
export default function PainelContestacao({ v, auditor, onFeito }: PropsEtapa) {
  const acao = useAcao();
  const [respondendo, setRespondendo] = useState(false);
  const [texto, setTexto] = useState("");
  const contestacao = v.status === "em_revisao" && v.revisao_tipo === "contestado";
  const reanalisando = v.status === "em_auditoria" && v.revisao_tipo === "contestado";
  const reaberto = v.status === "em_auditoria" && v.revisao_tipo === "reaberto";
  const anterior = v.status_anterior ? STATUS_ANTERIOR[v.status_anterior] ?? v.status_anterior : "";

  return (
    <div className="space-y-2">
      {reanalisando && (
        <Caixa tom="laranja" titulo="Reanalisando após contestação">
          <p className="text-xs text-orange-700">O atendente contestou a decisão anterior{anterior && ` (${anterior})`}. Leia a conversa e decida de novo.</p>
        </Caixa>
      )}
      {reaberto && (
        <Caixa tom="amarelo" titulo="Reaberto para correção">
          <p className="text-xs text-yellow-800">Você reabriu esta viabilidade (estava aprovada). Corrija os dados e decida de novo.</p>
        </Caixa>
      )}

      {v.mensagens && v.mensagens.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Conversa</p>
          {v.mensagens.map((m, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${COR_MSG[m.tipo] ?? COR_MSG.resposta}`}>
              <p className="mb-0.5 text-xs font-medium text-gray-500">{m.de} · {formatDateTime(m.data)}</p>
              <p className="whitespace-pre-wrap text-gray-800">{m.texto}</p>
            </div>
          ))}
        </div>
      )}

      {contestacao && (
        <div className="space-y-2">
          <Caixa tom="laranja" titulo={`O atendente contestou a decisão${anterior ? ` (${anterior})` : ""}`}>
            <p className="text-xs text-orange-700">Leia a conversa e escolha como seguir.</p>
          </Caixa>
          <div className="flex gap-2">
            <Botao ocupado={acao.ocupado} className="flex-1" onClick={() => acao.rodar(() => revisarContestacao(v.id), () => onFeito("Pedido reaberto para nova análise."))}>
              Revisar a viabilidade
            </Botao>
            <Botao tipo="borda" onClick={() => setRespondendo(!respondendo)} className="flex-1 text-orange-700">Manter e responder</Botao>
          </div>
          {respondendo && (
            <div className="space-y-2">
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Explique por que a decisão se mantém…" className={campo()} />
              <Botao tipo="laranja" ocupado={acao.ocupado} disabled={!texto.trim()} className="w-full"
                onClick={() => acao.rodar(() => manterDecisaoContestacao(v.id, texto.trim(), auditor.nome, v.status_anterior ?? "rejeitado", v.mensagens), () => onFeito("Decisão mantida e resposta enviada ao atendente."))}>
                Confirmar e enviar resposta
              </Botao>
            </div>
          )}
          <MsgErro erro={acao.erro} />
        </div>
      )}
    </div>
  );
}
