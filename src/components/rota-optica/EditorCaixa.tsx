"use client";

import { useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import {
  portasPara,
  salvarCaixa,
  SPLITTERS,
  STATUS_PORTA_LABEL,
  type CaixaRede,
  type PortaCaixa,
  type StatusPorta,
} from "@/lib/caixasRede";

interface Props {
  chave: string;
  nome: string;
  caixa?: CaixaRede;
  /** Splitter informado na rota (usado como sugestão quando a caixa ainda não foi cadastrada) */
  splitterRota?: string;
  /** Quantos ramos de rota saem desta caixa na árvore */
  ramosArvore: number;
  usuario: string;
  onSalva: (c: CaixaRede) => void;
}

const COR_STATUS: Record<StatusPorta, string> = {
  livre: "bg-white border-gray-300 text-gray-500",
  cliente: "bg-gray-900 border-gray-900 text-white",
  ramal: "bg-indigo-100 border-indigo-400 text-indigo-800",
};

const PROXIMO: Record<StatusPorta, StatusPorta> = { livre: "cliente", cliente: "ramal", ramal: "livre" };

/** Diagrama interno da caixa: splitter e o que está ligado em cada porta. Vale para todas as rotas que passam aqui. */
export default function EditorCaixa({ chave, nome, caixa, splitterRota, ramosArvore, usuario, onSalva }: Props) {
  const [editando, setEditando] = useState(false);
  const [splitter, setSplitter] = useState(caixa?.splitter ?? splitterRota ?? "");
  const [portas, setPortas] = useState<PortaCaixa[]>(portasPara(caixa?.splitter ?? splitterRota, caixa?.portas));
  const [obs, setObs] = useState(caixa?.obs ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function trocarSplitter(v: string) {
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
      const salva = await salvarCaixa({
        chave,
        nome,
        splitter: splitter || undefined,
        portas,
        obs,
        atualizado_por: usuario,
      });
      onSalva(salva);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a caixa.");
    } finally {
      setSalvando(false);
    }
  }

  const ramaisMarcados = portas.filter((p) => p.status === "ramal").length;

  if (!editando) {
    const vistas = portasPara(caixa?.splitter, caixa?.portas);
    return (
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Diagrama da caixa</p>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
          >
            <Pencil className="w-3.5 h-3.5" /> {caixa ? "Editar" : "Cadastrar"}
          </button>
        </div>
        {caixa?.splitter ? (
          <>
            <p className="text-xs text-gray-500">Splitter {caixa.splitter}</p>
            <ul className="grid grid-cols-1 gap-1">
              {vistas.map((p) => (
                <li key={p.numero} className="flex items-center gap-2 text-xs">
                  <span className={`w-7 text-center rounded border px-1 py-0.5 font-semibold ${COR_STATUS[p.status]}`}>{p.numero}</span>
                  <span className="text-gray-700">
                    {STATUS_PORTA_LABEL[p.status].split(" (")[0]}
                    {p.descricao ? ` · ${p.descricao}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-gray-500">
            {caixa ? "Caixa sem splitter (só passagem/emenda)." : "Splitter e portas ainda não cadastrados."}
          </p>
        )}
        {caixa?.obs && <p className="text-xs text-gray-600 italic">{caixa.obs}</p>}
        {caixa?.atualizado_por && (
          <p className="text-[11px] text-gray-400">
            Atualizado por {caixa.atualizado_por}
            {caixa.atualizado_em ? ` em ${new Date(caixa.atualizado_em).toLocaleDateString("pt-BR")}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Diagrama da caixa</p>
        <button type="button" onClick={() => setEditando(false)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-[11px] text-gray-500 mb-0.5" htmlFor={`spl-${chave}`}>Splitter</label>
        <select
          id={`spl-${chave}`}
          value={splitter}
          onChange={(e) => trocarSplitter(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Sem splitter (só passagem/emenda)</option>
          {SPLITTERS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {portas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-gray-500">
            Clique no número da porta para alternar: livre → cliente → ramal. Ramal é perna que segue para outra caixa
            {ramosArvore > 0 ? ` (a árvore já mostra ${ramosArvore} ramo${ramosArvore > 1 ? "s" : ""} saindo daqui)` : ""}.
          </p>
          <ul className="space-y-1 max-h-72 overflow-auto pr-1">
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
          {ramosArvore > ramaisMarcados && (
            <p className="text-[11px] text-amber-700">
              A árvore tem {ramosArvore} ramo{ramosArvore > 1 ? "s" : ""} saindo desta caixa e só {ramaisMarcados} porta
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
        <button type="button" onClick={() => setEditando(false)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50">
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
  );
}
