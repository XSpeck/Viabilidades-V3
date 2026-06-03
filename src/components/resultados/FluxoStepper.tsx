"use client";

import type { Viabilizacao } from "@/types";

interface Step {
  label: string;
  key: string;
}

// Fluxo de prédio (5 passos) — quando há status_predio
const STEPS_FTTA_FLOW: Step[] = [
  { key: "solicitado",       label: "Solicitado" },
  { key: "em_analise",       label: "Em análise" },
  { key: "aguardando_dados", label: "Dados do prédio" },
  { key: "agendado",         label: "Visita agendada" },
  { key: "estruturado",      label: "Estruturado" },
];

// Fluxo simples (3 passos) — FTTH e FTTA com aprovação/rejeição direta
const STEPS_SIMPLES: Step[] = [
  { key: "solicitado",  label: "Solicitado" },
  { key: "em_analise",  label: "Em análise" },
  { key: "resultado",   label: "Resultado" },
];

function getCurrentStep(v: Viabilizacao): number {
  const isFtta = ["Prédio", "Condomínio"].includes(v.tipo_instalacao);

  if (isFtta && v.status_predio) {
    // Fluxo de estruturação de prédio
    if (v.status_predio === "estruturado" || v.status === "finalizado") return 4;
    if (v.status_predio === "agendado") return 3;
    if (v.status_predio === "pronto_auditoria") return 3;
    if (v.status_predio === "aguardando_dados") return 2;
    return 1;
  }

  // FTTH ou FTTA com resolução direta (sem fluxo de prédio)
  if (["aprovado", "rejeitado", "utp", "finalizado"].includes(v.status)) return 2;
  if (v.status === "em_auditoria") return 1;
  return 0;
}

function isRejected(v: Viabilizacao): boolean {
  return v.status === "rejeitado";
}

interface Props {
  v: Viabilizacao;
}

export default function FluxoStepper({ v }: Props) {
  const isFtta = ["Prédio", "Condomínio"].includes(v.tipo_instalacao);
  const steps = (isFtta && v.status_predio) ? STEPS_FTTA_FLOW : STEPS_SIMPLES;
  const current = getCurrentStep(v);
  const rejected = isRejected(v);

  return (
    <div className="w-full pt-2 pb-1">
      <div className="flex items-center">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const isLast = i === steps.length - 1;
          const failedHere = rejected && active;

          let circleClass = "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ";
          if (failedHere) {
            circleClass += "bg-red-500 text-white";
          } else if (done) {
            circleClass += "bg-indigo-600 text-white";
          } else if (active) {
            circleClass += "bg-indigo-600 text-white ring-4 ring-indigo-100";
          } else {
            circleClass += "bg-gray-200 text-gray-400";
          }

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={circleClass}>
                  {failedHere ? "✕" : done ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] text-center leading-tight max-w-[56px] ${
                  active && !failedHere ? "text-indigo-600 font-semibold"
                  : failedHere ? "text-red-500 font-semibold"
                  : done ? "text-gray-600"
                  : "text-gray-400"
                }`}>
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${done ? "bg-indigo-600" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Sub-label do passo atual */}
      {isFtta && v.status_predio === "pronto_auditoria" && (
        <p className="text-xs text-indigo-600 text-center mt-1 font-medium">
          ⏳ Aguardando agendamento da visita técnica
        </p>
      )}
    </div>
  );
}
