"use client";

import { useState } from "react";
import { Botao, Caixa, campo, MsgErro } from "@/components/comum/ui";
import { MOTIVOS_SEM_VIAB } from "./tipos";

/** Confirmar "Sem viabilidade": motivo pronto (um clique) + detalhe livre */
export default function SemViabilidade({ ocupado, erro, onConfirmar, onCancelar, motivos = MOTIVOS_SEM_VIAB }: {
  ocupado: boolean; erro?: string; onConfirmar: (motivo: string) => void; onCancelar: () => void; motivos?: string[];
}) {
  const [escolhido, setEscolhido] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const motivo = [escolhido, detalhe.trim()].filter(Boolean).join(": ");

  return (
    <Caixa tom="vermelho" titulo="Confirmar sem viabilidade">
      <div className="flex flex-wrap gap-1.5 pt-1">
        {motivos.map((m) => (
          <button key={m} type="button" onClick={() => setEscolhido(escolhido === m ? "" : m)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${escolhido === m ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-white text-red-700 hover:bg-red-50"}`}>
            {m}
          </button>
        ))}
      </div>
      <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={2}
        placeholder={escolhido ? "Detalhe (opcional)" : "Ou escreva o motivo *"} className={`${campo()} resize-none bg-white`} />
      <MsgErro erro={erro} />
      <div className="flex gap-2">
        <Botao tipo="vermelho" ocupado={ocupado} disabled={!motivo} onClick={() => onConfirmar(motivo)} className="flex-1">Confirmar</Botao>
        <Botao tipo="borda" onClick={onCancelar}>Voltar</Botao>
      </div>
    </Caixa>
  );
}
