"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Archive, CalendarDays, List, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import { arquivarDemanda, ouvirDemandas, bustCacheAnaliseRede, getBairros } from "@/lib/firestore";
import { listTecnicos } from "@/lib/users";
import { semAcento } from "@/lib/localizacao";
import type { DemandaRede, BairroRede } from "@/types";
import DemandaCard from "@/components/analise-rede/DemandaCard";
import NovaDemandaModal from "@/components/analise-rede/NovaDemandaModal";
import ArquivoPanel from "@/components/analise-rede/ArquivoPanel";
import AgendaSemana from "@/components/analise-rede/AgendaSemana";
import { corTecnico, diasAtraso, hojeIso, ordenarDemandas, registrarTecnicos } from "@/components/analise-rede/constantes";
import { BotaoConfirmar } from "@/components/comum/ui";

const DemandasMap = dynamic(() => import("@/components/analise-rede/DemandasMap"), { ssr: false });

type FiltroStatus = "pendentes" | "atrasadas" | "aberta" | "agendada" | "em_andamento" | "concluida" | "todas";

/** Concluídas há mais que isso são arquivadas sozinhas */
const DIAS_PARA_ARQUIVAR = 30;

const pendente = (d: DemandaRede) => d.status === "aberta" || d.status === "agendada" || d.status === "em_andamento";

export default function AnaliseRedePage() {
  const { user } = useAuth();
  const [demandas, setDemandas] = useState<DemandaRede[]>([]);
  const [bairros, setBairros] = useState<BairroRede[]>([]);
  const [tecnicosRede, setTecnicosRede] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [visao, setVisao] = useState<"lista" | "semana">("lista");
  const [tecnicoTab, setTecnicoTab] = useState<"todos" | string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>("pendentes");
  const [bairroFiltro, setBairroFiltro] = useState<"todos" | string>("todos");
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState<string | null>(null);
  const autoArquivou = useRef(false);
  const hoje = hojeIso();
  registrarTecnicos(tecnicosRede);

  // Demandas ao vivo: estrutura nova, agendamento de outro auditor etc. aparecem na hora
  useEffect(() => {
    return ouvirDemandas(
      (dem) => { setDemandas(dem); setErroLista(""); setLoading(false); },
      (e) => { setErroLista(`Não foi possível carregar as demandas: ${e.message}`); setLoading(false); },
    );
  }, []);

  // Bairros e técnicos (o resto chega pela escuta ao vivo)
  const load = useCallback(async () => {
    bustCacheAnaliseRede();
    const [bai, tec] = await Promise.all([getBairros(), listTecnicos("rede")]);
    setBairros(bai);
    setTecnicosRede(tec.map((t) => t.nome));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { load().catch(() => {}); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Concluídas há mais de 30 dias vão sozinhas para o arquivo (uma vez por visita à tela)
  useEffect(() => {
    if (loading || autoArquivou.current) return;
    autoArquivou.current = true;
    const limite = new Date(Date.now() - DIAS_PARA_ARQUIVAR * 86400000).toISOString();
    const velhas = demandas.filter((d) => d.status === "concluida" && d.data_conclusao && d.data_conclusao < limite);
    velhas.forEach((d) => { arquivarDemanda(d.id).catch(() => {}); });
  }, [loading, demandas]);

  // filtros que valem para tudo (técnico, bairro, busca)
  const base = useMemo(() => {
    const q = semAcento(busca.trim());
    return demandas.filter((d) =>
      d.status !== "arquivada" &&
      (tecnicoTab === "todos" || d.tecnicos.includes(tecnicoTab)) &&
      (bairroFiltro === "todos" || d.bairro === bairroFiltro) &&
      (!q || semAcento([d.tipo, d.descricao, d.bairro, d.local, d.criado_por, ...d.tecnicos].filter(Boolean).join(" ")).includes(q)));
  }, [demandas, tecnicoTab, bairroFiltro, busca]);

  const contar = (f: FiltroStatus) => base.filter((d) => passaStatus(d, f, hoje)).length;
  const filtradas = ordenarDemandas(base.filter((d) => passaStatus(d, statusFiltro, hoje)), hoje);
  const concluidas = base.filter((d) => d.status === "concluida");

  if (!canAccess(user ?? null, "analise-rede")) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito.</div>;

  /** Pendentes de um técnico (aba), respeitando bairro e busca */
  const pendentesDe = (t: string) => demandas.filter((d) =>
    pendente(d) && (t === "todos" || d.tecnicos.includes(t)) && (bairroFiltro === "todos" || d.bairro === bairroFiltro)).length;

  function abrirNaLista(id: string) {
    setVisao("lista");
    setStatusFiltro("todas");
    setDestaque(id);
    setTimeout(() => document.getElementById(`demanda-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    setTimeout(() => setDestaque(null), 3000);
  }

  const chips: { k: FiltroStatus; r: string; cor?: string }[] = [
    { k: "pendentes", r: "Pendentes" },
    { k: "atrasadas", r: "Atrasadas", cor: "red" },
    { k: "aberta", r: "Abertas" },
    { k: "agendada", r: "Agendadas" },
    { k: "em_andamento", r: "Em andamento" },
    { k: "concluida", r: "Concluídas" },
    { k: "todas", r: "Todas" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Análise da Rede</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load()} title="Recarregar bairros e técnicos" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setShowMap((s) => !s)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${showMap ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"}`}>
            {showMap ? "Fechar mapa" : "Ver mapa"}
          </button>
          <button type="button" onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Nova demanda
          </button>
        </div>
      </div>

      {/* Números (clicam no filtro) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          { k: "atrasadas", r: "Atrasadas", cor: "text-red-600" },
          { k: "aberta", r: "Abertas", cor: "text-orange-600" },
          { k: "agendada", r: "Agendadas", cor: "text-indigo-600" },
          { k: "em_andamento", r: "Em andamento", cor: "text-yellow-600" },
        ] as { k: FiltroStatus; r: string; cor: string }[]).map((x) => (
          <button key={x.k} type="button" onClick={() => { setVisao("lista"); setStatusFiltro(statusFiltro === x.k ? "pendentes" : x.k); }}
            className={`rounded-xl border bg-white p-4 text-center transition-colors hover:border-indigo-300 ${statusFiltro === x.k ? "border-indigo-500 ring-2 ring-indigo-200" : ""}`}>
            <p className={`text-3xl font-bold ${x.cor}`}>{contar(x.k)}</p>
            <p className="mt-1 text-xs text-gray-500">{x.r}</p>
          </button>
        ))}
      </div>

      {showMap && (
        <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-semibold text-gray-800">Mapa de demandas</h2>
            <p className="mt-0.5 text-xs text-gray-400">{filtradas.filter((d) => d.local).length} de {filtradas.length} demanda(s) com localização · pin maior = maior prioridade</p>
          </div>
          <DemandasMap demandas={filtradas} onAbrir={abrirNaLista} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        {/* Abas por técnico (contam as pendentes) */}
        <div className="flex overflow-x-auto border-b">
          {["todos", ...tecnicosRede].map((t) => {
            const n = pendentesDe(t);
            return (
              <button key={t} type="button" onClick={() => setTecnicoTab(t)}
                className={`flex flex-shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${tecnicoTab === t ? "border-b-2 border-indigo-600 bg-indigo-50 text-indigo-600" : "text-gray-500 hover:bg-gray-50"}`}>
                {t !== "todos" && <span className={`h-2 w-2 rounded-full ${corTecnico(t)}`} />}
                {t === "todos" ? "Todos" : t}
                {n > 0 && <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${tecnicoTab === t ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`} title="Pendentes">{n}</span>}
              </button>
            );
          })}
        </div>

        {/* Busca, bairro e visão */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-gray-50 px-4 py-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por tipo, descrição, bairro, técnico…"
              className="w-full rounded-lg border bg-white py-1.5 pl-8 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {busca && <button type="button" onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" aria-label="Limpar busca"><X className="h-3.5 w-3.5" /></button>}
          </div>
          {bairros.length > 0 && (
            <select value={bairroFiltro} onChange={(e) => setBairroFiltro(e.target.value)} aria-label="Bairro"
              className="rounded-lg border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="todos">Todos os bairros</option>
              {bairros.map((b) => <option key={b.id} value={b.nome}>{b.nome}</option>)}
            </select>
          )}
          <div className="flex overflow-hidden rounded-lg border bg-white text-sm">
            <button type="button" onClick={() => setVisao("lista")} className={`flex items-center gap-1 px-3 py-1.5 ${visao === "lista" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}><List className="h-4 w-4" /> Lista</button>
            <button type="button" onClick={() => setVisao("semana")} className={`flex items-center gap-1 px-3 py-1.5 ${visao === "semana" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}><CalendarDays className="h-4 w-4" /> Semana</button>
          </div>
        </div>

        {erroLista && <p className="m-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erroLista}</p>}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></div>
        ) : visao === "semana" ? (
          <AgendaSemana demandas={base} onAbrir={abrirNaLista} />
        ) : (
          <>
            {/* Filtro de status */}
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              {chips.map((c) => {
                const n = contar(c.k);
                if (c.k === "atrasadas" && !n) return null;
                const on = statusFiltro === c.k;
                return (
                  <button key={c.k} type="button" onClick={() => setStatusFiltro(c.k)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? (c.cor === "red" ? "bg-red-600 text-white" : "bg-indigo-600 text-white") : c.cor === "red" ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : "border bg-white text-gray-600 hover:bg-gray-100"}`}>
                    {c.r} ({n})
                  </button>
                );
              })}
              {statusFiltro === "concluida" && concluidas.length > 0 && (
                <span className="ml-auto">
                  <BotaoConfirmar rotulo={<><Archive className="h-3.5 w-3.5" /> Arquivar todas ({concluidas.length})</>}
                    pergunta={`Arquivar ${concluidas.length} demanda(s) concluída(s)?`} confirmar="Arquivar"
                    onConfirmar={() => { concluidas.forEach((d) => { arquivarDemanda(d.id).catch(() => {}); }); }} />
                </span>
              )}
            </div>

            {filtradas.length === 0 ? (
              <div className="py-12 text-center text-gray-400">Nenhuma demanda encontrada.</div>
            ) : (
              <div className="divide-y">
                {filtradas.map((d) => (
                  <DemandaCard key={d.id} demanda={d} bairros={bairros} tecnicosRede={tecnicosRede} onRefresh={load}
                    atraso={diasAtraso(d, hoje)} destaque={destaque === d.id} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-center text-xs text-gray-400">Concluídas há mais de {DIAS_PARA_ARQUIVAR} dias vão sozinhas para o arquivo.</p>

      <ArquivoPanel onRestored={load} />

      {showModal && (
        <NovaDemandaModal
          auditorNome={user?.nome ?? ""}
          bairros={bairros}
          tecnicosRede={tecnicosRede}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function passaStatus(d: DemandaRede, f: FiltroStatus, hoje: string): boolean {
  switch (f) {
    case "pendentes": return pendente(d);
    case "atrasadas": return diasAtraso(d, hoje) > 0;
    case "todas": return true;
    default: return d.status === f;
  }
}
