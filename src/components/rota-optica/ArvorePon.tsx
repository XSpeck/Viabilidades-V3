"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Cable as CableIcon, Info, Maximize2, Minimize2, Route as RouteIcon, Signal, Users, Zap, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, formatMetros, TIPO_ELEMENTO_LABEL, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { caminhoAte, chaveElemento, dentroDePredio, ehVolta, filhosReais, voltaDe, montarArvoresPon, pernasSplitter, splittersDoNo, type ArvorePon, type NoArvore } from "@/lib/arvorePon";
import { rotuloSplitters, type CaixaRede } from "@/lib/caixasRede";
import { chaveCabo, semCodigo, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import EditorCaixa from "./EditorCaixa";
import PredioVertical from "./PredioVertical";
import { idPredioDoElemento, listarPredios, rotasComPredios, type PredioRede } from "@/lib/prediosRede";
import PrimarioHub from "./PrimarioHub";
import CaixaCto from "./CaixaCto";
import CaixaCeo from "./CaixaCeo";
import CaixaCt from "./CaixaCt";
import CaixaDio from "./CaixaDio";
import DiagramaEmendas from "./DiagramaEmendas";
import QuadroCabo from "./QuadroCabo";
import { Janela } from "./Janelas";
import BuscaRede from "./BuscaRede";
import { DESENHO_CABO, IconeCabo, IconeElemento, IconeElementoSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  cabos: CaboRede[];
  catalogo: ItemCatalogo[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onCaboSalvo: (c: CaboRede) => void;
  onAbrirRota: (id: string) => void;
  /** Rotas criadas fora do editor (ex.: CDOI nova no prédio): recarregar */
  onRotasMudaram?: () => void;
}

/** Janela aberta sobre a árvore (posição inicial na tela). */
type JanelaArv =
  | { id: string; tipo: "no"; noId: string; x: number; y: number }
  | { id: string; tipo: "cabo"; cabo: string; fibra?: number; x: number; y: number }
  | { id: string; tipo: "resumo"; x: number; y: number };
/** Janela ainda sem posição (Omit distribuído pela união). */
type JanelaNova = JanelaArv extends infer T ? (T extends JanelaArv ? Omit<T, "x" | "y"> : never) : never;

const COL = 180;
const ROW = 54;
const PADX = 50;
const PADY = 44;

/** Nome curto para o diagrama: "CE 9786 - TERRENO..." → "CE 9786"; "HUB 0/4/7 OLT1_ST / CTO..." → "HUB 0/4/7 OLT1_ST". */
function nomeCurto(nome: string): string {
  return cortar(nome.split(" - ")[0].split(" / ")[0].trim(), 20, nome);
}

function TF(fibra?: number, cabo?: string) {
  return corFibra(fibra, cabo).rotulo;
}

/** Tem splitter/portas para mostrar no diagrama da caixa */
function temDiagrama(n: NoArvore) {
  const t = tipoVisual(n.elemento);
  return !!(n.caixa?.splitter || n.elemento.splitter || t === "hub" || t === "cto" || t === "cdoi");
}

interface Folha { tipo: "livre" | "cliente"; pai: NoArvore; y: number; rotulo?: string }

function layout(a: ArvorePon) {
  const y = new Map<NoArvore, number>();
  const livres: Folha[] = [];
  let linha = 0;
  const f = (n: NoArvore) => {
    if (n.elemento.tipo === "predio") {
      y.set(n, linha++);
      return;
    }
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
  const maxD = Math.max(...a.nos.filter((n) => !dentroDePredio(n)).map((n) => n.profundidade)) + (livres.length ? 1 : 0);
  return { y, livres, linhas: Math.max(linha, 1), maxD };
}

export default function ArvorePonView({ rotas, caixas, cabos, catalogo, usuario, onCaixaSalva, onCaboSalvo, onAbrirRota, onRotasMudaram }: Props) {
  /** Prédios: agrupam as CDOIs na árvore e entram como destino das fibras de um cabo */
  const [predios, setPredios] = useState<PredioRede[]>([]);
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setPredios(ps)).catch(() => {});
    return () => { vivo = false; };
    // rotas mudaram (rota salva, CDOI nova): o prédio pode ter mudado junto
  }, [rotas]);
  const arvores = useMemo(() => montarArvoresPon(rotasComPredios(rotas, predios), caixas), [rotas, caixas, predios]);
  const usoFibras = useMemo(() => usoDasFibras(rotas), [rotas]);
  const [chave, setChave] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>("0");
  const [cheia, setCheia] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [janelas, setJanelas] = useState<JanelaArv[]>([]);
  /** Elemento escolhido na busca: a área rola até ele */
  const [foco, setFoco] = useState<{ id: string; vez: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  /** Abre uma janela perto do ponto clicado (ou traz para frente a que já está aberta). */
  function abrirJanela(j: JanelaNova, cx: number, cy: number) {
    setJanelas((js) => {
      if (js.some((x) => x.id === j.id)) return [...js.filter((x) => x.id !== j.id), { ...js.find((x) => x.id === j.id)!, ...j } as JanelaArv];
      const desloc = (js.length % 5) * 22;
      return [...js, { ...j, x: cx + 28 + desloc, y: cy - 60 + desloc } as JanelaArv];
    });
  }
  /** Caixas que este cabo alcança (primeiro) e as demais caixas da rede, para o destino de uma fibra */
  function destinosDoCabo(k: string) {
    const doCabo = new Set<string>();
    const todas = new Set<string>();
    for (const r of rotas) {
      r.elementos.forEach((e, i) => {
        if (i === 0 || e.tipo === "olt" || e.tipo === "dio" || e.tipo === "onu") return;
        todas.add(e.nome);
        if (e.cabo_entrada && chaveCabo(e.cabo_entrada) === k) doCabo.add(e.nome);
      });
    }
    // CDOIs dos prédios (inclusive as ainda sem rota, com fibra planejada neste cabo)
    for (const p of predios) {
      for (const o of p.pontos) {
        todas.add(o.nome);
        if (o.cabo && chaveCabo(o.cabo) === k) doCabo.add(o.nome);
      }
    }
    return [
      ...[...doCabo].sort().map((nome) => ({ nome, doCabo: true })),
      ...[...todas].filter((x) => !doCabo.has(x)).sort().map((nome) => ({ nome, doCabo: false })),
    ];
  }

  function fecharJanela(id: string) {
    setJanelas((js) => js.filter((j) => j.id !== id));
  }

  useEffect(() => {
    if (!foco) return;
    const t = window.setTimeout(() => {
      areaRef.current?.querySelector(`[data-no="${foco.id}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [foco]);

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
  // Margem direita: nomes das portas (até 22 letras) ficam à direita da última coluna
  const W = PADX + maxD * COL + (livres.length ? 180 : 90);
  const H = PADY * 2 + (linhas - 1) * ROW;
  const X = (d: number) => PADX + d * COL;
  const Y = (v: number) => PADY + v * ROW;

  function pontoNaTela(px: number, py: number) {
    const r = areaRef.current?.querySelector("svg")?.getBoundingClientRect();
    return r ? { x: r.left + px * zoom, y: r.top + py * zoom } : { x: 200, y: 200 };
  }

  function selecionar(n: NoArvore, cx?: number, cy?: number) {
    setSelId(n.id);
    const p = cx !== undefined && cy !== undefined ? { x: cx, y: cy } : pontoNaTela(X(n.profundidade), Y(y.get(n)!));
    if (n === arvore.raiz) abrirJanela({ id: "resumo", tipo: "resumo" }, p.x, p.y);
    else abrirJanela({ id: `no:${n.id}`, tipo: "no", noId: n.id }, p.x, p.y);
  }
  function abrirCabo(n: NoArvore, cx: number, cy: number) {
    const nomeCabo = n.elemento.cabo_entrada;
    if (!nomeCabo) return;
    abrirJanela({ id: `cabo:${chaveCabo(nomeCabo)}`, tipo: "cabo", cabo: nomeCabo, fibra: n.elemento.fibra_entrada }, cx, cy);
  }

  const caminho = new Set(caminhoAte(sel));
  const sub = new Set<NoArvore>();
  const marcar = (n: NoArvore) => { sub.add(n); n.filhos.forEach(marcar); };
  marcar(sel);
  const estado = (n: NoArvore) => (sel === arvore.raiz || caminho.has(n) ? 1 : sub.has(n) ? 0.6 : 0.18);

  return (
    <div className="space-y-4">
      <BuscaRede
        rotas={rotas}
        arvores={arvores}
        onRota={(id, ch) => {
          if (ch && ch !== arvore.chave) { setChave(ch); setSelId("0"); setJanelas([]); }
          onAbrirRota(id);
        }}
        onElemento={(ch, noId) => {
          if (ch !== arvore.chave) { setChave(ch); setJanelas([]); }
          setSelId(noId);
          setFoco((f) => ({ id: noId, vez: (f?.vez ?? 0) + 1 }));
          abrirJanela({ id: `no:${noId}`, tipo: "no", noId }, Math.max(20, window.innerWidth - 480), 120);
        }}
        onCabo={(nome) => abrirJanela({ id: `cabo:${chaveCabo(nome)}`, tipo: "cabo", cabo: nome }, Math.max(20, window.innerWidth / 2 - 200), 140)}
      />

      {/* Portas PON */}
      <div className="flex flex-wrap gap-2">
        {arvores.map((a) => {
          const ativo = a === arvore;
          return (
            <button
              key={a.chave}
              type="button"
              onClick={() => { setChave(a.chave); setSelId("0"); setJanelas([]); }}
              className={`flex items-center gap-2 text-left rounded-lg border-2 px-3 py-1.5 text-sm leading-tight ${
                ativo ? "bg-slate-900 border-slate-900 text-white" : "border-slate-300 bg-white text-gray-900 hover:border-slate-500"
              }`}
            >
              <IconeElemento tipo="olt" tamanho={22} />
              <span>
                <span className="font-semibold">{a.rotulo}</span>
                <span className={`block text-xs ${ativo ? "text-slate-300" : "text-gray-500"}`}>
                  {a.rotas.length} rota{a.rotas.length > 1 ? "s" : ""} · {a.raiz.pontas} ponta{a.raiz.pontas > 1 ? "s" : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section
        className={`bg-white border border-gray-200 overflow-hidden flex flex-col ${
          cheia ? "fixed inset-0 z-50 rounded-none" : "rounded-xl"
        }`}
      >
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-slate-50">
          {cheia && <span className="text-sm font-semibold text-gray-900 mr-2 truncate">{arvore.rotulo}</span>}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.2) * 10) / 10))}
            className="p-1.5 rounded hover:bg-gray-200"
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setZoom(1)} className="text-xs tabular-nums w-12 text-center rounded hover:bg-gray-200 py-1" title="Voltar para 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.2) * 10) / 10))}
            className="p-1.5 rounded hover:bg-gray-200"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => abrirJanela({ id: "resumo", tipo: "resumo" }, e.clientX, e.clientY + 40)}
            className="ml-2 flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            <Info className="w-3.5 h-3.5" /> Resumo da porta
          </button>
          <span className="hidden md:inline text-xs text-gray-400 ml-2">Arraste para mover · clique numa caixa ou num cabo para abrir a janela</span>
          <button
            type="button"
            onClick={() => setCheia((c) => !c)}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
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
          className={`overflow-auto select-none cursor-grab active:cursor-grabbing bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:18px_18px] ${
            cheia ? "flex-1 min-h-0" : "max-h-[72vh]"
          }`}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={Math.max(W, 560) * zoom}
            height={H * zoom}
            role="img"
            aria-label={`Árvore da ${arvore.rotulo}`}
            className="block"
          >
            {/* Ligações (cabos) */}
            {arvore.nos.filter((n) => n.pai && !dentroDePredio(n)).map((c) => {
              const p = c.pai!;
              const x1 = X(p.profundidade), y1 = Y(y.get(p)!), x2 = X(c.profundidade), y2 = Y(y.get(c)!);
              const mx = x1 + COL / 2;
              const d = `M${x1} ${y1}H${mx}V${y2}H${x2}`;
              const cor = corFibra(c.elemento.fibra_entrada, c.elemento.cabo_entrada).hex;
              const temCabo = !!c.elemento.cabo_entrada;
              const nFibrasPredio = c.elemento.tipo === "predio" ? new Set(filhosReais(c).map((x) => x.elemento.fibra_entrada)).size : 0;
              // cabo de ida e volta (HUB → CTO → HUB): as duas fibras no mesmo trecho
              const volta = voltaDe(c);
              const corVolta = volta ? corFibra(volta.elemento.fibra_entrada, volta.elemento.cabo_entrada).hex : null;
              const eVolta = ehVolta(c);
              const rot = eVolta
                ? `↩ volta F${c.elemento.fibra_entrada ?? "?"}`
                : volta
                  ? `F${c.elemento.fibra_entrada ?? "?"} ⇄ F${volta.elemento.fibra_entrada ?? "?"}`
                  : nFibrasPredio > 1 ? `${nFibrasPredio} fibras` : c.elemento.fibra_entrada ? TF(c.elemento.fibra_entrada, c.elemento.cabo_entrada) : "cabo";
              const lw = 36 + rot.length * 6;
              // Reta: etiqueta no meio do trecho; ramo: no trecho horizontal final, longe do ícone
              const ex = y1 === y2 ? (x1 + x2) / 2 : (mx + x2 - 16) / 2;
              return (
                <g
                  key={`l${c.id}`}
                  opacity={estado(c)}
                  className={temCabo ? "cursor-pointer" : undefined}
                  onClick={temCabo ? (ev) => abrirCabo(c, ev.clientX, ev.clientY) : undefined}
                >
                  {temCabo && <title>{`${c.elemento.cabo_entrada} · fibra ${c.elemento.fibra_entrada ?? "?"} — clique para ver as fibras do cabo`}</title>}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} strokeLinejoin="round" />
                  {eVolta ? (
                    <path d={d} fill="none" stroke={cor} strokeWidth={2.2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
                  ) : corVolta ? (
                    <>
                      <path d={d} fill="none" stroke="#0f172a" strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" />
                      <path d={d} transform="translate(0 -1.8)" fill="none" stroke={cor} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
                      <path d={d} transform="translate(0 1.8)" fill="none" stroke={corVolta} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
                    </>
                  ) : (
                    <>
                      <path d={d} fill="none" stroke="#0f172a" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
                      <path d={d} fill="none" stroke={cor} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
                    </>
                  )}
                  {temCabo && (
                    <g transform={`translate(${ex - lw / 2} ${y2 - 9})`}>
                      <rect width={lw} height={18} rx={9} fill="#fff" stroke="#0f172a" strokeWidth={1.3} />
                      <svg x={2} y={2} width={14} height={14} viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: DESENHO_CABO }} />
                      {corVolta ? (
                        <>
                          <path d={`M${lw - 9} 5 A4 4 0 0 0 ${lw - 9} 13 Z`} fill={cor} stroke="#0f172a" strokeWidth={0.8} />
                          <path d={`M${lw - 9} 5 A4 4 0 0 1 ${lw - 9} 13 Z`} fill={corVolta} stroke="#0f172a" strokeWidth={0.8} />
                        </>
                      ) : (
                        <circle cx={lw - 9} cy={9} r={4} fill={cor} stroke="#0f172a" strokeWidth={1} />
                      )}
                      <text x={19} y={12.6} fontSize={9.5} fontWeight={600} fill="#0f172a">{rot}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {livres.map((l, i) => {
              const p = l.pai;
              const x1 = X(p.profundidade), y1 = Y(y.get(p)!), x2 = X(p.profundidade + 1), y2 = Y(l.y);
              const mx = x1 + COL / 2;
              const vis = estado(p) === 1 || sub.has(p) ? 1 : 0.3;
              if (l.tipo === "cliente") {
                const rot = l.rotulo ? cortar(l.rotulo, 22) : l.rotulo;
                return (
                  <g key={`f${i}`} opacity={vis}>
                    <title>{l.rotulo}</title>
                    <path d={`M${x1} ${y1}H${mx}V${y2}H${x2}`} fill="none" stroke="#475569" strokeWidth={2} />
                    <IconeElementoSvg tipo="onu" x={x2} y={y2} tamanho={20} />
                    <text x={x2 + 13} y={y2 + 4} fontSize={10} fill="#0f172a">{rot}</text>
                  </g>
                );
              }
              return (
                <g key={`f${i}`} opacity={vis}>
                  <path d={`M${x1} ${y1}H${mx}V${y2}H${x2}`} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" />
                  <circle cx={x2} cy={y2} r={6} fill="#fff" stroke="#94a3b8" strokeWidth={2} strokeDasharray="3 3" />
                  <text x={x2 + 11} y={y2 + 4} fontSize={10} fill="#64748b">livre</text>
                </g>
              );
            })}

            {/* Elementos */}
            {arvore.nos.filter((n) => !dentroDePredio(n)).map((n) => {
              const x = X(n.profundidade), yy = Y(y.get(n)!);
              const t = tipoVisual(n.elemento);
              const ativo = n === sel;
              const spl0 = n.elemento.passagem
                ? "passagem"
                : n.caixa?.splitters?.length
                  ? rotuloSplitters(splittersDoNo(n)) || undefined
                  : n.caixa?.splitter ?? n.elemento.splitter;
              // HUB de meia porta: o 1:2 antes do primário
              const spl = n.elemento.tipo === "hub" && n.elemento.meia_porta && !n.elemento.passagem ? `½ porta${spl0 ? ` · ${spl0}` : ""}` : spl0;
              const tam = t === "olt" || t === "predio" ? 36 : t === "onu" || t === "outro" ? 24 : 30;
              return (
                <g
                  key={`n${n.id}`}
                  data-no={n.id}
                  opacity={estado(n)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.elemento.nome}, ${TIPO_ELEMENTO_LABEL[t]}`}
                  onClick={(ev) => selecionar(n, ev.clientX, ev.clientY)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selecionar(n); } }}
                >
                  <title>{n.elemento.nome}</title>
                  {ativo && <circle cx={x} cy={yy} r={tam / 2 + 7} fill="#fef9c3" stroke="#ca8a04" strokeWidth={2} />}
                  <IconeElementoSvg tipo={t} x={x} y={yy} tamanho={tam} />
                  {t === "predio" && (() => {
                    const q = filhosReais(n).length;
                    const txt = `${q} CDOI${q !== 1 ? "s" : ""}`;
                    return (
                      <g transform={`translate(${x + 8} ${yy + 6})`}>
                        <rect width={txt.length * 5.6 + 10} height={14} rx={7} fill="#0284c7" stroke="#fff" strokeWidth={1.2} />
                        <text x={(txt.length * 5.6 + 10) / 2} y={10.2} fontSize={9} fontWeight={700} fill="#fff" textAnchor="middle">{txt}</text>
                      </g>
                    );
                  })()}
                  {spl && (
                    <g transform={`translate(${x + 7} ${yy + 6})`}>
                      <rect width={spl.length * 6 + 8} height={14} rx={7} fill="#0f172a" stroke="#fff" strokeWidth={1.2} />
                      <text x={(spl.length * 6 + 8) / 2} y={10.2} fontSize={9} fontWeight={700} fill="#fff" textAnchor="middle">{spl}</text>
                    </g>
                  )}
                  <text x={x} y={yy - tam / 2 - 6} fontSize={11} textAnchor="middle" fontWeight={ativo ? 700 : 600} fill="#0f172a"
                    stroke="#fff" strokeWidth={3.5} paintOrder="stroke">
                    {ehVolta(n) ? `↩ ${nomeCurto(n.elemento.nome)}` : nomeCurto(n.elemento.nome)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <details className="group border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          <summary className="cursor-pointer select-none list-none font-medium text-gray-400 hover:text-gray-600">ⓘ Como ler a árvore</summary>
          <p className="mt-1.5">
            Rotas que saem da mesma porta da OLT são juntadas: onde passam pelas mesmas caixas formam o tronco e onde se separam a
            árvore ramifica. A linha usa a cor real da fibra e a etiqueta mostra tubo e fibra. Cada janela pode ser arrastada,
            minimizada ou fixada ao lado.
          </p>
        </details>
      </section>

      {janelas.map((j) => {
        if (j.tipo === "resumo") {
          return (
            <Janela
              key={j.id}
              inicial={{ x: j.x, y: j.y }}
              titulo={arvore.rotulo}
              subtitulo="Resumo da porta PON"
              icone={<IconeElemento tipo="olt" tamanho={22} />}
              onFechar={() => fecharJanela(j.id)}
            >
              <div className="p-3"><ResumoPon arvore={arvore} onAbrirRota={onAbrirRota} /></div>
            </Janela>
          );
        }
        if (j.tipo === "cabo") {
          const k = chaveCabo(j.cabo);
          const cabo = cabos.find((c) => c.chave === k);
          return (
            <Janela
              key={j.id}
              inicial={{ x: j.x, y: j.y }}
              titulo={semCodigo(j.cabo)}
              subtitulo={j.fibra ? `Cabo · fibra ${j.fibra} destacada` : "Cabo"}
              icone={<IconeCabo tamanho={22} />}
              corBarra="bg-indigo-900"
              largura={380}
              onFechar={() => fecharJanela(j.id)}
            >
              <QuadroCabo
                key={`${k}:${j.fibra ?? ""}`}
                chave={k}
                nome={j.cabo}
                cabo={cabo}
                uso={usoFibras.get(k)?.fibras ?? new Map()}
                fibraDestaque={j.fibra}
                tipos={catalogo.filter((t) => t.categoria === "cabo")}
                usuario={usuario}
                onSalva={onCaboSalvo}
                onFechar={() => fecharJanela(j.id)}
                onAbrirRota={onAbrirRota}
                destinos={destinosDoCabo(k)}
                semMoldura
              />
            </Janela>
          );
        }
        const no = arvore.nos.find((n) => n.id === j.noId);
        if (!no) return null;
        const t = tipoVisual(no.elemento);
        return (
          <Janela
            key={j.id}
            inicial={{ x: j.x, y: j.y }}
            titulo={no.elemento.nome}
            subtitulo={t === "predio" ? `Prédio · ${filhosReais(no).length} CDOI${filhosReais(no).length !== 1 ? "s" : ""}` : `${TIPO_ELEMENTO_LABEL[t]}${no.elemento.codigo ? ` · ${no.elemento.codigo}` : ""}`}
            icone={<IconeElemento tipo={t} tamanho={22} />}
            largura={460}
            onFechar={() => fecharJanela(j.id)}
          >
            <JanelaNo
              no={no}
              rotas={arvore.rotas}
              todasRotas={rotas}
              caixas={caixas}
              onRotasMudaram={onRotasMudaram}
              onAbrirNo={(id) => abrirJanela({ id: `no:${id}`, tipo: "no", noId: id }, Math.max(20, window.innerWidth - 500), 140)}
              catalogo={catalogo}
              usuario={usuario}
              onCaixaSalva={onCaixaSalva}
              onAbrirRota={onAbrirRota}
              onFechar={() => fecharJanela(j.id)}
            />
          </Janela>
        );
      })}
    </div>
  );
}

/** Conteúdo da janela de um elemento: abas Diagrama (splitter/portas) e Caminho (desde a OLT). */
function JanelaNo({
  no, rotas, todasRotas, caixas, catalogo, usuario, onCaixaSalva, onAbrirRota, onFechar, onAbrirNo, onRotasMudaram,
}: {
  onRotasMudaram?: () => void;
  onAbrirNo: (id: string) => void;
  no: NoArvore;
  rotas: RotaOptica[];
  todasRotas: RotaOptica[];
  caixas: CaixaRede[];
  catalogo: ItemCatalogo[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onAbrirRota: (id: string) => void;
  onFechar: () => void;
}) {
  const ehPredio = no.elemento.tipo === "predio";
  const ehCdoi = tipoVisual(no.elemento) === "cdoi";
  const ehHub = tipoVisual(no.elemento) === "hub";
  const ehCto = tipoVisual(no.elemento) === "cto";
  const ehCeo = tipoVisual(no.elemento) === "ceo";
  const ehCt = tipoVisual(no.elemento) === "ct";
  const ehDio = no.elemento.tipo === "dio";
  const [aba, setAba] = useState<"primario" | "cto" | "cdoi" | "ceo" | "ct" | "dio" | "predio" | "emendas" | "diagrama" | "caminho">(
    ehDio ? "dio" : ehHub ? "primario" : ehCto ? "cto" : ehCdoi ? "cdoi" : ehCeo ? "ceo" : ehCt ? "ct" : ehPredio ? "predio" : temDiagrama(no) ? "diagrama" : "emendas",
  );
  /** CDOIs do prédio (descendentes do nó) para abrir a janela de cada uma */
  const abrirCdoi = (k: string) => {
    const todos = (n: NoArvore): NoArvore[] => [n, ...n.filhos.flatMap(todos)];
    const alvo = todos(no).find((x) => chaveElemento(x.elemento) === k);
    if (alvo) onAbrirNo(alvo.id);
  };
  /** HUB: o Primário mostra; "Editar" troca, no mesmo lugar, pelo editor do splitter e das portas */
  const [editandoHub, setEditandoHub] = useState(false);
  return (
    <div>
      <div className="flex border-b border-gray-200 bg-slate-50 text-xs font-medium" role="tablist">
        {([
          ...(ehHub ? ([["primario", "Primário"]] as const) : []),
          ...(ehCto ? ([["cto", "CTO"]] as const) : []),
          ...(ehCdoi ? ([["cdoi", "CDOI"]] as const) : []),
          ...(ehCeo ? ([["ceo", "Emendas (CEO)"]] as const) : []),
          ...(ehCt ? ([["ct", "CT"]] as const) : []),
          ...(ehDio ? ([["dio", "DIO"]] as const) : []),
          ...(ehCdoi || ehPredio ? ([["predio", "Prédio"]] as const) : []),
          ...(ehPredio || ehCeo || ehDio ? [] : ([["emendas", "Emendas"]] as const)),
          ...(ehHub || ehPredio || ehCto || ehCdoi || ehCt || ehDio ? [] : ([["diagrama", "Splitter e portas"]] as const)),
          ["caminho", "Caminho e potência"],
        ] as const).map(([k, r]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={`flex-1 px-3 py-2 border-b-2 -mb-px ${aba === k ? "border-indigo-600 text-indigo-700 bg-white" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {r}
          </button>
        ))}
      </div>
      {aba === "primario" ? (
        editandoHub ? (
          <CaixaCto
            key={`edhub-${chaveElemento(no.elemento)}`}
            no={no}
            rotas={todasRotas}
            modelos={catalogo.filter((m) => m.categoria === "splitter")}
            usuario={usuario}
            onSalva={onCaixaSalva}
            saidas={filhosReais(no).map((f) => ({ nome: f.elemento.nome, cabo: f.elemento.cabo_entrada, fibra: f.elemento.fibra_entrada }))}
            tipoCaixa="HUB"
            soEdicao
            onFechar={() => setEditandoHub(false)}
          />
        ) : (
          <PrimarioHub no={no} rotas={todasRotas} catalogo={catalogo} onAbrirNo={onAbrirNo} onEditarPortas={() => setEditandoHub(true)} />
        )
      ) : aba === "dio" ? (
        <CaixaDio no={no} rotas={todasRotas} catalogo={catalogo} />
      ) : aba === "ct" ? (
        <CaixaCt key={`ct-${chaveElemento(no.elemento)}-${no.caixa?.atualizado_em ?? ""}`} no={no} rotas={todasRotas} modelos={catalogo.filter((m) => m.categoria === "splitter")} usuario={usuario} onSalva={onCaixaSalva} />
      ) : aba === "ceo" ? (
        <CaixaCeo key={`ceo-${chaveElemento(no.elemento)}-${no.caixa?.atualizado_em ?? ""}`} no={no} rotas={todasRotas} usuario={usuario} onSalva={onCaixaSalva} />
      ) : aba === "cto" ? (
        <CaixaCto
          key={`cto-${chaveElemento(no.elemento)}-${no.caixa?.atualizado_em ?? ""}`}
          no={no}
          rotas={todasRotas}
          modelos={catalogo.filter((m) => m.categoria === "splitter")}
          usuario={usuario}
          onSalva={onCaixaSalva}
          saidas={filhosReais(no).map((f) => ({ nome: f.elemento.nome, cabo: f.elemento.cabo_entrada, fibra: f.elemento.fibra_entrada }))}
        />
      ) : aba === "cdoi" ? (
        <CaixaCto
          key={`cdoi-${chaveElemento(no.elemento)}-${no.caixa?.atualizado_em ?? ""}`}
          no={no}
          rotas={todasRotas}
          modelos={catalogo.filter((m) => m.categoria === "splitter")}
          usuario={usuario}
          onSalva={onCaixaSalva}
          saidas={filhosReais(no).map((f) => ({ nome: f.elemento.nome, cabo: f.elemento.cabo_entrada, fibra: f.elemento.fibra_entrada }))}
          tipoCaixa="CDOI"
        />
      ) : aba === "predio" ? (
        <PredioVertical
          chave={ehPredio ? chaveElemento((filhosReais(no)[0] ?? no).elemento) : chaveElemento(no.elemento)}
          nome={ehPredio ? (filhosReais(no)[0] ?? no).elemento.nome : no.elemento.nome} predioId={idPredioDoElemento(no.elemento) ?? undefined} rotas={todasRotas} caixas={caixas} usuario={usuario} onAbrirRota={onAbrirRota} onRotasMudaram={onRotasMudaram} modelosSplitter={catalogo.filter((m) => m.categoria === "splitter")} onAbrirCdoi={abrirCdoi} />
      ) : aba === "emendas" ? (
        <DiagramaEmendas chave={chaveElemento(no.elemento)} nome={no.elemento.nome} rotas={rotas} />
      ) : aba === "diagrama" ? (
        <EditorCaixa
          key={chaveElemento(no.elemento)}
          chave={chaveElemento(no.elemento)}
          nome={no.elemento.nome}
          tipo={no.elemento.tipo}
          caixa={no.caixa}
          splitterRota={no.elemento.splitter}
          modeloRota={no.elemento.splitter_modelo}
          caboEntrada={no.elemento.cabo_entrada}
          fibraEntrada={no.elemento.fibra_entrada}
          ramos={filhosReais(no).map((f) => f.elemento.nome)}
          saidas={filhosReais(no).map((f) => ({ nome: f.elemento.nome, cabo: f.elemento.cabo_entrada, fibra: f.elemento.fibra_entrada }))}
          modelos={catalogo.filter((m) => m.categoria === "splitter")}
          usuario={usuario}
          onSalva={onCaixaSalva}
          onFechar={onFechar}
          potenciaEntrada={no.elemento.potencia_entrada}
          semMoldura
        />
      ) : (
        <div className="p-3">
          <DetalheNo no={no} rotas={rotas} onAbrirRota={onAbrirRota} onAbrirCaixa={() => setAba(ehDio ? "dio" : ehHub ? "primario" : ehCto ? "cto" : ehCdoi ? "cdoi" : ehCeo ? "ceo" : ehCt ? "ct" : ehPredio ? "predio" : "diagrama")} />
        </div>
      )}
    </div>
  );
}

function ResumoPon({ arvore, onAbrirRota }: { arvore: ArvorePon; onAbrirRota: (id: string) => void }) {
  const fibra = arvore.nos.reduce((s, n) => s + (n.pai ? n.elemento.distancia_m ?? 0 : 0), 0);
  const pernas = arvore.nos.map((n) => pernasSplitter(n)).filter((p): p is NonNullable<typeof p> => !!p);
  const tot = pernas.reduce(
    (a, p) => ({ total: a.total + p.total, clientes: a.clientes + p.clientes, ramais: a.ramais + p.ramais, livres: a.livres + p.livres }),
    { total: 0, clientes: 0, ramais: 0, livres: 0 }
  );
  const porTipo = new Map<ReturnType<typeof tipoVisual>, number>();
  arvore.nos.forEach((n) => { if (n.pai) { const t = tipoVisual(n.elemento); porTipo.set(t, (porTipo.get(t) ?? 0) + 1); } });
  const potPorta = arvore.raiz.elemento.potencia_entrada ?? arvore.raiz.elemento.potencia_saida;
  const pontas = arvore.nos.filter((n) => n.filhos.length === 0 && n.pai);
  const comPot = pontas
    .map((n) => ({ n, p: n.elemento.potencia_saida ?? n.elemento.potencia_entrada }))
    .filter((x): x is { n: NoArvore; p: number } => x.p !== undefined);
  const pior = comPot.sort((a, b) => a.p - b.p)[0];
  const nvPior = nivelPotencia(pior?.p);
  const maisLonge = pontas.reduce<NoArvore | undefined>((m, n) => (!m || n.distancia > m.distancia ? n : m), undefined);
  const ORDEM: ReturnType<typeof tipoVisual>[] = ["dio", "ceo", "ct", "hub", "cto", "predio", "cdoi", "onu", "outro"];
  const pct = (v: number) => (tot.total ? (v / tot.total) * 100 : 0);

  const tiles: { icone: React.ReactNode; rotulo: string; valor: string; detalhe?: string; cor?: string }[] = [
    { icone: <CableIcon className="w-4 h-4" />, rotulo: "Fibra lançada", valor: formatMetros(fibra), detalhe: maisLonge ? `ponta mais longe: ${formatMetros(maisLonge.distancia)}` : undefined },
    { icone: <Users className="w-4 h-4" />, rotulo: "Clientes", valor: String(arvore.raiz.clientes), detalhe: tot.total ? `${tot.livres} porta${tot.livres !== 1 ? "s" : ""} livre${tot.livres !== 1 ? "s" : ""}` : "cadastre os splitters" },
    { icone: <Zap className="w-4 h-4" />, rotulo: "Porta PON", valor: potPorta !== undefined ? `${dbm(potPorta)} dBm` : "—", detalhe: "potência de saída" },
    { icone: <Signal className="w-4 h-4" />, rotulo: "Pior ponta", valor: pior ? `${dbm(pior.p)} dBm` : "—", detalhe: pior ? curtoNome(pior.n.elemento.nome) : "sem medida", cor: pior ? nvPior.cor : undefined },
  ];

  return (
    <div className="space-y-3">
      {/* Cabeçalho */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white p-3.5 flex items-center gap-3">
        <span className="rounded-xl bg-white/10 p-1.5"><IconeElemento tipo="olt" tamanho={40} /></span>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight truncate">{arvore.rotulo}</p>
          <p className="text-xs text-slate-300 truncate">saindo de {arvore.raiz.elemento.nome}</p>
          <div className="flex gap-1.5 mt-1.5 text-[10px] font-semibold">
            <span className="rounded-full bg-white/15 px-2 py-0.5">{arvore.rotas.length} rota{arvore.rotas.length !== 1 ? "s" : ""}</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5">{arvore.raiz.pontas} ponta{arvore.raiz.pontas !== 1 ? "s" : ""}</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5">{arvore.nos.length - 1} elementos</span>
          </div>
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.rotulo} className="rounded-xl border border-slate-200 bg-white p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span className="text-indigo-500">{t.icone}</span> {t.rotulo}
            </p>
            <p className="text-lg font-bold tabular-nums leading-tight mt-0.5" style={t.cor ? { color: t.cor } : undefined}>{t.valor}</p>
            {t.detalhe && <p className="text-[10px] text-slate-500 truncate" title={t.detalhe}>{t.detalhe}</p>}
          </div>
        ))}
      </div>

      {/* Ocupação dos splitters */}
      <div className="rounded-xl border border-slate-200 p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-semibold text-slate-700">Ocupação dos splitters</p>
          <p className="text-[11px] text-slate-500 tabular-nums">{tot.total ? `${Math.round(pct(tot.clientes + tot.ramais))}% · ${tot.total} portas` : ""}</p>
        </div>
        {tot.total ? (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
              <span className="bg-emerald-500" style={{ width: `${pct(tot.clientes)}%` }} />
              <span className="bg-indigo-500" style={{ width: `${pct(tot.ramais)}%` }} />
            </div>
            <div className="flex gap-3 mt-1.5 text-[11px] text-slate-600">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{tot.clientes} cliente{tot.clientes !== 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />{tot.ramais} {tot.ramais !== 1 ? "ramais" : "ramal"}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" />{tot.livres} livre{tot.livres !== 1 ? "s" : ""}</span>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-slate-500">Clique num HUB ou CTO da árvore e cadastre o splitter para ver clientes e portas livres.</p>
        )}
      </div>

      {/* Elementos por tipo */}
      {porTipo.size > 0 && (
        <div className="rounded-xl border border-slate-200 p-2.5">
          <p className="text-[11px] font-semibold text-slate-700 mb-1.5">Elementos na árvore</p>
          <div className="flex flex-wrap gap-1.5">
            {ORDEM.filter((t) => porTipo.get(t)).map((t) => (
              <span key={t} className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 pl-1 pr-2 py-0.5" title={TIPO_ELEMENTO_LABEL[t]}>
                <IconeElemento tipo={t} tamanho={20} />
                <span className="text-xs font-bold tabular-nums text-slate-800">{porTipo.get(t)}</span>
                <span className="text-[10px] text-slate-500">{TIPO_ELEMENTO_LABEL[t].split(" (")[0]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <RamosAqui no={arvore.raiz} rotas={arvore.rotas} onAbrirRota={onAbrirRota} />
      <p className="text-[11px] text-slate-400 text-center">Clique num elemento da árvore para ver o caminho até ele.</p>
    </div>
  );
}

function curtoNome(nome: string) {
  return cortar(nome.split(" - ")[0].split(" / ")[0], 26, nome);
}

/** Nome da rota sem o prefixo da porta PON ("0/6/0 AND 9" → "AND 9") */
function nomeRotaCurto(nome: string) {
  return nome.replace(/^\s*\d+\/\d+\/\d+\s+/, "");
}

/**
 * Ramificações a partir desta caixa, na mesma porta PON: cada caixa seguinte é um ramo, com a fibra que segue,
 * quantas rotas e pontas ele leva, a pior potência e a ponta mais longe. Embaixo, as rotas de cada ramo.
 */
function RamosAqui({ no, rotas, onAbrirRota }: { no: NoArvore; rotas: RotaOptica[]; onAbrirRota: (id: string) => void }) {
  const ids = new Set([...no.filhos.flatMap((f) => f.rotas), ...no.fimDe]);
  if (!ids.size) return null;
  const doNo = rotas.filter((r) => ids.has(r.id));
  // hierarquia: rota principal (tronco) em cima; sub-rotas embaixo, indentadas
  const filhasDe = (id: string) => doNo.filter((r) => r.pai?.rota_id === id);
  const raizes = doNo.filter((r) => !r.pai || !ids.has(r.pai.rota_id));
  const linha = (r: RotaOptica, nivel: number): React.ReactNode => {
    const els = r.elementos;
    const proprio = r.tronco ? els[r.tronco] : els[1];
    const fim = els[els.length - 1];
    const pot = fim?.potencia_saida ?? fim?.potencia_entrada;
    const nv = nivelPotencia(pot);
    const metros = els.reduce((acc, e, i) => acc + (i > 0 ? e.distancia_m ?? 0 : 0), 0);
    const c = proprio ? corFibra(proprio.fibra_entrada, proprio.cabo_entrada) : null;
    const ehTronco = !r.pai;
    const ancora = r.tronco ? els[r.tronco - 1] : undefined;
    return (
      <li key={r.id}>
        <button
          type="button"
          onClick={() => onAbrirRota(r.id)}
          className="flex w-full items-center gap-2 py-1.5 pr-2.5 text-left hover:bg-indigo-50/60"
          style={{ paddingLeft: 10 + nivel * 18 }}
          title={r.nome}
        >
          {nivel > 0 && <span className="shrink-0 text-slate-300">└</span>}
          {ehTronco ? <RouteIcon className="h-4 w-4 shrink-0 text-indigo-600" /> : <IconeElemento tipo={tipoVisual(fim)} tamanho={18} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">
              {ehTronco && <span className="mr-1 rounded bg-indigo-100 px-1 text-[9px] font-bold uppercase text-indigo-700">tronco</span>}
              {nomeRotaCurto(r.nome)}
            </p>
            <p className="flex items-center gap-1 truncate text-[10px] text-slate-500">
              {ehTronco ? (
                <>{curtoNome(els[0]?.nome ?? "")} → {curtoNome(fim?.nome ?? "")}</>
              ) : (
                <>
                  {c && proprio?.fibra_entrada ? (
                    <>
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: c.hex }} />
                      {TF(proprio.fibra_entrada, proprio.cabo_entrada)}
                    </>
                  ) : proprio?.cabo_entrada ? (
                    // cabo até um prédio: entra inteiro (as fibras são das CDOIs)
                    <span className="truncate">cabo {curtoNome(semCodigo(proprio.cabo_entrada).split(" · ")[0])}</span>
                  ) : null}
                  {r.pai?.meia_porta && <span className="text-slate-400">· meia porta</span>}
                  {nivel === 0 && <span className="truncate">· sai de {curtoNome(ancora?.nome ?? "?")}</span>}
                </>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold tabular-nums" style={{ color: nv.cor }}>{pot !== undefined ? `${dbm(pot)} dBm` : "—"}</p>
            <p className="text-[10px] text-slate-400">{formatMetros(metros)}</p>
          </div>
        </button>
        {filhasDe(r.id).length > 0 && <ul>{filhasDe(r.id).map((x) => linha(x, nivel + 1))}</ul>}
      </li>
    );
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {no.filhos.length ? "Ramificações a partir daqui" : "Rotas que terminam aqui"}
        </p>
        <span className="ml-auto text-[10px] text-slate-400">
          {ids.size} rota{ids.size !== 1 ? "s" : ""}
        </span>
      </div>
      <ul className="py-0.5">{raizes.map((r) => linha(r, 0))}</ul>
    </div>
  );
}

/** Faixa de cor da potência (GPON: ONU costuma operar até ~−27 dBm) */
function nivelPotencia(v?: number) {
  if (v === undefined) return { cor: "#94a3b8", texto: "sem medida", classe: "text-slate-500" };
  if (v >= -20) return { cor: "#16a34a", texto: "ótima", classe: "text-emerald-700" };
  if (v >= -25) return { cor: "#65a30d", texto: "boa", classe: "text-lime-700" };
  if (v >= -27) return { cor: "#d97706", texto: "no limite", classe: "text-amber-700" };
  return { cor: "#dc2626", texto: "abaixo da sensibilidade", classe: "text-red-700" };
}

const dbm = (v?: number) => (v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}`);

/** Gráfico da potência ao longo do caminho (degrau nos splitters), com a linha de −27 dBm. */
function GraficoPotencia({ caminho }: { caminho: NoArvore[] }) {
  const pts: { x: number; y: number; no: NoArvore }[] = [];
  for (const n of caminho) {
    const e = n.elemento;
    if (e.potencia_entrada !== undefined) pts.push({ x: n.distancia, y: e.potencia_entrada, no: n });
    if (e.potencia_saida !== undefined && e.potencia_saida !== e.potencia_entrada) pts.push({ x: n.distancia, y: e.potencia_saida, no: n });
  }
  if (pts.length < 2) return null;
  const W = 360, H = 130, L = 34, R = 10, T = 12, B = 22;
  const maxX = Math.max(1, ...pts.map((p) => p.x));
  const ys = pts.map((p) => p.y);
  const maxY = Math.ceil(Math.max(...ys) + 1);
  const minY = Math.floor(Math.min(-28, Math.min(...ys) - 1));
  const sx = (x: number) => L + (x / maxX) * (W - L - R);
  const sy = (y: number) => T + ((maxY - y) / (maxY - minY)) * (H - T - B);
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${linha} L${sx(pts[pts.length - 1].x)} ${H - B} L${sx(pts[0].x)} ${H - B} Z`;
  const ticksY = [maxY, Math.round((maxY + minY) / 2), minY];
  const final = pts[pts.length - 1].y;
  const nv = nivelPotencia(final);
  const gid = `pot-${caminho[caminho.length - 1].id.replace(/\W/g, "")}`;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <p className="text-[11px] font-semibold text-slate-600 px-1">Potência ao longo do caminho</p>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gráfico de potência por distância">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={nv.cor} stopOpacity=".28" />
            <stop offset="1" stopColor={nv.cor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="#e2e8f0" />
            <text x={L - 4} y={sy(t) + 3} fontSize={8.5} textAnchor="end" fill="#94a3b8">{t}</text>
          </g>
        ))}
        {-27 >= minY && -27 <= maxY && (
          <g>
            <line x1={L} x2={W - R} y1={sy(-27)} y2={sy(-27)} stroke="#dc2626" strokeDasharray="4 3" />
            <text x={W - R} y={sy(-27) - 3} fontSize={8} textAnchor="end" fill="#dc2626">−27 dBm (limite ONU)</text>
          </g>
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={linha} fill="none" stroke={nv.cor} strokeWidth={2.4} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="#fff" stroke={nv.cor} strokeWidth={2}>
            <title>{`${p.no.elemento.nome}: ${dbm(p.y)} dBm a ${formatMetros(p.x)}`}</title>
          </circle>
        ))}
        <text x={L} y={H - 6} fontSize={8.5} fill="#94a3b8">OLT</text>
        <text x={W - R} y={H - 6} fontSize={8.5} fill="#94a3b8" textAnchor="end">{formatMetros(maxX)}</text>
        <text x={4} y={T + 2} fontSize={8} fill="#94a3b8">dBm</text>
      </svg>
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
  // Mesma referência do resumo da rota: potência da porta PON (entrada da OLT)
  const pot0 = caminho[0].elemento.potencia_entrada ?? caminho[0].elemento.potencia_saida;
  const potAqui = e.potencia_saida ?? e.potencia_entrada;
  const perda = pot0 !== undefined && potAqui !== undefined ? pot0 - potAqui : undefined;
  const pern = pernasSplitter(no);
  const nv = nivelPotencia(potAqui);
  // posição no medidor: +7 dBm (cheio) a −30 dBm (vazio)
  const pos = potAqui === undefined ? 0 : Math.min(100, Math.max(0, ((potAqui + 30) / 37) * 100));

  return (
    <div className="space-y-3">
      {/* Cartão principal */}
      <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-300">Da OLT</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{formatMetros(no.distancia)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-300">Potência</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{dbm(potAqui)}<span className="text-xs font-medium"> dBm</span></p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-300">Perda</p>
            <p className="text-lg font-bold tabular-nums leading-tight">{perda !== undefined ? perda.toFixed(2).replace(".", ",") : "—"}<span className="text-xs font-medium"> dB</span></p>
          </div>
        </div>
        {/* Medidor */}
        <div className="mt-3">
          <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-55% to-emerald-500">
            {potAqui !== undefined && (
              <span className="absolute -top-1 w-4 h-4 rounded-full bg-white border-2 shadow" style={{ left: `calc(${pos}% - 8px)`, borderColor: nv.cor }} />
            )}
          </div>
          <div className="flex justify-between text-[9px] text-slate-400 mt-1">
            <span>−30</span><span>−27 limite</span><span>−20</span><span>+7 dBm</span>
          </div>
          <p className="text-[11px] mt-1 text-center">
            Potência <b style={{ color: potAqui === undefined ? undefined : nv.cor === "#dc2626" ? "#fca5a5" : nv.cor === "#d97706" ? "#fcd34d" : "#86efac" }}>{nv.texto}</b>
            {" · "}{caminho.length - 1} trecho{caminho.length > 2 ? "s" : ""} desde a OLT
          </p>
        </div>
      </div>

      <GraficoPotencia caminho={caminho} />

      {/* Impacto de rompimento */}
      <div className="flex gap-2 items-start rounded-xl border border-red-200 bg-red-50 px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <p className="text-xs text-red-800">
          Se o trecho que chega aqui romper, ficam sem sinal:{" "}
          {no.clientes > 0 && <><b>{no.clientes} cliente{no.clientes !== 1 ? "s" : ""}</b>, </>}
          <b>{no.pontas} ponta{no.pontas !== 1 ? "s" : ""} de rota</b> e <b>{no.abaixo + 1} elemento{no.abaixo > 0 ? "s" : ""}</b>.
        </p>
      </div>

      {pern && (
        <button
          type="button"
          onClick={onAbrirCaixa}
          className="w-full flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50 text-left"
        >
          <IconeElemento tipo={tipoVisual(e)} tamanho={26} />
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-slate-800">Splitter {pern.splitter}</span>
            <span className="flex flex-wrap gap-1 mt-0.5 text-[10px]">
              <span className="rounded-full px-1.5 bg-emerald-100 text-emerald-800">{pern.clientes} cliente{pern.clientes !== 1 ? "s" : ""}</span>
              <span className="rounded-full px-1.5 bg-indigo-100 text-indigo-800">{pern.ramais} {pern.ramais !== 1 ? "ramais" : "ramal"}</span>
              <span className="rounded-full px-1.5 bg-slate-100 text-slate-600">{pern.livres} livre{pern.livres !== 1 ? "s" : ""}</span>
            </span>
          </span>
          <span className="text-[11px] text-indigo-600 font-medium">ver diagrama →</span>
        </button>
      )}
      {!pern && e.tipo !== "olt" && !e.passagem && (
        <button
          type="button"
          onClick={onAbrirCaixa}
          className="w-full text-xs px-3 py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-700 font-medium hover:bg-indigo-50"
        >
          Ver a caixa por dentro
        </button>
      )}

      {/* Caminho (recolhido) */}
      <details className="group rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Caminho desde a OLT
          <span className="font-normal normal-case tracking-normal text-slate-400">· {caminho.length - 1} trecho{caminho.length > 2 ? "s" : ""}</span>
          <span className="ml-auto text-slate-400 transition group-open:rotate-180">▾</span>
        </summary>
        <ol className="mt-1.5">
          {caminho.map((n, i) => {
            const el = n.elemento;
            const c = corFibra(el.fibra_entrada, el.cabo_entrada);
            const pot = el.potencia_saida ?? el.potencia_entrada;
            const ultimo = i === caminho.length - 1;
            // Emenda: cabo/fibra de chegada diferente do próximo trecho
            const prox = caminho[i + 1]?.elemento ?? (n.filhos.length === 1 ? n.filhos[0].elemento : undefined);
            const emenda =
              prox && el.cabo_entrada && prox.cabo_entrada && (chaveCabo(el.cabo_entrada) !== chaveCabo(prox.cabo_entrada) || el.fibra_entrada !== prox.fibra_entrada);
            return (
              <li key={n.id}>
                {/* Trecho de cabo que chega neste elemento */}
                {i > 0 && (
                  <div className="flex gap-2">
                    <div className="w-7 flex justify-center">
                      <span className="w-[7px] rounded-full border-2 border-slate-900 my-0.5" style={{ background: c.hex, minHeight: 34 }} />
                    </div>
                    <div className="flex-1 min-w-0 py-1.5 flex items-start gap-1.5">
                      <IconeCabo tamanho={15} className="shrink-0 mt-px" />
                      <p className="text-[11px] leading-tight text-slate-500 min-w-0">
                        <span className="text-slate-700 font-medium">{el.cabo_entrada ?? "cabo ?"}</span>
                        <br />
                        {el.fibra_entrada ? `${c.rotulo} ${c.nome.toLowerCase()}` : "fibra ?"}
                        {el.distancia_m !== undefined ? ` · ${formatMetros(el.distancia_m)}` : ""}
                      </p>
                    </div>
                  </div>
                )}
                {/* Elemento */}
                <div className={`flex gap-2 items-center rounded-lg ${ultimo ? "bg-amber-50 ring-1 ring-amber-200" : ""}`}>
                  <div className="w-7 flex justify-center shrink-0">
                    <IconeElemento tipo={tipoVisual(el)} tamanho={26} />
                  </div>
                  <div className="flex-1 min-w-0 py-1">
                    <p className={`text-xs leading-tight truncate ${ultimo ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`} title={el.nome}>
                      {el.nome}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatMetros(n.distancia)}
                      {el.splitter ? ` · splitter ${el.splitter}` : ""}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold tabular-nums pr-1.5 ${nivelPotencia(pot).classe}`}>{pot !== undefined ? `${dbm(pot)} dBm` : ""}</span>
                </div>
                {emenda && (
                  <p className="ml-9 mb-0.5 text-[10px] text-amber-800 bg-amber-100 rounded px-1.5 py-0.5 inline-block">
                    emenda {TF(el.fibra_entrada, el.cabo_entrada)} → {prox!.cabo_entrada?.split(" - ")[0]} {TF(prox!.fibra_entrada, prox!.cabo_entrada)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </details>

      <RamosAqui no={no} rotas={rotas} onAbrirRota={onAbrirRota} />
    </div>
  );
}
