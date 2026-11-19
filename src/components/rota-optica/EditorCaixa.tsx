"use client";

import { useState } from "react";
import { GripHorizontal, Loader2, Pencil, Save, X } from "lucide-react";
import {
  portasPara,
  salvarCaixa,
  SPLITTERS,
  STATUS_PORTA_LABEL,
  type CaixaRede,
  type PortaCaixa,
  type StatusPorta,
} from "@/lib/caixasRede";
import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";
import { corFibra, TIPO_ELEMENTO_LABEL, type TipoElementoRota } from "@/lib/rotaOptica";

interface Props {
  chave: string;
  nome: string;
  tipo: TipoElementoRota;
  caixa?: CaixaRede;
  /** Splitter informado na rota (sugestão quando a caixa ainda não foi cadastrada) */
  splitterRota?: string;
  caboEntrada?: string;
  fibraEntrada?: number;
  /** Nomes dos ramos de rota que saem desta caixa na árvore */
  ramos: string[];
  /** Modelos de splitter do cadastro de equipamentos */
  modelos: ItemCatalogo[];
  usuario: string;
  onSalva: (c: CaixaRede) => void;
  onFechar: () => void;
}

const COR_STATUS: Record<StatusPorta, string> = {
  livre: "bg-white border-gray-300 text-gray-500",
  cliente: "bg-gray-900 border-gray-900 text-white",
  ramal: "bg-indigo-100 border-indigo-400 text-indigo-800",
};

const PROXIMO: Record<StatusPorta, StatusPorta> = { livre: "cliente", cliente: "ramal", ramal: "livre" };

function curto(t: string, n: number) {
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Desenho interno da caixa: fibra de entrada → splitter → portas. */
function DesenhoSplitter({ splitter, portas, fibraEntrada, caboEntrada }: {
  splitter: string;
  portas: PortaCaixa[];
  fibraEntrada?: number;
  caboEntrada?: string;
}) {
  const LIN = 24;
  const H = Math.max(70, portas.length * LIN + 16);
  const meio = H / 2;
  const cor = corFibra(fibraEntrada, caboEntrada);
  const xSpl = 92;
  const xPorta = 150;
  return (
    <svg viewBox={`0 0 296 ${H}`} width="100%" height={H} role="img" aria-label={`Splitter ${splitter} com ${portas.length} portas`}>
      {/* Fibra de entrada */}
      <line x1={4} y1={meio} x2={xSpl - 18} y2={meio} stroke="#111827" strokeWidth={6.5} />
      <line x1={4} y1={meio} x2={xSpl - 18} y2={meio} stroke={cor.hex} strokeWidth={3.5} />
      <text x={6} y={meio - 9} fontSize={9} fill="#6b7280">
        {fibraEntrada ? `F${String(fibraEntrada).padStart(2, "0")} ${cor.nome.toLowerCase()}` : "entrada"}
      </text>
      {caboEntrada && (
        <text x={6} y={meio + 16} fontSize={8} fill="#9ca3af">
          {curto(caboEntrada, 16)}
        </text>
      )}
      {/* Saídas */}
      {portas.map((p, i) => {
        const yy = 8 + LIN / 2 + i * LIN;
        const livre = p.status === "livre";
        return (
          <g key={p.numero}>
            <path
              d={`M${xSpl + 14} ${meio} C ${xSpl + 34} ${meio}, ${xSpl + 30} ${yy}, ${xPorta - 10} ${yy}`}
              fill="none"
              stroke={livre ? "#9ca3af" : p.status === "ramal" ? "#4f46e5" : "#111827"}
              strokeWidth={livre ? 1.5 : 2}
              strokeDasharray={livre ? "4 3" : undefined}
            />
            <rect
              x={xPorta - 10}
              y={yy - 8}
              width={20}
              height={16}
              rx={3}
              fill={p.status === "cliente" ? "#111827" : p.status === "ramal" ? "#e0e7ff" : "#fff"}
              stroke={p.status === "ramal" ? "#818cf8" : livre ? "#d1d5db" : "#111827"}
            />
            <text x={xPorta} y={yy + 3.5} fontSize={9} textAnchor="middle" fontWeight={700}
              fill={p.status === "cliente" ? "#fff" : p.status === "ramal" ? "#3730a3" : "#6b7280"}>
              {p.numero}
            </text>
            <text x={xPorta + 16} y={yy + 3.5} fontSize={10} fill={livre ? "#9ca3af" : "#111827"}>
              <title>{p.descricao ?? STATUS_PORTA_LABEL[p.status]}</title>
              {livre ? "livre" : curto(p.descricao || (p.status === "cliente" ? "cliente" : "ramal"), 22)}
            </text>
          </g>
        );
      })}
      {/* Splitter */}
      <path d={`M${xSpl - 18} ${meio - 16} L${xSpl + 14} ${meio - 26} L${xSpl + 14} ${meio + 26} L${xSpl - 18} ${meio + 16} Z`}
        fill="#111827" />
      <text x={xSpl - 2} y={meio + 4} fontSize={11} textAnchor="middle" fill="#fff" fontWeight={700}>{splitter}</text>
    </svg>
  );
}

/** Quadro da caixa, aberto em cima do elemento na árvore: desenho do splitter e cadastro das portas. */
export default function EditorCaixa({
  chave, nome, tipo, caixa, splitterRota, caboEntrada, fibraEntrada, ramos, modelos, usuario, onSalva, onFechar,
}: Props) {
  const [editando, setEditando] = useState(!caixa);
  const [splitter, setSplitter] = useState(caixa?.splitter ?? splitterRota ?? "");
  const [portas, setPortas] = useState<PortaCaixa[]>(portasPara(caixa?.splitter ?? splitterRota, caixa?.portas));
  const [obs, setObs] = useState(caixa?.obs ?? "");
  const [modeloId, setModeloId] = useState(caixa?.splitter_modelo ?? "");
  const modeloSalvo = modelos.find((m) => m.id === caixa?.splitter_modelo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function trocarSplitter(valor: string) {
    // "m:<id>" = modelo do cadastro; senão relação genérica
    const m = valor.startsWith("m:") ? modelos.find((x) => x.id === valor.slice(2)) : undefined;
    const v = m ? m.relacao ?? "" : valor;
    setModeloId(m?.id ?? "");
    setSplitter(v);
    setPortas((atuais) => portasPara(v || undefined, atuais));
  }

  function alterarPorta(numero: number, mudanca: Partial<PortaCaixa>) {
    setPortas((ps) => ps.map((p) => (p.numero === numero ? { ...p, ...mudanca } : p)));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const salva = await salvarCaixa({ chave, nome, splitter: splitter || undefined, splitter_modelo: modeloId || undefined, portas, obs, atualizado_por: usuario });
      onSalva(salva);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a caixa.");
    } finally {
      setSalvando(false);
    }
  }

  const ramaisMarcados = portas.filter((p) => p.status === "ramal").length;
  const vistas = portasPara(caixa?.splitter, caixa?.portas);

  return (
    <div className="bg-white rounded-xl border border-gray-300 shadow-2xl overflow-hidden">
      <div data-alca className="flex items-start justify-between gap-2 px-3 py-2 bg-gray-900 text-white cursor-move">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate" title={nome}>{nome}</p>
          <p className="text-[11px] text-gray-300 flex items-center gap-1">
            <GripHorizontal className="w-3 h-3" /> {TIPO_ELEMENTO_LABEL[tipo]} · diagrama da caixa
          </p>
        </div>
        <button type="button" onClick={onFechar} className="text-gray-300 hover:text-white shrink-0" aria-label="Fechar diagrama">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!editando ? (
        <div className="p-3 space-y-2 max-h-[60vh] overflow-auto">
          {caixa?.splitter ? (
            <DesenhoSplitter splitter={caixa.splitter} portas={vistas} fibraEntrada={fibraEntrada} caboEntrada={caboEntrada} />
          ) : (
            <p className="text-xs text-gray-500">Caixa sem splitter (só passagem/emenda).</p>
          )}
          {modeloSalvo && (
            <p className="text-[11px] text-gray-600">
              <b>{modeloSalvo.nome}</b> · {resumoItem(modeloSalvo)}
            </p>
          )}
          {ramos.length > 0 && (
            <p className="text-[11px] text-gray-500">
              Segue para: {ramos.map((r) => curto(r, 30)).join(", ")}
            </p>
          )}
          {caixa?.obs && <p className="text-xs text-gray-600 italic">{caixa.obs}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-gray-400 truncate">
              {caixa?.atualizado_por ? `Por ${caixa.atualizado_por}` : ""}
              {caixa?.atualizado_em ? ` em ${new Date(caixa.atualizado_em).toLocaleDateString("pt-BR")}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50 shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-3 max-h-[60vh] overflow-auto">
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`spl-${chave}`}>Splitter</label>
            <select
              id={`spl-${chave}`}
              value={modeloId && modelos.some((m) => m.id === modeloId) ? `m:${modeloId}` : splitter}
              onChange={(e) => trocarSplitter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Sem splitter (só passagem/emenda)</option>
              {modelos.length > 0 && (
                <optgroup label="Cadastrados">
                  {modelos.map((m) => (
                    <option key={m.id} value={`m:${m.id}`}>{m.nome} · {resumoItem(m)}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Genérico">
                {SPLITTERS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {portas.length > 0 && (
            <div className="space-y-1.5">
              <DesenhoSplitter splitter={splitter} portas={portas} fibraEntrada={fibraEntrada} caboEntrada={caboEntrada} />
              <p className="text-[11px] text-gray-500">
                Clique no número para alternar: livre → cliente → ramal (perna que segue para outra caixa).
              </p>
              <ul className="space-y-1">
                {portas.map((p) => (
                  <li key={p.numero} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alterarPorta(p.numero, { status: PROXIMO[p.status] })}
                      className={`w-9 shrink-0 text-center rounded border px-1 py-1 text-xs font-semibold ${COR_STATUS[p.status]}`}
                      title={STATUS_PORTA_LABEL[p.status]}
                      aria-label={`Porta ${p.numero}: ${STATUS_PORTA_LABEL[p.status]}`}
                    >
                      {p.numero}
                    </button>
                    <input
                      value={p.descricao ?? ""}
                      onChange={(e) => alterarPorta(p.numero, { descricao: e.target.value })}
                      disabled={p.status === "livre"}
                      placeholder={p.status === "cliente" ? "Cliente / login" : p.status === "ramal" ? "Caixa de destino" : "Livre"}
                      className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1 text-xs bg-white disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </li>
                ))}
              </ul>
              {ramos.length > ramaisMarcados && (
                <p className="text-[11px] text-amber-700">
                  A árvore tem {ramos.length} ramo{ramos.length > 1 ? "s" : ""} saindo desta caixa e só {ramaisMarcados} porta
                  {ramaisMarcados !== 1 ? "s" : ""} marcada{ramaisMarcados !== 1 ? "s" : ""} como ramal. Na contagem de livres vale o maior.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`obs-${chave}`}>Observação</label>
            <input
              id={`obs-${chave}`}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            />
          </div>

          {erro && <p className="text-xs text-red-600">{erro}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => (caixa ? setEditando(false) : onFechar())}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar caixa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
