"use client";

import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Loader2, Pencil, Route as RouteIcon, Save, X } from "lucide-react";
import { corFibraPorCapacidade, fibrasPorTubo } from "@/lib/rotaOptica";
import {
  capacidadeSugerida,
  CAPACIDADES_CADASTRO,
  salvarCabo,
  STATUS_FIBRA_LABEL,
  type CaboRede,
  type StatusFibra,
  type UsoFibra,
} from "@/lib/cabosRede";
import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";
import { codigoDoCabo } from "@/lib/cabosRede";
import EtiquetaCabo from "./EtiquetaCabo";
import TrocaFibra from "./TrocaFibra";
import type { RotaOptica } from "@/lib/rotaOptica";

interface Props {
  chave: string;
  nome: string;
  cabo?: CaboRede;
  /** Fibras usadas pelas rotas salvas (automático) */
  uso: Map<number, UsoFibra[]>;
  /** Fibra do trecho clicado, destacada */
  fibraDestaque?: number;
  /** Tipos de cabo do cadastro de equipamentos */
  tipos: ItemCatalogo[];
  usuario: string;
  onSalva: (c: CaboRede) => void;
  onFechar: () => void;
  onAbrirRota: (id: string) => void;
  /** Dentro de uma janela: sem barra de título própria */
  semMoldura?: boolean;
  /** Fibra clicada: a árvore mostra o caminho dela */
  onFibra?: (n: number) => void;
  /** Todas as rotas montadas: liga o "Trocar fibra" (várias rotas de uma vez) */
  rotas?: RotaOptica[];
  /** As rotas foram gravadas (recarregar) */
  onRotasMudaram?: () => void;
  /** Só mostra (o cabo se edita no mapa da rota) */
  soLeitura?: boolean;
  onEditarNoMapa?: () => void;
  /** Antes de começar uma troca de fibra (o editor avisa que o não salvo se perde) */
  antesDeTrocar?: () => boolean | Promise<boolean>;
}



/** Quadro do cabo: o que vai em cada fibra, com link para as rotas que usam cada uma. */
export default function QuadroCabo({ chave, nome, cabo, uso, fibraDestaque, tipos, usuario, onSalva, onFechar, onAbrirRota, semMoldura, onFibra, rotas, onRotasMudaram, soLeitura, onEditarNoMapa, antesDeTrocar }: Props) {
  /** Fibra escolhida (clique): destacada aqui */
  const [fibraSel, setFibraSel] = useState<number | undefined>(fibraDestaque);
  /** Fibras com as sub-rotas abertas (por padrão ficam recolhidas embaixo da rota tronco) */
  const [subAbertas, setSubAbertas] = useState<Set<number>>(new Set());
  /** Fibra sendo trocada (painel "Trocar fibra") e o resumo da última troca */
  const [trocando, setTrocando] = useState<number | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const maiorUsada = Math.max(0, ...uso.keys(), ...(cabo?.fibras.map((f) => f.numero) ?? []), fibraDestaque ?? 0);
  const capInicial = cabo?.capacidade ?? capacidadeSugerida(Math.max(1, maiorUsada));
  const [editando, setEditando] = useState(false);
  const [capacidade, setCapacidade] = useState(capInicial);
  const [tipoId, setTipoId] = useState(cabo?.tipo_id ?? "");
  const [obs, setObs] = useState(cabo?.obs ?? "");
  const [soOcupadas, setSoOcupadas] = useState(capInicial > 24);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const destaqueRef = useRef<HTMLLIElement>(null);
  const tuboRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    destaqueRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const cap = editando ? capacidade : cabo?.capacidade ?? capInicial;
  const tipo = tipos.find((t) => t.id === (editando ? tipoId : cabo?.tipo_id));
  const fibras = Array.from({ length: Math.max(cap, maiorUsada) }, (_, i) => i + 1);
  const porTubo = tipo?.fibras_por_tubo ?? fibrasPorTubo(cap);

  function escolherTipo(id: string) {
    setTipoId(id);
    const t = tipos.find((x) => x.id === id);
    if (t?.capacidade) setCapacidade(t.capacidade);
  }

  /** Em uso ou livre: sempre pelas rotas (o que vai em cada fibra se define nas rotas e nas caixas) */
  function statusDe(n: number): StatusFibra {
    if ((uso.get(n)?.length ?? 0) > 0) return "uso";
    const an = cabo?.fibras.find((f) => f.numero === n)?.status;
    return an === "rompida" || an === "reservada" ? an : "livre";
  }

  const contagem = fibras.reduce(
    (acc, n) => { acc[statusDe(n)]++; return acc; },
    { livre: 0, uso: 0, reservada: 0, rompida: 0 } as Record<StatusFibra, number>
  );

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const salvo = await salvarCabo({
        chave,
        nome,
        capacidade,
        tipo_id: tipoId || undefined,
        fibras: cabo?.fibras ?? [],
        obs,
        atualizado_por: usuario,
      });
      onSalva(salvo);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar o cabo.");
    } finally {
      setSalvando(false);
    }
  }

  const visivel = (n: number) => !soOcupadas || n === fibraSel || statusDe(n) !== "livre";
  const nTubos = Math.ceil(fibras.length / porTubo);
  const tubos = Array.from({ length: nTubos }, (_, t) => fibras.slice(t * porTubo, (t + 1) * porTubo));
  const nenhumaVisivel = !fibras.some(visivel);

  function irParaTubo(t: number) {
    tuboRefs.current[t]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className={semMoldura ? "" : "bg-white rounded-xl border border-gray-300 shadow-2xl overflow-hidden"}>
      {!semMoldura && (
        <div data-alca className="flex items-start justify-between gap-2 px-3 py-2 bg-indigo-900 text-white cursor-move">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate" title={nome}>{nome}</p>
            <p className="text-[11px] text-indigo-200 flex items-center gap-1">
              <GripHorizontal className="w-3 h-3" /> {tipo ? tipo.nome : "Cabo"} · {cap} fibras
            </p>
          </div>
          <button type="button" onClick={onFechar} className="text-indigo-200 hover:text-white shrink-0" aria-label="Fechar cabo">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {codigoDoCabo(nome) && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-yellow-50 px-3 py-1.5">
          <EtiquetaCabo codigo={codigoDoCabo(nome)!} grande />
          <span className="text-[11px] leading-tight text-slate-600">etiqueta do cabo em campo · vale em todas as rotas</span>
        </div>
      )}

      {/* Cabeçalho: corte do cabo + números */}
      <div className="flex gap-3 items-center p-3 bg-gradient-to-br from-slate-50 to-slate-100 border-b border-slate-200">
        <CorteCabo cap={fibras.length} porTubo={porTubo} statusDe={statusDe} destaque={fibraDestaque} onTubo={irParaTubo} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] text-slate-500 leading-tight">
            <b className="text-slate-800 text-sm">{cap} fibras</b>
            {nTubos > 1 ? ` · ${nTubos} tubos de ${porTubo}` : " · tubo único"}
            <br />
            {tipo ? tipo.nome : !cabo?.capacidade && !editando ? "capacidade estimada pelas rotas" : "sem tipo cadastrado"}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {(["uso", "livre"] as const).map((k) => (
              <span key={k} className={`flex items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${CHIP[k]}`}>
                {STATUS_FIBRA_LABEL[k]} <b className="tabular-nums">{contagem[k]}</b>
              </span>
            ))}
          </div>
          {/* barra de ocupação do cabo */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-200" aria-hidden>
            {(["uso"] as const).map((k) =>
              contagem[k] ? <span key={k} className={BARRA[k]} style={{ width: `${(contagem[k] / fibras.length) * 100}%` }} /> : null
            )}
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {editando && (
          <div className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
            <label className="block text-[11px] text-gray-500" htmlFor={`tipo-${chave}`}>Tipo de cabo (cadastro)</label>
            <select
              id={`tipo-${chave}`}
              value={tipoId}
              onChange={(e) => escolherTipo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">{tipos.length ? "Sem tipo (só capacidade)" : "Nenhum tipo cadastrado"}</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id} disabled={(t.capacidade ?? 0) < maiorUsada}>
                  {t.nome} · {resumoItem(t)}{(t.capacidade ?? 0) < maiorUsada ? " (menor que a fibra usada)" : ""}
                </option>
              ))}
            </select>
            <label className="block text-[11px] text-gray-500" htmlFor={`cap-${chave}`}>Capacidade do cabo</label>
            <select
              id={`cap-${chave}`}
              value={capacidade}
              onChange={(e) => setCapacidade(parseInt(e.target.value, 10))}
              disabled={!!tipoId}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500"
            >
              {CAPACIDADES_CADASTRO.map((c) => (
                <option key={c} value={c} disabled={c < maiorUsada}>{c} fibras{c < maiorUsada ? " (menor que a fibra usada)" : ""}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-medium" role="tablist">
          {([
            [true, "Só ocupadas"],
            [false, "Todas as fibras"],
          ] as const).map(([v, r]) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={soOcupadas === v}
              onClick={() => setSoOcupadas(v)}
              className={`flex-1 rounded-md py-1 ${soOcupadas === v ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-800"}`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="max-h-[48vh] overflow-auto space-y-2 pr-0.5">
          {tubos.map((lista, t) => {
            const corTubo = corFibraPorCapacidade(lista[0], cap, porTubo).corTubo!;
            const ocupadas = lista.filter((n) => statusDe(n) !== "livre").length;
            const mostrar = lista.filter(visivel);
            // Em "Só ocupadas", tubo sem nada ocupado fica de fora (resumido no fim)
            if (soOcupadas && mostrar.length === 0) return null;
            return (
              <section
                key={t}
                ref={(el) => { tuboRefs.current[t] = el; }}
                className="rounded-lg border border-slate-200 overflow-hidden"
                style={{ borderLeft: `6px solid ${corTubo.hex}`, boxShadow: corTubo.hex.toLowerCase() === "#ffffff" || corTubo.nome === "Branco" ? "inset 1px 0 0 #94a3b8" : undefined }}
              >
                <header className="flex items-center gap-2 px-2 py-1.5 bg-slate-50">
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" style={{ background: corTubo.hex }} />
                  <p className="text-xs font-semibold text-slate-800 flex-1 min-w-0 truncate">
                    {nTubos > 1 ? `Tubo ${t + 1}` : "Tubo único"} <span className="font-normal text-slate-500">· {corTubo.nome.toLowerCase()}</span>
                  </p>
                  <div className="flex gap-[2px]" aria-label={`${ocupadas} de ${lista.length} ocupadas`} title={`${ocupadas} de ${lista.length} ocupadas`}>
                    {lista.map((n) => (
                      <span key={n} className={`w-1.5 h-3 rounded-sm ${statusDe(n) === "livre" ? "bg-slate-200" : BARRA[statusDe(n)]}`} />
                    ))}
                  </div>
                  <span className="text-[10px] tabular-nums text-slate-500 w-7 text-right">{ocupadas}/{lista.length}</span>
                </header>
                {mostrar.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {mostrar.map((n) => {
                      const c = corFibraPorCapacidade(n, cap, porTubo);
                      const st = statusDe(n);
                      const usos = uso.get(n) ?? [];
                      const ativa = n === fibraSel;
                      return (
                        <li
                          key={n}
                          ref={n === fibraDestaque ? destaqueRef : undefined}
                          onClick={() => { setFibraSel(n); onFibra?.(n); }}
                          title="Clique para destacar esta fibra"
                          className={`cursor-pointer px-2 py-1.5 ${ativa ? "bg-amber-50 ring-2 ring-inset ring-amber-300" : "bg-white hover:bg-slate-50"}`}
                        >
                          <div className="flex items-center gap-2">
                            <Fio hex={c.hex} apagada={st === "livre"} rompida={st === "rompida"} />
                            <span className={`font-mono text-xs font-bold tabular-nums ${st === "livre" ? "text-slate-400" : "text-slate-900"}`}>
                              F{String(n).padStart(2, "0")}
                            </span>
                            <span className={`text-xs flex-1 min-w-0 truncate ${st === "livre" ? "text-slate-400" : "text-slate-700"}`}>
                              {c.nome.toLowerCase()}
                            </span>
                            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${CHIP[st]}`}>{STATUS_FIBRA_LABEL[st]}</span>
                          </div>
                          {ativa && st === "uso" && rotas && trocando !== n && !soLeitura && (
                            <button
                              type="button"
                              onClick={async (e) => { e.stopPropagation(); if (antesDeTrocar && !(await antesDeTrocar())) return; setTrocando(n); setFeito(null); }}
                              className="mt-1 ml-[46px] rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                              title="Passar esta fibra para outra em várias rotas de uma vez"
                            >
                              ⇄ Trocar fibra
                            </button>
                          )}
                          {trocando === n && rotas && (
                            <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                              <TrocaFibra
                                rotas={rotas}
                                caboChave={chave}
                                caboNome={nome}
                                cabo={cabo}
                                velha={n}
                                capacidade={cap}
                                porTubo={porTubo}
                                uso={uso}
                                usuario={usuario}
                                onCancelar={() => setTrocando(null)}
                                onFeito={(resumo, caboSalvo) => {
                                  setTrocando(null);
                                  setFeito(resumo);
                                  if (caboSalvo) onSalva(caboSalvo);
                                  onRotasMudaram?.();
                                }}
                              />
                            </div>
                          )}
                          {usos.length > 0 && (
                            <div className="mt-1 ml-[46px] space-y-0.5">
                              {[...usos.filter((u) => !u.herdado), ...(subAbertas.has(n) ? usos.filter((u) => u.herdado) : [])].map((u) => (
                                <button
                                  key={u.rotaId}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onAbrirRota(u.rotaId); }}
                                  className="flex items-start gap-1 text-left text-[11px] leading-tight text-indigo-700 hover:underline"
                                  title="Abrir esta rota"
                                >
                                  {u.herdado ? <span className="mt-px w-3 shrink-0 text-center text-slate-300">└</span> : <RouteIcon className="w-3 h-3 mt-px shrink-0" />}
                                  <span>
                                    {u.rotaNome}
                                    <span className="block text-slate-500 no-underline">{u.de.split(" - ")[0]} → {u.para.split(" - ")[0]}</span>
                                  </span>
                                </button>
                              ))}
                              {usos.some((u) => u.herdado) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setSubAbertas((x) => { const y = new Set(x); if (y.has(n)) y.delete(n); else y.add(n); return y; }); }}
                                  className="flex items-center gap-1 rounded px-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-indigo-700"
                                  aria-expanded={subAbertas.has(n)}
                                >
                                  <span className={`inline-block transition-transform ${subAbertas.has(n) ? "rotate-90" : ""}`}>▸</span>
                                  {subAbertas.has(n) ? "esconder sub-rotas" : `${usos.filter((u) => u.herdado).length} sub-rota${usos.filter((u) => u.herdado).length !== 1 ? "s" : ""} seguem nesta fibra`}
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          {nenhumaVisivel && <p className="py-3 text-center text-xs text-gray-400">Nenhuma fibra ocupada neste cabo.</p>}
          {feito && (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-900">
              ✓ {feito}
              <button type="button" onClick={() => setFeito(null)} className="ml-1 text-emerald-700 underline">ok</button>
            </p>
          )}
          {soOcupadas && nTubos > 1 && (() => {
            const vazios = tubos.filter((l) => !l.some(visivel)).length;
            return vazios > 0 ? (
              <button type="button" onClick={() => setSoOcupadas(false)} className="w-full text-[11px] text-slate-500 hover:text-slate-800 py-1">
                + {vazios} tubo{vazios > 1 ? "s" : ""} sem fibra ocupada · ver todas
              </button>
            ) : null;
          })()}
        </div>

        {editando ? (
          <>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação do cabo"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs"
            />
            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1"
              >
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar cabo
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-400 truncate">
              {cabo?.obs ? cabo.obs : cabo?.atualizado_por ? `Por ${cabo.atualizado_por}` : "Uso automático pelas rotas salvas"}
            </p>
            {soLeitura ? (
              <button
                type="button"
                onClick={onEditarNoMapa}
                disabled={!onEditarNoMapa}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shrink-0 disabled:opacity-40"
                title="Tipo, capacidade, observação e troca de fibra: no mapa da rota (botão Cabo)"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar no mapa
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-gray-300 hover:bg-gray-50 shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const CHIP: Record<StatusFibra, string> = {
  livre: "bg-slate-100 text-slate-500",
  uso: "bg-emerald-100 text-emerald-800",
  reservada: "bg-amber-100 text-amber-800",
  rompida: "bg-red-100 text-red-700",
};

const BARRA: Record<StatusFibra, string> = {
  livre: "bg-slate-200",
  uso: "bg-emerald-500",
  reservada: "bg-amber-400",
  rompida: "bg-red-500",
};

/** Fibra desenhada como um fio (com brilho); apagada quando livre, cortada quando rompida. */
function Fio({ hex, apagada, rompida }: { hex: string; apagada: boolean; rompida: boolean }) {
  return (
    <svg width="38" height="12" viewBox="0 0 38 12" className="shrink-0" aria-hidden style={{ opacity: apagada ? 0.45 : 1 }}>
      {rompida ? (
        <>
          <rect x="1" y="3" width="15" height="6" rx="3" fill={hex} stroke="#0f172a" strokeWidth="1" />
          <rect x="22" y="3" width="15" height="6" rx="3" fill={hex} stroke="#0f172a" strokeWidth="1" />
          <path d="M17 2l4 8M21 2l-4 8" stroke="#dc2626" strokeWidth="1.6" />
        </>
      ) : (
        <>
          <rect x="1" y="3" width="36" height="6" rx="3" fill={hex} stroke="#0f172a" strokeWidth="1" />
          <rect x="4" y="4.2" width="22" height="1.3" rx=".65" fill="#fff" opacity=".55" />
        </>
      )}
    </svg>
  );
}

/** Corte transversal do cabo: capa, tubos coloridos e as fibras dentro (acesas se ocupadas). */
function CorteCabo({
  cap, porTubo, statusDe, destaque, onTubo,
}: {
  cap: number;
  porTubo: number;
  statusDe: (n: number) => StatusFibra;
  destaque?: number;
  onTubo: (t: number) => void;
}) {
  const nT = Math.max(1, Math.ceil(cap / porTubo));
  const C = 60;
  const interno = 52;
  const s = Math.sin(Math.PI / nT);
  const rTubo = nT === 1 ? 38 : Math.min(24, ((interno - 3) * s) / (1 + s));
  const anel = nT === 1 ? 0 : interno - 2 - rTubo;
  return (
    <svg width="112" height="112" viewBox="0 0 120 120" className="shrink-0 drop-shadow" role="img" aria-label={`Corte do cabo: ${nT} tubo(s)`}>
      <circle cx={C} cy={C} r={58} fill="#0f172a" />
      <circle cx={C} cy={C} r={58} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={C} cy={C} r={interno} fill="#1e293b" />
      {nT > 2 && <circle cx={C} cy={C} r={Math.max(4, anel - rTubo - 2)} fill="#64748b" stroke="#94a3b8" />}
      {Array.from({ length: nT }, (_, t) => {
        const ang = (t / nT) * Math.PI * 2 - Math.PI / 2;
        const tx = C + anel * Math.cos(ang);
        const ty = C + anel * Math.sin(ang);
        const corTubo = corFibraPorCapacidade(t * porTubo + 1, cap, porTubo).corTubo!;
        const nF = Math.min(porTubo, cap - t * porTubo);
        const rF = Math.max(1.3, Math.min(rTubo * 0.24, (rTubo * 0.85 * Math.PI) / Math.max(nF, 1) / 1.15));
        const anelF = nF === 1 ? 0 : rTubo - rF - 2.2;
        return (
          <g key={t} className="cursor-pointer" onClick={() => onTubo(t)}>
            <title>{`Tubo ${t + 1} (${corTubo.nome.toLowerCase()})`}</title>
            <circle cx={tx} cy={ty} r={rTubo} fill={corTubo.hex} stroke="#0f172a" strokeWidth="1" />
            <circle cx={tx} cy={ty} r={rTubo - 1.6} fill="#f8fafc" opacity=".22" />
            {Array.from({ length: nF }, (_, k) => {
              const n = t * porTubo + k + 1;
              const a = (k / nF) * Math.PI * 2 - Math.PI / 2;
              const fx = tx + anelF * Math.cos(a);
              const fy = ty + anelF * Math.sin(a);
              const c = corFibraPorCapacidade(n, cap, porTubo);
              const st = statusDe(n);
              return (
                <g key={n}>
                  {n === destaque && <circle cx={fx} cy={fy} r={rF + 2.2} fill="#facc15" />}
                  <circle cx={fx} cy={fy} r={rF} fill={c.hex} stroke={st === "livre" ? "#475569" : "#0f172a"} strokeWidth={st === "livre" ? 0.5 : 0.9} opacity={st === "livre" ? 0.4 : 1} />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
