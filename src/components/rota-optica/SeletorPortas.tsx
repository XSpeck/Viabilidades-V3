"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { rotuloCurtoPon, type ArvorePon } from "@/lib/arvorePon";
import { IconeElemento } from "./IconesRede";

/**
 * Escolhe as portas PON da árvore: um botão com a seleção e um painel com busca e as portas
 * agrupadas por OLT e placa (pílulas). Clique = só esta porta; Ctrl/⌘ ou o "+" = soma à seleção.
 */
interface Props {
  arvores: ArvorePon[];
  selecionadas: string[];
  onMudar: (chaves: string[]) => void;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** placa e porta a partir do rótulo ("PON 0/6/2" → 6, 2) */
function placaPorta(a: ArvorePon): { placa: number | null; porta: number | null } {
  const m = a.rotulo.match(/PON\s+\d+\/(\d+)\/(\d+)/);
  return m ? { placa: +m[1], porta: +m[2] } : { placa: null, porta: null };
}

export default function SeletorPortas({ arvores, selecionadas, onMudar }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  // fecha ao clicar fora e no Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fora); window.removeEventListener("keydown", tecla); };
  }, [aberto]);

  const sel = arvores.filter((a) => selecionadas.includes(a.chave));
  const q = semAcento(busca.trim());
  /** a busca acha a porta pelo número, pela OLT ou por qualquer caixa/rota dela */
  const casa = (a: ArvorePon) => !q || semAcento([a.rotulo, ...a.rotas.map((r) => r.nome), ...a.nos.map((n) => n.elemento.nome)].join(" ")).includes(q);

  const grupos = useMemo(() => {
    const porOlt = new Map<string, Map<string, ArvorePon[]>>();
    for (const a of arvores) {
      const { placa } = placaPorta(a);
      const kp = placa === null ? "outras" : `Placa ${String(placa).padStart(2, "0")}`;
      const m = porOlt.get(a.olt) ?? new Map<string, ArvorePon[]>();
      m.set(kp, [...(m.get(kp) ?? []), a]);
      porOlt.set(a.olt, m);
    }
    return [...porOlt.entries()].sort((x, y) => x[0].localeCompare(y[0], "pt-BR", { numeric: true }))
      .map(([olt, m]) => ({ olt, placas: [...m.entries()].sort((x, y) => x[0].localeCompare(y[0], "pt-BR", { numeric: true })) }));
  }, [arvores]);

  const alternar = (k: string) => onMudar(selecionadas.includes(k) ? selecionadas.filter((x) => x !== k) : [...selecionadas, k]);
  const so = (k: string) => { onMudar([k]); setAberto(false); };
  const achadas = arvores.filter(casa);

  const resumo = sel.length === 0 ? "Escolha a porta" : sel.length === 1 ? sel[0].rotulo : `${sel.length} portas: ${sel.slice(0, 3).map((a) => rotuloCurtoPon(a).replace("PON ", "")).join(", ")}${sel.length > 3 ? "…" : ""}`;
  const pontas = sel.reduce((s, a) => s + a.raiz.pontas, 0);
  const rotas = sel.reduce((s, a) => s + a.rotas.length, 0);

  return (
    <div ref={caixa} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
          className="flex items-center gap-2 rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-1.5 text-left text-sm text-white shadow-sm hover:bg-slate-800">
          <IconeElemento tipo="olt" tamanho={22} />
          <span className="leading-tight">
            <span className="block font-semibold">{resumo}</span>
            <span className="block text-xs text-slate-300">{rotas} rota{rotas !== 1 ? "s" : ""} · {pontas} ponta{pontas !== 1 ? "s" : ""} · {arvores.length} portas na rede</span>
          </span>
          <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        </button>
        {sel.length > 1 && sel.map((a) => (
          <span key={a.chave} className="flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2 pr-1 text-xs text-slate-700">
            {rotuloCurtoPon(a)}
            <button type="button" onClick={() => alternar(a.chave)} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Tirar ${a.rotulo}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>

      {aberto && (
        <div className="absolute left-0 top-full z-[60] mt-1 w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar porta (0/6/2), OLT, caixa ou rota…"
              className="min-w-0 flex-1 text-sm outline-none" />
            {busca && <button type="button" onClick={() => setBusca("")} className="text-slate-400 hover:text-slate-700" aria-label="Limpar busca"><X className="h-4 w-4" /></button>}
          </div>
          <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
            Clique numa porta para ver só ela. Para abrir <b>várias juntas</b> na árvore, marque o <b>+</b> (ou Ctrl/⌘ + clique).
          </p>
          <div className="max-h-[55vh] overflow-y-auto px-3 py-2">
            {achadas.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma porta com “{busca}”.</p>}
            {grupos.map(({ olt, placas }) => {
              const placasVis = placas.map(([p, l]) => [p, l.filter(casa)] as const).filter(([, l]) => l.length);
              if (!placasVis.length) return null;
              return (
                <section key={olt} className="mb-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-800"><IconeElemento tipo="olt" tamanho={16} /> {olt}</p>
                  <div className="space-y-1.5">
                    {placasVis.map(([placa, lista]) => (
                      <div key={placa} className="flex items-start gap-2">
                        <span className="w-16 shrink-0 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{placa}</span>
                        <div className="flex flex-wrap gap-1">
                          {[...lista].sort((x, y) => (placaPorta(x).porta ?? 0) - (placaPorta(y).porta ?? 0)).map((a) => {
                            const ativa = selecionadas.includes(a.chave);
                            const pp = placaPorta(a);
                            return (
                              <span key={a.chave} className={`flex items-stretch overflow-hidden rounded-lg border text-xs ${ativa ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`}>
                                <button type="button" onClick={(e) => (e.ctrlKey || e.metaKey ? alternar(a.chave) : so(a.chave))}
                                  title={`${a.rotulo} · ${a.rotas.length} rota(s) · ${a.raiz.pontas} ponta(s)`} className="px-2 py-1 font-semibold">
                                  {pp.porta !== null ? `Porta ${String(pp.porta).padStart(2, "0")}` : rotuloCurtoPon(a)}
                                  <span className={`ml-1 font-normal ${ativa ? "text-indigo-100" : "text-slate-400"}`}>{a.raiz.pontas}</span>
                                </button>
                                <button type="button" onClick={() => alternar(a.chave)} aria-pressed={ativa} title={ativa ? "Tirar da árvore" : "Somar à árvore"}
                                  className={`border-l px-1.5 font-bold ${ativa ? "border-indigo-500 hover:bg-indigo-700" : "border-slate-200 text-indigo-600 hover:bg-indigo-50"}`}>
                                  {ativa ? "✓" : "+"}
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{selecionadas.length} selecionada{selecionadas.length !== 1 ? "s" : ""}</span>
            {q && achadas.length > 1 && (
              <button type="button" onClick={() => onMudar([...new Set([...selecionadas, ...achadas.map((a) => a.chave)])])} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-medium hover:border-indigo-400">
                Somar as {achadas.length} achadas
              </button>
            )}
            <button type="button" onClick={() => setAberto(false)} className="ml-auto rounded-md bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-800">Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}
