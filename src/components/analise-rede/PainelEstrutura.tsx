"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { agendarEstruturaRede, concluirEstruturaRede, getViabilizacaoPorId, semViabEstruturaRede } from "@/lib/firestore";
import type { DemandaRede } from "@/types";
import { Botao, Caixa, campo, MsgErro, PERIODOS, useAcao } from "@/components/comum/ui";

const TECNOLOGIAS = ["FTTA", "UTP", "FTTH"];
const MOTIVOS = ["Sem tubulação", "Síndico não autorizou", "Sem espaço para a caixa", "Sem rede próxima ao prédio"];

/**
 * Demanda de estrutura de prédio/condomínio (vinda de um pedido de viabilidade): a equipe de rede
 * agenda a visita, conclui a estrutura (o prédio entra em Prédios Atendidos) ou registra sem viabilidade.
 */
export default function PainelEstrutura({ demanda: d, tecnicosRede, onRefresh }: {
  demanda: DemandaRede; tecnicosRede: string[]; onRefresh: () => void;
}) {
  const { user } = useAuth();
  const acao = useAcao();
  const [painel, setPainel] = useState<"" | "agendar" | "concluir" | "sem">("");
  const [data, setData] = useState(d.data_agendamento ?? "");
  const [periodo, setPeriodo] = useState(d.periodo_agendamento ?? "Manhã");
  const [tecnicos, setTecnicos] = useState<string[]>(d.tecnicos);
  const [tecnologia, setTecnologia] = useState("FTTA");
  const [giga, setGiga] = useState(true);
  const [obs, setObs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [faltando, setFaltando] = useState(false);
  const viab = d.viabilizacao_id!;

  // Sem data ainda: começa com a preferência que o atendente informou
  useEffect(() => {
    if (d.data_agendamento) return;
    let vivo = true;
    getViabilizacaoPorId(viab).then((v) => {
      if (!vivo || !v?.data_preferencia_visita) return;
      setData((x) => x || v.data_preferencia_visita!);
      if (v.periodo_preferencia_visita) setPeriodo(v.periodo_preferencia_visita);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [viab, d.data_agendamento]);
  const sempreGiga = tecnologia === "FTTA";
  const abrir = (p: typeof painel) => { setPainel(painel === p ? "" : p); setFaltando(false); acao.setErro(""); };
  const alternarTecnico = (t: string) => setTecnicos((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
      <p className="text-xs font-semibold text-sky-900">Estrutura do pedido de viabilidade</p>
      <div className="flex flex-wrap gap-2">
        <Botao tipo="borda" onClick={() => abrir("agendar")} className="text-xs"><CalendarDays className="h-3.5 w-3.5" /> {d.status === "aberta" ? "Agendar visita" : "Reagendar"}</Botao>
        <Botao tipo="borda" onClick={() => abrir("concluir")} className="text-xs text-green-700"><CheckCircle className="h-3.5 w-3.5" /> Estrutura pronta</Botao>
        <Botao tipo="borda" onClick={() => abrir("sem")} className="text-xs text-red-600"><XCircle className="h-3.5 w-3.5" /> Sem viabilidade</Botao>
      </div>

      {painel === "agendar" && (
        <Caixa tom="indigo" titulo="Agendar a visita de estrutura">
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo(faltando && !data)} aria-label="Data" />
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className={campo()} aria-label="Período">
              {PERIODOS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tecnicosRede.map((t) => (
              <button key={t} type="button" onClick={() => alternarTecnico(t)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${tecnicos.includes(t) ? "border-indigo-600 bg-indigo-600 text-white" : faltando && !tecnicos.length ? "border-red-300 bg-white text-gray-600" : "border-gray-200 bg-white text-gray-600 hover:bg-indigo-50"}`}>
                {t}
              </button>
            ))}
          </div>
          {faltando && <p className="text-xs text-red-600">Informe a data e ao menos um técnico.</p>}
          <MsgErro erro={acao.erro} />
          <Botao ocupado={acao.ocupado} className="w-full"
            onClick={() => {
              if (!data || !tecnicos.length) { setFaltando(true); return; }
              acao.rodar(() => agendarEstruturaRede(viab, d.id, { data, periodo, tecnicos }), () => { setPainel(""); onRefresh(); });
            }}>
            Salvar agendamento
          </Botao>
        </Caixa>
      )}

      {painel === "concluir" && (
        <Caixa tom="verde" titulo="Estrutura pronta">
          <p className="text-xs text-green-800">O prédio entra em Prédios Atendidos e o pedido do atendente fica “Estruturado”.</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={tecnologia} onChange={(e) => { setTecnologia(e.target.value); if (e.target.value === "FTTA") setGiga(true); }} className={campo()} aria-label="Tecnologia">
              {TECNOLOGIAS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sempreGiga || giga} disabled={sempreGiga} onChange={(e) => setGiga(e.target.checked)} className="h-4 w-4" /> Giga
            </label>
          </div>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação (ex.: blocos estruturados, andares)" className={`${campo()} resize-none bg-white`} />
          <MsgErro erro={acao.erro} />
          <Botao tipo="verde" ocupado={acao.ocupado} className="w-full"
            onClick={() => acao.rodar(() => concluirEstruturaRede(viab, { tecnologia, giga: sempreGiga || giga, obs: obs.trim(), tecnico: (d.tecnicos[0] ?? user?.nome ?? "") }), () => { setPainel(""); onRefresh(); })}>
            Confirmar estrutura pronta
          </Botao>
        </Caixa>
      )}

      {painel === "sem" && (
        <Caixa tom="vermelho" titulo="Prédio sem viabilidade">
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <button key={m} type="button" onClick={() => setMotivo(m)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${motivo === m ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-white text-red-700 hover:bg-red-50"}`}>
                {m}
              </button>
            ))}
          </div>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Motivo *" className={`${campo()} resize-none bg-white`} />
          <p className="text-xs text-red-700">O prédio entra em “Sem viabilidade” e o atendente recebe o motivo.</p>
          <MsgErro erro={acao.erro} />
          <Botao tipo="vermelho" ocupado={acao.ocupado} disabled={!motivo.trim()} className="w-full"
            onClick={() => acao.rodar(() => semViabEstruturaRede(viab, motivo.trim(), user?.nome ?? "Equipe de rede"), () => { setPainel(""); onRefresh(); })}>
            Confirmar sem viabilidade
          </Botao>
        </Caixa>
      )}
    </div>
  );
}
