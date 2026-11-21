"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { formatarDocumento, soDigitos, type ClienteRede } from "@/lib/clientesRede";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Perna com cliente: busca no cadastro pelo código, nome ou CPF/CNPJ e liga o escolhido.
 * Ligado, mostra o cliente com um × para soltar.
 */
export default function BuscaCliente({
  cadastro,
  clienteId,
  ocupado,
  onEscolher,
}: {
  cadastro: ClienteRede[];
  clienteId?: string;
  /** Cliente já ligado em outra perna */
  ocupado: (id: string) => boolean;
  onEscolher: (c: ClienteRede | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [aberta, setAberta] = useState(false);
  const atual = clienteId ? cadastro.find((c) => c.id === clienteId) : undefined;

  if (atual) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-1 text-[11px]">
        <span className="min-w-0 flex-1 truncate font-semibold text-sky-900" title={atual.nome}>{atual.nome}</span>
        <span className="shrink-0 font-mono text-[10px] text-sky-700">{atual.codigo}</span>
        <button type="button" onClick={() => onEscolher(null)} className="shrink-0 text-sky-500 hover:text-red-600" aria-label="Tirar o cliente desta perna" title="Tirar o cliente desta perna">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const t = norm(texto.trim());
  const dig = soDigitos(texto);
  const achados = t
    ? cadastro
        .filter((c) => norm(`${c.codigo} ${c.nome}`).includes(t) || (dig.length >= 3 && soDigitos(c.documento ?? "").includes(dig)))
        .slice(0, 8)
    : [];

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full rounded-md border border-slate-300 bg-white py-1 pl-6 pr-1.5 text-[11px] focus:border-sky-400 focus:outline-none"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberta(true); }}
        onFocus={() => setAberta(true)}
        onBlur={() => setTimeout(() => setAberta(false), 150)}
        placeholder="Código ou nome do cliente…"
      />
      {aberta && t && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-lg">
          {achados.length === 0 ? (
            <li className="px-2 py-1.5 text-[11px] text-slate-500">Nenhum cliente com “{texto}”. Cadastre em Mais → Clientes.</li>
          ) : (
            achados.map((c) => {
              const preso = ocupado(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={preso}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { onEscolher(c); setTexto(""); setAberta(false); }}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{c.codigo}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.nome}</span>
                    {preso ? (
                      <span className="shrink-0 text-[10px] text-amber-700">já ligado</span>
                    ) : c.documento ? (
                      <span className="shrink-0 text-[10px] text-slate-400">{formatarDocumento(c.documento)}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
