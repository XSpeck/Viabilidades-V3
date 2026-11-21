"use client";

import { useState, useEffect } from "react";
import { deleteDemanda, getDemandasArquivadas, desarquivarDemanda } from "@/lib/firestore";
import { formatDateTime } from "@/lib/pluscode";
import type { DemandaRede } from "@/types";
import { Loader2, Trash2, ChevronRight, Search } from "lucide-react";
import { FotoLightbox } from "@/components/analise-rede/Fotos";
import { PRIORIDADE_LABEL, PRIORIDADE_COLOR, corTecnico } from "@/components/analise-rede/constantes";

// ── Painel de arquivo ─────────────────────────────────────
export default function ArquivoPanel({ onRestored }: { onRestored: () => void }) {
  const [open, setOpen]               = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [demandas, setDemandas]       = useState<DemandaRede[]>([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState<DemandaRede | null>(null);

  // Filtros próprios do arquivo
  const [busca, setBusca]             = useState("");
  const [filtroTec, setFiltroTec]     = useState<"todos" | string>("todos");
  const [filtroBairro, setFiltroBairro] = useState<string>("todos");
  const [dataInicio, setDataInicio]   = useState("");
  const [dataFim, setDataFim]         = useState("");
  const [page, setPage]               = useState(1);
  const PER_PAGE = 20;

  async function load() {
    setLoading(true);
    try {
      setDemandas(await getDemandasArquivadas());
      setLoaded(true);
    } finally { setLoading(false); }
  }

  function toggle() {
    if (!open && !loaded) load();
    setOpen((v) => !v);
  }

  const bairrosArquivados = Array.from(new Set(demandas.map((d) => d.bairro).filter(Boolean))).sort();
  const tecnicosArquivados = Array.from(new Set(demandas.flatMap((d) => d.tecnicos))).sort();

  const filtradas = demandas
    .filter((d) => filtroTec === "todos" || d.tecnicos.includes(filtroTec))
    .filter((d) => filtroBairro === "todos" || d.bairro === filtroBairro)
    .filter((d) => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (
        d.descricao.toLowerCase().includes(q) ||
        d.tipo.toLowerCase().includes(q) ||
        d.tecnicos.some((t) => t.toLowerCase().includes(q)) ||
        (d.bairro ?? "").toLowerCase().includes(q) ||
        (d.obs_conclusao ?? "").toLowerCase().includes(q)
      );
    })
    .filter((d) => {
      const dt = (d.data_conclusao ?? d.data_criacao).slice(0, 10);
      if (dataInicio && dt < dataInicio) return false;
      if (dataFim   && dt > dataFim)     return false;
      return true;
    })
    .sort((a, b) =>
      (b.data_conclusao ?? b.data_criacao) > (a.data_conclusao ?? a.data_criacao) ? 1 : -1
    );

  async function handleRestaurar(id: string) {
    await desarquivarDemanda(id);
    setSelected(null);
    await load();
    onRestored();
  }

  async function handleExcluir(id: string, fotoUrls?: string[]) {
    await deleteDemanda(id, fotoUrls);
    setSelected(null);
    setDemandas((prev) => prev.filter((d) => d.id !== id));
  }

  useEffect(() => { setPage(1); }, [busca, filtroTec, filtroBairro, dataInicio, dataFim]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PER_PAGE));
  const pageItems  = filtradas.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const hasFilters = busca || filtroTec !== "todos" || filtroBairro !== "todos" || dataInicio || dataFim;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Header colapsável */}
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span>📦 Arquivo de Demandas</span>
          {loaded && demandas.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {demandas.length}
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="border-t">
          {/* Filtros */}
          <div className="px-4 py-3 bg-gray-50 border-b space-y-2">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descrição, tipo, técnico..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              />
            </div>
            {/* Técnico + datas */}
            <div className="flex flex-wrap gap-2 items-center">
              {["todos", ...tecnicosArquivados].map((t) => (
                <button key={t} onClick={() => setFiltroTec(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filtroTec === t
                      ? "bg-amber-500 text-white"
                      : "bg-white border text-gray-600 hover:bg-gray-100"
                  }`}>
                  {t !== "todos" && (
                    <span className={`w-2 h-2 rounded-full ${corTecnico(t)}`} />
                  )}
                  {t === "todos" ? "Todos" : t}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                {bairrosArquivados.length > 0 && (
                  <select value={filtroBairro} onChange={(e) => setFiltroBairro(e.target.value)}
                    className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    <option value="todos">Todos os bairros</option>
                    {bairrosArquivados.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
                <span className="text-xs text-gray-400">De</span>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {hasFilters && (
                  <button onClick={() => { setBusca(""); setFiltroTec("todos"); setFiltroBairro("todos"); setDataInicio(""); setDataFim(""); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">
                    Limpar
                  </button>
                )}
              </div>
            </div>
            {loaded && (
              <p className="text-xs text-gray-400">
                {filtradas.length} de {demandas.length} demanda(s)
              </p>
            )}
          </div>

          {/* Lista */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">
              {demandas.length === 0 ? "Nenhuma demanda arquivada." : "Nenhum resultado para os filtros aplicados."}
            </p>
          ) : (
            <>
              <div className="divide-y">
                {pageItems.map((d) => (
                  <ArquivoRow key={d.id} demanda={d} onClick={() => setSelected(d)} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-gray-400">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(1)} disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">«</button>
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">‹</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                        if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                        ) : (
                          <button key={p} onClick={() => setPage(p as number)}
                            className={`px-2.5 py-1 text-xs border rounded-lg ${page === p ? "bg-indigo-600 text-white border-indigo-600" : "hover:bg-gray-50"}`}>
                            {p}
                          </button>
                        )
                      )}
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">›</button>
                    <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                      className="px-2 py-1 text-xs border rounded-lg disabled:opacity-30 hover:bg-gray-50">»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal de detalhes */}
      {selected && (
        <ArquivoDetalheModal
          demanda={selected}
          onClose={() => setSelected(null)}
          onRestaurar={() => handleRestaurar(selected.id)}
          onExcluir={() => handleExcluir(selected.id, selected.foto_urls)}
        />
      )}
    </div>
  );
}

function ArquivoRow({ demanda: d, onClick }: { demanda: DemandaRede; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full px-4 py-3 flex items-start gap-3 hover:bg-amber-50 transition-colors text-left">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORIDADE_COLOR[d.prioridade]}`}>
            {PRIORIDADE_LABEL[d.prioridade]}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
            {d.tipo}
          </span>
          {d.tecnicos.map((t) => (
            <span key={t} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${corTecnico(t)}`} />
              {t}
            </span>
          ))}
          {(d.notas_atividade?.length ?? 0) > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              🗒️ {d.notas_atividade!.length} nota(s)
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 truncate">{d.descricao}</p>
        {d.obs_conclusao && (
          <p className="text-xs text-gray-500 truncate mt-0.5">📝 {d.obs_conclusao}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          Concluído em {d.data_conclusao ? formatDateTime(d.data_conclusao) : "—"}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
    </button>
  );
}

// ── Modal de detalhes do arquivo ──────────────────────────
function ArquivoDetalheModal({ demanda: d, onClose, onRestaurar, onExcluir }: {
  demanda: DemandaRede;
  onClose: () => void;
  onRestaurar: () => Promise<void>;
  onExcluir:  () => Promise<void>;
}) {
  const [busy, setBusy]           = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const notas = [...(d.notas_atividade ?? [])].sort((a, b) => b.data.localeCompare(a.data));

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {PRIORIDADE_LABEL[d.prioridade]}
                </span>
                <span className="bg-white/20 text-white/90 text-xs px-2 py-0.5 rounded-full">
                  📦 Arquivada
                </span>
              </div>
              <h3 className="text-lg font-bold text-white">{d.tipo}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {d.tecnicos.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full border border-white/40 ${corTecnico(t)}`} />
                    <span className="text-white/80 text-sm font-medium">{t}</span>
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClose}
              className="text-white/70 hover:text-white text-xl leading-none shrink-0 mt-1">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Descrição */}
          <div>
            <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Descrição</p>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
          </div>

          {/* Local */}
          {d.local && (
            <div>
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Localização</p>
              <p className="text-sm font-mono text-gray-700">📍 {d.local}</p>
            </div>
          )}

          {/* Fotos */}
          {(d.foto_urls?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1 font-semibold uppercase tracking-wide">Fotos</p>
              <div className="grid grid-cols-4 gap-2">
                {d.foto_urls!.map((url, i) => (
                  <button key={url} type="button" onClick={() => setFotoAmpliada(url)} className="aspect-square">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover rounded-lg border" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-0.5">Criado em</p>
              <p className="text-sm font-medium text-gray-700">{formatDateTime(d.data_criacao)}</p>
              <p className="text-xs text-gray-500 mt-0.5">por {d.criado_por}</p>
            </div>
            {d.data_conclusao && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-0.5">Concluído em</p>
                <p className="text-sm font-medium text-green-700">{formatDateTime(d.data_conclusao)}</p>
              </div>
            )}
          </div>

          {/* Agendamento */}
          {d.data_agendamento && (
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-indigo-400 mb-0.5 font-semibold">Agendado para</p>
              <p className="text-sm font-medium text-indigo-700">
                {new Date(d.data_agendamento + "T12:00:00").toLocaleDateString("pt-BR")}
                {" — "}{d.periodo_agendamento}
              </p>
            </div>
          )}

          {/* Obs conclusão */}
          {d.obs_conclusao && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600 mb-1 font-semibold">📝 Observação de conclusão</p>
              <p className="text-sm text-green-800 leading-relaxed whitespace-pre-wrap">{d.obs_conclusao}</p>
            </div>
          )}

          {/* Notas de atividade */}
          {notas.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">
                Registro de atividade ({notas.length})
              </p>
              <div className="space-y-0">
                {notas.map((n, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white shadow mt-1.5 shrink-0" />
                      {i < notas.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.texto}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {n.por} · {new Date(n.data).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center justify-between gap-2 border-t pt-4">
          <div className="flex gap-2">
            {!confirmDel ? (
              <button onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            ) : (
              <>
                <button
                  onClick={async () => { setBusy(true); await onExcluir(); setBusy(false); }}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar exclusão"}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="px-3 py-2 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">
              Fechar
            </button>
            <button
              onClick={async () => { setBusy(true); await onRestaurar(); setBusy(false); }}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "↩ Restaurar"}
            </button>
          </div>
        </div>
      </div>
      {fotoAmpliada && <FotoLightbox url={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
    </div>
  );
}

