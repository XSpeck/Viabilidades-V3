"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, ChevronDown, ClipboardList, Flame, Loader2, PlayCircle, Radio } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ouvirEmAnalise, ouvirFila, pegarViabilizacao } from "@/lib/firestore";
import { canAccess } from "@/lib/access";
import type { TipoInstalacao, Viabilizacao } from "@/types";
import CardFila, { corEspera, minutosDesde, tempoTexto } from "@/components/viabilidades/CardFila";

const TITULO = "Fila de viabilizações";
const CHAVE_SOM = "fila_som";

/** Bipe curto (sem arquivo de áudio); urgente toca duas vezes */
function bipe(urgente: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tocar = (inicio: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + inicio + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + inicio);
      o.stop(ctx.currentTime + inicio + 0.3);
    };
    tocar(0, urgente ? 988 : 784);
    if (urgente) tocar(0.35, 988);
    setTimeout(() => ctx.close(), 1000);
  } catch { /* navegador sem áudio */ }
}

const TIPOS: { valor: "todos" | TipoInstalacao; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "FTTH", rotulo: "Casa" },
  { valor: "Prédio", rotulo: "Prédio" },
  { valor: "Condomínio", rotulo: "Condomínio" },
];

export default function ViabilidadesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [fila, setFila] = useState<Viabilizacao[] | null>(null);
  const [emAnalise, setEmAnalise] = useState<Viabilizacao[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pegando, setPegando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"todos" | TipoInstalacao>("todos");
  const [agora, setAgora] = useState(() => Date.now());
  const [som, setSom] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(CHAVE_SOM) === "1"; } catch { return false; }
  });
  const conhecidos = useRef<Set<string> | null>(null);
  const somRef = useRef(som);
  useEffect(() => { somRef.current = som; }, [som]);

  const pode = canAccess(user ?? null, "viabilidades");

  // Fila e "em análise" ao vivo
  useEffect(() => {
    if (!pode) return;
    const pararFila = ouvirFila((lista) => {
      // pedido novo (depois da primeira carga) → bipe, se ligado
      if (conhecidos.current) {
        const novos = lista.filter((v) => !conhecidos.current!.has(v.id));
        if (novos.length && somRef.current) bipe(novos.some((v) => v.urgente));
      }
      conhecidos.current = new Set(lista.map((v) => v.id));
      setFila(lista);
      setErro("");
    }, (e) => setErro(`Não foi possível ouvir a fila: ${e.message}`));
    const pararAnalise = ouvirEmAnalise(setEmAnalise, () => {});
    return () => { pararFila(); pararAnalise(); };
  }, [pode]);

  // Relógio para o tempo de espera (a cada 30 s)
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Quantidade no título da aba
  useEffect(() => {
    const n = fila?.length ?? 0;
    document.title = n ? `(${n}) ${TITULO}` : TITULO;
    return () => { document.title = "Validador de Projetos"; };
  }, [fila]);

  const visiveis = useMemo(() => (fila ?? []).filter((v) => tipo === "todos" || v.tipo_instalacao === tipo), [fila, tipo]);

  if (!pode) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito a auditores.</div>;

  const urgentes = visiveis.filter((v) => v.urgente);
  const normais = visiveis.filter((v) => !v.urgente);
  const atrasados = (fila ?? []).filter((v) => minutosDesde(v.data_solicitacao, agora) >= 120).length;

  async function pegar(id: string) {
    if (!user || pegando) return;
    setPegando(id);
    setAviso("");
    try {
      await pegarViabilizacao(id, user.nome);
      router.push("/auditoria");
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível pegar este pedido.");
      setPegando(null);
    }
  }

  function alternarSom() {
    const novo = !som;
    setSom(novo);
    try { window.localStorage.setItem(CHAVE_SOM, novo ? "1" : "0"); } catch {}
    if (novo) bipe(false);
  }

  const contTipo = (t: "todos" | TipoInstalacao) => (fila ?? []).filter((v) => t === "todos" || v.tipo_instalacao === t).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="rounded-xl border bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fila de viabilizações</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
              <Radio className="h-3.5 w-3.5 text-green-600" /> Ao vivo: pedidos aparecem e somem na hora
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">{fila?.length ?? "–"}</p>
              <p className="text-xs text-gray-400">na fila</p>
            </div>
            {(fila ?? []).some((v) => v.urgente) && (
              <div className="text-right">
                <p className="text-3xl font-bold text-red-600">{(fila ?? []).filter((v) => v.urgente).length}</p>
                <p className="text-xs text-red-400">urgente(s)</p>
              </div>
            )}
            {atrasados > 0 && (
              <div className="text-right">
                <p className="text-3xl font-bold text-amber-600">{atrasados}</p>
                <p className="text-xs text-amber-600">há +2 h</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => visiveis[0] && pegar(visiveis[0].id)}
            disabled={!visiveis.length || !!pegando}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
            title="Pega o primeiro da fila: urgentes primeiro, depois o mais antigo"
          >
            {pegando && pegando === visiveis[0]?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Pegar o próximo
          </button>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <button key={t.valor} type="button" onClick={() => setTipo(t.valor)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${tipo === t.valor ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t.rotulo} ({contTipo(t.valor)})
              </button>
            ))}
          </div>
          <button type="button" onClick={alternarSom} className={`ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${som ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50"}`}
            title="Tocar um bipe quando chegar pedido (dois bipes se for urgente)">
            {som ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />} Som {som ? "ligado" : "desligado"}
          </button>
        </div>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso("")} className="text-xs text-amber-700 underline">ok</button>
        </div>
      )}
      {erro && <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</p>}

      {/* Lista */}
      {fila === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border bg-white py-20 text-center">
          <ClipboardList className="mx-auto mb-3 h-14 w-14 text-gray-200" />
          <p className="text-lg font-medium text-gray-400">{fila.length ? "Nenhum pedido deste tipo" : "Nenhuma solicitação na fila"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {urgentes.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-red-600">
                <Flame className="h-4 w-4" /> Urgente: cliente presencial <span className="h-px flex-1 bg-red-200" />
              </h2>
              {urgentes.map((v, i) => <CardFila key={v.id} v={v} posicao={i + 1} agora={agora} pegando={pegando} onPegar={pegar} />)}
            </section>
          )}
          {normais.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-gray-500">
                Normal <span className="h-px flex-1 bg-gray-200" />
              </h2>
              {normais.map((v, i) => <CardFila key={v.id} v={v} posicao={urgentes.length + i + 1} agora={agora} pegando={pegando} onPegar={pegar} />)}
            </section>
          )}
        </div>
      )}

      {/* Quem está analisando o quê */}
      {emAnalise.length > 0 && (
        <details className="rounded-xl border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700">
            <span>Em análise agora ({emAnalise.length})</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </summary>
          <ul className="divide-y border-t">
            {emAnalise.map((v) => {
              const min = minutosDesde(v.status_atualizado_em ?? v.data_solicitacao, agora);
              return (
                <li key={v.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="w-28 shrink-0 truncate font-medium text-gray-800">{v.auditor_responsavel}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-600">{v.nome_cliente ?? "Cliente"} · {v.tipo_instalacao === "FTTH" ? "Casa" : v.tipo_instalacao}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${corEspera(min)}`}>{tempoTexto(min)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
