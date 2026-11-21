"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2, Radio, Search, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ouvirAuditoria } from "@/lib/firestore";
import { listTecnicos } from "@/lib/users";
import { canAccess, getCargo } from "@/lib/access";
import { semAcento } from "@/lib/localizacao";
import type { Viabilizacao } from "@/types";
import CartaoAuditoria from "@/components/auditoria/CartaoAuditoria";
import HistoricoAuditor from "@/components/auditoria/HistoricoAuditor";
import type { Auditor, Tecnicos } from "@/components/auditoria/tipos";

type Filtro = "todos" | "urgentes" | "casa" | "predios" | "aguardando" | "agendar" | "contestado";

const FILTROS: { k: Filtro; rotulo: string; teste: (v: Viabilizacao) => boolean }[] = [
  { k: "urgentes", rotulo: "Urgentes", teste: (v) => !!v.urgente },
  { k: "casa", rotulo: "Casa", teste: (v) => v.tipo_instalacao === "FTTH" && !v.urgente },
  { k: "predios", rotulo: "Prédio/Cond.", teste: (v) => v.tipo_instalacao !== "FTTH" && !v.urgente && !v.status_predio },
  { k: "aguardando", rotulo: "Aguardando dados", teste: (v) => v.status_predio === "aguardando_dados" },
  { k: "agendar", rotulo: "Agendar visita", teste: (v) => ["pronto_auditoria", "proposta_visita"].includes(v.status_predio ?? "") },
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

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const f = FILTROS.find((x) => x.k === filtro);
    return (itens ?? [])
      .filter((v) => !f || f.teste(v))
      .filter((v) => !q || semAcento([v.nome_cliente, v.plus_code_cliente, v.predio_ftta, v.usuario, v.telefone_cliente].filter(Boolean).join(" ")).includes(q));
  }, [itens, filtro, busca]);

  if (!pode || !auditor) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito.</div>;

  const chip = (on: boolean, urgente = false) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? (urgente ? "bg-red-600 text-white" : "bg-indigo-600 text-white") : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
          <Radio className="h-3.5 w-3.5 text-green-600" /> {itens ? `${itens.length} pedido(s) com você` : "Carregando…"} · atualiza sozinho
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
          <button type="button" onClick={() => setFiltro("todos")} className={chip(filtro === "todos")}>Todos ({itens?.length ?? 0})</button>
          {FILTROS.map((f) => {
            const n = (itens ?? []).filter(f.teste).length;
            if (!n) return null;
            return <button key={f.k} type="button" onClick={() => setFiltro(filtro === f.k ? "todos" : f.k)} className={chip(filtro === f.k, f.k === "urgentes")}>{f.rotulo} ({n})</button>;
          })}
        </div>
      </div>

      {itens === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : itens.length === 0 ? (
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

      <HistoricoAuditor auditor={auditor} />
    </div>
  );
}
