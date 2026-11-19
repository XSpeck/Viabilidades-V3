"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, formatDbm, formatMetros, TIPO_ELEMENTO_LABEL, type RotaOptica } from "@/lib/rotaOptica";
import { caminhoAte, chaveElemento, montarArvoresPon, pernasSplitter, type ArvorePon, type NoArvore } from "@/lib/arvorePon";
import type { CaixaRede } from "@/lib/caixasRede";
import { chaveCabo, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import EditorCaixa from "./EditorCaixa";
import QuadroCabo from "./QuadroCabo";

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  cabos: CaboRede[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onCaboSalvo: (c: CaboRede) => void;
  onAbrirRota: (id: string) => void;
}

/** Quadro flutuante aberto em cima da árvore (posição em px dentro da área desenhada). */
type Quadro =
  | { id: string; tipo: "caixa"; noId: string; x: number; y: number }
  | { id: string; tipo: "cabo"; cabo: string; fibra?: number; x: number; y: number };

const LARG_QUADRO = 320;
/** Quadro ainda sem posição (Omit distribuído pela união). */
type QuadroNovo = Quadro extends infer T ? (T extends Quadro ? Omit<T, "x" | "y"> : never) : never;

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

interface Folha { tipo: "livre" | "cliente"; pai: NoArvore; y: number; rotulo?: string }

function layout(a: ArvorePon) {
  const y = new Map<NoArvore, number>();
  const livres: Folha[] = [];
  let linha = 0;
  const f = (n: NoArvore) => {
    const pern = pernasSplitter(n);
    const nLivres = pern?.livres ?? 0;
    const clientes = pern?.portasCliente ?? [];
    if (n.filhos.length === 0 && nLivres === 0 && clientes.length === 0) {
      y.set(n, linha++);
      return;
    }
    const ys: number[] = [];
    n.filhos.forEach((c) => { f(c); ys.push(y.get(c)!); });
    for (const c of clientes) {
      livres.push({ tipo: "cliente", pai: n, y: linha, rotulo: `P${c.numero}${c.descricao ? " · " + c.descricao : ""}` });
      ys.push(linha++);
    }
    for (let i = 0; i < nLivres; i++) { livres.push({ tipo: "livre", pai: n, y: linha }); ys.push(linha++); }
    y.set(n, (ys[0] + ys[ys.length - 1]) / 2);
  };
  f(a.raiz);
  const maxD = Math.max(...a.nos.map((n) => n.profundidade)) + (livres.length ? 1 : 0);
  return { y, livres, linhas: Math.max(linha, 1), maxD };
}

export default function ArvorePonView({ rotas, caixas, cabos, usuario, onCaixaSalva, onCaboSalvo, onAbrirRota }: Props) {
  const arvores = useMemo(() => montarArvoresPon(rotas, caixas), [rotas, caixas]);
  const usoFibras = useMemo(() => usoDasFibras(rotas), [rotas]);
  const [chave, setChave] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>("0");
  const [cheia, setCheia] = useState(false);
  const [zoom, setZoom] = useState(1);
  /** Quadros abertos (caixas e cabos); o último da lista fica por cima */
  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [ultimoAberto, setUltimoAberto] = useState<{ id: string; vez: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const quadroRefs = useRef(new Map<string, HTMLDivElement>());
  const arrasteQuadro = useRef<{ id: string; x: number; y: number; qx: number; qy: number; pid: number } | null>(null);

  // Ao abrir um quadro, rola a área para ele ficar inteiro à vista
  useEffect(() => {
    if (ultimoAberto) quadroRefs.current.get(ultimoAberto.id)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [ultimoAberto]);

  /** Abre (ou traz para frente) um quadro perto do ponto (px, py) da área desenhada. */
  function abrirQuadro(q: QuadroNovo, px: number, py: number, larguraArea: number) {
    setQuadros((qs) => {
      const existente = qs.find((x) => x.id === q.id);
      if (existente) return [...qs.filter((x) => x.id !== q.id), { ...existente, ...q } as Quadro];
      const direita = px + 26;
      const x = direita + LARG_QUADRO <= larguraArea ? direita : Math.max(4, px - 26 - LARG_QUADRO);
      // Cascata leve para quadros abertos no mesmo lugar não ficarem exatamente sobrepostos
      const desloc = (qs.length % 5) * 18;
      return [...qs, { ...q, x: x + desloc, y: Math.max(4, py - 40) + desloc } as Quadro];
    });
    setUltimoAberto((u) => ({ id: q.id, vez: (u?.vez ?? 0) + 1 }));
  }
  function fecharQuadro(id: string) {
    setQuadros((qs) => qs.filter((q) => q.id !== id));
  }
  function trazerParaFrente(id: string) {
    setQuadros((qs) => (qs[qs.length - 1]?.id === id ? qs : [...qs.filter((q) => q.id !== id), qs.find((q) => q.id === id)!]));
  }

  // Arrastar um quadro pela barra de título
  function iniciarArrasteQuadro(e: React.PointerEvent<HTMLDivElement>, q: Quadro) {
    trazerParaFrente(q.id);
    if (e.button !== 0 || !(e.target as HTMLElement).closest("[data-alca]") || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasteQuadro.current = { id: q.id, x: e.clientX, y: e.clientY, qx: q.x, qy: q.y, pid: e.pointerId };
  }
  function arrastarQuadro(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasteQuadro.current;
    if (!a) return;
    const nx = Math.max(0, a.qx + e.clientX - a.x);
    const ny = Math.max(0, a.qy + e.clientY - a.y);
    setQuadros((qs) => qs.map((q) => (q.id === a.id ? { ...q, x: nx, y: ny } : q)));
  }
  function soltarQuadro(e: React.PointerEvent<HTMLDivElement>) {
    if (arrasteQuadro.current && e.currentTarget.hasPointerCapture(arrasteQuadro.current.pid)) {
      e.currentTarget.releasePointerCapture(arrasteQuadro.current.pid);
    }
    arrasteQuadro.current = null;
  }
  const arraste = useRef<{ x: number; y: number; sl: number; st: number; id: number } | null>(null);
  const moveu = useRef(false);

  // Tela cheia: Esc fecha e a página de fundo não rola
  useEffect(() => {
    if (!cheia) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setCheia(false); };
    window.addEventListener("keydown", tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflow;
    };
  }, [cheia]);

  // Arrastar a área com o mouse (clique simples continua selecionando o elemento)
  function iniciarArraste(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || e.button !== 0 || !areaRef.current) return;
    // Dentro de um quadro (campos, botões, barra de título) a área não arrasta
    if ((e.target as HTMLElement).closest("[data-quadro]")) return;
    arraste.current = { x: e.clientX, y: e.clientY, sl: areaRef.current.scrollLeft, st: areaRef.current.scrollTop, id: e.pointerId };
    moveu.current = false;
  }
  function arrastar(e: React.PointerEvent<HTMLDivElement>) {
    const a = arraste.current;
    const el = areaRef.current;
    if (!a || !el) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!moveu.current && Math.abs(dx) + Math.abs(dy) > 4) {
      moveu.current = true;
      el.setPointerCapture(a.id);
    }
    if (moveu.current) {
      el.scrollLeft = a.sl - dx;
      el.scrollTop = a.st - dy;
    }
  }
  function soltar() {
    const a = arraste.current;
    if (a && areaRef.current?.hasPointerCapture(a.id)) areaRef.current.releasePointerCapture(a.id);
    arraste.current = null;
  }

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
  // Margem direita: nomes das portas (até 22 letras) ficam à direita da última coluna; nomes dos elementos são centralizados.
  const W = PADX + maxD * COL + (livres.length ? 170 : 80);
  const H = PADY * 2 + (linhas - 1) * ROW;
  const X = (d: number) => PADX + d * COL;
  const Y = (v: number) => PADY + v * ROW;

  const larguraArea = Math.max(W, 560) * zoom;

  function selecionar(n: NoArvore) {
    setSelId(n.id);
    if (n.elemento.tipo === "olt") return;
    abrirQuadro({ id: `caixa:${n.id}`, tipo: "caixa", noId: n.id }, X(n.profundidade) * zoom, Y(y.get(n)!) * zoom, larguraArea);
  }
  function abrirCabo(n: NoArvore, px: number, py: number) {
    const nomeCabo = n.elemento.cabo_entrada;
    if (!nomeCabo) return;
    abrirQuadro({ id: `cabo:${chaveCabo(nomeCabo)}`, tipo: "cabo", cabo: nomeCabo, fibra: n.elemento.fibra_entrada }, px * zoom, py * zoom, larguraArea);
  }

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
              onClick={() => { setChave(a.chave); setSelId("0"); setQuadros([]); }}
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

      <div
        className={
          cheia
            ? "fixed inset-0 z-50 bg-gray-100 p-3 grid gap-3 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,40%)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]"
            : "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start"
        }
      >
        <section className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${cheia ? "min-h-0" : ""}`}>
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200">
            {cheia && <span className="text-sm font-semibold text-gray-900 mr-2 truncate">{arvore.rotulo}</span>}
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.2) * 10) / 10))}
              className="p-1.5 rounded hover:bg-gray-100"
              aria-label="Diminuir zoom"
              title="Diminuir zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="text-xs tabular-nums w-12 text-center rounded hover:bg-gray-100 py-1"
              title="Voltar para 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.2) * 10) / 10))}
              className="p-1.5 rounded hover:bg-gray-100"
              aria-label="Aumentar zoom"
              title="Aumentar zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <span className="hidden sm:inline text-xs text-gray-400 ml-2">Arraste com o mouse para mover</span>
            <button
              type="button"
              onClick={() => setCheia((c) => !c)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              {cheia ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {cheia ? "Sair da tela cheia" : "Tela cheia"}
            </button>
          </div>
          <div
            ref={areaRef}
            onPointerDown={iniciarArraste}
            onPointerMove={arrastar}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onClickCapture={(e) => {
              if (moveu.current) { e.stopPropagation(); e.preventDefault(); moveu.current = false; }
            }}
            className={`overflow-auto select-none cursor-grab active:cursor-grabbing ${cheia ? "flex-1 min-h-0" : "max-h-[70vh]"}`}
          >
            <div className="relative" style={{ width: Math.max(W, 560) * zoom, minHeight: H * zoom }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              width={Math.max(W, 560) * zoom}
              height={H * zoom}
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
                const temCabo = !!c.elemento.cabo_entrada;
                return (
                  <g
                    key={`l${c.id}`}
                    opacity={estado(c)}
                    className={temCabo ? "cursor-pointer" : undefined}
                    onClick={temCabo ? () => abrirCabo(c, (mx + x2) / 2, y2) : undefined}
                  >
                    {temCabo && <title>{`${c.elemento.cabo_entrada} · fibra ${c.elemento.fibra_entrada ?? "?"} — clique para ver as fibras do cabo`}</title>}
                    {/* área de clique mais larga que a linha */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={16} strokeLinejoin="round" />
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
                const vis = estado(p) === 1 || sub.has(p) ? 1 : 0.3;
                if (l.tipo === "cliente") {
                  const rot = l.rotulo && l.rotulo.length > 22 ? l.rotulo.slice(0, 21) + "…" : l.rotulo;
                  return (
                    <g key={`f${i}`} opacity={vis}>
                      <title>{l.rotulo}</title>
                      <path d={`M${x1} ${y1}H${mx}V${y2}H${x2}`} fill="none" stroke="#374151" strokeWidth={2} />
                      <circle cx={x2} cy={y2} r={6} fill="#fff" stroke="#111827" strokeWidth={2.5} />
                      <text x={x2 + 10} y={y2 + 4} fontSize={10} fill="#111827">{rot}</text>
                    </g>
                  );
                }
                return (
                  <g key={`f${i}`} opacity={vis}>
                    <path d={`M${x1} ${y1}H${mx}V${y2}H${x2}`} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 4" />
                    <circle cx={x2} cy={y2} r={6} fill="none" stroke="#9ca3af" strokeWidth={2} strokeDasharray="3 3" />
                    <text x={x2 + 10} y={y2 + 4} fontSize={10} fill="#6b7280">livre</text>
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
                    onClick={() => selecionar(n)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selecionar(n); } }}
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
            {quadros.map((q, i) => {
              let conteudo: React.ReactNode = null;
              if (q.tipo === "caixa") {
                const no = arvore.nos.find((n) => n.id === q.noId);
                if (!no) return null;
                conteudo = (
                  <EditorCaixa
                    key={chaveElemento(no.elemento)}
                    chave={chaveElemento(no.elemento)}
                    nome={no.elemento.nome}
                    tipo={no.elemento.tipo}
                    caixa={no.caixa}
                    splitterRota={no.elemento.splitter}
                    caboEntrada={no.elemento.cabo_entrada}
                    fibraEntrada={no.elemento.fibra_entrada}
                    ramos={no.filhos.map((f) => f.elemento.nome)}
                    usuario={usuario}
                    onSalva={onCaixaSalva}
                    onFechar={() => fecharQuadro(q.id)}
                  />
                );
              } else {
                const k = chaveCabo(q.cabo);
                conteudo = (
                  <QuadroCabo
                    key={`${k}:${q.fibra ?? ""}`}
                    chave={k}
                    nome={q.cabo}
                    cabo={cabos.find((c) => c.chave === k)}
                    uso={usoFibras.get(k)?.fibras ?? new Map()}
                    fibraDestaque={q.fibra}
                    usuario={usuario}
                    onSalva={onCaboSalvo}
                    onFechar={() => fecharQuadro(q.id)}
                    onAbrirRota={onAbrirRota}
                  />
                );
              }
              return (
                <div
                  key={q.id}
                  ref={(el) => { if (el) quadroRefs.current.set(q.id, el); else quadroRefs.current.delete(q.id); }}
                  data-quadro
                  onPointerDown={(e) => iniciarArrasteQuadro(e, q)}
                  onPointerMove={arrastarQuadro}
                  onPointerUp={soltarQuadro}
                  onPointerCancel={soltarQuadro}
                  className="absolute cursor-auto select-text"
                  style={{ left: q.x, top: q.y, width: LARG_QUADRO, zIndex: 10 + i }}
                >
                  {conteudo}
                </div>
              );
            })}
            </div>
          </div>
          <p className="text-xs text-gray-500 px-4 py-2.5 border-t border-gray-200">
            Rotas que saem da mesma porta da OLT são juntadas: onde passam pelas mesmas caixas (mesmo código PT ou mesmo
            nome) formam o tronco, e onde se separam a árvore ramifica. A linha usa a cor real da fibra (ABNT). Clique num
            HUB ou CTO para cadastrar o splitter e as portas: clientes aparecem como pontas cheias e pernas livres tracejadas.
          </p>
        </section>

        <aside
          className={`bg-white rounded-xl border border-gray-200 p-4 ${cheia ? "overflow-auto min-h-0" : "xl:sticky xl:top-4"}`}
          aria-live="polite"
        >
          {sel === arvore.raiz ? (
            <ResumoPon arvore={arvore} onAbrirRota={onAbrirRota} />
          ) : (
            <DetalheNo no={sel} rotas={arvore.rotas} onAbrirRota={onAbrirRota} onAbrirCaixa={() => selecionar(sel)} />
          )}
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
    ["Clientes cadastrados", String(arvore.raiz.clientes)],
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
          Para ver clientes e pernas livres, clique num HUB ou CTO da árvore e cadastre o splitter e as portas.
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

function DetalheNo({
  no, rotas, onAbrirRota, onAbrirCaixa,
}: {
  no: NoArvore;
  rotas: RotaOptica[];
  onAbrirRota: (id: string) => void;
  onAbrirCaixa: () => void;
}) {
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
        Se o trecho que chega aqui romper:{" "}
        {no.clientes > 0 && <><b>{no.clientes} cliente{no.clientes !== 1 ? "s" : ""}</b>, </>}
        <b>{no.pontas} ponta{no.pontas !== 1 ? "s" : ""} de rota</b> e{" "}
        <b>{no.abaixo + 1} elemento{no.abaixo > 0 ? "s" : ""}</b> ficam sem sinal.
      </p>
      {pern && (
        <p className="text-sm text-gray-700">
          Splitter {pern.splitter}: <b>{pern.clientes} cliente{pern.clientes !== 1 ? "s" : ""}, {pern.ramais} {pern.ramais !== 1 ? "ramais" : "ramal"}, {pern.livres} livre{pern.livres !== 1 ? "s" : ""}</b> de {pern.total}
        </p>
      )}
      {e.tipo !== "olt" && (
        <button
          type="button"
          onClick={onAbrirCaixa}
          className="w-full text-sm px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100"
        >
          {no.caixa ? "Ver diagrama da caixa na árvore" : "Cadastrar diagrama da caixa"}
        </button>
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
                // No elemento clicado (fim do caminho), usa o ramo seguinte quando só existe um.
                const prox = caminho[i + 1]?.elemento ?? (n.filhos.length === 1 ? n.filhos[0].elemento : undefined);
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
