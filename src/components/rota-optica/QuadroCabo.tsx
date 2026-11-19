"use client";

import { useEffect, useRef, useState } from "react";
import { GripHorizontal, Loader2, Pencil, Save, X } from "lucide-react";
import { corFibraPorCapacidade, fibrasPorTubo } from "@/lib/rotaOptica";
import {
  capacidadeSugerida,
  CAPACIDADES,
  salvarCabo,
  STATUS_FIBRA_LABEL,
  type CaboRede,
  type FibraCabo,
  type StatusFibra,
  type UsoFibra,
} from "@/lib/cabosRede";
import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";

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
}

const COR_STATUS: Record<StatusFibra, string> = {
  livre: "text-gray-400",
  uso: "text-gray-900",
  reservada: "text-amber-700",
  rompida: "text-red-700",
};


/** Quadro do cabo: o que vai em cada fibra, com link para as rotas que usam cada uma. */
export default function QuadroCabo({ chave, nome, cabo, uso, fibraDestaque, tipos, usuario, onSalva, onFechar, onAbrirRota }: Props) {
  const maiorUsada = Math.max(0, ...uso.keys(), ...(cabo?.fibras.map((f) => f.numero) ?? []), fibraDestaque ?? 0);
  const capInicial = cabo?.capacidade ?? capacidadeSugerida(Math.max(1, maiorUsada));
  const [editando, setEditando] = useState(false);
  const [capacidade, setCapacidade] = useState(capInicial);
  const [tipoId, setTipoId] = useState(cabo?.tipo_id ?? "");
  const [manuais, setManuais] = useState<Record<number, FibraCabo>>(
    Object.fromEntries((cabo?.fibras ?? []).map((f) => [f.numero, f]))
  );
  const [obs, setObs] = useState(cabo?.obs ?? "");
  const [soOcupadas, setSoOcupadas] = useState(capInicial > 24);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const destaqueRef = useRef<HTMLLIElement>(null);

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

  function statusDe(n: number): StatusFibra {
    const m = (editando ? manuais : Object.fromEntries((cabo?.fibras ?? []).map((f) => [f.numero, f])))[n];
    if (m && m.status !== "livre") return m.status;
    return (uso.get(n)?.length ?? 0) > 0 ? "uso" : "livre";
  }
  function descricaoDe(n: number): string | undefined {
    return editando ? manuais[n]?.descricao : cabo?.fibras.find((f) => f.numero === n)?.descricao;
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
        fibras: Object.values(manuais),
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

  const visiveis = fibras.filter((n) => !soOcupadas || n === fibraDestaque || statusDe(n) !== "livre" || descricaoDe(n));

  return (
    <div className="bg-white rounded-xl border border-gray-300 shadow-2xl overflow-hidden">
      <div data-alca className="flex items-start justify-between gap-2 px-3 py-2 bg-indigo-900 text-white cursor-move">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate" title={nome}>{nome}</p>
          <p className="text-[11px] text-indigo-200 flex items-center gap-1">
            <GripHorizontal className="w-3 h-3" /> {tipo ? tipo.nome : "Cabo"} · {cap} fibras{!cabo?.capacidade && !editando ? " (estimado)" : ""}
          </p>
        </div>
        <button type="button" onClick={onFechar} className="text-indigo-200 hover:text-white shrink-0" aria-label="Fechar cabo">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span><b>{contagem.uso}</b> em uso</span>
          <span className="text-amber-700"><b>{contagem.reservada}</b> reservadas</span>
          <span className="text-red-700"><b>{contagem.rompida}</b> rompidas</span>
          <span className="text-gray-500"><b>{contagem.livre}</b> livres</span>
        </div>

        {editando && (
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`tipo-${chave}`}>Tipo de cabo (cadastro)</label>
            <select
              id={`tipo-${chave}`}
              value={tipoId}
              onChange={(e) => escolherTipo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white mb-1.5"
            >
              <option value="">{tipos.length ? "Sem tipo (só capacidade)" : "Nenhum tipo cadastrado"}</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id} disabled={(t.capacidade ?? 0) < maiorUsada}>
                  {t.nome} · {resumoItem(t)}{(t.capacidade ?? 0) < maiorUsada ? " (menor que a fibra usada)" : ""}
                </option>
              ))}
            </select>
            <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`cap-${chave}`}>Capacidade do cabo</label>
            <select
              id={`cap-${chave}`}
              value={capacidade}
              onChange={(e) => setCapacidade(parseInt(e.target.value, 10))}
              disabled={!!tipoId}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500"
            >
              {CAPACIDADES.map((c) => (
                <option key={c} value={c} disabled={c < maiorUsada}>{c} fibras{c < maiorUsada ? " (menor que a fibra usada)" : ""}</option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <input type="checkbox" checked={soOcupadas} onChange={(e) => setSoOcupadas(e.target.checked)} />
          Mostrar só fibras ocupadas
        </label>

        <ul className="max-h-[45vh] overflow-auto divide-y divide-gray-100 border-y border-gray-100">
          {visiveis.map((n, idx) => {
            const c = corFibraPorCapacidade(n, cap, porTubo);
            const st = statusDe(n);
            const usos = uso.get(n) ?? [];
            const novoTubo = idx === 0 || Math.ceil(visiveis[idx - 1] / porTubo) !== Math.ceil(n / porTubo);
            const corTubo = c.corTubo!;
            return (
              <li
                key={n}
                ref={n === fibraDestaque ? destaqueRef : undefined}
                className={`py-1.5 px-1 ${n === fibraDestaque ? "bg-yellow-50 ring-1 ring-yellow-300 rounded" : ""}`}
              >
                {novoTubo && (
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full border border-gray-800" style={{ background: corTubo.hex }} />
                    Tubo {c.tubo} ({corTubo.nome.toLowerCase()}){cap > porTubo ? ` · ${porTubo} fibras` : ""}
                  </p>
                )}
                <div className="flex items-start gap-2">
                  <span className="inline-block w-4 h-4 mt-0.5 rounded-full border border-gray-800 shrink-0" style={{ background: c.hex }} title={c.nome} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${COR_STATUS[st]}`}>
                      <b>F{String(n).padStart(2, "0")}</b> {c.nome.toLowerCase()} · {c.rotulo} · {STATUS_FIBRA_LABEL[st]}
                      {!editando && descricaoDe(n) ? ` · ${descricaoDe(n)}` : ""}
                    </p>
                    {usos.map((u) => (
                      <button
                        key={u.rotaId}
                        type="button"
                        onClick={() => onAbrirRota(u.rotaId)}
                        className="block text-left text-[11px] text-indigo-600 hover:underline leading-tight"
                        title="Abrir esta rota"
                      >
                        ↳ {u.rotaNome} <span className="text-gray-500">({u.de.split(" - ")[0]} → {u.para.split(" - ")[0]})</span>
                      </button>
                    ))}
                    {editando && (
                      <div className="flex gap-1 mt-1">
                        <select
                          value={manuais[n]?.status ?? "livre"}
                          onChange={(e) => setManuais((m) => ({ ...m, [n]: { numero: n, status: e.target.value as StatusFibra, descricao: m[n]?.descricao } }))}
                          className="border border-gray-300 rounded px-1 py-0.5 text-[11px] bg-white"
                          aria-label={`Status da fibra ${n}`}
                        >
                          <option value="livre">{usos.length ? "Pelas rotas" : "Livre"}</option>
                          <option value="uso">Em uso</option>
                          <option value="reservada">Reservada</option>
                          <option value="rompida">Rompida</option>
                        </select>
                        <input
                          value={manuais[n]?.descricao ?? ""}
                          onChange={(e) => setManuais((m) => ({ ...m, [n]: { numero: n, status: m[n]?.status ?? "livre", descricao: e.target.value } }))}
                          placeholder="O que vai nesta fibra"
                          className="flex-1 min-w-0 border border-gray-300 rounded px-1.5 py-0.5 text-[11px]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {visiveis.length === 0 && <li className="py-3 text-center text-xs text-gray-400">Nenhuma fibra ocupada.</li>}
        </ul>

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
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50 shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
