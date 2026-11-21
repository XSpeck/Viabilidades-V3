"use client";

import { useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export const PERIODOS = ["Manhã", "Tarde", "Noturno", "Dia todo"];

/** "2026-11-21" → 21/11/2026 (sem cair no dia anterior pelo fuso) */
export const dataBr = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "-");

export const campo = (erro?: boolean) =>
  `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${erro ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-gray-300 focus:ring-indigo-400"}`;

const TONS = {
  verde: "border-green-200 bg-green-50",
  azul: "border-blue-200 bg-blue-50",
  laranja: "border-orange-200 bg-orange-50",
  amarelo: "border-yellow-200 bg-yellow-50",
  vermelho: "border-red-200 bg-red-50",
  roxo: "border-purple-200 bg-purple-50",
  cinza: "border-gray-200 bg-gray-50",
  indigo: "border-indigo-200 bg-indigo-50",
} as const;

export function Caixa({ tom, titulo, children, acao }: { tom: keyof typeof TONS; titulo?: ReactNode; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className={`space-y-1 rounded-lg border p-3 text-sm ${TONS[tom]}`}>
      {(titulo || acao) && (
        <div className="flex items-center justify-between gap-2">
          {titulo && <p className="font-medium text-gray-900">{titulo}</p>}
          {acao}
        </div>
      )}
      {children}
    </div>
  );
}

/** Linha "Rótulo: valor" que some quando não há valor */
export function Linha({ r, v }: { r: string; v?: ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return <p><span className="text-gray-500">{r}:</span> <strong className="font-medium text-gray-800">{v}</strong></p>;
}

export function Historico({ texto, titulo = "Histórico de negociação" }: { texto?: string; titulo?: string }) {
  if (!texto) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-500 hover:text-gray-700">{titulo}</summary>
      <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border bg-white p-2.5 font-sans leading-relaxed text-gray-600">{texto}</pre>
    </details>
  );
}

/**
 * Executa uma ação do Firestore uma vez só: trava clique duplo, mostra "enviando"
 * e guarda o erro para mostrar na tela (sem alert).
 */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const trava = useRef(false);
  async function rodar(fn: () => Promise<unknown>, depois?: () => void) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      depois?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return { ocupado, erro, setErro, rodar };
}

export function MsgErro({ erro }: { erro?: string }) {
  return erro ? <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p> : null;
}

const BOTOES = {
  primario: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  verde: "bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300",
  laranja: "bg-orange-600 text-white hover:bg-orange-700 disabled:bg-orange-300",
  vermelho: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  borda: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
} as const;

export function Botao({ tipo = "primario", ocupado, children, className = "", ...p }: {
  tipo?: keyof typeof BOTOES; ocupado?: boolean; children: ReactNode; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} disabled={ocupado || p.disabled} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${BOTOES[tipo]} ${className}`}>
      {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

/** Botão que pede um segundo clique ("Tem certeza?") antes de agir */
export function BotaoConfirmar({ rotulo, pergunta, confirmar = "Sim", tipo = "borda", ocupado, onConfirmar, classeAberto = "" }: {
  rotulo: ReactNode; pergunta: string; confirmar?: string; tipo?: keyof typeof BOTOES; ocupado?: boolean; onConfirmar: () => void;
  /** Classes extras quando a pergunta está aberta (ex.: col-span para ocupar a linha) */
  classeAberto?: string;
}) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) return <Botao tipo={tipo} onClick={() => setAberto(true)} className="text-xs">{rotulo}</Botao>;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs ${classeAberto}`}>
      <span className="text-gray-700">{pergunta}</span>
      <Botao tipo="primario" ocupado={ocupado} onClick={onConfirmar} className="px-2.5 py-1 text-xs">{confirmar}</Botao>
      <button type="button" onClick={() => setAberto(false)} className="text-gray-500 hover:text-gray-700">Não</button>
    </div>
  );
}

/** Data + período + observação, usado nas propostas de instalação e de visita */
export function CamposData({ data, periodo, obs, onData, onPeriodo, onObs, obsPlaceholder = "Observações (opcional)" }: {
  data: string; periodo: string; obs: string;
  onData: (v: string) => void; onPeriodo: (v: string) => void; onObs: (v: string) => void; obsPlaceholder?: string;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid grid-cols-2 gap-2">
      <input type="date" min={hoje} value={data} onChange={(e) => onData(e.target.value)} className={campo()} aria-label="Data" />
      <select value={periodo} onChange={(e) => onPeriodo(e.target.value)} className={campo()} aria-label="Período">
        {PERIODOS.map((p) => <option key={p}>{p}</option>)}
      </select>
      <textarea placeholder={obsPlaceholder} value={obs} onChange={(e) => onObs(e.target.value)} rows={2} className={`${campo()} col-span-2 resize-none`} />
    </div>
  );
}
