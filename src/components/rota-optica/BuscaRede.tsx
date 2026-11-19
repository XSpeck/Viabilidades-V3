"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Route as RouteIcon, Search, X } from "lucide-react";
import { formatMetros, resumoRota, textoBuscaRota, TIPO_ELEMENTO_LABEL, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import type { ArvorePon } from "@/lib/arvorePon";
import { usoDasFibras } from "@/lib/cabosRede";
import { IconeCabo, IconeElemento } from "./IconesRede";

interface Props {
  rotas: RotaOptica[];
  arvores: ArvorePon[];
  onRota: (id: string, arvoreChave?: string) => void;
  onElemento: (arvoreChave: string, noId: string) => void;
  onCabo: (nome: string) => void;
}

type Resultado =
  | { tipo: "rota"; id: string; titulo: string; sub: string; arvore?: string }
  | { tipo: "elemento"; id: string; titulo: string; sub: string; arvore: string; noId: string; icone: ReturnType<typeof tipoVisual> }
  | { tipo: "cabo"; id: string; titulo: string; sub: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Destaca o trecho buscado no texto */
function Realce({ texto, termo }: { texto: string; termo: string }) {
  if (!termo) return <>{texto}</>;
  const i = norm(texto).indexOf(norm(termo));
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <mark className="bg-amber-200/80 text-inherit rounded px-0.5">{texto.slice(i, i + termo.length)}</mark>
      {texto.slice(i + termo.length)}
    </>
  );
}

const GRUPOS: { tipo: Resultado["tipo"]; titulo: string }[] = [
  { tipo: "rota", titulo: "Rotas" },
  { tipo: "elemento", titulo: "Caixas e elementos" },
  { tipo: "cabo", titulo: "Cabos" },
];

/** Busca única da rede: rotas, caixas (nome ou código PT) e cabos. Atalho: tecla "/". */
export default function BuscaRede({ rotas, arvores, onRota, onElemento, onCabo }: Props) {
  const [termo, setTermo] = useState("");
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // "/" foca a busca; clique fora fecha
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const fora = (e: PointerEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberta(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fora);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fora);
    };
  }, []);

  const indice = useMemo(() => {
    const arvoreDaRota = new Map<string, ArvorePon>();
    arvores.forEach((a) => a.rotas.forEach((r) => arvoreDaRota.set(r.id, a)));
    const rs: (Resultado & { busca: string })[] = rotas.map((r) => {
      const res = resumoRota(r.elementos);
      const a = arvoreDaRota.get(r.id);
      return {
        tipo: "rota",
        id: `r:${r.id}`,
        titulo: r.nome,
        sub: `${a ? a.rotulo + " · " : ""}${r.elementos.length} elementos · ${formatMetros(res.distancia_m)} · ${r.origem === "geogrid" ? "GeoGrid" : "manual"}`,
        arvore: a?.chave,
        busca: norm(textoBuscaRota(r)),
      };
    });
    const es: (Resultado & { busca: string })[] = [];
    for (const a of arvores) {
      for (const n of a.nos) {
        if (!n.pai) continue;
        const t = tipoVisual(n.elemento);
        es.push({
          tipo: "elemento",
          id: `e:${a.chave}:${n.id}`,
          titulo: n.elemento.nome,
          sub: `${TIPO_ELEMENTO_LABEL[t]}${n.elemento.codigo ? " · " + n.elemento.codigo : ""} · ${a.rotulo}`,
          arvore: a.chave,
          noId: n.id,
          icone: t,
          busca: norm(`${n.elemento.nome} ${n.elemento.codigo ?? ""} ${TIPO_ELEMENTO_LABEL[t]}`),
        });
      }
    }
    const cs: (Resultado & { busca: string })[] = [];
    usoDasFibras(rotas).forEach((v, k) => {
      cs.push({ tipo: "cabo", id: `c:${k}`, titulo: v.nome, sub: `${v.fibras.size} fibra${v.fibras.size !== 1 ? "s" : ""} em uso pelas rotas`, busca: norm(v.nome) });
    });
    return { rs, es, cs };
  }, [rotas, arvores]);

  const t = norm(termo.trim());
  const grupos = useMemo(() => {
    if (!t) return [{ tipo: "rota" as const, itens: indice.rs as Resultado[], total: indice.rs.length }];
    const f = (l: (Resultado & { busca: string })[]) => l.filter((x) => x.busca.includes(t));
    return [
      { tipo: "rota" as const, lista: f(indice.rs) },
      { tipo: "elemento" as const, lista: f(indice.es) },
      { tipo: "cabo" as const, lista: f(indice.cs) },
    ].map((g) => ({ tipo: g.tipo, itens: g.lista.slice(0, 8) as Resultado[], total: g.lista.length }));
  }, [t, indice]);
  const planos = grupos.flatMap((g) => g.itens);

  function escolher(r: Resultado) {
    setAberta(false);
    inputRef.current?.blur();
    if (r.tipo === "rota") onRota(r.id.slice(2), r.arvore);
    else if (r.tipo === "elemento") onElemento(r.arvore, r.noId);
    else onCabo(r.titulo);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAberta(true); setAtivo((a) => Math.min(planos.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && planos[ativo]) { e.preventDefault(); escolher(planos[ativo]); }
    else if (e.key === "Escape") { setAberta(false); inputRef.current?.blur(); }
  }

  let idx = -1;
  return (
    <div ref={caixaRef} className="relative">
      <div className={`flex items-center gap-2 rounded-2xl border bg-white px-3.5 py-2.5 shadow-sm transition ${aberta ? "border-indigo-400 ring-4 ring-indigo-100" : "border-slate-200 hover:border-slate-300"}`}>
        <Search className="w-5 h-5 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setAtivo(0); setAberta(true); }}
          onFocus={() => setAberta(true)}
          onKeyDown={teclado}
          placeholder="Buscar rota, caixa, CTO, código PT ou cabo…"
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
          role="combobox"
          aria-expanded={aberta}
          aria-controls="busca-rede-lista"
          aria-label="Buscar na rede"
        />
        {termo ? (
          <button type="button" onClick={() => { setTermo(""); inputRef.current?.focus(); }} className="p-0.5 rounded hover:bg-slate-100" aria-label="Limpar busca">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        ) : (
          <kbd className="hidden sm:inline text-[10px] font-semibold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">/</kbd>
        )}
      </div>

      {aberta && (
        <div
          id="busca-rede-lista"
          role="listbox"
          className="absolute z-40 left-0 right-0 mt-2 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
        >
          <div className="max-h-[60vh] overflow-auto py-1.5">
            {planos.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                {rotas.length === 0 ? "Nenhuma rota cadastrada ainda." : `Nada encontrado para "${termo}".`}
              </p>
            )}
            {grupos.map((g) =>
              g.itens.length === 0 ? null : (
                <div key={g.tipo} className="py-1">
                  <p className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t ? GRUPOS.find((x) => x.tipo === g.tipo)!.titulo : "Todas as rotas"} <span className="font-medium">({g.total})</span>
                  </p>
                  {g.itens.map((r) => {
                    idx++;
                    const meu = idx;
                    const sel = meu === ativo;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="option"
                        aria-selected={sel}
                        onMouseEnter={() => setAtivo(meu)}
                        onClick={() => escolher(r)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left ${sel ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      >
                        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.tipo === "rota" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100"}`}>
                          {r.tipo === "rota" ? <RouteIcon className="w-5 h-5" /> : r.tipo === "cabo" ? <IconeCabo tamanho={24} /> : <IconeElemento tipo={r.icone} tamanho={26} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-900 truncate"><Realce texto={r.titulo} termo={termo.trim()} /></span>
                          <span className="block text-xs text-slate-500 truncate">{r.sub}</span>
                        </span>
                        {sel && <span className="text-[10px] text-indigo-500 font-semibold shrink-0">Enter ↵</span>}
                      </button>
                    );
                  })}
                  {g.total > g.itens.length && (
                    <p className="px-4 py-1 text-[11px] text-slate-400">+ {g.total - g.itens.length} — refine a busca</p>
                  )}
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400">
            <span><kbd className="font-semibold">↑ ↓</kbd> navegar</span>
            <span><kbd className="font-semibold">Enter</kbd> abrir</span>
            <span><kbd className="font-semibold">Esc</kbd> fechar</span>
          </div>
        </div>
      )}
    </div>
  );
}
