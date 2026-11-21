"use client";

import { useState } from "react";
import { confirmarPropostaVisita, contraproporVisita, enviarDadosPredio } from "@/lib/firestore";
import { formatarTelefone } from "@/lib/localizacao";
import type { Viabilizacao } from "@/types";
import { Botao, Caixa, campo, CamposData, dataBr, Historico, Linha, MsgErro, useAcao } from "@/components/comum/ui";

type Campo = "predio" | "sindico" | "telSindico" | "cliente" | "telCliente" | "apto";

/** Estrutura do prédio/condomínio: dados do síndico, visita técnica e estrutura pronta */
export default function EtapaPredio({ r, onRefresh }: { r: Viabilizacao; onRefresh: () => void }) {
  const cond = r.tipo_instalacao === "Condomínio";
  const quem = cond ? "responsável" : "síndico";
  const acao = useAcao();

  // dados do síndico
  const [f, setF] = useState<Record<Campo, string>>({
    predio: r.predio_ftta ?? "",
    sindico: "",
    telSindico: "",
    cliente: r.nome_cliente ?? "",
    telCliente: r.telefone_cliente ?? "",
    apto: r.andar_predio ?? "",
  });
  const [prefData, setPrefData] = useState("");
  const [prefPeriodo, setPrefPeriodo] = useState("Manhã");
  const [obs, setObs] = useState("");
  const [faltando, setFaltando] = useState<Campo[]>([]);
  const mudar = (k: Campo, v: string) => { setF((x) => ({ ...x, [k]: v })); setFaltando((x) => x.filter((c) => c !== k)); };
  const tel = (k: Campo) => (e: React.ChangeEvent<HTMLInputElement>) => mudar(k, formatarTelefone(e.target.value));

  // contraproposta de visita
  const [outraData, setOutraData] = useState(false);
  const [cData, setCData] = useState("");
  const [cPeriodo, setCPeriodo] = useState("Manhã");
  const [cObs, setCObs] = useState("");

  function enviarDados() {
    const vazios = (Object.keys(f) as Campo[]).filter((k) => !f[k].trim());
    if (vazios.length) { setFaltando(vazios); return; }
    acao.rodar(() => enviarDadosPredio(r.id, {
      predio_ftta: f.predio.trim(),
      nome_sindico: f.sindico.trim(),
      contato_sindico: f.telSindico.trim(),
      nome_cliente_predio: f.cliente.trim(),
      contato_cliente_predio: f.telCliente.trim(),
      apartamento: f.apto.trim(),
      data_preferencia_visita: prefData || undefined,
      periodo_preferencia_visita: prefData ? prefPeriodo : undefined,
      obs_agendamento: obs.trim() || undefined,
    }), onRefresh);
  }

  const erro = (k: Campo) => faltando.includes(k);

  switch (r.status_predio) {
    case "aguardando_dados":
      return (
        <div className="space-y-3">
          <Caixa tom="laranja" titulo={`Precisamos estruturar o ${cond ? "condomínio" : "prédio"}`}>
            <p className="text-xs text-orange-700">Preencha os dados para agendarmos a visita técnica.</p>
          </Caixa>
          <div className="space-y-2">
            <input value={f.predio} onChange={(e) => mudar("predio", e.target.value)} placeholder={`Nome do ${cond ? "condomínio" : "prédio"} *`} className={campo(erro("predio"))} />
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{cond ? "Responsável do condomínio" : "Síndico"}</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={f.sindico} onChange={(e) => mudar("sindico", e.target.value)} placeholder={`Nome do ${quem} *`} className={campo(erro("sindico"))} />
              <input value={f.telSindico} inputMode="tel" onChange={tel("telSindico")} placeholder="Telefone *" className={campo(erro("telSindico"))} />
            </div>
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Cliente</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={f.cliente} onChange={(e) => mudar("cliente", e.target.value)} placeholder="Nome do cliente *" className={campo(erro("cliente"))} />
              <input value={f.telCliente} inputMode="tel" onChange={tel("telCliente")} placeholder="Telefone *" className={campo(erro("telCliente"))} />
            </div>
            <input value={f.apto} onChange={(e) => mudar("apto", e.target.value)} placeholder={`${cond ? "Casa/Lote" : "Apartamento"} *`} className={campo(erro("apto"))} />
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Preferência para a visita</p>
            <CamposData data={prefData} periodo={prefPeriodo} obs={obs} onData={setPrefData} onPeriodo={setPrefPeriodo} onObs={setObs} />
          </div>
          {faltando.length > 0 && <p className="text-xs text-red-600">Preencha os campos marcados em vermelho.</p>}
          <MsgErro erro={acao.erro} />
          <Botao ocupado={acao.ocupado} onClick={enviarDados} className="w-full py-2.5">Enviar para verificação técnica</Botao>
        </div>
      );

    case "pronto_auditoria":
      return (
        <div className="space-y-2">
          <Caixa tom="azul" titulo="Dados enviados">
            <p className="text-xs text-blue-700">Aguardando o agendamento da visita técnica.</p>
          </Caixa>
          <Caixa tom="cinza">
            <Linha r={cond ? "Responsável" : "Síndico"} v={[r.nome_sindico, r.contato_sindico].filter(Boolean).join(" · ")} />
            <Linha r="Cliente" v={[r.nome_cliente_predio, r.contato_cliente_predio].filter(Boolean).join(" · ")} />
            <Linha r={cond ? "Casa/Lote" : "Apto"} v={r.apartamento} />
            {r.data_preferencia_visita && <Linha r="Preferência" v={`${dataBr(r.data_preferencia_visita)} — ${r.periodo_preferencia_visita ?? "Manhã"}`} />}
            {r.obs_agendamento && <p className="whitespace-pre-wrap italic text-gray-600">“{r.obs_agendamento}”</p>}
          </Caixa>
        </div>
      );

    case "proposta_visita":
      return (
        <div className="space-y-2">
          <Caixa tom="laranja" titulo="Data proposta para a visita técnica">
            <Linha r="Data" v={`${dataBr(r.proposta_visita_data)} — ${r.proposta_visita_periodo ?? ""}`} />
            <Linha r="Técnico" v={r.proposta_visita_tecnico} />
            {r.obs_agendamento && <p className="whitespace-pre-wrap text-gray-600">{r.obs_agendamento}</p>}
            <Historico texto={r.historico_visita} />
          </Caixa>
          {!outraData ? (
            <div className="flex flex-wrap gap-2">
              <Botao
                tipo="verde"
                ocupado={acao.ocupado}
                disabled={!r.proposta_visita_data}
                onClick={() => acao.rodar(() => confirmarPropostaVisita(r.id, { proposta_visita_data: r.proposta_visita_data!, proposta_visita_periodo: r.proposta_visita_periodo ?? "Manhã", proposta_visita_tecnico: r.proposta_visita_tecnico }, r.historico_visita), onRefresh)}
                className="flex-1"
              >
                Confirmar esta data
              </Botao>
              <Botao tipo="borda" onClick={() => setOutraData(true)}>Propor outra</Botao>
            </div>
          ) : (
            <div className="space-y-2">
              <CamposData data={cData} periodo={cPeriodo} obs={cObs} onData={setCData} onPeriodo={setCPeriodo} onObs={setCObs} obsPlaceholder="Motivo / observação (opcional)" />
              <div className="flex gap-2">
                <Botao ocupado={acao.ocupado} disabled={!cData} onClick={() => acao.rodar(() => contraproporVisita(r.id, cData, cPeriodo, cObs.trim() || undefined, r.historico_visita), onRefresh)} className="flex-1">
                  Enviar nova proposta
                </Botao>
                <Botao tipo="borda" onClick={() => setOutraData(false)}>Voltar</Botao>
              </div>
            </div>
          )}
          <MsgErro erro={acao.erro} />
        </div>
      );

    case "agendado":
      return (
        <Caixa tom="verde" titulo="Visita técnica agendada!">
          <Linha r="Data" v={dataBr(r.data_visita)} />
          <Linha r="Período" v={r.periodo_visita} />
          <Linha r="Técnico" v={r.tecnico_responsavel} />
          <Linha r="Tecnologia" v={r.tecnologia_predio} />
          {(r.giga || r.tecnologia_predio === "FTTA" || cond) && <Linha r="Giga" v="Sim" />}
          {r.obs_agendamento && <p className="whitespace-pre-wrap text-gray-600">{r.obs_agendamento}</p>}
          <Historico texto={r.historico_visita} />
        </Caixa>
      );

    case "estruturado":
      return (
        <Caixa tom="verde" titulo="Estrutura instalada!">
          <p className="text-xs text-green-700">A estrutura foi concluída. Faça um novo pedido de viabilidade para a instalação do cliente.</p>
          <Linha r="Tecnologia" v={r.tecnologia_predio} />
          <Linha r="Técnico" v={r.tecnico_responsavel} />
          {r.notas_visita && r.notas_visita.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-green-700 hover:text-green-900">Notas da visita ({r.notas_visita.length})</summary>
              <ul className="mt-1.5 space-y-1.5">
                {r.notas_visita.map((n, i) => (
                  <li key={i} className="rounded-lg border bg-white p-2 text-gray-600">
                    <span className="font-medium text-gray-700">{n.por}</span> · <span className="text-gray-400">{dataBr(n.data)}</span>
                    <p className="mt-0.5 whitespace-pre-wrap">{n.texto}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Caixa>
      );
  }
  return null;
}
