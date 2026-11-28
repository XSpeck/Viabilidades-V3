"use client";

// =====================
// Modo de animação (mapa, Unifilar e prédio): tudo, só nas portas (LEDs, anéis, pulsos) ou nenhuma.
// Fica guardado no navegador e vale para todas as telas ao mesmo tempo.
// =====================
import { useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";

export type ModoAnimacao = "tudo" | "portas" | "nenhuma";
const CHAVE = "fibrahub_animacao";
const EVENTO = "fibrahub-animacao";

function ler(): ModoAnimacao {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v === "portas" || v === "nenhuma" ? v : "tudo";
  } catch {
    return "tudo";
  }
}
function assinar(cb: () => void) {
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb); };
}

export function useModoAnimacao(): [ModoAnimacao, (m: ModoAnimacao) => void] {
  const modo = useSyncExternalStore(assinar, ler, () => "tudo" as ModoAnimacao);
  const mudar = (m: ModoAnimacao) => {
    try { window.localStorage.setItem(CHAVE, m); } catch { /* sem guardar */ }
    window.dispatchEvent(new Event(EVENTO));
  };
  return [modo, mudar];
}

/** Regras de CSS do modo (o contêiner leva data-anim={modo}) */
export const CSS_MODO_ANIMACAO = `
[data-anim="portas"] .fh-fluxo, [data-anim="nenhuma"] .fh-fluxo { display: none; }
[data-anim="nenhuma"] .fh-led, [data-anim="nenhuma"] .fh-anel, [data-anim="nenhuma"] .fh-pulso { animation: none !important; }
`;

const OPCOES: [ModoAnimacao, string, string][] = [
  ["tudo", "Tudo", "Luz correndo nas fibras e nas portas"],
  ["portas", "Portas", "Animação só nas portas (LEDs, anéis, pulsos)"],
  ["nenhuma", "Parado", "Sem animação"],
];

export function SeletorAnimacao({ escuro = false }: { escuro?: boolean }) {
  const [modo, setModo] = useModoAnimacao();
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-xl p-0.5 text-[11px] font-semibold ${escuro ? "border border-slate-700 bg-[#1b1d21]" : "bg-slate-200/70"}`} title="Animação">
      <Sparkles className={`mx-1 h-3.5 w-3.5 ${escuro ? "text-slate-400" : "text-slate-500"}`} />
      {OPCOES.map(([k, r, dica]) => (
        <button key={k} type="button" title={dica} onClick={() => setModo(k)}
          className={`rounded-lg px-2 py-1 transition-colors ${modo === k ? (escuro ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 shadow") : escuro ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}>
          {r}
        </button>
      ))}
    </div>
  );
}
