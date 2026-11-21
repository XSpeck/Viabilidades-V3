"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, Radio, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ouvirAuditoria } from "@/lib/firestore";
import { listTecnicos } from "@/lib/users";
import { canAccess, getCargo } from "@/lib/access";
import { semAcento } from "@/lib/localizacao";
import type { Viabilizacao } from "@/types";
import { MODULOS } from "@/lib/modulos";
import CartaoAuditoria from "@/components/auditoria/CartaoAuditoria";
import { corEspera, minutosDesde, tempoTexto } from "@/components/viabilidades/CardFila";
import { dataBr } from "@/components/comum/ui";
import HistoricoAuditor from "@/components/auditoria/HistoricoAuditor";
import type { Auditor, Tecnicos } from "@/components/auditoria/tipos";

type Filtro = "todos" | "urgentes" | "casa" | "predios" | "aguardando" | "agendar" | "contestado";

/** Sem o módulo de agendamento: prédio com o atendente (dados do síndico) ou com a equipe de rede não é trabalho do auditor */
const ESPERANDO_OUTROS = ["aguardando_dados", "pronto_auditoria", "agendado", "proposta_visita"];
const comOutros = (v: Viabilizacao) => !MODULOS.agendamento && ESPERANDO_OUTROS.includes(v.status_predio ?? "");

const FILTROS: { k: Filtro; rotulo: string; teste: (v: Viabilizacao) => boolean }[] = [
  { k: "urgentes", rotulo: "Urgentes", teste: (v) => !!v.urgente },
  { k: "casa", rotulo: "Casa", teste: (v) => v.tipo_instalacao === "FTTH" && !v.urgente },
  { k: "predios", rotulo: "Prédio/Cond.", teste: (v) => v.tipo_instalacao !== "FTTH" && !v.urgente && !v.status_predio },
  { k: "aguardando", rotulo: "Aguardando dados", teste: (v) => v.status_predio === "aguardando_dados" },
  { k: "agendar", rotulo: MODULOS.agendamento ? "Agendar visita" : "Com a rede", teste: (v) => ["pronto_auditoria", "proposta_visita", ...(MODULOS.agendamento ? [] : ["agendado"])].includes(v.status_predio ?? "") },
  { k: "contestado", rotulo: "Contestações", teste: (v) => v.status === "em_revisao" && v.revisao_tipo === "contestado" },
];

export default function AuditoriaPage() {
  const { user } = useAuth();
  const [itens, setItens] = useState<Viabilizacao[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState("");
  const [tecnicos, setTecnicos] = useState<Tecnicos>([]);
  const [erroTecnicos, setErroTecnicos] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  const pode = canAccess(user ?? null, "auditoria");
  const auditor: Auditor | null = useMemo(() => (user ? { nome: user.nome, uid: user.uid, adm: getCargo(user) === "adm" } : null), [user]);

  // Pedidos com este auditor, ao vivo (respostas do atendente aparecem sozinhas)
  useEffect(() => {
    if (!pode || !auditor) return;
    return ouvirAuditoria(auditor.nome, (l) => { setItens(l); setErro(""); }, (e) => setErro(`Não foi possível carregar a sua lista: ${e.message}`));
  }, [pode, auditor]);

  // Técnicos: uma leitura para a página toda
  useEffect(() => {
    if (!pode) return;
    listTecnicos("rede").then(setTecnicos).catch(() => setErroTecnicos(true));
  }, [pode]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // aviso de sucesso some sozinho
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const meus = useMemo(() => (itens ?? []).filter((v) => !comOutros(v)), [itens]);
  const acompanhando = useMemo(() => (itens ?? []).filter(comOutros), [itens]);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const f = FILTROS.find((x) => x.k === filtro);
    return meus
      .filter((v) => !f || f.teste(v))
      .filter((v) => !q || semAcento([v.nome_cliente, v.plus_code_cliente, v.predio_ftta, v.usuario, v.telefone_cliente].filter(Boolean).join(" ")).includes(q));
  }, [meus, filtro, busca]);

  if (!pode || !auditor) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito.</div>;

  const chip = (on: boolean, urgente = false) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? (urgente ? "bg-red-600 text-white" : "bg-indigo-600 text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
          <Radio className="h-3.5 w-3.5 text-green-600" /> {itens ? `${meus.length} pedido(s) com você` : "Carregando…"} · atualiza sozinho
        </p>
      </div>

      {aviso && (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800" role="status">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso("")} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}
      {erro && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</p>}

      <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, plus code, prédio, atendente ou telefone…"
            className="w-full rounded-lg border py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFiltro("todos")} className={chip(filtro === "todos")}>Todos ({meus.length})</button>
          {FILTROS.map((f) => {
            const n = meus.filter(f.teste).length;
            if (!n) return null;
            return <button key={f.k} type="button" onClick={() => setFiltro(filtro === f.k ? "todos" : f.k)} className={chip(filtro === f.k, f.k === "urgentes")}>{f.rotulo} ({n})</button>;
          })}
        </div>
      </div>

      {itens === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : meus.length === 0 ? (
        <div className="rounded-xl border bg-white py-20 text-center text-gray-400">Nenhum pedido com você. Pegue o próximo na fila.</div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-gray-400">Nenhum pedido com esses filtros.</div>
      ) : (
        <div className="space-y-4">
          {lista.map((v) => (
            <CartaoAuditoria key={`${v.id}|${v.tipo_instalacao}|${v.nome_cliente ?? ""}`} v={v} auditor={auditor} tecnicos={tecnicos} erroTecnicos={erroTecnicos} agora={agora} onFeito={setAviso} />
          ))}
        </div>
      )}

      {acompanhando.length > 0 && (
        <Acompanhando itens={acompanhando} auditor={auditor} tecnicos={tecnicos} erroTecnicos={erroTecnicos} agora={agora} onFeito={setAviso} />
      )}

      <HistoricoAuditor auditor={auditor} />
    </div>
  );
}

/** Prédios que saíram da mão do auditor (atendente preenchendo o síndico ou equipe de rede), só para acompanhar */
function Acompanhando({ itens, auditor, tecnicos, erroTecnicos, agora, onFeito }: {
  itens: Viabilizacao[]; auditor: Auditor; tecnicos: Tecnicos; erroTecnicos: boolean; agora: number; onFeito: (m: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const comAtendente = itens.filter((v) => v.status_predio === "aguardando_dados").length;
  const comRede = itens.length - comAtendente;
  const situacao = (v: Viabilizacao) =>
    v.status_predio === "aguardando_dados" ? "Atendente preenchendo o síndico"
    : v.status_predio === "agendado" ? `Visita ${dataBr(v.data_visita)}${v.tecnico_responsavel ? ` · ${v.tecnico_responsavel}` : ""}`
    : "Com a equipe de rede";

  return (
    <details className="rounded-xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm">
        <span className="font-semibold text-gray-700">Acompanhando ({itens.length})</span>
        <span className="text-xs text-gray-500">
          {[comAtendente && `${comAtendente} com o atendente`, comRede && `${comRede} com a equipe de rede`].filter(Boolean).join(" · ")}
        </span>
      </summary>
      <ul className="divide-y border-t">
        {itens.map((v) => {
          const min = minutosDesde(v.status_atualizado_em ?? v.data_solicitacao, agora);
          return (
            <li key={v.id}>
              <button type="button" onClick={() => setAberto(aberto === v.id ? null : v.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-gray-50">
                <span className="min-w-0 flex-1 truncate">
                  <strong className="font-medium text-gray-800">{v.predio_ftta ?? v.nome_cliente ?? "Prédio"}</strong>
                  <span className="text-gray-500"> · {v.nome_cliente}</span>
                </span>
                <span className="hidden shrink-0 text-xs text-gray-500 sm:inline">{situacao(v)}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${corEspera(min)}`}>{tempoTexto(min)}</span>
              </button>
              {aberto === v.id && (
                <div className="px-3 pb-3">
                  <CartaoAuditoria v={v} auditor={auditor} tecnicos={tecnicos} erroTecnicos={erroTecnicos} agora={agora} onFeito={onFeito} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
