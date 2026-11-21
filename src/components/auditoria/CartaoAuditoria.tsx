"use client";

import { useState } from "react";
import { Building2, ChevronDown, Flame, Home, User, Users } from "lucide-react";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import type { TipoInstalacao, Viabilizacao } from "@/types";
import { corEspera, minutosDesde, tempoTexto } from "@/components/viabilidades/CardFila";
import InfoPedido from "./InfoPedido";
import FormCto from "./FormCto";
import FormPredio from "./FormPredio";
import AgendaVisita from "./AgendaVisita";
import ComARede from "./ComARede";
import { MODULOS } from "@/lib/modulos";
import PainelContestacao from "./PainelContestacao";
import type { Auditor, Tecnicos } from "./tipos";

const TIPO = {
  FTTH: { icone: Home, rotulo: "Casa" },
  "Prédio": { icone: Building2, rotulo: "Prédio" },
  "Condomínio": { icone: Users, rotulo: "Condomínio" },
} as const;

/** Um pedido na Auditoria: cabeçalho claro e, aberto, informações + formulário da etapa */
export default function CartaoAuditoria({ v, auditor, tecnicos, erroTecnicos, agora, onFeito }: {
  v: Viabilizacao; auditor: Auditor; tecnicos: Tecnicos; erroTecnicos: boolean; agora: number; onFeito: (msg: string) => void;
}) {
  const [aberto, setAberto] = useState(true);
  const [mapa, setMapa] = useState(false);
  const [tipo, setTipo] = useState<TipoInstalacao>(v.tipo_instalacao);
  const [nome, setNome] = useState(v.nome_cliente ?? "");
  // (a página remonta o cartão quando tipo ou nome mudam lá fora)

  const t = TIPO[tipo] ?? TIPO.FTTH;
  const comVoce = minutosDesde(v.status_atualizado_em ?? v.data_solicitacao, agora);
  const contestacao = v.status === "em_revisao" && v.revisao_tipo === "contestado";
  const reanalise = v.status === "em_auditoria" && v.revisao_tipo === "contestado";
  const reaberto = v.status === "em_auditoria" && v.revisao_tipo === "reaberto";
  const borda = v.urgente ? "border-l-red-500" : contestacao || reanalise ? "border-l-orange-400" : reaberto ? "border-l-amber-400" : "border-l-indigo-400";
  const props = { v, auditor, onFeito };

  return (
    <div className={`rounded-xl border border-l-4 bg-white shadow-sm ${borda}`}>
      <button type="button" onClick={() => setAberto(!aberto)} className="w-full px-5 py-3 text-left" aria-expanded={aberto}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-gray-900">{nome || "Cliente"}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"><t.icone className="h-3 w-3" /> {t.rotulo}</span>
              {v.urgente && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700"><Flame className="h-3 w-3" /> Urgente</span>}
              {v.predio_estruturado && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Prédio pronto</span>}
              {contestacao && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Contestação</span>}
              {reanalise && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">Reanalisando</span>}
              {reaberto && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Reaberto</span>}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {v.usuario}</span>
              <span className="font-mono">{locationToPlusCode(v.plus_code_cliente)}</span>
              {v.predio_ftta && <span>{v.predio_ftta}{v.andar_predio ? ` · ${v.andar_predio}` : ""}</span>}
              <span>pedido em {formatDateTime(v.data_solicitacao)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corEspera(comVoce)}`} title="Tempo nesta etapa">{tempoTexto(comVoce)}</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
          </div>
        </div>
      </button>

      {aberto && (
        <div className="space-y-4 border-t px-5 pb-5 pt-4">
          {!mapa && <PainelContestacao {...props} />}
          {!contestacao && (
            <div className={mapa ? "" : "grid grid-cols-1 gap-6 md:grid-cols-2"}>
              {!mapa && <InfoPedido {...props} tipo={tipo} nome={nome} onTipo={setTipo} onNome={setNome} />}
              <div>
                {!v.status_predio && (tipo === "FTTH" || tipo === "Condomínio") && (
                  <FormCto key={tipo} {...props} tipo={tipo} nome={nome} onMapa={setMapa} />
                )}
                {!v.status_predio && tipo === "Prédio" && <FormPredio {...props} nome={nome} onMapa={setMapa} />}
                {v.status_predio && (!MODULOS.agendamento && ["pronto_auditoria", "agendado", "proposta_visita"].includes(v.status_predio)
                  ? <ComARede {...props} />
                  : <AgendaVisita {...props} tipo={tipo} tecnicos={tecnicos} erroTecnicos={erroTecnicos} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
