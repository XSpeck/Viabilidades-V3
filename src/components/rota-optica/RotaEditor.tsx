"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import {
  TIPO_ELEMENTO_LABEL,
  type ElementoRota,
  type RotaOptica,
  type RotaOpticaInput,
  type TipoElementoRota,
} from "@/lib/rotaOptica";

/** Linha do formulário: números ficam como texto até salvar. */
interface Linha {
  nome: string;
  tipo: TipoElementoRota;
  codigo: string;
  cabo_entrada: string;
  fibra_entrada: string;
  cabo_saida: string;
  fibra_saida: string;
  distancia_m: string;
  potencia_entrada: string;
  potencia_saida: string;
  splitter: string;
  porta: string;
  coords: string;
  obs: string;
}

const s = (v?: number) => (v === undefined ? "" : String(v).replace(".", ","));

function paraLinha(e: ElementoRota): Linha {
  return {
    nome: e.nome,
    tipo: e.tipo,
    codigo: e.codigo ?? "",
    cabo_entrada: e.cabo_entrada ?? "",
    fibra_entrada: s(e.fibra_entrada),
    cabo_saida: e.cabo_saida ?? "",
    fibra_saida: s(e.fibra_saida),
    distancia_m: s(e.distancia_m),
    potencia_entrada: s(e.potencia_entrada),
    potencia_saida: s(e.potencia_saida),
    splitter: e.splitter ?? "",
    porta: e.porta ?? "",
    coords: e.lat !== undefined && e.lon !== undefined ? `${e.lat}, ${e.lon}` : "",
    obs: e.obs ?? "",
  };
}

const linhaVazia = (tipo: TipoElementoRota = "ceo"): Linha => paraLinha({ nome: "", tipo });

function n(v: string): number | undefined {
  const t = v.trim().replace(",", ".");
  if (!t) return undefined;
  const x = parseFloat(t);
  return isFinite(x) ? x : undefined;
}

function parseCoords(v: string): { lat?: number; lon?: number; erro?: boolean } {
  const t = v.trim();
  if (!t) return {};
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return { erro: true };
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erro: true };
  return { lat, lon };
}

interface Props {
  inicial?: RotaOptica | null;
  usuario: string;
  onCancelar: () => void;
  onSalvar: (dados: RotaOpticaInput) => Promise<void>;
}

export default function RotaEditor({ inicial, usuario, onCancelar, onSalvar }: Props) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial?.elementos.length ? inicial.elementos.map(paraLinha) : [linhaVazia("olt"), linhaVazia("cto")]
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alterar(i: number, campo: keyof Linha, valor: string) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  function mover(i: number, d: -1 | 1) {
    setLinhas((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome para a rota.");
    if (linhas.length < 2) return setErro("A rota precisa de pelo menos 2 elementos.");
    const elementos: ElementoRota[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l.nome.trim()) return setErro(`Elemento ${i + 1}: informe o nome.`);
      const c = parseCoords(l.coords);
      if (c.erro) return setErro(`Elemento ${i + 1}: coordenadas inválidas. Use "-28.6917, -49.3423".`);
      elementos.push({
        nome: l.nome.trim(),
        tipo: l.tipo,
        codigo: l.codigo.trim() || undefined,
        cabo_entrada: l.cabo_entrada.trim() || undefined,
        fibra_entrada: n(l.fibra_entrada),
        cabo_saida: l.cabo_saida.trim() || undefined,
        fibra_saida: n(l.fibra_saida),
        distancia_m: n(l.distancia_m),
        potencia_entrada: n(l.potencia_entrada),
        potencia_saida: n(l.potencia_saida),
        splitter: l.splitter.trim() || undefined,
        porta: l.porta.trim() || undefined,
        lat: c.lat,
        lon: c.lon,
        obs: l.obs.trim() || undefined,
      });
    }
    setSalvando(true);
    try {
      await onSalvar({
        nome: nome.trim(),
        origem: inicial?.origem ?? "manual",
        elementos,
        trechos: inicial?.trechos ?? [],
        obs: obs.trim() || undefined,
        criado_por: inicial?.criado_por ?? usuario,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300";
  const rot = "block text-[11px] text-gray-500 mb-0.5";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">{inicial ? "Editar rota" : "Cadastrar rota manualmente"}</h2>
        <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={rot}>Nome da rota *</label>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: OLT1_ST PL04 P13 → HUB 0/4/13" />
        </div>
        <div>
          <label className={rot}>Observação</label>
          <input className={campo} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Cadastre os elementos na ordem em que o sinal passa, da OLT até a ponta. Distância é a do trecho desde o
        elemento anterior. Fibra é o número da fibra no cabo (1 a 144); a cor é calculada pelo padrão ABNT.
      </p>

      <ol className="space-y-3">
        {linhas.map((l, i) => (
          <li key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Elemento {i + 1}</span>
              <span className="flex gap-1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" aria-label="Subir">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" aria-label="Descer">
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  className="p-1 rounded hover:bg-red-100 text-red-600"
                  aria-label="Remover elemento"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className={rot}>Nome *</label>
                <input className={campo} value={l.nome} onChange={(e) => alterar(i, "nome", e.target.value)} placeholder="Ex.: CE 2222 - P. CHAMINE" />
              </div>
              <div>
                <label className={rot}>Tipo</label>
                <select className={campo} value={l.tipo} onChange={(e) => alterar(i, "tipo", e.target.value)}>
                  {Object.entries(TIPO_ELEMENTO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={rot}>Código (PT…)</label>
                <input className={campo} value={l.codigo} onChange={(e) => alterar(i, "codigo", e.target.value)} />
              </div>
              {i > 0 && (
                <>
                  <div>
                    <label className={rot}>Cabo de chegada</label>
                    <input className={campo} value={l.cabo_entrada} onChange={(e) => alterar(i, "cabo_entrada", e.target.value)} />
                  </div>
                  <div>
                    <label className={rot}>Fibra de chegada</label>
                    <input className={campo} inputMode="numeric" value={l.fibra_entrada} onChange={(e) => alterar(i, "fibra_entrada", e.target.value)} />
                  </div>
                  <div>
                    <label className={rot}>Distância do anterior (m)</label>
                    <input className={campo} inputMode="decimal" value={l.distancia_m} onChange={(e) => alterar(i, "distancia_m", e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <label className={rot}>Potência na chegada (dBm)</label>
                <input className={campo} inputMode="decimal" value={l.potencia_entrada} onChange={(e) => alterar(i, "potencia_entrada", e.target.value)} />
              </div>
              {i < linhas.length - 1 && (
                <>
                  <div>
                    <label className={rot}>Cabo de saída</label>
                    <input className={campo} value={l.cabo_saida} onChange={(e) => alterar(i, "cabo_saida", e.target.value)} />
                  </div>
                  <div>
                    <label className={rot}>Fibra de saída</label>
                    <input className={campo} inputMode="numeric" value={l.fibra_saida} onChange={(e) => alterar(i, "fibra_saida", e.target.value)} />
                  </div>
                </>
              )}
              <div>
                <label className={rot}>Potência na saída (dBm)</label>
                <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, "potencia_saida", e.target.value)} />
              </div>
              <div>
                <label className={rot}>Splitter</label>
                <input className={campo} value={l.splitter} onChange={(e) => alterar(i, "splitter", e.target.value)} placeholder="1:8" />
              </div>
              <div className="col-span-2">
                <label className={rot}>Porta</label>
                <input className={campo} value={l.porta} onChange={(e) => alterar(i, "porta", e.target.value)} placeholder="Ex.: PL 04 - Porta 13" />
              </div>
              <div className="col-span-2">
                <label className={rot}>Coordenadas (lat, lon)</label>
                <input className={campo} value={l.coords} onChange={(e) => alterar(i, "coords", e.target.value)} placeholder="-28.69170, -49.34236" />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label className={rot}>Observação</label>
                <input className={campo} value={l.obs} onChange={(e) => alterar(i, "obs", e.target.value)} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}
        className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-800"
      >
        <Plus className="w-4 h-4" /> Adicionar elemento
      </button>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar rota
        </button>
      </div>
    </div>
  );
}
