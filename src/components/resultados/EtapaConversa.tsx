"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { contestarViabilizacao, reenviarParaAuditoria } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { Botao, Caixa, campo, MsgErro, useAcao } from "./ui";

const COR_MSG = {
  auditoria: "border-blue-200 bg-blue-50",
  contestacao: "border-orange-200 bg-orange-50",
  resposta: "border-gray-200 bg-gray-50",
} as const;

/** Mensagens com o auditor: devolução, contestação e o histórico da conversa */
export default function EtapaConversa({ r, usuario, onRefresh }: { r: Viabilizacao; usuario: string; onRefresh: () => void }) {
  const devolvida = r.status === "em_revisao" && r.revisao_tipo === "devolvido";
  const contestacaoPendente = r.status === "em_revisao" && r.revisao_tipo === "contestado";
  const podeContestar = ["rejeitado", "utp"].includes(r.status) && !r.status_instalacao && !r.data_finalizacao;
  const [texto, setTexto] = useState("");
  const [contestando, setContestando] = useState(false);
  const acao = useAcao();

  return (
    <div className="space-y-2">
      {r.mensagens && r.mensagens.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Conversa com o auditor</p>
          {r.mensagens.map((m, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${COR_MSG[m.tipo] ?? COR_MSG.resposta}`}>
              <p className="mb-0.5 text-xs font-medium text-gray-500">{m.de} · {formatDateTime(m.data)}</p>
              <p className="whitespace-pre-wrap text-gray-800">{m.texto}</p>
            </div>
          ))}
        </div>
      )}

      {devolvida && (
        <Caixa tom="laranja" titulo="O auditor devolveu o pedido">
          <p className="text-xs text-orange-700">Responda e o pedido volta para a análise.</p>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Sua resposta ou correção…" className={`${campo()} bg-white`} />
          <MsgErro erro={acao.erro} />
          <Botao ocupado={acao.ocupado} disabled={!texto.trim()} onClick={() => acao.rodar(() => reenviarParaAuditoria(r.id, texto.trim(), usuario, r.mensagens), onRefresh)} className="w-full">
            Reenviar para análise
          </Botao>
        </Caixa>
      )}

      {contestacaoPendente && (
        <Caixa tom="azul" titulo="Contestação enviada">
          <p className="text-xs text-blue-700">Aguardando a resposta do auditor.</p>
        </Caixa>
      )}

      {podeContestar && !contestando && (
        <Botao tipo="borda" onClick={() => setContestando(true)} className="text-xs text-orange-700">
          <MessageSquare className="h-3.5 w-3.5" /> Contestar decisão
        </Botao>
      )}
      {podeContestar && contestando && (
        <Caixa tom="laranja" titulo="Contestar a decisão do auditor">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ex.: o vizinho tem nossa internet, o endereço certo é outro…" className={`${campo()} bg-white`} />
          <MsgErro erro={acao.erro} />
          <div className="flex gap-2">
            <Botao tipo="laranja" ocupado={acao.ocupado} disabled={!texto.trim()} onClick={() => acao.rodar(() => contestarViabilizacao(r.id, texto.trim(), usuario, r.status, r.mensagens), onRefresh)} className="flex-1">
              Enviar contestação
            </Botao>
            <Botao tipo="borda" onClick={() => setContestando(false)}>Voltar</Botao>
          </div>
        </Caixa>
      )}
    </div>
  );
}
