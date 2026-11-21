"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { cancelarPedidoNaFila, corrigirPedidoNaFila } from "@/lib/firestore";
import { formatarTelefone } from "@/lib/localizacao";
import { podeMexerNaFila } from "@/lib/statusViabilizacao";
import type { Viabilizacao } from "@/types";
import { Botao, Caixa, campo, Linha, MsgErro, useAcao } from "./ui";

/** O que o atendente enviou; na fila (sem auditor) dá para corrigir ou cancelar */
export default function EtapaFila({ r, onRefresh }: { r: Viabilizacao; onRefresh: () => void }) {
  const ehPredio = r.tipo_instalacao !== "FTTH";
  const cond = r.tipo_instalacao === "Condomínio";
  const podeMexer = podeMexerNaFila(r);
  const [modo, setModo] = useState<"ver" | "corrigir" | "cancelar">("ver");
  const acao = useAcao();

  const [nome, setNome] = useState(r.nome_cliente ?? "");
  const [telefone, setTelefone] = useState(r.telefone_cliente ?? "");
  const [predio, setPredio] = useState(r.predio_ftta ?? "");
  const [apto, setApto] = useState(r.andar_predio ?? "");
  const [bloco, setBloco] = useState(r.bloco_predio ?? "");
  const [obs, setObs] = useState(r.obs_usuario ?? "");
  const [urgente, setUrgente] = useState(!!r.urgente);
  const [motivo, setMotivo] = useState("");
  const [faltando, setFaltando] = useState(false);

  function salvar() {
    if (!nome.trim() || (ehPredio && (!predio.trim() || !apto.trim()))) { setFaltando(true); return; }
    acao.rodar(() => corrigirPedidoNaFila(r.id, {
      nome_cliente: nome.trim(),
      telefone_cliente: telefone.trim(),
      predio_ftta: ehPredio ? predio.trim() : undefined,
      andar_predio: ehPredio ? apto.trim() : undefined,
      bloco_predio: ehPredio ? bloco.trim() : undefined,
      obs_usuario: obs.trim(),
      urgente,
    }), () => { setModo("ver"); onRefresh(); });
  }

  if (modo === "corrigir") {
    return (
      <Caixa tom="indigo" titulo="Corrigir pedido">
        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente *" className={campo(faltando && !nome.trim())} />
          <input value={telefone} inputMode="tel" onChange={(e) => setTelefone(formatarTelefone(e.target.value))} placeholder="Telefone" className={campo()} />
          {ehPredio && (
            <>
              <input value={predio} onChange={(e) => setPredio(e.target.value)} placeholder={cond ? "Nome do condomínio *" : "Nome do prédio *"} className={`${campo(faltando && !predio.trim())} sm:col-span-2`} />
              <input value={apto} onChange={(e) => setApto(e.target.value)} placeholder={cond ? "Casa *" : "Apto *"} className={campo(faltando && !apto.trim())} />
              <input value={bloco} onChange={(e) => setBloco(e.target.value)} placeholder={cond ? "Quadra" : "Bloco"} className={campo()} />
            </>
          )}
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação para o auditor" className={`${campo()} resize-none sm:col-span-2`} />
        </div>
        <label className="flex items-center gap-2 pt-1 text-sm text-gray-700">
          <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-4 w-4 accent-red-600" /> Cliente presencial (urgente)
        </label>
        {faltando && <p className="text-xs text-red-600">Preencha os campos com *.</p>}
        <MsgErro erro={acao.erro} />
        <div className="flex gap-2 pt-1">
          <Botao ocupado={acao.ocupado} onClick={salvar} className="flex-1">Salvar correção</Botao>
          <Botao tipo="borda" onClick={() => { setModo("ver"); acao.setErro(""); }}>Voltar</Botao>
        </div>
      </Caixa>
    );
  }

  const enviado = (
    <>
      <Linha r="Cliente" v={r.nome_cliente} />
      <Linha r="Telefone" v={r.telefone_cliente} />
      <Linha r={cond ? "Condomínio" : "Prédio"} v={r.predio_ftta} />
      <Linha r={cond ? "Casa" : "Apto"} v={r.andar_predio} />
      <Linha r={cond ? "Quadra" : "Bloco"} v={r.bloco_predio} />
      {r.urgente && <p className="text-xs font-semibold text-red-600">Cliente presencial (urgente)</p>}
      {r.predio_estruturado && <p className="text-xs font-semibold text-emerald-700">Prédio pronto: {r.predio_estruturado}</p>}
      {r.obs_usuario && <p className="whitespace-pre-wrap text-gray-700">“{r.obs_usuario}”</p>}
    </>
  );

  // Depois da fila, o que foi enviado fica recolhido
  if (r.status !== "pendente") {
    return (
      <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-gray-500">O que você enviou</summary>
        <div className="mt-1 space-y-1">{enviado}</div>
      </details>
    );
  }

  return (
    <div className="space-y-2">
      <Caixa tom="cinza" titulo="O que você enviou">{enviado}</Caixa>

      {podeMexer && modo === "ver" && (
        <div className="flex flex-wrap gap-2">
          <Botao tipo="borda" onClick={() => setModo("corrigir")} className="text-xs"><Pencil className="h-3.5 w-3.5" /> Corrigir</Botao>
          <Botao tipo="borda" onClick={() => setModo("cancelar")} className="text-xs text-red-600"><X className="h-3.5 w-3.5" /> Cancelar pedido</Botao>
        </div>
      )}
      {podeMexer && modo === "cancelar" && (
        <Caixa tom="vermelho" titulo="Cancelar este pedido?">
          <p className="text-xs text-red-700">Ele sai da fila e fica no histórico como “Cancelado”.</p>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo (opcional)" className={`${campo()} resize-none`} />
          <MsgErro erro={acao.erro} />
          <div className="flex gap-2">
            <Botao tipo="vermelho" ocupado={acao.ocupado} onClick={() => acao.rodar(() => cancelarPedidoNaFila(r.id, motivo), onRefresh)} className="flex-1">Sim, cancelar</Botao>
            <Botao tipo="borda" onClick={() => { setModo("ver"); acao.setErro(""); }}>Voltar</Botao>
          </div>
        </Caixa>
      )}
      {!podeMexer && r.status === "pendente" && (
        <p className="text-xs text-gray-500">O auditor já pegou este pedido. Para mudar algo, fale com ele.</p>
      )}
    </div>
  );
}
