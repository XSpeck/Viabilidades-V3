"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, formatDbm, formatMetros, TIPO_ELEMENTO_LABEL, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { caminhoAte, chaveElemento, montarArvoresPon, pernasSplitter, type ArvorePon, type NoArvore } from "@/lib/arvorePon";
import type { CaixaRede } from "@/lib/caixasRede";
import { chaveCabo, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import EditorCaixa from "./EditorCaixa";
import QuadroCabo from "./QuadroCabo";
import { Janela } from "./Janelas";
import { DESENHO_CABO, IconeCabo, IconeElemento, IconeElementoSvg } from "./IconesRede";

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  cabos: CaboRede[];
  catalogo: ItemCatalogo[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onCaboSalvo: (c: CaboRede) => void;
  onAbrirRota: (id: string) => void;
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
  let n = nome.split(" - ")[0].split(" / ")[0].trim();
  if (n.length > 20) n = n.slice(0, 19) + "…";
  return n;
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

export default function ArvorePonView({ rotas, caixas, cabos, catalogo, usuario, onCaixaSalva, onCaboSalvo, onAbrirRota }: Props) {
  const arvores = useMemo(() => montarArvoresPon(rotas, caixas), [rotas, caixas]);
  const usoFibras = useMemo(() => usoDasFibras(rotas), [rotas]);
  const [chave, setChave] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>("0");
  const [cheia, setCheia] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [janelas, setJanelas] = useState<JanelaArv[]>([]);
  const areaRef = useRef<HTMLDivElement>(null);

  /** Abre uma janela perto do ponto clicado (ou traz para frente a que já está aberta). */
  function abrirJanela(j: JanelaNova, cx: number, cy: number) {
    setJanelas((js) => {
      if (js.some((x) => x.id === j.id)) return [...js.filter((x) => x.id !== j.id), { ...js.find((x) => x.id === j.id)!, ...j } as JanelaArv];
      const desloc = (js.length % 5) * 22;
      return [...js, { ...j, x: cx + 28 + desloc, y: cy - 60 + desloc } as JanelaArv];
    });
  }
  function fecharJanela(id: string) {
    setJanelas((js) => js.filter((j) => j.id !== id));
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
            {arvore.nos.filter((n) => n.pai).map((c) => {
              const p = c.pai!;
              const x1 = X(p.profundidade), y1 = Y(y.get(p)!), x2 = X(c.profundidade), y2 = Y(y.get(c)!);
              const mx = x1 + COL / 2;
              const d = `M${x1} ${y1}H${mx}V${y2}H${x2}`;
              const cor = corFibra(c.elemento.fibra_entrada, c.elemento.cabo_entrada).hex;
              const temCabo = !!c.elemento.cabo_entrada;
              const rot = c.elemento.fibra_entrada ? TF(c.elemento.fibra_entrada, c.elemento.cabo_entrada) : "cabo";
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
                  <path d={d} fill="none" stroke="#0f172a" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={d} fill="none" stroke={cor} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
                  {temCabo && (
                    <g transform={`translate(${ex - lw / 2} ${y2 - 9})`}>
                      <rect width={lw} height={18} rx={9} fill="#fff" stroke="#0f172a" strokeWidth={1.3} />
                      <svg x={2} y={2} width={14} height={14} viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: DESENHO_CABO }} />
                      <circle cx={lw - 9} cy={9} r={4} fill={cor} stroke="#0f172a" strokeWidth={1} />
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
                const rot = l.rotulo && l.rotulo.length > 22 ? l.rotulo.slice(0, 21) + "…" : l.rotulo;
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
            {arvore.nos.map((n) => {
              const x = X(n.profundidade), yy = Y(y.get(n)!);
              const t = tipoVisual(n.elemento);
              const ativo = n === sel;
              const spl = n.caixa?.splitter ?? n.elemento.splitter;
              const tam = t === "olt" ? 34 : t === "onu" || t === "outro" ? 24 : 30;
              return (
                <g
                  key={`n${n.id}`}
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
                  {spl && (
                    <g transform={`translate(${x + 7} ${yy + 6})`}>
                      <rect width={spl.length * 6 + 8} height={14} rx={7} fill="#0f172a" stroke="#fff" strokeWidth={1.2} />
                      <text x={(spl.length * 6 + 8) / 2} y={10.2} fontSize={9} fontWeight={700} fill="#fff" textAnchor="middle">{spl}</text>
                    </g>
                  )}
                  <text x={x} y={yy - tam / 2 - 6} fontSize={11} textAnchor="middle" fontWeight={ativo ? 700 : 600} fill="#0f172a"
                    stroke="#fff" strokeWidth={3.5} paintOrder="stroke">
                    {nomeCurto(n.elemento.nome)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="text-xs text-gray-500 px-4 py-2.5 border-t border-gray-200">
          Rotas que saem da mesma porta da OLT são juntadas: onde passam pelas mesmas caixas formam o tronco e onde se separam a
          árvore ramifica. A linha usa a cor real da fibra e a etiqueta mostra tubo e fibra. Cada janela pode ser arrastada,
          minimizada ou fixada ao lado.
        </p>
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
              titulo={j.cabo}
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
            subtitulo={`${TIPO_ELEMENTO_LABEL[t]}${no.elemento.codigo ? ` · ${no.elemento.codigo}` : ""}`}
            icone={<IconeElemento tipo={t} tamanho={22} />}
            onFechar={() => fecharJanela(j.id)}
          >
            <JanelaNo
              no={no}
              rotas={arvore.rotas}
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
  no, rotas, catalogo, usuario, onCaixaSalva, onAbrirRota, onFechar,
}: {
  no: NoArvore;
  rotas: RotaOptica[];
  catalogo: ItemCatalogo[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onAbrirRota: (id: string) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<"diagrama" | "caminho">(temDiagrama(no) ? "diagrama" : "caminho");
  return (
    <div>
      <div className="flex border-b border-gray-200 bg-slate-50 text-xs font-medium" role="tablist">
        {([
          ["diagrama", "Diagrama da caixa"],
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
      {aba === "diagrama" ? (
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
          ramos={no.filhos.map((f) => f.elemento.nome)}
          modelos={catalogo.filter((m) => m.categoria === "splitter")}
          usuario={usuario}
          onSalva={onCaixaSalva}
          onFechar={onFechar}
          potenciaEntrada={no.elemento.potencia_entrada}
          semMoldura
        />
      ) : (
        <div className="p-3">
          <DetalheNo no={no} rotas={rotas} onAbrirRota={onAbrirRota} onAbrirCaixa={() => setAba("diagrama")} />
        </div>
      )}
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
          {TIPO_ELEMENTO_LABEL[tipoVisual(e)]}
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
          {no.caixa ? "Ver diagrama da caixa" : "Cadastrar diagrama da caixa"}
        </button>
      )}

      <ol className="border-l-2 border-gray-200 space-y-3 pl-4">
        {caminho.map((n, i) => {
          const c = corFibra(n.elemento.fibra_entrada, n.elemento.cabo_entrada);
          return (
            <li key={n.id} className="relative">
              <span className="absolute -left-[27px] top-0 bg-white"><IconeElemento tipo={tipoVisual(n.elemento)} tamanho={18} /></span>
              <p className="text-sm font-semibold text-gray-900 leading-tight">{n.elemento.nome}</p>
              {i > 0 && (
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {n.elemento.fibra_entrada ? <span className="inline-block w-5 h-2 rounded-full border border-gray-900" style={{ background: c.hex }} /> : null}
                  <span>
                    {n.elemento.cabo_entrada ?? "cabo ?"}
                    {n.elemento.fibra_entrada ? ` · fibra ${n.elemento.fibra_entrada} (${c.nome.toLowerCase()}, ${TF(n.elemento.fibra_entrada, n.elemento.cabo_entrada)})` : ""}
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
                    Emenda: {ent.cabo_entrada} {TF(ent.fibra_entrada, ent.cabo_entrada)} ↔ {prox.cabo_entrada} {TF(prox.fibra_entrada, prox.cabo_entrada)}
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
