"use client";

import { useState, useEffect } from "react";

function calcElapsed(iso: string): { label: string; colorClass: string } {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  const label =
    mins < 1    ? "agora"
    : mins < 60  ? `${mins}min`
    : mins < 1440 ? `${Math.floor(mins / 60)}h`
    : `${Math.floor(mins / 1440)}d`;
  const colorClass =
    mins < 5  ? "bg-green-100 text-green-700"
    : mins < 30 ? "bg-yellow-100 text-yellow-700"
    : "bg-red-100 text-red-700";
  return { label, colorClass };
}

export default function TempoDecorrido({ iso }: { iso?: string }) {
  const [state, setState] = useState(() => (iso ? calcElapsed(iso) : null));

  useEffect(() => {
    if (!iso) { setState(null); return; }
    setState(calcElapsed(iso));
    const id = setInterval(() => setState(calcElapsed(iso)), 60_000);
    return () => clearInterval(id);
  }, [iso]);

  if (!state) return null;

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${state.colorClass}`}>
      🕐 {state.label}
    </span>
  );
}
