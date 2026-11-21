"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Building2, ChevronDown, Home, Radio, Users } from "lucide-react";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import { ehUtp, statusDe } from "@/lib/statusViabilizacao";
import type { Viabilizacao } from "@/types";
import FluxoStepper from "./FluxoStepper";
import TempoDecorrido from "@/components/TempoDecorrido";
import EtapaFila from "./EtapaFila";
import EtapaConversa from "./EtapaConversa";
import DadosAprovados from "./DadosAprovados";
import EtapaInstalacao from "./EtapaInstalacao";
import EtapaPredio from "./EtapaPredio";
import AcoesFinais from "./AcoesFinais";

const RotaMapaDownload = dynamic(() => import("./RotaMapaDownload"), {
  ssr: false,
  loading: () => <div className="mt-2 h-[300px] animate-pulse rounded-lg bg-gray-100" />,
});

function IconeTipo({ r }: { r: Viabilizacao }) {
  const cls = "h-4 w-4 shrink-0 text-gray-400";
  if (ehUtp(r)) return <Radio className={cls} />;
  if (r.tipo_instalacao === "FTTH") return <Home className={cls} />;
  if (r.tipo_instalacao === "Condomínio") return <Users className={cls} />;
  return <Building2 className={cls} />;
}

/** Um pedido em Meus Resultados: cabeçalho com a situação e, aberto, cada etapa do fluxo */
export default function ResultadoCard({ r, usuario, onRefresh }: { r: Viabilizacao; usuario: string; onRefresh: () => void }) {
  const st = statusDe(r);
  const [aberto, setAberto] = useState(false);
  const ativo = r.status !== "finalizado" && r.status !== "rejeitado";

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm ${st.acao ? "border-l-4 border-l-orange-400" : ""}`}>
      <div className="p-4">
        <FluxoStepper v={r} />
        <button type="button" onClick={() => setAberto(!aberto)} className="mt-2 w-full text-left" aria-expanded={aberto}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-1.5 font-medium text-gray-900">
                <IconeTipo r={r} />
                <span className="truncate">{r.nome_cliente ?? locationToPlusCode(r.plus_code_cliente)}</span>
                {r.urgente && <span className="rounded bg-red-100 px-1.5 text-[10px] font-semibold text-red-700">urgente</span>}
              </p>
              <p className="text-xs text-gray-400">
                {r.predio_ftta && <span className="text-gray-500">{r.predio_ftta}{r.andar_predio ? ` · ${r.andar_predio}` : ""} · </span>}
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(r.plus_code_cliente)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono hover:text-indigo-600 hover:underline"
                  title="Ver no Google Maps"
                >
                  {locationToPlusCode(r.plus_code_cliente)}
                </a>{" "}
                · {formatDateTime(r.data_solicitacao)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {ativo && <TempoDecorrido iso={r.status_atualizado_em ?? r.data_auditoria ?? r.data_solicitacao} />}
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${st.cor}`}>{st.rotulo}</span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
            </div>
          </div>
          {st.acao && !aberto && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-orange-600">
              <AlertCircle className="h-3.5 w-3.5" /> {st.acao}
            </p>
          )}
        </button>

        {aberto && (
          <div className="mt-3 space-y-3 border-t pt-3 text-sm text-gray-600">
            <EtapaFila r={r} onRefresh={onRefresh} />
            <DadosAprovados r={r} />
            <EtapaConversa r={r} usuario={usuario} onRefresh={onRefresh} />
            {(r.trajeto_cabo?.length ?? 0) > 0 && (
              <RotaMapaDownload
                plusCodeCliente={r.plus_code_cliente}
                localizacaoCaixa={r.localizacao_caixa}
                trajetoCabo={r.trajeto_cabo ?? []}
                viabilizacaoId={r.id}
                nomeCliente={r.nome_cliente}
              />
            )}
            <EtapaPredio r={r} onRefresh={onRefresh} />
            <EtapaInstalacao r={r} onRefresh={onRefresh} />
            <AcoesFinais r={r} onRefresh={onRefresh} />
          </div>
        )}
      </div>
    </div>
  );
}
