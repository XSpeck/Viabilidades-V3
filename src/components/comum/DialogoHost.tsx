"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, HelpCircle } from "lucide-react";
import { ouvirDialogos, type PedidoDialogo } from "@/lib/dialogo";

/** Mostra os avisos e confirmações pedidos por `avisar` / `confirmar` (um por vez, na ordem) */
export default function DialogoHost() {
  const [fila, setFila] = useState<PedidoDialogo[]>([]);
  useEffect(() => ouvirDialogos(setFila), []);
  const atual = fila[0];
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!atual) return;
    okRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); atual.responder(atual.tipo === "aviso"); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [atual]);

  if (!atual) return null;
  const Icone = atual.perigo ? AlertTriangle : atual.tipo === "aviso" ? Info : HelpCircle;
  const cor = atual.perigo ? "bg-red-100 text-red-600" : atual.tipo === "aviso" ? "bg-sky-100 text-sky-600" : "bg-indigo-100 text-indigo-600";
  const titulo = atual.titulo ?? (atual.tipo === "aviso" ? "Aviso" : atual.perigo ? "Tem certeza?" : "Confirmar");
  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]" role="presentation"
      onClick={() => atual.responder(atual.tipo === "aviso")}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={`dlg-t-${atual.id}`} aria-describedby={`dlg-m-${atual.id}`}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-3 p-5">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cor}`}><Icone className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p id={`dlg-t-${atual.id}`} className="text-sm font-bold text-gray-900">{titulo}</p>
            <p id={`dlg-m-${atual.id}`} className="mt-1 max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm text-gray-600">{atual.mensagem}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          {atual.tipo === "confirmar" && (
            <button type="button" onClick={() => atual.responder(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {atual.cancelar ?? "Cancelar"}
            </button>
          )}
          <button ref={okRef} type="button" onClick={() => atual.responder(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${atual.perigo ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
            {atual.ok ?? (atual.tipo === "aviso" ? "OK" : "Confirmar")}
          </button>
        </div>
      </div>
    </div>
  );
}
