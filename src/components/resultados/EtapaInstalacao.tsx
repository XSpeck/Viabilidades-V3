"use client";

import { useState } from "react";
import { agendarViaWhatsapp, confirmarPropostaUsuario, enviarPropostaInstalacao } from "@/lib/firestore";
import type { Viabilizacao } from "@/types";
import { Botao, Caixa, CamposData, dataBr, Historico, Linha, MsgErro, useAcao } from "@/components/comum/ui";

/** Agendamento da instalação: propor data, aguardar, confirmar a contraproposta, agendada, instalada */
export default function EtapaInstalacao({ r, onRefresh }: { r: Viabilizacao; onRefresh: () => void }) {
  const [data, setData] = useState("");
  const [periodo, setPeriodo] = useState("Manhã");
  const [obs, setObs] = useState("");
  const [outraData, setOutraData] = useState(false);
  const acao = useAcao();

  if (!r.status_instalacao) return null;

  const enviarProposta = () =>
    acao.rodar(() => enviarPropostaInstalacao(r.id, { proposta_data: data, proposta_periodo: periodo, proposta_obs: obs.trim() || undefined }, r.historico_agendamento, r.ag_chegou_em), onRefresh);

  const formProposta = (rotulo: string) => (
    <div className="space-y-2">
      <CamposData data={data} periodo={periodo} obs={obs} onData={setData} onPeriodo={setPeriodo} onObs={setObs} />
      <Botao ocupado={acao.ocupado} disabled={!data} onClick={enviarProposta} className="w-full">{rotulo}</Botao>
    </div>
  );

  switch (r.status_instalacao) {
    case "aguardando_proposta":
      return (
        <div className="space-y-2">
          <Caixa tom="indigo" titulo="Viabilidade aprovada!">
            <p className="text-indigo-800">Informe a data e o período de preferência para a instalação.</p>
          </Caixa>
          {formProposta("Enviar para agendamento")}
          <Botao tipo="borda" ocupado={acao.ocupado} onClick={() => acao.rodar(() => agendarViaWhatsapp(r.id, r.historico_agendamento), onRefresh)} className="w-full text-green-700">
            Já combinei direto pelo WhatsApp
          </Botao>
          <MsgErro erro={acao.erro} />
        </div>
      );

    case "proposta_enviada":
      return (
        <Caixa tom="amarelo" titulo="Proposta enviada ao agendamento">
          <Linha r="Sua preferência" v={`${dataBr(r.proposta_data)} — ${r.proposta_periodo ?? ""}`} />
          {r.proposta_obs && <p className="whitespace-pre-wrap text-gray-600">{r.proposta_obs}</p>}
          <p className="text-xs text-yellow-800">Aguardando o setor de agendamento confirmar.</p>
        </Caixa>
      );

    case "aguardando_confirmacao":
      return (
        <div className="space-y-2">
          <Caixa tom="laranja" titulo="O agendamento propôs outra data">
            <Linha r="Nova data" v={`${dataBr(r.agendamento_data)} — ${r.agendamento_periodo ?? ""}`} />
            <Linha r="Técnico" v={r.agendamento_tecnico} />
            {r.agendamento_obs && <p className="whitespace-pre-wrap text-gray-600">{r.agendamento_obs}</p>}
          </Caixa>
          {!outraData ? (
            <div className="flex flex-wrap gap-2">
              <Botao
                tipo="verde"
                ocupado={acao.ocupado}
                disabled={!r.agendamento_data}
                onClick={() => acao.rodar(() => confirmarPropostaUsuario(r.id, { agendamento_data: r.agendamento_data!, agendamento_periodo: r.agendamento_periodo ?? "Manhã" }, r.historico_agendamento), onRefresh)}
                className="flex-1"
              >
                Confirmar esta data
              </Botao>
              <Botao tipo="borda" onClick={() => setOutraData(true)}>Propor outra</Botao>
            </div>
          ) : (
            <>
              {formProposta("Enviar nova proposta")}
              <button type="button" onClick={() => setOutraData(false)} className="text-xs text-gray-500 hover:text-gray-700">Voltar</button>
            </>
          )}
          <MsgErro erro={acao.erro} />
        </div>
      );

    case "agendado":
      return (
        <Caixa tom="verde" titulo="Instalação agendada!">
          <Linha r="Data" v={dataBr(r.data_instalacao)} />
          <Linha r="Período" v={r.periodo_instalacao} />
          <Linha r="Técnico" v={r.tecnico_instalacao} />
          <Historico texto={r.historico_agendamento} />
        </Caixa>
      );

    case "instalado":
      return (
        <Caixa tom="azul" titulo={`Instalação concluída${r.tecnico_instalacao ? ` por ${r.tecnico_instalacao}` : ""}!`}>
          <p className="text-xs text-blue-700">Arquive o pedido para tirá-lo da lista.</p>
          <Historico texto={r.historico_agendamento} />
        </Caixa>
      );
  }
  return null;
}
