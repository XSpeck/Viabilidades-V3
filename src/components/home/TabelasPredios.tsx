"use client";

import { useState } from "react";
import { Building2, Search, XCircle } from "lucide-react";
import { locationToPlusCode } from "@/lib/pluscode";
import { semAcento } from "@/lib/localizacao";
import type { PredioAtendido, PredioSemViabilidade } from "@/types";

const COR_TEC: Record<string, string> = {
  FTTA: "bg-blue-100 text-blue-700",
  UTP: "bg-green-100 text-green-700",
};

function LinkMapa({ local }: { local: string }) {
  return (
    <a
      href={`https://maps.google.com/?q=${encodeURIComponent(local)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-gray-500 hover:text-indigo-600 hover:underline"
      title="Ver no Google Maps"
    >
      {locationToPlusCode(local)}
    </a>
  );
}

/** Consulta: prédios já atendidos e prédios sem viabilidade (cartões no celular, tabela no computador) */
export default function TabelasPredios({ atendidos, semViab }: { atendidos: PredioAtendido[]; semViab: PredioSemViabilidade[] }) {
  const [aba, setAba] = useState<0 | 1>(0);
  const [busca, setBusca] = useState("");
  const q = semAcento(busca.trim());
  const casa = (...t: (string | undefined)[]) => !q || semAcento(t.filter(Boolean).join(" ")).includes(q);

  const listaA = atendidos.filter((p) => casa(p.condominio, p.observacao, p.tecnologia));
  const listaS = semViab.filter((p) => casa(p.condominio, p.observacao));
  const total = aba === 0 ? atendidos.length : semViab.length;
  const achados = aba === 0 ? listaA.length : listaS.length;

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex border-b" role="tablist">
        {[
          { t: "Prédios atendidos", n: atendidos.length, i: <Building2 className="h-4 w-4" /> },
          { t: "Sem viabilidade", n: semViab.length, i: <XCircle className="h-4 w-4" /> },
        ].map((x, i) => (
          <button
            key={x.t}
            role="tab"
            aria-selected={aba === i}
            onClick={() => setAba(i as 0 | 1)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors ${
              aba === i ? "border-b-2 border-indigo-600 bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
          >
            {x.i} {x.t}
            <span className={`rounded-full px-1.5 text-[11px] ${aba === i ? "bg-indigo-100" : "bg-gray-100"}`}>{x.n}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou observação…"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {q && <p className="text-xs text-gray-500">{achados} de {total}</p>}

        {achados === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nenhum registro</p>
        ) : aba === 0 ? (
          <>
            {/* celular: cartões */}
            <ul className="max-h-96 space-y-2 overflow-auto md:hidden">
              {listaA.map((p) => (
                <li key={p.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{p.condominio}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_TEC[p.tecnologia] ?? "bg-orange-100 text-orange-700"}`}>{p.tecnologia}</span>
                    {(p.tecnologia === "FTTA" || p.giga) && <span className="text-xs">⚡ Giga</span>}
                  </div>
                  {p.observacao && <p className="mt-0.5 text-xs text-gray-500">{p.observacao}</p>}
                  <div className="mt-1"><LinkMapa local={p.localizacao} /></div>
                </li>
              ))}
            </ul>
            {/* computador: tabela */}
            <div className="hidden max-h-80 overflow-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Condomínio</th>
                    <th className="px-4 py-3 text-left font-medium">Tecnologia</th>
                    <th className="px-4 py-3 text-left font-medium">Giga</th>
                    <th className="px-4 py-3 text-left font-medium">Observação</th>
                    <th className="px-4 py-3 text-left font-medium">Localização</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listaA.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.condominio}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR_TEC[p.tecnologia] ?? "bg-orange-100 text-orange-700"}`}>{p.tecnologia}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">{p.tecnologia === "FTTA" || p.giga ? "⚡ Giga" : "—"}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-xs text-gray-500" title={p.observacao}>{p.observacao ?? "—"}</td>
                      <td className="px-4 py-3"><LinkMapa local={p.localizacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <ul className="max-h-96 space-y-2 overflow-auto md:hidden">
              {listaS.map((p) => (
                <li key={p.id} className="rounded-lg border px-3 py-2">
                  <p className="font-medium text-gray-900">{p.condominio}</p>
                  {p.observacao && <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600">{p.observacao}</p>}
                  <div className="mt-1"><LinkMapa local={p.localizacao} /></div>
                </li>
              ))}
            </ul>
            <div className="hidden max-h-80 overflow-auto rounded-lg border md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Condomínio</th>
                    <th className="px-4 py-3 text-left font-medium">Localização</th>
                    <th className="px-4 py-3 text-left font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listaS.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{p.condominio}</td>
                      <td className="px-4 py-3"><LinkMapa local={p.localizacao} /></td>
                      <td className="whitespace-pre-wrap px-4 py-3 text-gray-600">{p.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
