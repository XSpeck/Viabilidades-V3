"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Network } from "lucide-react";
import { demandaDaEstrutura, enviarEstruturaParaRede } from "@/lib/firestore";
import { Botao, Caixa, dataBr, Linha, MsgErro, useAcao } from "@/components/comum/ui";
import type { PropsEtapa } from "./tipos";

/**
 * Sem o módulo de agendamento: com os dados do síndico, a estrutura fica com a equipe de rede
 * (demanda na Análise da Rede). Aqui o auditor só acompanha — e manda para lá se faltou a demanda.
 */
export default function ComARede({ v, auditor, onFeito }: PropsEtapa) {
  const cond = v.tipo_instalacao === "Condomínio";
  const acao = useAcao();
  const [demanda, setDemanda] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    demandaDaEstrutura(v.id).then((d) => { if (vivo) setDemanda(d); }).catch(() => { if (vivo) setDemanda(null); });
    return () => { vivo = false; };
  }, [v.id]);

  return (
    <div className="space-y-3">
      <Caixa tom="azul" titulo={v.status_predio === "agendado" ? "Estrutura agendada pela equipe de rede" : "Com a equipe de rede"}>
        <Linha r={cond ? "Responsável" : "Síndico"} v={[v.nome_sindico, v.contato_sindico].filter(Boolean).join(" · ")} />
        <Linha r="Cliente" v={[v.nome_cliente_predio, v.contato_cliente_predio].filter(Boolean).join(" · ")} />
        <Linha r={cond ? "Casa/Lote" : "Apto"} v={v.apartamento} />
        {v.status_predio === "agendado" && <Linha r="Visita" v={`${dataBr(v.data_visita)} — ${v.periodo_visita ?? ""}${v.tecnico_responsavel ? ` · ${v.tecnico_responsavel}` : ""}`} />}
        {v.data_preferencia_visita && v.status_predio !== "agendado" && <Linha r="Preferência" v={`${dataBr(v.data_preferencia_visita)} — ${v.periodo_preferencia_visita ?? "Manhã"}`} />}
      </Caixa>
      {demanda === undefined ? null : demanda ? (
        <Link href="/analise-rede" className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline">
          <Network className="h-4 w-4" /> Ver a demanda na Análise da Rede
        </Link>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-700">Ainda não há demanda na Análise da Rede para este pedido.</p>
          <MsgErro erro={acao.erro} />
          <Botao ocupado={acao.ocupado} className="w-full"
            onClick={() => acao.rodar(() => enviarEstruturaParaRede(v.id, auditor.nome), () => { setDemanda("ok"); onFeito("Estrutura enviada para a Análise da Rede."); })}>
            Enviar para a Análise da Rede
          </Botao>
        </div>
      )}
    </div>
  );
}
