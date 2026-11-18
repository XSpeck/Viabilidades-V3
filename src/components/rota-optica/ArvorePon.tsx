"use client";

import { useMemo, useState } from "react";
import { corFibra, formatDbm, formatMetros, TIPO_ELEMENTO_LABEL, type RotaOptica } from "@/lib/rotaOptica";
import { caminhoAte, montarArvoresPon, pernasSplitter, type ArvorePon, type NoArvore } from "@/lib/arvorePon";

interface Props {
  rotas: RotaOptica[];
  onAbrirRota: (id: string) => void;
}

const COL = 140;
const ROW = 50;
const PADX = 50;
const PADY = 40;

/** Nome curto para o diagrama: "CE 9786 - TERRENO..." → "CE 9786"; "HUB 0/4/7 OLT1_ST / CTO..." → "HUB 0/4/7 OLT1_ST". */
function nomeCurto(nome: string): string {
  let n = nome.split(" - ")[0].split(" / ")[0].trim();
  if (n.length > 18) n = n.slice(0, 17) + "…";
  return n;
}

function TF(fibra?: number) {
  if (!fibra) return "";
  return `T${Math.ceil(fibra / 12)} F${String(fibra).padStart(2, "0")}`;
}

interface Folha { tipo: "livre"; pai: NoArvore; y: number }

function layout(a: ArvorePon) {
  const y = new Map<NoArvore, number>();
  const livres: Folha[] = [];
  let linha = 0;
  const f = (n: NoArvore) => {
    const pern = pernasSplitter(n);
    const nLivres = pern?.livres ?? 0;
    if (n.filhos.length === 0 && nLivres === 0) {
      y.set(n, linha++);
      return;
    }
    const ys: number[] = [];
    n.filhos.forEach((c) => { f(c); ys.push(y.get(c)!); });
    for (let i = 0; i < nLivres; i++) { livres.push({ tipo: "livre", pai: n, y: linha }); ys.push(linha++); }
    y.set(n, (ys[0] + ys[ys.length - 1]) / 2);
  };
  f(a.raiz);
  const maxD = Math.max(...a.nos.map((n) => n.profundidade)) + (livres.length ? 1 : 0);
  return { y, livres, linhas: Math.max(linha, 1), maxD };
}

export default function ArvorePonView({ rotas, onAbrirRota }: Props) {
  const arvores = useMemo(() => montarArvoresPon(rotas), [rotas]);
  const [chave, setChave] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>("0");

  const arvore = arvores.find((a) => a.chave === chave) ?? arvores[0];

  if (!arvore) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500 text-sm">
        Nenhuma rota salva ainda. Importe ou cadastre rotas para montar a árvore das portas PON.
      </div>
    );
  }

  const sel = arvore.nos.find((n) => n.id === selId) ?? arvore.raiz;
  const { y, livres, linhas, maxD } = layout(arvore);
  const W = PADX * 2 + maxD * COL;
  const H = PADY * 2 + (linhas - 1) * ROW;
  const X = (d: number) => PADX + d * COL;
  const Y = (v: number) => PADY + v * ROW;

  const caminho = new Set(caminhoAte(sel));
  const sub = new Set<NoArvore>();
  const marcar = (n: NoArvore) => { sub.add(n); n.filhos.forEach(marcar); };
  marcar(sel);
  const estado = (n: NoArvore) => (sel === arvore.raiz || caminho.has(n) ? 1 : sub.has(n) ? 0.6 : 0.15);

  return (
    <div className="space-y-4">
      {/* Portas PON */}
      <div className="flex flex-wrap gap-2">
        {arvores.map((a) => {
          const ativo = a === arvore;
          return (
            <button
              key={a.chave}
              type="button"
              onClick={() => { setChave(a.chave); setSelId("0"); }}
              className={`text-left rounded-lg border-2 px-3 py-1.5 text-sm leading-tight ${
                ativo ? "bg-gray-900 border-gray-900 text-white" : "border-gray-900 bg-white text-gray-900 hover:bg-gray-50"
              }`}
            >
              <span className="font-semibold">{a.rotulo}</span>
              <span className={`block text-xs ${ativo ? "text-gray-300" : "text-gray-500"}`}>
                {a.rotas.length} rota{a.rotas.length > 1 ? "s" : ""} · {a.raiz.pontas} ponta{a.raiz.pontas > 1 ? "s" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={Math.max(W, 560)}
              height={H}
              role="img"
              aria-label={`Árvore da ${arvore.rotulo}`}
              className="block"
            >
              {/* Ligações */}
              {arvore.nos.filter((n) => n.pai).map((c) => {
                const p = c.pai!;
                const x1 = X(p.profundidade), y1 = Y(y.get(p)!), x2 = X(c.profundidade), y2 = Y(y.get(c)!);
                const mx = x1 + COL / 2;
                const d = `M${x1} ${y1}H${mx}V${y2}H${x2}`;
                const cor = corFibra(c.elemento.fibra_entrada).hex;
                return (
                  <g key={`l${c.id}`} opacity={estado(c)}>
                    <path d={d} fill="none" stroke="#111827" strokeWidth={6.5} strokeLinejoin="round" />
                    <path d={d} fill="none" stroke={cor} strokeWidth={3.5} strokeLinejoin="round" />
                    {c.elemento.fibra_entrada ? (
                      <text x={(mx + x2) / 2 + 4} y={y2 - 7} fontSize={10} textAnchor="middle" fill="#374151"
                        stroke="#fff" strokeWidth={3} paintOrder="stroke">
                        {TF(c.elemento.fibra_entrada)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {livres.map((l, i) => {
                const p = l.pai;
                const x1 = X(p.profundidade), y1 = Y(y.get(p)!), x2 = X(p.profundidade + 1), y2 = Y(l.y);
                const mx = x1 + COL / 2;
                return (
                  <g key={`f${i}`} opacity={estado(p) === 1 ? 1 : 0.3}>
                    <path d={`M${x1} ${y1}H${mx}V${y2}H${x2}`} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 4" />
                    <circle cx={x2} cy={y2} r={6} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="3 3" />
                    <text x={x2} y={y2 - 12} fontSize={10} textAnchor="middle" fill="#6b7280">perna livre</text>
                  </g>
                );
              })}

              {/* Elementos */}
              {arvore.nos.map((n) => {
                const x = X(n.profundidade), yy = Y(y.get(n)!);
                const t = n.elemento.tipo;
                const ativo = n === sel;
                let forma;
                if (t === "olt") forma = <rect x={x - 11} y={yy - 11} width={22} height={22} rx={3} fill="#111827" />;
                else if (t === "dio") forma = <rect x={x - 10} y={yy - 8} width={20} height={16} rx={2} fill="#fff" stroke="#111827" strokeWidth={2.5} />;
                else if (t === "ceo") forma = <path d={`M${x} ${yy - 11}L${x + 11} ${yy}L${x} ${yy + 11}L${x - 11} ${yy}Z`} fill="#fff" stroke="#111827" strokeWidth={2.5} />;
                else if (t === "hub" || t === "cto") {
                  const R = t === "hub" ? 13 : 11;
                  forma = (
                    <>
                      <circle cx={x} cy={yy} r={R} fill="#111827" />
                      <text x={x} y={yy + 3.5} fontSize={8.5} textAnchor="middle" fill="#fff" fontWeight={700}>
                        {n.elemento.splitter ?? (t === "hub" ? "HUB" : "CTO")}
                      </text>
                    </>
                  );
                } else forma = <circle cx={x} cy={yy} r={6.5} fill="#fff" stroke="#111827" strokeWidth={2.5} />;
                return (
                  <g
                    key={`n${n.id}`}
                    opacity={estado(n)}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.elemento.nome}, ${TIPO_ELEMENTO_LABEL[t]}`}
                    onClick={() => setSelId(n.id)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelId(n.id); } }}
                  >
                    <title>{n.elemento.nome}</title>
                    {ativo && <circle cx={x} cy={yy} r={19} fill="none" stroke="#111827" strokeWidth={2} strokeDasharray="3 3" />}
                    {forma}
                    <text x={x} y={yy - 19} fontSize={11} textAnchor="middle" fontWeight={ativo ? 700 : 500} fill="#111827"
                      stroke="#fff" strokeWidth={3} paintOrder="stroke">
                      {nomeCurto(n.elemento.nome)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-xs text-gray-500 px-4 py-2.5 border-t border-gray-200">
            Rotas que saem da mesma porta da OLT são juntadas: onde passam pelas mesmas caixas (mesmo código PT ou mesmo
            nome) formam o tronco, e onde se separam a árvore ramifica. A linha usa a cor real da fibra (ABNT). Tracejado é
            perna livre de splitter (aparece quando o splitter está informado no elemento).
          </p>
        </section>

        <aside className="bg-white rounded-xl border border-gray-200 p-4 xl:sticky xl:top-4" aria-live="polite">
          {sel === arvore.raiz ? <ResumoPon arvore={arvore} onAbrirRota={onAbrirRota} /> : <DetalheNo no={sel} rotas={arvore.rotas} onAbrirRota={onAbrirRota} />}
        </aside>
      </div>
    </div>
  );
}

function ResumoPon({ arvore, onAbrirRota }: { arvore: ArvorePon; onAbrirRota: (id: string) => void }) {
  const fibra = arvore.nos.reduce((s, n) => s + (n.pai ? n.elemento.distancia_m ?? 0 : 0), 0);
  const livres = arvore.nos.reduce((s, n) => s + (pernasSplitter(n)?.livres ?? 0), 0);
  const comSplitter = arvore.nos.filter((n) => pernasSplitter(n)).length;
  const itens: [string, string][] = [
    ["Rotas juntadas", String(arvore.rotas.length)],
    ["Pontas (fins de rota)", String(arvore.raiz.pontas)],
    ["Fibra lançada", formatMetros(fibra)],
    ["Elementos", String(arvore.nos.length)],
    ["Caixas de emenda", String(arvore.nos.filter((n) => n.elemento.tipo === "ceo").length)],
    ["Pernas livres", comSplitter ? String(livres) : "—"],
  ];
  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-bold text-gray-900 leading-tight">{arvore.rotulo}</p>
        <p className="text-sm text-gray-500">Árvore completa da porta, saindo de {arvore.raiz.elemento.nome}.</p>
      </div>
      <dl className="grid grid-cols-2 border-t border-gray-200">
        {itens.map(([k, v], i) => (
          <div key={k} className={`py-2 border-b border-gray-200 ${i % 2 === 0 ? "pr-2" : ""}`}>
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="text-lg font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      {!comSplitter && (
        <p className="text-xs text-gray-500">
          Para ver pernas livres, informe o splitter (ex.: 1:8) nos hubs e CTOs pela edição da rota.
        </p>
      )}
      <ListaRotas ids={arvore.rotas.map((r) => r.id)} rotas={arvore.rotas} onAbrirRota={onAbrirRota} />
      <p className="text-sm text-gray-500">Clique num elemento da árvore para ver o caminho até ele.</p>
    </div>
  );
}

function ListaRotas({ ids, rotas, onAbrirRota }: { ids: string[]; rotas: RotaOptica[]; onAbrirRota: (id: string) => void }) {
  const lista = rotas.filter((r) => ids.includes(r.id));
  if (!lista.length) return null;
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">Rotas que passam aqui</p>
      <ul className="space-y-1">
        {lista.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onAbrirRota(r.id)} className="text-sm text-indigo-600 hover:underline text-left">
              {r.nome}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetalheNo({ no, rotas, onAbrirRota }: { no: NoArvore; rotas: RotaOptica[]; onAbrirRota: (id: string) => void }) {
  const caminho = caminhoAte(no);
  const e = no.elemento;
  const pot0 = caminho[0].elemento.potencia_entrada ?? caminho[0].elemento.potencia_saida;
  const potAqui = e.potencia_saida ?? e.potencia_entrada;
  const pern = pernasSplitter(no);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-bold text-gray-900 leading-tight">{e.nome}</p>
        <p className="text-sm text-gray-500">
          {TIPO_ELEMENTO_LABEL[e.tipo]}
          {e.codigo ? ` · ${e.codigo}` : ""} · {caminho.length - 1} trecho{caminho.length > 2 ? "s" : ""} desde a OLT
        </p>
      </div>
      <dl className="grid grid-cols-2 border-t border-gray-200">
        <div className="py-2 border-b border-gray-200 pr-2"><dt className="text-xs text-gray-500">Distância da OLT</dt><dd className="text-lg font-bold">{formatMetros(no.distancia)}</dd></div>
        <div className="py-2 border-b border-gray-200"><dt className="text-xs text-gray-500">Potência aqui</dt><dd className="text-lg font-bold">{formatDbm(potAqui)}</dd></div>
        <div className="py-2 border-b border-gray-200 pr-2"><dt className="text-xs text-gray-500">Perda desde a OLT</dt><dd className="text-lg font-bold">{pot0 !== undefined && potAqui !== undefined ? `${(pot0 - potAqui).toFixed(2).replace(".", ",")} dB` : "—"}</dd></div>
        <div className="py-2 border-b border-gray-200"><dt className="text-xs text-gray-500">Ramos a partir daqui</dt><dd className="text-lg font-bold">{no.filhos.length}</dd></div>
      </dl>

      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        Se o trecho que chega aqui romper: <b>{no.pontas} ponta{no.pontas !== 1 ? "s" : ""}</b> e{" "}
        <b>{no.abaixo + 1} elemento{no.abaixo > 0 ? "s" : ""}</b> ficam sem sinal.
      </p>
      {pern && (
        <p className="text-sm text-gray-700">
          Splitter {e.splitter}: <b>{pern.usadas} perna{pern.usadas !== 1 ? "s" : ""} em uso, {pern.livres} livre{pern.livres !== 1 ? "s" : ""}</b>
        </p>
      )}

      <ol className="border-l-2 border-gray-200 space-y-3 pl-4">
        {caminho.map((n, i) => {
          const c = corFibra(n.elemento.fibra_entrada);
          return (
            <li key={n.id} className="relative">
              <span className="absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full bg-gray-900" />
              <p className="text-sm font-semibold text-gray-900 leading-tight">{n.elemento.nome}</p>
              {i > 0 && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {n.elemento.fibra_entrada ? <span className="inline-block w-5 h-2 rounded-full border border-gray-900" style={{ background: c.hex }} /> : null}
                  <span>
                    {n.elemento.cabo_entrada ?? "cabo ?"}
                    {n.elemento.fibra_entrada ? ` · fibra ${n.elemento.fibra_entrada} (${c.nome.toLowerCase()}, ${TF(n.elemento.fibra_entrada)})` : ""}
                    {n.elemento.distancia_m !== undefined ? ` · ${formatMetros(n.elemento.distancia_m)}` : ""}
                  </span>
                </p>
              )}
              {(() => {
                // A saída deste elemento, no caminho, é a chegada do próximo (num nó que ramifica, cada ramo sai por um cabo).
                const prox = caminho[i + 1]?.elemento;
                const ent = n.elemento;
                if (!prox || !ent.cabo_entrada || !prox.cabo_entrada) return null;
                if (ent.cabo_entrada === prox.cabo_entrada && ent.fibra_entrada === prox.fibra_entrada) return null;
                return (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Emenda: {ent.cabo_entrada} {TF(ent.fibra_entrada)} ↔ {prox.cabo_entrada} {TF(prox.fibra_entrada)}
                  </p>
                );
              })()}
            </li>
          );
        })}
      </ol>

      <ListaRotas ids={no.rotas} rotas={rotas} onAbrirRota={onAbrirRota} />
    </div>
  );
}
