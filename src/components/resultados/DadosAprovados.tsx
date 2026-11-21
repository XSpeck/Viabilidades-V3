"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ehUtp } from "@/lib/statusViabilizacao";
import type { Viabilizacao } from "@/types";
import { Caixa } from "@/components/comum/ui";

/** Linhas da viabilidade aprovada: CTO (casa e condomínio) ou CDOI (prédio) */
function linhas(r: Viabilizacao): [string, string | number | undefined][] {
  if (r.tipo_instalacao === "Prédio") {
    return [
      ["CDOI", r.cdoi],
      ["OLT", r.olt],
      ["Prédio", r.predio_ftta],
      ["Portas", r.portas_disponiveis],
      ["Média RX", r.media_rx ? `${r.media_rx} dBm` : undefined],
      ["Obs", r.observacoes],
    ];
  }
  return [
    ["CTO", r.cto_numero],
    ["OLT", r.olt],
    ["Portas", r.portas_disponiveis],
    ["Menor RX", r.menor_rx ? `${r.menor_rx} dBm` : undefined],
    ["Distância", r.distancia_cliente],
    ["Localização CTO", r.localizacao_caixa],
    ["Obs", r.observacoes],
  ];
}

/** Resultado da auditoria: dados aprovados (com copiar), motivo da recusa ou UTP */
export default function DadosAprovados({ r }: { r: Viabilizacao }) {
  const [copiado, setCopiado] = useState(false);

  if (r.status === "rejeitado") {
    return <Caixa tom="vermelho" titulo="Sem viabilidade"><p>{r.motivo_rejeicao ?? "Não temos projeto neste ponto."}</p></Caixa>;
  }
  if (r.status === "utp" && !r.status_instalacao) {
    return <Caixa tom="roxo" titulo="Atendemos via UTP"><p>Esta área é atendida por cabo de rede (UTP).</p></Caixa>;
  }
  // Aprovado direto (sem passar pela estrutura do prédio)
  if (r.status !== "aprovado" || r.status_predio || ehUtp(r)) return null;

  const dados = linhas(r).filter(([, v]) => v !== undefined && v !== "");
  const copiar = () =>
    navigator.clipboard.writeText(dados.map(([k, v]) => `${k}: ${v}`).join("\n")).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });

  return (
    <Caixa
      tom="verde"
      titulo="Dados da viabilidade"
      acao={
        <button type="button" onClick={copiar} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${copiado ? "bg-green-600 text-white" : "border border-green-300 bg-white text-green-700 hover:bg-green-100"}`}>
          {copiado ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
        </button>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {dados.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="whitespace-pre-wrap font-medium text-gray-800">{v}</dd>
          </div>
        ))}
      </dl>
    </Caixa>
  );
}
