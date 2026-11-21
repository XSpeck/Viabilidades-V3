"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { agendarVisita, proporDataVisita, rejeitarPredio } from "@/lib/firestore";
import type { TipoInstalacao } from "@/types";
import { Botao, Caixa, campo, dataBr, Historico, Linha, MsgErro, PERIODOS, useAcao } from "@/components/comum/ui";
import SemViabilidade from "./SemViabilidade";
import type { PropsEtapa, Tecnicos } from "./tipos";

const MOTIVOS_PREDIO = ["Sem tubulação", "Síndico não autorizou", "Sem espaço para a caixa", "Sem rede próxima ao prédio"];

/** Estrutura do prédio/condomínio: aguardando dados, agendar a visita e proposta enviada */
export default function AgendaVisita({ v, auditor, onFeito, tipo, tecnicos, erroTecnicos }: PropsEtapa & {
  tipo: TipoInstalacao; tecnicos: Tecnicos; erroTecnicos: boolean;
}) {
  const cond = tipo === "Condomínio";
  const acao = useAcao();
  const [data, setData] = useState(v.data_preferencia_visita ?? "");
  const [periodo, setPeriodo] = useState(v.periodo_preferencia_visita ?? "Manhã");
  const [tecnico, setTecnico] = useState("");
  const [tecnologia, setTecnologia] = useState(cond ? "FTTH" : "FTTA");
  const [giga, setGiga] = useState(true);
  const [obs, setObs] = useState("");
  const [faltando, setFaltando] = useState(false);
  const [semViab, setSemViab] = useState(false);
  const sempreGiga = tecnologia === "FTTA" || cond;
  const difere = !!v.data_preferencia_visita && (data !== v.data_preferencia_visita || periodo !== (v.periodo_preferencia_visita ?? "Manhã"));
  const quem = v.predio_ftta ?? "Prédio";

  if (v.status_predio === "aguardando_dados") {
    return <Caixa tom="amarelo" titulo="Aguardando os dados do atendente"><p className="text-yellow-800">Ele está preenchendo os dados do {cond ? "responsável" : "síndico"}.</p></Caixa>;
  }

  if (v.status_predio === "proposta_visita") {
    return (
      <Caixa tom="laranja" titulo="Aguardando o atendente confirmar a data">
        <Linha r="Data proposta" v={`${dataBr(v.proposta_visita_data)} — ${v.proposta_visita_periodo ?? ""}`} />
        <Linha r="Técnico" v={v.proposta_visita_tecnico} />
        {v.data_preferencia_visita && <p className="text-xs text-orange-700">Preferência original: {dataBr(v.data_preferencia_visita)} — {v.periodo_preferencia_visita ?? "Manhã"}</p>}
        <Historico texto={v.historico_visita} />
      </Caixa>
    );
  }

  if (v.status_predio !== "pronto_auditoria") return null;

  return (
    <div className="space-y-3">
      <Caixa tom="azul" titulo="Dados recebidos: agendar a visita">
        <Linha r={cond ? "Responsável" : "Síndico"} v={[v.nome_sindico, v.contato_sindico].filter(Boolean).join(" · ")} />
        <Linha r="Cliente" v={[v.nome_cliente_predio, v.contato_cliente_predio].filter(Boolean).join(" · ")} />
        <Linha r={cond ? "Casa/Lote" : "Apto"} v={v.apartamento} />
        {v.obs_agendamento && <p className="whitespace-pre-wrap italic text-gray-600">“{v.obs_agendamento}”</p>}
        <Historico texto={v.historico_visita} />
      </Caixa>
      {v.data_preferencia_visita && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${difere ? "border-orange-200 bg-orange-50 text-orange-800" : "border-green-200 bg-green-50 text-green-800"}`}>
          Preferência do atendente: <strong>{dataBr(v.data_preferencia_visita)}</strong> — {v.periodo_preferencia_visita ?? "Manhã"}
          {difere && " (você escolheu outra)"}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={data} onChange={(e) => { setData(e.target.value); setFaltando(false); }} className={campo(faltando && !data)} aria-label="Data da visita" />
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={campo()} aria-label="Período">
          {PERIODOS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={tecnico} onChange={(e) => { setTecnico(e.target.value); setFaltando(false); }} className={campo(faltando && !tecnico)} aria-label="Técnico">
          <option value="">Técnico *</option>
          {tecnicos.map((t) => <option key={t.uid} value={t.nome}>{t.nome}</option>)}
        </select>
        <select value={tecnologia} onChange={(e) => { setTecnologia(e.target.value); if (e.target.value === "FTTA") setGiga(true); }} className={campo()} aria-label="Tecnologia">
          {cond ? <option>FTTH</option> : <><option>FTTA</option><option>UTP</option><option>FTTH</option></>}
        </select>
      </div>
      {erroTecnicos && <p className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar os técnicos. Recarregue a página.</p>}
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={sempreGiga || giga} onChange={(e) => setGiga(e.target.checked)} disabled={sempreGiga} className="h-4 w-4" />
        {cond ? "Condomínio" : "Prédio"} Giga {sempreGiga && <span className="text-xs text-blue-600">(sempre em {cond ? "condomínio" : "FTTA"})</span>}
      </label>
      <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observações (opcional)" className={`${campo()} resize-none`} />
      {faltando && <p className="text-xs text-red-600">{difere ? "Informe a data." : "Informe a data e o técnico."}</p>}
      <MsgErro erro={acao.erro} />

      {semViab ? (
        <SemViabilidade motivos={MOTIVOS_PREDIO} ocupado={acao.ocupado} erro={acao.erro} onCancelar={() => setSemViab(false)}
          onConfirmar={(m) => acao.rodar(() => rejeitarPredio(v.id, quem, v.plus_code_cliente, m, auditor.nome, auditor.uid), () => onFeito(`${quem}: prédio sem viabilidade registrado.`))} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Botao ocupado={acao.ocupado} className="flex-1"
            onClick={() => {
              if (!data || !tecnico) { setFaltando(true); return; }
              acao.rodar(() => agendarVisita(v.id, { data_visita: data, periodo_visita: periodo, tecnico_responsavel: tecnico, tecnologia_predio: tecnologia, giga: sempreGiga || giga, obs_agendamento: obs.trim() || undefined }, v.historico_visita, {
                predio: v.predio_ftta, localizacao: v.plus_code_cliente, criadoPor: auditor.nome, urgente: v.urgente,
              }), () => onFeito(`Visita agendada: ${dataBr(data)} — ${periodo} — ${tecnico}.`));
            }}>
            Agendar
          </Botao>
          {difere && (
            <Botao tipo="laranja" ocupado={acao.ocupado} className="flex-1"
              onClick={() => {
                if (!data) { setFaltando(true); return; }
                acao.rodar(() => proporDataVisita(v.id, { proposta_visita_data: data, proposta_visita_periodo: periodo, tecnologia_predio: tecnologia, giga: sempreGiga || giga, obs_agendamento: obs.trim() || undefined }, v.historico_visita),
                  () => onFeito(`Nova data proposta ao atendente: ${dataBr(data)} — ${periodo}.`));
              }}>
              Propor ao atendente
            </Botao>
          )}
          <Botao tipo="borda" onClick={() => setSemViab(true)} className="flex-1 text-red-600">Sem viabilidade</Botao>
        </div>
      )}
    </div>
  );
}
