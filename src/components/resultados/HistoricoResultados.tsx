"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, History, Loader2, Search } from "lucide-react";
import { formatDateTime, locationToPlusCode } from "@/lib/pluscode";
import { semAcento } from "@/lib/localizacao";
import { ehUtp, statusDe } from "@/lib/statusViabilizacao";
import type { TipoInstalacao, Viabilizacao } from "@/types";

const POR_PAGINA = 20;
type Coluna = "data" | "cliente" | "tipo" | "status" | "auditor" | "dt_audit";

const tipoDe = (v: Viabilizacao) => (ehUtp(v) ? "UTP" : v.tipo_instalacao === "FTTH" ? "Casa" : v.tipo_instalacao);
const caixaDe = (v: Viabilizacao) => v.cdoi ?? v.cto_numero ?? "-";
const motivoDe = (v: Viabilizacao) => v.motivo_rejeicao ?? v.motivo_desistencia ?? "-";

/** Histórico completo (inclusive finalizados): filtros, tabela no computador, cartões no celular, CSV */
export default function HistoricoResultados({ carregar, nomeArquivo }: { carregar: () => Promise<Viabilizacao[]>; nomeArquivo: string }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Viabilizacao[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoInstalacao>("todos");
  const [situacao, setSituacao] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [ordem, setOrdem] = useState<{ col: Coluna; dir: 1 | -1 }>({ col: "data", dir: -1 });
  const [pagina, setPagina] = useState(1);

  async function abrir() {
    setAberto((a) => !a);
    if (lista || carregando) return;
    setCarregando(true);
    try { setLista(await carregar()); }
    catch { setErro("Não foi possível carregar o histórico."); }
    finally { setCarregando(false); }
  }

  const todos = useMemo(() => lista ?? [], [lista]);
  const situacoes = useMemo(() => [...new Set(todos.map((v) => statusDe(v).rotulo))].sort((a, b) => a.localeCompare(b, "pt-BR")), [todos]);

  const filtrados = useMemo(() => {
    const q = semAcento(busca.trim());
    const chave = (v: Viabilizacao): string => {
      switch (ordem.col) {
        case "cliente": return v.nome_cliente ?? "";
        case "tipo": return tipoDe(v);
        case "status": return statusDe(v).rotulo;
        case "auditor": return v.auditado_por ?? "";
        case "dt_audit": return v.data_auditoria ?? "";
        default: return v.data_solicitacao ?? "";
      }
    };
    return todos
      .filter((v) => tipo === "todos" || v.tipo_instalacao === tipo)
      .filter((v) => situacao === "todos" || statusDe(v).rotulo === situacao)
      .filter((v) => {
        const d = (v.data_solicitacao ?? "").slice(0, 10);
        return (!de || d >= de) && (!ate || d <= ate);
      })
      .filter((v) => !q || semAcento([v.nome_cliente, v.plus_code_cliente, v.predio_ftta, v.cto_numero, v.cdoi, v.auditado_por, v.telefone_cliente].filter(Boolean).join(" ")).includes(q))
      .sort((a, b) => chave(a).localeCompare(chave(b), "pt-BR") * ordem.dir);
  }, [todos, busca, tipo, situacao, de, ate, ordem]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  const itens = filtrados.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const filtrando = busca || tipo !== "todos" || situacao !== "todos" || de || ate;
  const mudarFiltro = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPagina(1); };

  function ordenar(col: Coluna) {
    setOrdem((o) => (o.col === col ? { col, dir: (o.dir * -1) as 1 | -1 } : { col, dir: 1 }));
  }

  function baixarCsv() {
    const linhas = filtrados.map((v) => ({
      Data: formatDateTime(v.data_solicitacao),
      Tipo: tipoDe(v),
      Cliente: v.nome_cliente ?? "-",
      Telefone: v.telefone_cliente ?? "-",
      "Plus Code": locationToPlusCode(v.plus_code_cliente),
      "Prédio/Cond": v.predio_ftta ?? "-",
      "CTO/CDOI": caixaDe(v),
      OLT: v.olt ?? "-",
      Distância: v.distancia_cliente ?? "-",
      Situação: statusDe(v).rotulo,
      Motivo: motivoDe(v),
      Auditor: v.auditado_por ?? "-",
      "Dt. Audit.": formatDateTime(v.data_auditoria),
    }));
    if (!linhas.length) return;
    const cab = Object.keys(linhas[0]) as (keyof (typeof linhas)[0])[];
    const csv = [cab.join(";"), ...linhas.map((l) => cab.map((h) => `"${String(l[h]).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `historico_${nomeArquivo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const th = (children: string, col?: Coluna) =>
    col ? (
      <th key={children} onClick={() => ordenar(col)} className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left hover:bg-gray-100">
        {children} <span className="text-gray-300">{ordem.col === col ? (ordem.dir === 1 ? "↑" : "↓") : "↕"}</span>
      </th>
    ) : (
      <th key={children} className="whitespace-nowrap px-3 py-3 text-left text-gray-400">{children}</th>
    );

  const sel = "rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <button type="button" onClick={abrir} className="flex w-full items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50" aria-expanded={aberto}>
        <span className="flex items-center gap-2">
          <History className="h-5 w-5 text-indigo-600" />
          <span className="font-semibold text-gray-800">Histórico completo</span>
          <span className="hidden text-xs text-gray-400 sm:inline">inclui os finalizados</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="border-t">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin text-indigo-600" /> Carregando…</div>
          ) : erro ? (
            <p className="py-8 text-center text-sm text-red-600">{erro}</p>
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input value={busca} onChange={(e) => mudarFiltro(setBusca)(e.target.value)} placeholder="Cliente, plus code, prédio, CTO, telefone…" className={`${sel} w-full pl-9`} />
                </div>
                <select value={tipo} onChange={(e) => mudarFiltro(setTipo)(e.target.value as typeof tipo)} className={sel} aria-label="Tipo">
                  <option value="todos">Todos os tipos</option>
                  <option value="FTTH">Casa</option>
                  <option value="Prédio">Prédio</option>
                  <option value="Condomínio">Condomínio</option>
                </select>
                <select value={situacao} onChange={(e) => mudarFiltro(setSituacao)(e.target.value)} className={sel} aria-label="Situação">
                  <option value="todos">Todas as situações</option>
                  {situacoes.map((s) => <option key={s}>{s}</option>)}
                </select>
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  De <input type="date" value={de} onChange={(e) => mudarFiltro(setDe)(e.target.value)} className={`${sel} px-2`} />
                  até <input type="date" value={ate} onChange={(e) => mudarFiltro(setAte)(e.target.value)} className={`${sel} px-2`} />
                </span>
                <button type="button" onClick={baixarCsv} disabled={!filtrados.length} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                {filtrando && (
                  <button type="button" onClick={() => { setBusca(""); setTipo("todos"); setSituacao("todos"); setDe(""); setAte(""); setPagina(1); }} className="text-xs text-gray-400 underline hover:text-gray-600">
                    Limpar filtros
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400">{filtrados.length} de {todos.length} pedido(s)</p>

              {filtrados.length === 0 ? (
                <p className="py-8 text-center text-gray-400">Nenhum pedido encontrado.</p>
              ) : (
                <>
                  {/* celular */}
                  <ul className="space-y-2 md:hidden">
                    {itens.map((v) => {
                      const st = statusDe(v);
                      return (
                        <li key={v.id} className="rounded-lg border px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{v.nome_cliente ?? "-"}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}>{st.rotulo}</span>
                          </div>
                          <p className="text-xs text-gray-500">{tipoDe(v)}{v.predio_ftta ? ` · ${v.predio_ftta}` : ""} · {formatDateTime(v.data_solicitacao)}</p>
                          {caixaDe(v) !== "-" && <p className="text-xs text-gray-500">{caixaDe(v)}{v.distancia_cliente ? ` · ${v.distancia_cliente}` : ""}</p>}
                          {motivoDe(v) !== "-" && <p className="text-xs text-gray-600">{motivoDe(v)}</p>}
                        </li>
                      );
                    })}
                  </ul>
                  {/* computador */}
                  <div className="hidden overflow-auto rounded-lg border md:block">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
                        <tr>
                          {th("Data", "data")}
                          {th("Tipo", "tipo")}
                          {th("Cliente", "cliente")}
                          {th("Plus Code")}
                          {th("Prédio/Cond.")}
                          {th("CTO / CDOI")}
                          {th("Distância")}
                          {th("Situação", "status")}
                          {th("Motivo")}
                          {th("Auditor", "auditor")}
                          {th("Dt. Audit.", "dt_audit")}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itens.map((v) => {
                          const st = statusDe(v);
                          return (
                            <tr key={v.id} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{formatDateTime(v.data_solicitacao)}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs">{tipoDe(v)}</td>
                              <td className="whitespace-nowrap px-3 py-2.5">{v.nome_cliente ?? "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-500">
                                <a href={`https://maps.google.com/?q=${encodeURIComponent(v.plus_code_cliente)}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline">{locationToPlusCode(v.plus_code_cliente)}</a>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{v.predio_ftta ?? "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{caixaDe(v)}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{v.distancia_cliente ?? "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cor}`}>{st.rotulo}</span></td>
                              <td className="max-w-[240px] px-3 py-2.5 text-xs text-gray-600">{motivoDe(v)}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{v.auditado_por ?? "-"}</td>
                              <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{formatDateTime(v.data_auditoria)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {paginas > 1 && (
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-gray-400">Página {pag} de {paginas}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setPagina(pag - 1)} disabled={pag === 1} className="rounded-lg border px-3 py-1 hover:bg-gray-50 disabled:opacity-30">Anterior</button>
                    <button type="button" onClick={() => setPagina(pag + 1)} disabled={pag === paginas} className="rounded-lg border px-3 py-1 hover:bg-gray-50 disabled:opacity-30">Próxima</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
