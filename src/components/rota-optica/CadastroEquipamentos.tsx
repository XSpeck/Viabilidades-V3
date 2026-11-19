"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { CAPACIDADES } from "@/lib/cabosRede";
import { fibrasPorTubo } from "@/lib/rotaOptica";
import {
  CATEGORIA_LABEL,
  CONECTORES,
  CONSTRUCOES_CABO,
  excluirItemCatalogo,
  PERDA_TIPICA,
  RELACOES_SPLITTER,
  resumoItem,
  salvarItemCatalogo,
  type CategoriaCatalogo,
  type ItemCatalogo,
  type ItemCatalogoInput,
} from "@/lib/catalogoRede";

interface Props {
  itens: ItemCatalogo[];
  usuario: string;
  onMudou: (itens: ItemCatalogo[]) => void;
  onFechar: () => void;
}

const CATEGORIAS: CategoriaCatalogo[] = ["cabo", "splitter", "dio", "olt"];
const FIBRAS_POR_TUBO = [2, 4, 6, 8, 12, 24];

function novoItem(categoria: CategoriaCatalogo, usuario: string): ItemCatalogoInput {
  if (categoria === "cabo") return { categoria, nome: "", capacidade: 12, fibras_por_tubo: 12, construcao: "AS80", atualizado_por: usuario };
  if (categoria === "splitter")
    return { categoria, nome: "", relacao: "1:8", balanceamento: "balanceado", conector: "SC/APC", perda_db: PERDA_TIPICA["1:8"], atualizado_por: usuario };
  if (categoria === "dio") return { categoria, nome: "", portas: 24, conector: "SC/APC", atualizado_por: usuario };
  return { categoria, nome: "", modelo: "", placas: 1, portas_por_placa: 16, potencia_tx: 5, atualizado_por: usuario };
}

const campo = "w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-gray-500 mb-0.5">{rotulo}</span>
      {children}
    </label>
  );
}

function numero(v: string): number | undefined {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Cadastro dos tipos de cabo, splitter, DIO e OLT usados na rede. */
export default function CadastroEquipamentos({ itens, usuario, onMudou }: Props) {
  const [cat, setCat] = useState<CategoriaCatalogo>("cabo");
  const [form, setForm] = useState<{ id: string | null; dados: ItemCatalogoInput } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const lista = itens.filter((i) => i.categoria === cat);
  const d = form?.dados;
  const set = (m: Partial<ItemCatalogoInput>) => setForm((f) => (f ? { ...f, dados: { ...f.dados, ...m } } : f));

  function nomeSugerido(x: ItemCatalogoInput): string {
    if (x.categoria === "cabo") return `Cabo ${x.construcao ?? ""} ${x.capacidade ?? ""}F`.replace(/\s+/g, " ").trim();
    if (x.categoria === "splitter") return `Splitter ${x.relacao ?? ""} ${x.conector ?? ""}`.trim();
    if (x.categoria === "dio") return `DIO ${x.portas ?? ""} portas`;
    return x.modelo ? `OLT ${x.modelo}` : "";
  }

  async function salvar() {
    if (!form) return;
    const dados = { ...form.dados, nome: form.dados.nome.trim() || nomeSugerido(form.dados), atualizado_por: usuario };
    if (!dados.nome) return setErro("Dê um nome para o item.");
    setSalvando(true);
    setErro(null);
    try {
      const salvo = await salvarItemCatalogo(form.id, dados);
      onMudou([...itens.filter((i) => i.id !== salvo.id), salvo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })));
      setForm(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(i: ItemCatalogo) {
    if (!confirm(`Excluir "${i.nome}" do cadastro? Cabos e caixas que usam este tipo ficam sem ele.`)) return;
    try {
      await excluirItemCatalogo(i.id);
      onMudou(itens.filter((x) => x.id !== i.id));
      if (form?.id === i.id) setForm(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  return (
    <section className="p-4 space-y-4">
      <p className="text-xs text-gray-500">
            Tipos de cabo, splitter, DIO e OLT da rede. Os cabos e splitters cadastrados aparecem para escolher nos quadros da árvore PON.
          </p>

      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {CATEGORIAS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cat === c}
            onClick={() => { setCat(c); setForm(null); setErro(null); }}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
              cat === c ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {CATEGORIA_LABEL[c]} <span className="text-xs text-gray-400">({itens.filter((i) => i.categoria === c).length})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
        <div>
          {lista.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">
              Nenhum item cadastrado em {CATEGORIA_LABEL[cat].toLowerCase()}.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {lista.map((i) => (
                <li key={i.id} className={`flex items-center gap-2 px-3 py-2 ${form?.id === i.id ? "bg-indigo-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 leading-tight">{i.nome}</p>
                    <p className="text-xs text-gray-500">{resumoItem(i)}</p>
                    {i.obs && <p className="text-xs text-gray-400 italic">{i.obs}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => { const { id, atualizado_em, ...resto } = i; void atualizado_em; setForm({ id, dados: resto }); setErro(null); }}
                    className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                    aria-label={`Editar ${i.nome}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(i)}
                    className="p-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                    aria-label={`Excluir ${i.nome}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!form && (
            <button
              type="button"
              onClick={() => { setForm({ id: null, dados: novoItem(cat, usuario) }); setErro(null); }}
              className="mt-3 flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" /> Novo {cat === "cabo" ? "tipo de cabo" : cat === "splitter" ? "splitter" : cat === "dio" ? "DIO" : "OLT"}
            </button>
          )}
        </div>

        {form && d && (
          <div className="border border-indigo-200 rounded-lg p-3 space-y-2.5 bg-indigo-50/40">
            <p className="text-sm font-semibold text-gray-900">{form.id ? "Editar" : "Novo"} · {CATEGORIA_LABEL[d.categoria].replace(/s$/, "")}</p>

            {d.categoria === "cabo" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Capacidade">
                    <select
                      className={campo}
                      value={d.capacidade ?? 12}
                      onChange={(e) => { const c = parseInt(e.target.value, 10); set({ capacidade: c, fibras_por_tubo: Math.min(fibrasPorTubo(c), c) }); }}
                    >
                      {CAPACIDADES.map((c) => <option key={c} value={c}>{c} fibras</option>)}
                    </select>
                  </Campo>
                  <Campo rotulo="Fibras por tubo">
                    <select className={campo} value={d.fibras_por_tubo ?? 12} onChange={(e) => set({ fibras_por_tubo: parseInt(e.target.value, 10) })}>
                      {FIBRAS_POR_TUBO.filter((f) => f <= (d.capacidade ?? 12) || f === d.fibras_por_tubo).map((f) => (
                        <option key={f} value={f}>{f}{f >= (d.capacidade ?? 12) ? " (tubo único)" : ""}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <p className="text-[11px] text-gray-500">
                  {Math.ceil((d.capacidade ?? 12) / (d.fibras_por_tubo ?? 12))} tubo(s). Padrão: até 12 fibras 1 tubo; 24 a 72 tubos de 6; acima, tubos de 12.
                </p>
                <Campo rotulo="Construção">
                  <select className={campo} value={d.construcao ?? ""} onChange={(e) => set({ construcao: e.target.value || undefined })}>
                    <option value="">—</option>
                    {CONSTRUCOES_CABO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Campo>
              </>
            )}

            {d.categoria === "splitter" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Relação">
                    <select
                      className={campo}
                      value={d.relacao ?? "1:8"}
                      onChange={(e) => set({ relacao: e.target.value, perda_db: d.balanceamento === "desbalanceado" ? d.perda_db : PERDA_TIPICA[e.target.value] })}
                    >
                      {RELACOES_SPLITTER.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Campo>
                  <Campo rotulo="Tipo">
                    <select className={campo} value={d.balanceamento ?? "balanceado"} onChange={(e) => set({ balanceamento: e.target.value as ItemCatalogo["balanceamento"] })}>
                      <option value="balanceado">Balanceado</option>
                      <option value="desbalanceado">Desbalanceado</option>
                    </select>
                  </Campo>
                  <Campo rotulo="Conector">
                    <select className={campo} value={d.conector ?? ""} onChange={(e) => set({ conector: e.target.value || undefined })}>
                      <option value="">—</option>
                      {CONECTORES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Campo>
                  <Campo rotulo="Perda (dB)">
                    <input
                      className={campo}
                      inputMode="decimal"
                      value={d.perda_db !== undefined ? String(d.perda_db).replace(".", ",") : ""}
                      onChange={(e) => set({ perda_db: numero(e.target.value) })}
                      placeholder={d.balanceamento === "desbalanceado" ? "ex.: 1,5 / 15" : ""}
                    />
                  </Campo>
                </div>
              </>
            )}

            {d.categoria === "dio" && (
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Portas">
                  <input className={campo} inputMode="numeric" value={d.portas ?? ""} onChange={(e) => set({ portas: numero(e.target.value) })} />
                </Campo>
                <Campo rotulo="Conector">
                  <select className={campo} value={d.conector ?? ""} onChange={(e) => set({ conector: e.target.value || undefined })}>
                    <option value="">—</option>
                    {CONECTORES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Campo>
              </div>
            )}

            {d.categoria === "olt" && (
              <>
                <Campo rotulo="Fabricante / modelo">
                  <input className={campo} value={d.modelo ?? ""} onChange={(e) => set({ modelo: e.target.value })} placeholder="ex.: Huawei MA5800-X7" />
                </Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Placas PON">
                    <input className={campo} inputMode="numeric" value={d.placas ?? ""} onChange={(e) => set({ placas: numero(e.target.value) })} />
                  </Campo>
                  <Campo rotulo="Portas por placa">
                    <input className={campo} inputMode="numeric" value={d.portas_por_placa ?? ""} onChange={(e) => set({ portas_por_placa: numero(e.target.value) })} />
                  </Campo>
                </div>
                <Campo rotulo="Potência de saída da porta PON (dBm)">
                  <input
                    className={campo}
                    inputMode="decimal"
                    value={d.potencia_tx !== undefined ? String(d.potencia_tx).replace(".", ",") : ""}
                    onChange={(e) => set({ potencia_tx: numero(e.target.value) })}
                    placeholder="ex.: 5 (módulo C+)"
                  />
                </Campo>
                <Campo rotulo="Local">
                  <input className={campo} value={d.local ?? ""} onChange={(e) => set({ local: e.target.value })} placeholder="ex.: POP Centro" />
                </Campo>
              </>
            )}

            <Campo rotulo="Nome">
              <input className={campo} value={d.nome} onChange={(e) => set({ nome: e.target.value })} placeholder={nomeSugerido(d) || "Nome"} />
            </Campo>
            <Campo rotulo="Observação">
              <input className={campo} value={d.obs ?? ""} onChange={(e) => set({ obs: e.target.value })} />
            </Campo>

            {erro && <p className="text-xs text-red-600">{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
              </button>
            </div>
          </div>
        )}
      </div>
      {!form && erro && <p className="text-sm text-red-600">{erro}</p>}
    </section>
  );
}
