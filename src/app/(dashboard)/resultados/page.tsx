"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Building2, Loader2, Radio, Search, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getViabilizacoesHistorico, ouvirMeusPedidos } from "@/lib/firestore";
import { canAccess } from "@/lib/access";
import { semAcento } from "@/lib/localizacao";
import { DIAS_RESULTADO_NA_LISTA, ehResultadoFinal, ORDEM_CHAVES, ordenarResultados, resultadoVencido, statusDe, type ChaveStatus, type GrupoStatus } from "@/lib/statusViabilizacao";
import type { TipoInstalacao, Viabilizacao } from "@/types";
import ResultadoCard from "@/components/resultados/ResultadoCard";
import HistoricoResultados from "@/components/resultados/HistoricoResultados";

/** Filtro de situação: um grupo (números do topo), uma situação (chips) ou "precisa de você" */
type Filtro = { tipo: "todos" } | { tipo: "acao" } | { tipo: "grupo"; valor: GrupoStatus } | { tipo: "chave"; valor: ChaveStatus };

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
  const [erroAoVivo, setErroAoVivo] = useState(false);

  const ids = useMemo(() => (user ? [user.nome, user.login, user.uid, `${user.nome}@viabilidade.com`] : []), [user]);

  // Ao vivo: o Firebase manda só o que muda (sem recarregar tudo a cada X minutos)
  useEffect(() => {
    if (!user) return;
    const parar = ouvirMeusPedidos(ids, user.uid,
      (l) => { setResults(l); setLoading(false); setErroAoVivo(false); },
      (e) => { console.warn("Meus Resultados ao vivo falhou:", e); setErroAoVivo(true); setLoading(false); });
    return parar;
  }, [ids, user]);
  const load = () => {};

  // Resultado final com mais de 7 dias sai da lista (fica no histórico) — só exibição, nada é gravado
  const visiveis = useMemo(() => results.filter((r) => !resultadoVencido(r)), [results]);
  const foramProHistorico = results.length - visiveis.length;
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
        {erroAoVivo ? (
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">Sem conexão · recarregar</button>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-green-700"><Radio className="h-3.5 w-3.5" /> Ao vivo</span>
        )}
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
                <ResultadoCard key={r.id} r={r} usuario={user?.nome ?? "Usuário"} onRefresh={load} />
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((r) => (
            <ResultadoCard key={r.id} r={r} usuario={user?.nome ?? "Usuário"} onRefresh={load} />
          ))}
        </div>
      )}

      {!loading && foramProHistorico > 0 && (
        <p className="rounded-xl border border-dashed bg-white px-4 py-3 text-sm text-gray-600">
          {foramProHistorico} resultado(s) com mais de {DIAS_RESULTADO_NA_LISTA} dias foram para o histórico (abaixo). Não é preciso arquivar nada.
        </p>
      )}

      <HistoricoResultados carregar={() => getViabilizacoesHistorico(ids)} nomeArquivo={(user?.nome ?? "usuario").replace(/\s/g, "_")} />
    </div>
  );
}
