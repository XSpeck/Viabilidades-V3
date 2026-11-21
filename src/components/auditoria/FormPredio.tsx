"use client";

import { useState } from "react";
import { AlertTriangle, Map as MapIcon } from "lucide-react";
import { aprovarFTTA, marcarUTP, rejeitarViabilizacao, solicitarViabilizacaoPredio } from "@/lib/firestore";
import { Botao, BotaoConfirmar, campo, MsgErro, useAcao } from "@/components/comum/ui";
import FttaMap from "./FttaMap";
import SemViabilidade from "./SemViabilidade";
import { MODULOS } from "@/lib/modulos";
import { avisoRx, type PropsEtapa } from "./tipos";

type Campo = "cdoi" | "olt" | "predio" | "portas" | "rx";

/** Prédio (FTTA): CDOI, dados e decisão (viabilizar, UTP, pedir estrutura ou sem viabilidade) */
export default function FormPredio({ v, auditor, onFeito, nome, onMapa }: PropsEtapa & { nome: string; onMapa: (aberto: boolean) => void }) {
  const acao = useAcao();
  const [mapa, setMapa] = useState(false);
  const [cdoi, setCdoi] = useState(v.cdoi ?? "");
  const [predio, setPredio] = useState(v.predio_ftta ?? "");
  const [portas, setPortas] = useState(v.portas_disponiveis ? String(v.portas_disponiveis) : "");
  const [rx, setRx] = useState(v.media_rx ?? "");
  const [olt, setOlt] = useState(v.olt ?? "");
  const [obs, setObs] = useState(v.observacoes ?? "");
  const [erros, setErros] = useState<Campo[]>([]);
  const [semViab, setSemViab] = useState(false);
  const [rxConfirmado, setRxConfirmado] = useState(false);
  const aviso = avisoRx(rx);
  const errado = (c: Campo) => erros.includes(c);
  const mudar = (c: Campo, set: (x: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value); setErros((x) => x.filter((y) => y !== c)); };
  const quem = nome || v.predio_ftta || "Pedido";

  function viabilizar() {
    const faltando: Campo[] = [];
    if (!cdoi.trim()) faltando.push("cdoi");
    if (!olt.trim()) faltando.push("olt");
    if (!predio.trim()) faltando.push("predio");
    if (!(Number(portas) > 0)) faltando.push("portas");
    if (!rx.trim()) faltando.push("rx");
    setErros(faltando);
    if (faltando.length) return;
    if (aviso && !rxConfirmado) { setRxConfirmado(true); return; }
    acao.rodar(() => aprovarFTTA(v.id, {
      cdoi: cdoi.trim(), predio_ftta: predio.trim(), portas_disponiveis: Number(portas), media_rx: rx.trim().replace(",", "."),
      observacoes: obs.trim(), olt: olt.trim(), tipo_instalacao: "Prédio", nome_cliente: nome.trim() || undefined,
    }, auditor.nome, auditor.uid), () => onFeito(`${quem}: viabilidade aprovada${MODULOS.agendamento ? " e enviada para o agendamento" : ""}.`));
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">Dados do prédio (FTTA)</h4>
      <button type="button" onClick={() => { setMapa(!mapa); if (mapa) onMapa(false); }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-2.5 text-sm font-medium ${mapa ? "border-blue-400 bg-blue-50 text-blue-700" : "border-blue-300 text-blue-600 hover:bg-blue-50"}`}>
        <MapIcon className="h-4 w-4" /> {mapa ? "Ocultar mapa" : "Ver redes e CDOIs no mapa"}
      </button>
      {mapa && (
        <FttaMap plusCode={v.plus_code_cliente} nomeCliente={v.nome_cliente}
          onSelectCdoi={(n) => { setCdoi(n); setErros((x) => x.filter((y) => y !== "cdoi")); }}
          onConfirm={() => { setMapa(false); onMapa(false); }} onExpandChange={onMapa} />
      )}

      <div className="grid grid-cols-2 gap-2">
        <input placeholder="CDOI *" value={cdoi} onChange={mudar("cdoi", setCdoi)} className={`${campo(errado("cdoi"))} col-span-2`} />
        <input placeholder="OLT *" value={olt} onChange={mudar("olt", setOlt)} className={`${campo(errado("olt"))} col-span-2`} />
        <input placeholder="Nome do prédio *" value={predio} onChange={mudar("predio", setPredio)} className={`${campo(errado("predio"))} col-span-2`} />
        <input type="number" min={1} placeholder="Portas livres *" value={portas} onChange={mudar("portas", setPortas)} className={campo(errado("portas"))} />
        <input inputMode="decimal" placeholder="Média RX (dBm) *" value={rx} onChange={(e) => { setRx(e.target.value); setRxConfirmado(false); setErros((x) => x.filter((y) => y !== "rx")); }} className={campo(errado("rx") || !!aviso)} />
        {aviso && <p className="col-span-2 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {aviso}</p>}
        <textarea placeholder="Observações" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={`${campo()} col-span-2 resize-none`} />
      </div>
      {erros.length > 0 && <p className="text-xs text-red-600">Preencha o que está em vermelho.</p>}
      <MsgErro erro={acao.erro} />

      {semViab ? (
        <SemViabilidade ocupado={acao.ocupado} erro={acao.erro} onCancelar={() => setSemViab(false)}
          onConfirmar={(m) => acao.rodar(() => rejeitarViabilizacao(v.id, m, auditor.nome, auditor.uid), () => onFeito(`${quem}: sem viabilidade registrada.`))} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Botao tipo="verde" ocupado={acao.ocupado} onClick={viabilizar}>{aviso && rxConfirmado ? "Mesmo assim" : "Viabilizar"}</Botao>
            <BotaoConfirmar rotulo="UTP" pergunta="Atender por UTP?" classeAberto="col-span-3 order-last" ocupado={acao.ocupado}
              onConfirmar={() => acao.rodar(() => marcarUTP(v.id, auditor.nome, auditor.uid), () => onFeito(`${quem}: marcado como UTP.`))} />
            <BotaoConfirmar rotulo="Pedir estrutura" pergunta="Pedir os dados do síndico?" classeAberto="col-span-3 order-last" ocupado={acao.ocupado}
              onConfirmar={() => acao.rodar(() => solicitarViabilizacaoPredio(v.id), () => onFeito("Pedido de dados do prédio enviado ao atendente."))} />
          </div>
          <Botao tipo="borda" onClick={() => setSemViab(true)} className="w-full text-red-600">Sem viabilidade</Botao>
        </>
      )}
    </div>
  );
}
