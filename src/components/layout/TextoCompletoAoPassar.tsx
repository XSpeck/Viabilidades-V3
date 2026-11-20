"use client";

import { useEffect, useState } from "react";
import { expandir } from "@/lib/textoCompleto";

/**
 * Ao passar o mouse sobre um texto cortado com "…" (pelo espaço ou encurtado pelo programa,
 * inclusive dentro dos desenhos), mostra um balão com o texto completo.
 */

function completoDe(alvo: EventTarget | null): string | null {
  let el = alvo instanceof Element ? alvo : null;
  for (let k = 0; el && k < 4; k++, el = el.parentElement) {
    const texto = (el instanceof HTMLElement ? el.innerText : el.textContent) ?? "";
    if (!texto || texto.length > 300) continue;
    // cortado pelo espaço (CSS: reticências)
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis") {
      return expandir(texto) ?? texto;
    }
    // encurtado pelo programa ("AND 3_Majestoso_C…")
    if (texto.includes("…")) {
      const c = expandir(texto);
      if (c) return c;
    }
  }
  return null;
}

export default function TextoCompletoAoPassar() {
  const [dica, setDica] = useState<{ texto: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const mover = (ev: MouseEvent) => {
      const t = completoDe(ev.target);
      setDica((d) => (t ? { texto: t, x: ev.clientX, y: ev.clientY } : d ? null : d));
    };
    const sair = () => setDica(null);
    document.addEventListener("mousemove", mover, { passive: true });
    document.addEventListener("mouseleave", sair);
    window.addEventListener("scroll", sair, true);
    return () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseleave", sair);
      window.removeEventListener("scroll", sair, true);
    };
  }, []);
  if (!dica) return null;
  const esq = typeof window !== "undefined" && dica.x > window.innerWidth - 340;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[10000] max-w-[320px] rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs font-medium text-white shadow-xl ring-1 ring-white/10"
      style={{ top: dica.y + 18, left: esq ? undefined : dica.x + 12, right: esq ? window.innerWidth - dica.x + 12 : undefined }}
    >
      {dica.texto}
    </div>
  );
}
