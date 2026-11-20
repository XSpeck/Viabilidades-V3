"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Building2, Cable as CableIcon, Loader2, Package, Trash2 } from "lucide-react";
import type { RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento } from "@/lib/arvorePon";
import { excluirCaixa, type CaixaRede } from "@/lib/caixasRede";
import { chaveCabo, excluirCabo, type CaboRede } from "@/lib/cabosRede";
import { excluirPredio, listarPredios, salvarPredio, type PredioRede } from "@/lib/prediosRede";

/**
 * Limpeza: o que ficou guardado sem nenhuma rota usando (resíduos de rotas apagadas).
 * Prédios / CDOIs, diagramas de caixa (splitter, portas, emendas) e cabos (tipo e anotações das fibras).
 */

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  cabos: CaboRede[];
  usuario: string;
  onCaixas: (c: CaixaRede[]) => void;
  onCabos: (c: CaboRede[]) => void;
  /** Prédios mudaram (a árvore relê) */
  onPredios: () => void;
}

export default function LimpezaRede({ rotas, caixas, cabos, usuario, onCaixas, onCabos, onPredios }: Props) {
  const [predios, setPredios] = useState<PredioRede[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarPredios(true).then((ps) => vivo && setPredios(ps)).catch(() => vivo && setPredios([]));
    return () => { vivo = false; };
  }, []);

  // O que as rotas usam hoje
  const chavesRotas = new Set(rotas.flatMap((r) => r.elementos.map(chaveElemento)));
  const cabosRotas = new Set(rotas.flatMap((r) => r.elementos.flatMap((e) => [e.cabo_entrada, e.cabo_saida]).filter((c): c is string => !!c?.trim()).map(chaveCabo)));

  // Resíduos
  const prediosSobra = (predios ?? [])
    .map((p) => {
      const semRota = p.pontos.filter((o) => o.chave && !chavesRotas.has(o.chave));
      const comRota = p.pontos.filter((o) => o.chave && chavesRotas.has(o.chave));
      return { p, semRota, comRota };
    })
    .filter((x) => x.semRota.length > 0 || x.comRota.length === 0);
  const caixasSobra = caixas.filter((c) => !chavesRotas.has(c.chave));
  const cabosSobra = cabos.filter((c) => !cabosRotas.has(c.chave));
  const total = prediosSobra.length + caixasSobra.length + cabosSobra.length;

  async function rodar(id: string, fn: () => Promise<void>) {
    setOcupado(id);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(/permission/i.test(String(e)) ? "Sem permissão para apagar." : "Não foi possível apagar.");
    } finally {
      setOcupado(null);
    }
  }
  const apagarPredio = (p: PredioRede) =>
    rodar(`p${p.id}`, async () => {
      await excluirPredio(p.id);
      setPredios((ps) => (ps ?? []).filter((x) => x.id !== p.id));
      onPredios();
    });
  const limparCdois = (p: PredioRede) =>
    rodar(`l${p.id}`, async () => {
      const salvo = await salvarPredio({ ...p, pontos: p.pontos.filter((o) => !o.chave || chavesRotas.has(o.chave)) }, usuario);
      setPredios((ps) => (ps ?? []).map((x) => (x.id === p.id ? salvo : x)));
      onPredios();
    });
  const apagarCaixa = (c: CaixaRede) =>
    rodar(`c${c.id}`, async () => {
      await excluirCaixa(c.id);
      onCaixas(caixas.filter((x) => x.id !== c.id));
    });
  const apagarCabo = (c: CaboRede) =>
    rodar(`k${c.id}`, async () => {
      await excluirCabo(c.id);
      onCabos(cabos.filter((x) => x.id !== c.id));
    });
  async function apagarTudo() {
    if (!confirm(`Apagar todos os ${total} resíduos? Prédios sem rota, CDOIs sem rota, diagramas de caixa e cabos sem rota. Não dá para desfazer.`)) return;
    await rodar("tudo", async () => {
      for (const x of prediosSobra) {
        if (x.comRota.length === 0) await excluirPredio(x.p.id);
        else await salvarPredio({ ...x.p, pontos: x.p.pontos.filter((o) => !o.chave || chavesRotas.has(o.chave)) }, usuario);
      }
      for (const c of caixasSobra) await excluirCaixa(c.id);
      for (const c of cabosSobra) await excluirCabo(c.id);
      onCaixas(caixas.filter((c) => !caixasSobra.includes(c)));
      onCabos(cabos.filter((c) => !cabosSobra.includes(c)));
      setPredios(await listarPredios(true));
      onPredios();
    });
  }

  const btn = "shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-50";
  const secao = (icone: ReactNode, titulo: string, qtd: number, explica: string) => (
    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
      {icone} {titulo}
      <span className={`rounded-full px-1.5 text-[10px] ${qtd ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{qtd}</span>
      <span className="ml-1 font-normal text-[10px] text-slate-400">{explica}</span>
    </p>
  );

  if (!predios) return <p className="p-4 text-xs text-slate-500">Procurando resíduos…</p>;

  return (
    <div className="p-3 space-y-3">
      <div className={`rounded-xl border px-3 py-2 text-xs ${total ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
        {total
          ? <>Há <b>{total}</b> {total === 1 ? "item guardado" : "itens guardados"} que nenhuma rota usa mais (sobraram de rotas apagadas).</>
          : <>Tudo limpo: tudo o que está guardado é usado por alguma rota.</>}
        {total > 0 && (
          <button type="button" disabled={!!ocupado} onClick={apagarTudo} className="ml-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {ocupado === "tudo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Apagar tudo
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <section className="space-y-1.5">
        {secao(<Building2 className="h-4 w-4 text-slate-500" />, "Prédios", prediosSobra.length, "prédio sem rota, ou CDOIs dele sem rota")}
        {prediosSobra.map(({ p, semRota, comRota }) => (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{p.nome}</span>
              {comRota.length > 0 && semRota.length > 0 && (
                <button type="button" disabled={!!ocupado} onClick={() => limparCdois(p)} className={`${btn} border-amber-300 bg-amber-50 text-amber-800`}>
                  {ocupado === `l${p.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Tirar CDOIs sem rota
                </button>
              )}
              <button type="button" disabled={!!ocupado} onClick={() => confirm(`Apagar o prédio "${p.nome}"?`) && apagarPredio(p)} className={`${btn} border-red-200 bg-red-50 text-red-700`}>
                {ocupado === `p${p.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Apagar prédio
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {comRota.length === 0 ? "Nenhuma CDOI dele tem rota." : `${comRota.length} CDOI${comRota.length !== 1 ? "s" : ""} com rota.`}
              {semRota.length > 0 && ` Sem rota: ${semRota.map((o) => o.nome).join(", ")}.`}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        {secao(<Package className="h-4 w-4 text-slate-500" />, "Caixas", caixasSobra.length, "splitter, portas, clientes e emendas de caixas que não estão em rota")}
        {caixasSobra.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{c.nome || c.chave}</p>
              <p className="truncate text-[10px] text-slate-500">
                {[c.splitters?.length ? `${c.splitters.length} splitters` : c.splitter, c.emendas?.length || c.regras_emenda?.length ? "mapa de emendas" : "", c.atendimento?.length ? "clientes da CT" : "", c.chave.startsWith("PT:") ? `código ${c.chave.slice(3)}` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button type="button" disabled={!!ocupado} onClick={() => apagarCaixa(c)} className={`${btn} border-red-200 bg-red-50 text-red-700`}>
              {ocupado === `c${c.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Apagar
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        {secao(<CableIcon className="h-4 w-4 text-slate-500" />, "Cabos", cabosSobra.length, "tipo do cabo e anotações de fibras de cabos que nenhuma rota usa")}
        {cabosSobra.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{c.nome || c.chave}</p>
              <p className="text-[10px] text-slate-500">{c.capacidade ? `${c.capacidade} fibras` : "sem capacidade"}{c.fibras.length ? ` · ${c.fibras.length} fibra(s) anotada(s)` : ""}</p>
            </div>
            <button type="button" disabled={!!ocupado} onClick={() => apagarCabo(c)} className={`${btn} border-red-200 bg-red-50 text-red-700`}>
              {ocupado === `k${c.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Apagar
            </button>
          </div>
        ))}
      </section>
      <p className="text-[10px] text-slate-400">O cadastro de equipamentos (tipos de cabo, splitters, DIO, OLT) não entra aqui: ele vale para a rede toda.</p>
    </div>
  );
}
