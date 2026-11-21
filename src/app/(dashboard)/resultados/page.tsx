"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Archive, CheckCircle, Clock, Building2, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { finalizarViabilizacao, getViabilizacoesHistorico, getViabilizacoesUsuario, bustCacheResultados } from "@/lib/firestore";
import { canAccess } from "@/lib/access";
import { semAcento } from "@/lib/localizacao";
import { DIAS_RESULTADO_NA_LISTA, ehResultadoFinal, ORDEM_CHAVES, ordenarResultados, resultadoVencido, statusDe, type ChaveStatus, type GrupoStatus } from "@/lib/statusViabilizacao";
import { BotaoConfirmar } from "@/components/comum/ui";
import type { TipoInstalacao, Viabilizacao } from "@/types";
import ResultadoCard from "@/components/resultados/ResultadoCard";
import HistoricoResultados from "@/components/resultados/HistoricoResultados";

/** Filtro de situação: um grupo (números do topo), uma situação (chips) ou "precisa de você" */
type Filtro = { tipo: "todos" } | { tipo: "acao" } | { tipo: "grupo"; valor: GrupoStatus } | { tipo: "chave"; valor: ChaveStatus };

/** De quanto em quanto tempo a lista se atualiza sozinha */
const ATUALIZAR_MS = 3 * 60 * 1000;

const KPIS: { grupo: GrupoStatus; rotulo: string; icone: typeof Clock; cor: string }[] = [
  { grupo: "analise", rotulo: "Em análise", icone: Clock, cor: "text-blue-600" },
  { grupo: "aprovado", rotulo: "Aprovadas", icone: CheckCircle, cor: "text-green-600" },
  { grupo: "sem_viab", rotulo: "Sem viabilidade", icone: XCircle, cor: "text-red-600" },
  { grupo: "predio", rotulo: "Estrutura prédio/cond.", icone: Building2, cor: "text-purple-600" },
];

const TIPOS: { valor: "todos" | TipoInstalacao; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos os tipos" },
  { valor: "FTTH", rotulo: "Casa" },
  { valor: "Prédio", rotulo: "Prédio" },
  { valor: "Condomínio", rotulo: "Condomínio" },
];

export default function ResultadosPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Viabilizacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({ tipo: "todos" });
  const [tipo, setTipo] = useState<"todos" | TipoInstalacao>("todos");
  const ultimaCarga = useRef(0);

  const ids = useMemo(() => (user ? [user.nome, user.login, user.uid, `${user.nome}@viabilidade.com`] : []), [user]);

  /** silencioso = atualização automática, sem o spinner grande */
  const load = useCallback(async (silencioso = false) => {
    if (!ids.length) return;
    bustCacheResultados();
    if (!silencioso) setLoading(true);
    try {
      setResults(await getViabilizacoesUsuario(ids));
      ultimaCarga.current = Date.now();
    } catch (e) {
      console.warn("Não foi possível atualizar Meus Resultados:", e);
    } finally {
      setLoading(false);
    }
  }, [ids]);

  useEffect(() => {
    // primeira carga fora do corpo do efeito (evita render em cascata)
    const t = setTimeout(() => load(), 0);
    // volta para a aba → atualiza (se a última carga tem mais de 30 s); e a cada 3 min com a aba aberta
    const aoVoltar = () => { if (document.visibilityState === "visible" && Date.now() - ultimaCarga.current > 30_000) load(true); };
    const intervalo = setInterval(() => { if (document.visibilityState === "visible") load(true); }, ATUALIZAR_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [load]);

  // Resultado final com mais de 7 dias sai da lista (fica no histórico) — só exibição, nada é gravado
  const visiveis = useMemo(() => results.filter((r) => !resultadoVencido(r)), [results]);
  const foramProHistorico = results.length - visiveis.length;
  // Tudo que já tem resposta final e ainda não foi arquivado (para o "Arquivar todos")
  const arquivaveis = useMemo(() => results.filter((r) => ehResultadoFinal(r) && !r.data_finalizacao), [results]);
  const [arquivando, setArquivando] = useState<{ feitos: number; total: number } | null>(null);
  const [erroArquivar, setErroArquivar] = useState("");

  async function arquivarTodos() {
    const lista = arquivaveis;
    setErroArquivar("");
    setArquivando({ feitos: 0, total: lista.length });
    let feitos = 0;
    try {
      for (let i = 0; i < lista.length; i += 10) {
        await Promise.all(lista.slice(i, i + 10).map((r) => finalizarViabilizacao(r.id)));
        feitos = Math.min(lista.length, i + 10);
        setArquivando({ feitos, total: lista.length });
      }
    } catch (e) {
      setErroArquivar(`Parou em ${feitos} de ${lista.length}: ${e instanceof Error ? e.message : "erro ao arquivar"}. Tente de novo.`);
    } finally {
      setArquivando(null);
      load(true);
    }
  }

  const comStatus = useMemo(() => visiveis.map((r) => ({ r, st: statusDe(r) })), [visiveis]);
  const precisaDeVoce = comStatus.filter((x) => x.st.acao).length;
  const porGrupo = (g: GrupoStatus) => comStatus.filter((x) => x.st.grupo === g).length;
  const chips = ORDEM_CHAVES
    .map((k) => ({ k, n: comStatus.filter((x) => x.st.chave === k).length, rotulo: comStatus.find((x) => x.st.chave === k)?.st.rotulo ?? k }))
    .filter((c) => c.n > 0);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return ordenarResultados(
      comStatus
        .filter(({ st }) =>
          filtro.tipo === "todos" ? true
          : filtro.tipo === "acao" ? !!st.acao
          : filtro.tipo === "grupo" ? st.grupo === filtro.valor
          : st.chave === filtro.valor)
        .map((x) => x.r)
        .filter((r) => tipo === "todos" || r.tipo_instalacao === tipo)
        .filter((r) => !q || semAcento([r.nome_cliente, r.plus_code_cliente, r.predio_ftta, r.cto_numero, r.cdoi, r.telefone_cliente].filter(Boolean).join(" ")).includes(q)),
    );
  }, [comStatus, filtro, tipo, busca]);

  if (!canAccess(user ?? null, "resultados")) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito.</div>;

  const ativo = (f: Filtro) => JSON.stringify(f) === JSON.stringify(filtro);
  const alternar = (f: Filtro) => setFiltro(ativo(f) ? { tipo: "todos" } : f);
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus resultados</h1>
          <p className="mt-1 text-sm text-gray-500">Pedidos de <strong>{user?.nome}</strong></p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {precisaDeVoce > 0 && (
        <button
          type="button"
          onClick={() => alternar({ tipo: "acao" })}
          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${ativo({ tipo: "acao" }) ? "border-orange-400 bg-orange-100" : "border-orange-300 bg-orange-50 hover:bg-orange-100"}`}
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-orange-600" />
          <span className="flex-1 text-sm font-semibold text-orange-900">
            {precisaDeVoce === 1 ? "1 pedido precisa de você" : `${precisaDeVoce} pedidos precisam de você`}
          </span>
          <span className="text-xs text-orange-700">{ativo({ tipo: "acao" }) ? "Mostrar todos" : "Ver só esses"}</span>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {KPIS.map(({ grupo, rotulo, icone: Icone, cor }) => {
          const f: Filtro = { tipo: "grupo", valor: grupo };
          return (
            <button
              key={grupo}
              type="button"
              onClick={() => alternar(f)}
              aria-pressed={ativo(f)}
              className={`flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition-colors hover:border-indigo-300 ${ativo(f) ? "border-indigo-500 ring-2 ring-indigo-200" : ""}`}
            >
              <Icone className={`h-5 w-5 shrink-0 ${cor}`} />
              <span>
                <span className="block text-2xl font-bold text-gray-900">{porGrupo(grupo)}</span>
                <span className="block text-xs text-gray-500">{rotulo}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, plus code, prédio, CTO ou telefone…"
            className="w-full rounded-lg border py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFiltro({ tipo: "todos" })} className={chip(filtro.tipo === "todos")}>Todos ({visiveis.length})</button>
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => alternar({ tipo: "chave", valor: c.k })} className={chip(ativo({ tipo: "chave", valor: c.k }))}>
              {c.rotulo} ({c.n})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <button key={t.valor} type="button" onClick={() => setTipo(t.valor)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${tipo === t.valor ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border bg-white py-16 text-center text-gray-400">
          {visiveis.length === 0 ? "Nenhum pedido em andamento." : "Nenhum pedido com esses filtros."}
        </div>
      ) : filtro.tipo === "todos" && !busca.trim() ? (
        // Sem filtro: três blocos — o que precisa do atendente, o que está andando e os resultados recentes
        <div className="space-y-5">
          {([
            { titulo: "Precisa de você", itens: lista.filter((r) => statusDe(r).acao), cor: "text-orange-700" },
            { titulo: "Aguardando", itens: lista.filter((r) => !statusDe(r).acao && !ehResultadoFinal(r)), cor: "text-gray-600" },
            { titulo: `Resultados recentes (últimos ${DIAS_RESULTADO_NA_LISTA} dias)`, itens: lista.filter((r) => !statusDe(r).acao && ehResultadoFinal(r)), cor: "text-gray-600" },
          ]).filter((b) => b.itens.length).map((b) => (
            <section key={b.titulo} className="space-y-3">
              <h2 className={`px-1 text-xs font-bold uppercase tracking-wide ${b.cor}`}>{b.titulo} ({b.itens.length})</h2>
              {b.itens.map((r) => (
                <ResultadoCard key={r.id} r={r} usuario={user?.nome ?? "Usuário"} onRefresh={() => load(true)} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((r) => (
            <ResultadoCard key={r.id} r={r} usuario={user?.nome ?? "Usuário"} onRefresh={() => load(true)} />
          ))}
        </div>
      )}

      {!loading && (foramProHistorico > 0 || arquivaveis.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-white px-4 py-3 text-sm text-gray-600">
          {foramProHistorico > 0 && (
            <span className="flex-1">
              {foramProHistorico} resultado(s) com mais de {DIAS_RESULTADO_NA_LISTA} dias foram para o histórico (abaixo).
            </span>
          )}
          {arquivaveis.length > 0 && (arquivando ? (
            <span className="flex items-center gap-2 text-indigo-700"><Loader2 className="h-4 w-4 animate-spin" /> Arquivando {arquivando.feitos} de {arquivando.total}…</span>
          ) : (
            <BotaoConfirmar
              rotulo={<><Archive className="h-3.5 w-3.5" /> Arquivar todos os resultados ({arquivaveis.length})</>}
              pergunta={`Arquivar ${arquivaveis.length} pedido(s) com resposta final? Eles ficam no histórico.`}
              confirmar="Arquivar"
              onConfirmar={arquivarTodos}
            />
          ))}
          {erroArquivar && <p className="w-full text-xs text-red-600">{erroArquivar}</p>}
        </div>
      )}

      <HistoricoResultados carregar={() => getViabilizacoesHistorico(ids)} nomeArquivo={(user?.nome ?? "usuario").replace(/\s/g, "_")} />
    </div>
  );
}
