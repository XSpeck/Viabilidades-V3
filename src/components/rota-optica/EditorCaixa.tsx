"use client";

import { useState } from "react";
import { GripHorizontal, Loader2, Pencil, Save, X } from "lucide-react";
import {
  portasPara,
  salvarCaixa,
  STATUS_PORTA_LABEL,
  type CaixaRede,
  type PortaCaixa,
  type StatusPorta,
} from "@/lib/caixasRede";
import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";
import { corFibra, perdaSplitter, TIPO_ELEMENTO_LABEL, type TipoElementoRota } from "@/lib/rotaOptica";
import { COR_ELEMENTO } from "./IconesRede";

interface Props {
  chave: string;
  nome: string;
  tipo: TipoElementoRota;
  caixa?: CaixaRede;
  /** Splitter informado na rota (sugestão quando a caixa ainda não foi cadastrada) */
  splitterRota?: string;
  /** Modelo de splitter informado na rota */
  modeloRota?: string;
  caboEntrada?: string;
  fibraEntrada?: number;
  /** Nomes dos ramos de rota que saem desta caixa na árvore */
  ramos: string[];
  /** Modelos de splitter do cadastro de equipamentos */
  modelos: ItemCatalogo[];
  usuario: string;
  onSalva: (c: CaixaRede) => void;
  onFechar: () => void;
  /** Dentro de uma janela: sem barra de título própria */
  semMoldura?: boolean;
  /** Potência (dBm) que chega na caixa, para estimar a das portas */
  potenciaEntrada?: number;
}

const COR_STATUS: Record<StatusPorta, string> = {
  livre: "bg-white border-slate-300 text-slate-500",
  cliente: "bg-emerald-600 border-emerald-600 text-white",
  ramal: "bg-indigo-600 border-indigo-600 text-white",
};

const CHIP: Record<StatusPorta, string> = {
  livre: "bg-slate-100 text-slate-600",
  cliente: "bg-emerald-100 text-emerald-800",
  ramal: "bg-indigo-100 text-indigo-800",
};

/** Cor do fio de saída e do anel do adaptador por estado da porta */
const TRACO: Record<StatusPorta, string> = { livre: "#94a3b8", cliente: "#059669", ramal: "#4f46e5" };

function curto(t: string, n: number) {
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

const fmtDbm = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} dBm`;

/**
 * Interior da caixa: cabo entrando pela parede → fusão na bandeja → splitter PLC →
 * fibras de saída até os adaptadores (portas), coloridas pelo uso.
 */
function DesenhoSplitter({ splitter, portas, fibraEntrada, caboEntrada, tipo, perdaDb, potenciaEntrada, conector }: {
  splitter: string;
  portas: PortaCaixa[];
  fibraEntrada?: number;
  caboEntrada?: string;
  tipo: TipoElementoRota;
  perdaDb?: number;
  potenciaEntrada?: number;
  conector?: string;
}) {
  const W = 400;
  const LIN = 26;
  const TOPO = 30;
  const H = Math.max(150, TOPO + portas.length * LIN + 18);
  const meio = TOPO + (H - TOPO - 12) / 2;
  const cor = corFibra(fibraEntrada, caboEntrada);
  const corCaixa = COR_ELEMENTO[tipo] ?? "#334155";
  const perda = perdaSplitter(splitter, perdaDb);
  const potSaida = potenciaEntrada !== undefined ? potenciaEntrada - 0.1 - perda : undefined;
  const xParede = 14;
  const xFusao = 62;
  const xSpl = 104;
  const wSpl = 54;
  const xPorta = 236;
  const apc = !conector || /APC/i.test(conector);
  const corAdapt = apc ? "#16a34a" : "#2563eb";
  const hSpl = Math.min(H - TOPO - 24, Math.max(56, portas.length * 9));
  const id = `g${splitter.replace(/\W/g, "")}${portas.length}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Interior da caixa: splitter ${splitter} com ${portas.length} portas`}>
      <defs>
        <linearGradient id={`${id}-spl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#475569" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <pattern id={`${id}-grade`} width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="#e2e8f0" strokeWidth=".6" />
        </pattern>
      </defs>

      {/* Caixa */}
      <rect x={xParede} y={4} width={W - xParede - 4} height={H - 8} rx={12} fill={`url(#${id}-grade)`} stroke={corCaixa} strokeWidth={2.5} />
      <rect x={xParede} y={4} width={W - xParede - 4} height={20} rx={12} fill={corCaixa} />
      <rect x={xParede} y={14} width={W - xParede - 4} height={10} fill={corCaixa} />
      <text x={xParede + 10} y={18} fontSize={10} fontWeight={700} fill="#fff">
        {TIPO_ELEMENTO_LABEL[tipo].toUpperCase()} · INTERIOR
      </text>
      {potSaida !== undefined && (
        <text x={W - 12} y={18} fontSize={9.5} fontWeight={600} fill="#fff" textAnchor="end">
          ≈ {fmtDbm(potSaida)} por porta
        </text>
      )}

      {/* Bandeja de emenda */}
      <rect x={xFusao - 20} y={meio - 22} width={44} height={44} rx={8} fill="#f1f5f9" stroke="#cbd5e1" strokeDasharray="3 2" />
      <text x={xFusao + 2} y={meio + 34} fontSize={8} fill="#64748b" textAnchor="middle">fusão</text>

      {/* Cabo entrando pela parede (prensa-cabo) */}
      <rect x={xParede - 8} y={meio - 8} width={14} height={16} rx={3} fill="#334155" />
      <line x1={0} y1={meio} x2={xParede + 4} y2={meio} stroke="#0f172a" strokeWidth={10} strokeLinecap="round" />
      {/* Fibra de entrada até a fusão e da fusão até o splitter */}
      <path d={`M${xParede + 4} ${meio} H${xFusao - 8}`} stroke="#0f172a" strokeWidth={6} />
      <path d={`M${xParede + 4} ${meio} H${xFusao - 8}`} stroke={cor.hex} strokeWidth={3.5} />
      <path d={`M${xFusao + 8} ${meio} H${xSpl}`} stroke="#0f172a" strokeWidth={6} />
      <path d={`M${xFusao + 8} ${meio} H${xSpl}`} stroke={cor.hex} strokeWidth={3.5} />
      {/* Protetor de emenda */}
      <rect x={xFusao - 11} y={meio - 4.5} width={22} height={9} rx={4.5} fill="#e2e8f0" stroke="#64748b" />
      <line x1={xFusao - 7} y1={meio} x2={xFusao + 7} y2={meio} stroke="#94a3b8" strokeWidth={1.5} />
      <circle cx={xFusao} cy={meio} r={2} fill="#f59e0b" />

      {/* Etiqueta da fibra de entrada */}
      <g transform={`translate(${xParede + 2} ${meio - 40})`}>
        <rect width={84} height={16} rx={8} fill="#fff" stroke="#cbd5e1" />
        <circle cx={9} cy={8} r={4.2} fill={cor.hex} stroke="#0f172a" strokeWidth={0.8} />
        <text x={17} y={11.5} fontSize={8.5} fontWeight={700} fill="#0f172a">
          {fibraEntrada ? `${cor.rotulo || `F${fibraEntrada}`}` : "entrada"}
        </text>
      </g>
      {caboEntrada && (
        <text x={xParede + 2} y={meio + 50} fontSize={8} fill="#64748b">
          <title>{caboEntrada}</title>
          {curto(caboEntrada, 20)}
        </text>
      )}

      {/* Saídas */}
      {portas.map((p, i) => {
        const yy = TOPO + 8 + LIN / 2 + i * LIN;
        const livre = p.status === "livre";
        const ySai = meio - hSpl / 2 + 8 + (i * (hSpl - 16)) / Math.max(1, portas.length - 1);
        const ys = portas.length === 1 ? meio : ySai;
        const texto = livre ? "livre" : curto(p.descricao || (p.status === "cliente" ? "cliente" : "ramal"), 22);
        return (
          <g key={p.numero}>
            <title>{`Porta ${p.numero}: ${p.descricao || STATUS_PORTA_LABEL[p.status]}`}</title>
            <path
              d={`M${xSpl + wSpl} ${ys} C ${xSpl + wSpl + 30} ${ys}, ${xPorta - 40} ${yy}, ${xPorta - 12} ${yy}`}
              fill="none"
              stroke={TRACO[p.status]}
              strokeWidth={livre ? 1.6 : 2.4}
              strokeDasharray={livre ? "4 3" : undefined}
              strokeLinecap="round"
            />
            {/* Adaptador */}
            <rect x={xPorta - 12} y={yy - 9} width={24} height={18} rx={3.5} fill={livre ? "#fff" : corAdapt} stroke={livre ? "#cbd5e1" : "#0f172a"} strokeWidth={1.2} />
            <rect x={xPorta - 8} y={yy - 5} width={16} height={10} rx={2} fill={livre ? "#f1f5f9" : "#ffffff"} opacity={livre ? 1 : 0.92} />
            <text x={xPorta} y={yy + 3.4} fontSize={9} textAnchor="middle" fontWeight={800} fill={livre ? "#94a3b8" : "#0f172a"}>
              {p.numero}
            </text>
            {/* Destino */}
            {p.status === "cliente" && (
              <path d={`M${xPorta + 18} ${yy + 4}V${yy - 1}L${xPorta + 23} ${yy - 5}L${xPorta + 28} ${yy - 1}V${yy + 4}Z`} fill="#059669" />
            )}
            {p.status === "ramal" && (
              <path d={`M${xPorta + 17} ${yy}H${xPorta + 27}M${xPorta + 23} ${yy - 4}L${xPorta + 27} ${yy}L${xPorta + 23} ${yy + 4}`} stroke="#4f46e5" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            <text x={xPorta + (livre ? 17 : 32)} y={yy + 3.5} fontSize={9.5} fontWeight={livre ? 400 : 600} fill={livre ? "#94a3b8" : "#0f172a"}>
              {texto}
            </text>
          </g>
        );
      })}

      {/* Splitter PLC */}
      <rect x={xSpl} y={meio - hSpl / 2} width={wSpl} height={hSpl} rx={8} fill={`url(#${id}-spl)`} stroke="#0f172a" />
      <rect x={xSpl + 5} y={meio - hSpl / 2 + 5} width={wSpl - 10} height={4} rx={2} fill="#94a3b8" opacity=".5" />
      <text x={xSpl + wSpl / 2} y={meio - 3} fontSize={8} textAnchor="middle" fill="#cbd5e1" letterSpacing=".5">PLC</text>
      <text x={xSpl + wSpl / 2} y={meio + 10} fontSize={13} textAnchor="middle" fill="#fff" fontWeight={800}>{splitter}</text>
      <text x={xSpl + wSpl / 2} y={meio + hSpl / 2 - 6} fontSize={7.5} textAnchor="middle" fill="#94a3b8">
        −{perda.toFixed(1).replace(".", ",")} dB
      </text>
    </svg>
  );
}

/** Contagem das portas em selos coloridos. */
function ResumoPortasChips({ portas }: { portas: PortaCaixa[] }) {
  const n = (s: StatusPorta) => portas.filter((p) => p.status === s).length;
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className="rounded-full px-2 py-0.5 bg-slate-800 text-white font-semibold">{portas.length} portas</span>
      {(["cliente", "ramal", "livre"] as const).map((s) => (
        <span key={s} className={`rounded-full px-2 py-0.5 font-medium ${CHIP[s]}`}>
          {n(s)} {s === "cliente" ? (n(s) === 1 ? "cliente" : "clientes") : s === "ramal" ? (n(s) === 1 ? "ramal" : "ramais") : n(s) === 1 ? "livre" : "livres"}
        </span>
      ))}
    </div>
  );
}

/** Quadro da caixa, aberto em cima do elemento na árvore: desenho do splitter e cadastro das portas. */
export default function EditorCaixa({
  chave, nome, tipo, caixa, splitterRota, modeloRota, caboEntrada, fibraEntrada, ramos, modelos, usuario, onSalva, onFechar, semMoldura, potenciaEntrada,
}: Props) {
  const [editando, setEditando] = useState(!caixa);
  const [splitter, setSplitter] = useState(caixa?.splitter ?? splitterRota ?? "");
  const [portas, setPortas] = useState<PortaCaixa[]>(portasPara(caixa?.splitter ?? splitterRota, caixa?.portas));
  const [obs, setObs] = useState(caixa?.obs ?? "");
  const [modeloId, setModeloId] = useState(caixa ? caixa.splitter_modelo ?? "" : modeloRota ?? "");
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
    if (splitter && !(modeloId && modelos.some((m) => m.id === modeloId))) {
      setErro("Escolha um splitter do cadastro.");
      return;
    }
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
  const modeloEdit = modelos.find((m) => m.id === modeloId);
  const desenho = (spl: string, ps: PortaCaixa[], modelo?: ItemCatalogo) => (
    <div className="rounded-xl bg-slate-50 p-1.5 border border-slate-200">
      <DesenhoSplitter
        splitter={spl}
        portas={ps}
        fibraEntrada={fibraEntrada}
        caboEntrada={caboEntrada}
        tipo={tipo}
        perdaDb={modelo?.perda_db}
        conector={modelo?.conector}
        potenciaEntrada={potenciaEntrada}
      />
    </div>
  );
  const vistas = portasPara(caixa?.splitter, caixa?.portas);

  return (
    <div className={semMoldura ? "" : "bg-white rounded-xl border border-gray-300 shadow-2xl overflow-hidden"}>
      {!semMoldura && (
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
      )}

      {!editando ? (
        <div className={`p-3 space-y-2 ${semMoldura ? "" : "max-h-[60vh] overflow-auto"}`}>
          {caixa?.splitter ? (
            <>
              <ResumoPortasChips portas={vistas} />
              {desenho(caixa.splitter, vistas, modeloSalvo)}
            </>
          ) : (
            <p className="text-xs text-gray-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg px-3 py-4 text-center">
              Caixa sem splitter: só passagem / emenda da fibra.
            </p>
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
        <div className={`p-3 space-y-3 ${semMoldura ? "" : "max-h-[60vh] overflow-auto"}`}>
          <div>
            <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`spl-${chave}`}>Splitter</label>
            <select
              id={`spl-${chave}`}
              value={modeloId && modelos.some((m) => m.id === modeloId) ? `m:${modeloId}` : splitter}
              onChange={(e) => trocarSplitter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Sem splitter (só passagem/emenda)</option>
              {modelos.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>{m.nome} · {resumoItem(m)}</option>
              ))}
              {splitter && !(modeloId && modelos.some((m) => m.id === modeloId)) && (
                <option value={splitter}>{splitter} (não cadastrado)</option>
              )}
            </select>
          </div>

          {!modelos.length && <p className="text-[11px] text-red-600">Nenhum splitter cadastrado. Cadastre em Cadastros → Splitters.</p>}
          {splitter && !(modeloId && modelos.some((m) => m.id === modeloId)) && (
            <p className="text-[11px] text-red-600">Este splitter não é do cadastro: escolha um modelo cadastrado.</p>
          )}
          {portas.length > 0 && (
            <div className="space-y-1.5">
              <ResumoPortasChips portas={portas} />
              {desenho(splitter, portas, modeloEdit)}
              <p className="text-[11px] text-gray-500">
                Marque cada porta: livre, cliente ou ramal (perna que segue para outra caixa).
              </p>
              <ul className="space-y-1">
                {portas.map((p) => (
                  <li key={p.numero} className="flex items-center gap-1.5">
                    <span className={`w-7 shrink-0 text-center rounded-md border py-1 text-xs font-bold ${COR_STATUS[p.status]}`}>{p.numero}</span>
                    <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 shrink-0" role="radiogroup" aria-label={`Porta ${p.numero}`}>
                      {(["livre", "cliente", "ramal"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          role="radio"
                          aria-checked={p.status === st}
                          onClick={() => alterarPorta(p.numero, { status: st })}
                          title={STATUS_PORTA_LABEL[st]}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${p.status === st ? COR_STATUS[st] + " shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                        >
                          {st === "livre" ? "Livre" : st === "cliente" ? "Cliente" : "Ramal"}
                        </button>
                      ))}
                    </div>
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
