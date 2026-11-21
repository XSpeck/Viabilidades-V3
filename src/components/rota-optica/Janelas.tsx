"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, Minus, PanelRightClose, PanelRightOpen, Square, X } from "lucide-react";

// =====================
// Janelas flutuantes: abrem no topo da tela (na coluna do clique), cabem sempre dentro da tela, arrastam pela barra de título, ficam
// várias abertas ao mesmo tempo e só vão para a lateral quando o usuário pede (fixar).
// =====================

const DockCtx = createContext<HTMLElement | null>(null);
let zGlobal = 100;

/** Envolve a tela: guarda a coluna lateral onde ficam as janelas fixadas. */
export function JanelasProvider({ children }: { children: ReactNode }) {
  const [dock, setDock] = useState<HTMLElement | null>(null);
  return (
    <DockCtx.Provider value={dock}>
      {children}
      <aside
        ref={setDock}
        aria-label="Janelas fixadas"
        className="fixed top-3 right-3 bottom-3 w-[min(380px,calc(100vw-24px))] z-[90] overflow-y-auto space-y-3 empty:hidden rounded-xl"
      />
    </DockCtx.Provider>
  );
}

interface Props {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icone?: ReactNode;
  /** Posição inicial na tela (px, coordenadas da janela do navegador) */
  inicial: { x: number; y: number };
  largura?: number;
  /** Classe de cor da barra de título */
  corBarra?: string;
  onFechar: () => void;
  children: ReactNode;
}

function limitar(x: number, y: number, largura: number) {
  if (typeof window === "undefined") return { x, y };
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - largura - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - 80)),
  };
}

export function Janela({ titulo, subtitulo, icone, inicial, largura: larguraPedida = 340, corBarra = "bg-slate-900", onFechar, children }: Props) {
  const dock = useContext(DockCtx);
  // celular: a janela nunca passa da largura da tela (sobra 8 px de cada lado)
  const telaPequena = typeof window !== "undefined" && window.innerWidth < 640;
  const largura = typeof window !== "undefined" ? Math.min(larguraPedida, window.innerWidth - 16) : larguraPedida;
  // Abre colada no topo da tela (com um pequeno degrau quando há várias), na altura de x do clique
  const [pos, setPos] = useState(() => limitar(inicial.x, 12 + ((zGlobal - 100) % 5) * 22, largura));
  const [z, setZ] = useState(() => ++zGlobal);
  const [minimizada, setMinimizada] = useState(false);
  const [fixada, setFixada] = useState(false);
  const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const frente = () => setZ(++zGlobal);

  function iniciar(e: React.PointerEvent<HTMLDivElement>) {
    if (fixada || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arraste.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  }
  function mover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arraste.current;
    if (!a) return;
    setPos(limitar(a.px + e.clientX - a.x, a.py + e.clientY - a.y, largura));
  }
  function soltar(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    arraste.current = null;
  }

  if (typeof document === "undefined") return null;

  const janela = (
    <div
      role="dialog"
      aria-label={typeof titulo === "string" ? titulo : undefined}
      onPointerDownCapture={fixada ? undefined : frente}
      className={`bg-white rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col ${fixada ? "w-full" : "fixed"}`}
      style={fixada ? undefined : { left: pos.x, top: pos.y, width: largura, zIndex: z, maxHeight: `calc(100vh - ${pos.y + 8}px)` }}
    >
      <div
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setMinimizada((m) => !m); }}
        className={`flex items-center gap-2 px-2.5 py-2 text-white select-none touch-none ${corBarra} ${fixada ? "" : "cursor-move"}`}
      >
        {icone ? <span className="shrink-0 flex">{icone}</span> : <GripHorizontal className="w-4 h-4 text-white/60 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight truncate">{titulo}</p>
          {subtitulo && <p className="text-[11px] text-white/70 leading-tight truncate">{subtitulo}</p>}
        </div>
        <button type="button" onClick={() => setMinimizada((m) => !m)} className="p-1 rounded hover:bg-white/15" aria-label={minimizada ? "Restaurar" : "Minimizar"} title={minimizada ? "Restaurar" : "Minimizar"}>
          {minimizada ? <Square className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          hidden={telaPequena}
          onClick={() => { setFixada((f) => !f); setMinimizada(false); }}
          className="p-1 rounded hover:bg-white/15"
          aria-label={fixada ? "Soltar da lateral" : "Fixar ao lado"}
          title={fixada ? "Soltar da lateral (volta a flutuar)" : "Fixar ao lado"}
        >
          {fixada ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={onFechar} className="p-1 rounded hover:bg-white/15" aria-label="Fechar" title="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!minimizada && <div className={`overflow-auto ${fixada ? "" : "min-h-0"}`}>{children}</div>}
    </div>
  );

  return createPortal(janela, fixada && dock ? dock : document.body);
}
