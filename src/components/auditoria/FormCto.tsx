"use client";

import { useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { aprovarFTTH, rejeitarViabilizacao, salvarCTOEscolhida, solicitarViabilizacaoPredio } from "@/lib/firestore";
import type { TipoInstalacao } from "@/types";
import { Botao, campo, MsgErro, useAcao } from "@/components/comum/ui";
import CtoBusca from "./CtoBusca";
import SemViabilidade from "./SemViabilidade";
import { MODULOS } from "@/lib/modulos";
import { avisoRx, type PropsEtapa } from "./tipos";

type Campo = "cto" | "olt" | "distancia" | "localizacao" | "portas" | "rx";

/** Casa (FTTH) e Condomínio: escolha da CTO, dados e decisão (o traçado da rota do cabo foi tirado por enquanto) */
export default function FormCto({ v, auditor, onFeito, tipo, nome, onMapa }: PropsEtapa & {
  tipo: TipoInstalacao; nome: string; onMapa: (aberto: boolean) => void;
}) {
  const cond = tipo === "Condomínio";
  const acao = useAcao();
  const [busca, setBusca] = useState(false);
  const [cto, setCto] = useState(v.cto_numero ?? "");
  const [distancia, setDistancia] = useState(v.distancia_cliente ?? "");
  const [localizacao, setLocalizacao] = useState(v.localizacao_caixa ?? "");
  const [portas, setPortas] = useState(v.portas_disponiveis ? String(v.portas_disponiveis) : "");
  const [rx, setRx] = useState(v.menor_rx ?? "");
  const [olt, setOlt] = useState(v.olt ?? "");
  const [obs, setObs] = useState(v.observacoes ?? "");
  const [erros, setErros] = useState<Campo[]>([]);
  const [semViab, setSemViab] = useState(false);
  const [rxConfirmado, setRxConfirmado] = useState(false);
  const aviso = avisoRx(rx);
  const errado = (c: Campo) => erros.includes(c);
  const mudar = (c: Campo, set: (x: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { set(e.target.value); setErros((x) => x.filter((y) => y !== c)); };

  function viabilizar() {
    const faltando: Campo[] = [];
    if (!cto.trim()) faltando.push("cto");
    if (!olt.trim()) faltando.push("olt");
    if (!distancia.trim()) faltando.push("distancia");
    if (!localizacao.trim()) faltando.push("localizacao");
    if (!(Number(portas) > 0)) faltando.push("portas");
    if (!rx.trim()) faltando.push("rx");
    setErros(faltando);
    if (faltando.length) return;
    if (aviso && !rxConfirmado) { setRxConfirmado(true); return; }
    acao.rodar(() => aprovarFTTH(v.id, {
      cto_numero: cto.trim(), portas_disponiveis: Number(portas), menor_rx: rx.trim().replace(",", "."),
      distancia_cliente: distancia.trim(), localizacao_caixa: localizacao.trim(), observacoes: obs.trim(),
      olt: olt.trim(), tipo_instalacao: tipo, nome_cliente: nome.trim() || undefined,
    }, auditor.nome, auditor.uid), () => onFeito(`${nome || "Pedido"}: viabilidade aprovada${MODULOS.agendamento ? " e enviada para o agendamento" : ""}.`));
  }

  if (busca) {
    return (
      <CtoBusca
        plusCode={v.plus_code_cliente}
        nomeCliente={v.nome_cliente}
        initialCto={cto || undefined}
        semRota
        onConfirm={(d) => {
          setCto(d.cto_numero); setDistancia(d.distancia_cliente); setLocalizacao(d.localizacao_caixa);
          setErros((x) => x.filter((y) => !["cto", "distancia", "localizacao"].includes(y)));
          setBusca(false); onMapa(false);
          acao.rodar(() => salvarCTOEscolhida(v.id, d));
        }}
        onClose={() => { setBusca(false); onMapa(false); }}
        onExpandChange={onMapa}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">{cond ? "Dados do condomínio" : "Dados da casa (FTTH)"}</h4>

      {cto && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <span>CTO <strong>{cto}</strong>{distancia && ` · ${distancia}`}</span>
          <button type="button" onClick={() => setBusca(true)} className="text-indigo-600 underline">Trocar</button>
        </div>
      )}
      <button type="button" onClick={() => setBusca(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
        <Search className="h-4 w-4" /> {cto ? "Buscar outra CTO" : "Buscar CTOs próximas"}
      </button>


      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Nº da CTO *" value={cto} onChange={mudar("cto", setCto)} className={`${campo(errado("cto"))} col-span-2`} />
        <input placeholder="OLT *" value={olt} onChange={mudar("olt", setOlt)} className={`${campo(errado("olt"))} col-span-2`} />
        <input placeholder="Distância *" value={distancia} onChange={mudar("distancia", setDistancia)} className={campo(errado("distancia"))} />
        <input placeholder="Localização da caixa *" value={localizacao} onChange={mudar("localizacao", setLocalizacao)} className={campo(errado("localizacao"))} />
        <input type="number" min={1} placeholder="Portas livres *" value={portas} onChange={mudar("portas", setPortas)} className={campo(errado("portas"))} />
        <input inputMode="decimal" placeholder="Menor RX (dBm) *" value={rx} onChange={(e) => { setRx(e.target.value); setRxConfirmado(false); setErros((x) => x.filter((y) => y !== "rx")); }} className={campo(errado("rx") || !!aviso)} />
        {aviso && <p className="col-span-2 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {aviso}</p>}
        <textarea placeholder="Observações" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={`${campo()} col-span-2 resize-none`} />
      </div>
      {erros.length > 0 && <p className="text-xs text-red-600">Preencha o que está em vermelho.</p>}
      <MsgErro erro={acao.erro} />

      {semViab ? (
        <SemViabilidade ocupado={acao.ocupado} erro={acao.erro} onCancelar={() => setSemViab(false)}
          onConfirmar={(m) => acao.rodar(() => rejeitarViabilizacao(v.id, m, auditor.nome, auditor.uid), () => onFeito(`${nome || "Pedido"}: sem viabilidade registrada.`))} />
      ) : (
        <div className="flex gap-2">
          <Botao tipo="verde" ocupado={acao.ocupado} onClick={viabilizar} className="flex-1">
            {aviso && rxConfirmado ? "Viabilizar mesmo assim" : "Viabilizar"}
          </Botao>
          <Botao tipo="borda" onClick={() => setSemViab(true)} className="flex-1 text-red-600">Sem viabilidade</Botao>
        </div>
      )}

      {cond && !semViab && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <p>Tem projeto na rua, mas o condomínio ainda não tem estrutura?</p>
          <Botao ocupado={acao.ocupado} className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => acao.rodar(() => solicitarViabilizacaoPredio(v.id, auditor.nome, auditor.uid), () => onFeito("Pedido de dados da estrutura enviado ao atendente."))}>
            Solicitar estrutura do condomínio
          </Botao>
        </div>
      )}
    </div>
  );
}
