"use client";

import { useState } from "react";
import { arquivarPorDesistencia, finalizarViabilizacao } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { Viabilizacao } from "@/types";
import { Botao, BotaoConfirmar, Caixa, campo, MsgErro, useAcao } from "@/components/comum/ui";

/** Fechar o pedido (Finalizar / Entendi / Arquivar / Ciente) e desistência, sempre com confirmação */
export default function AcoesFinais({ r, onRefresh }: { r: Viabilizacao; onRefresh: () => void }) {
  const acao = useAcao();
  const [desistindo, setDesistindo] = useState(false);
  const [motivo, setMotivo] = useState("");

  const aberto = !r.data_finalizacao;
  const resultadoSimples = ["aprovado", "rejeitado", "utp"].includes(r.status) && !r.status_instalacao && !r.status_predio;
  const fechar = resultadoSimples
    ? { rotulo: r.status === "aprovado" ? "Finalizar" : "OK, entendi", pergunta: "Tirar este pedido da lista? Ele fica no histórico." }
    : r.status_instalacao === "instalado"
      ? { rotulo: "Arquivar", pergunta: "Arquivar este pedido? Ele fica no histórico." }
      : r.status_predio === "estruturado" && !r.status_instalacao
        ? { rotulo: "Ciente", pergunta: "Tirar este pedido da lista? Ele fica no histórico." }
        : null;
  const podeDesistir = r.status === "aprovado" && !!r.status_instalacao && !["instalado", "agendado"].includes(r.status_instalacao);

  return (
    <div className="space-y-2">
      {r.auditado_por && <p className="text-xs text-gray-400">Auditado por <strong>{r.auditado_por}</strong> · {formatDateTime(r.data_auditoria)}</p>}

      {aberto && fechar && (
        <BotaoConfirmar
          rotulo={fechar.rotulo}
          pergunta={fechar.pergunta}
          tipo={r.status_instalacao === "instalado" ? "primario" : "borda"}
          ocupado={acao.ocupado}
          onConfirmar={() => acao.rodar(() => finalizarViabilizacao(r.id), onRefresh)}
        />
      )}

      {aberto && podeDesistir && !desistindo && (
        <button type="button" onClick={() => setDesistindo(true)} className="text-xs font-medium text-red-500 hover:text-red-700">
          O cliente não tem mais interesse
        </button>
      )}
      {aberto && podeDesistir && desistindo && (
        <Caixa tom="vermelho" titulo="Registrar desistência">
          <p className="text-xs text-red-700">O pedido será arquivado. O histórico continua disponível.</p>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo (opcional)" className={`${campo()} resize-none bg-white`} />
          <div className="flex gap-2">
            <Botao tipo="vermelho" ocupado={acao.ocupado} onClick={() => acao.rodar(() => arquivarPorDesistencia(r.id, motivo), onRefresh)} className="flex-1">Confirmar</Botao>
            <Botao tipo="borda" onClick={() => setDesistindo(false)}>Voltar</Botao>
          </div>
        </Caixa>
      )}
      <MsgErro erro={acao.erro} />
    </div>
  );
}
