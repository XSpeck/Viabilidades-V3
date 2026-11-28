"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Plus, Route as RouteIcon, Save, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, perdaSplitter, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { chaveCabo, codigoDoCabo, semCodigo } from "@/lib/cabosRede";
import { portasPara, salvarCaixa, type CaixaRede, type SplitterCaixa } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import {
  caminhoNaCaixa, completarPelasRotas, corComCor, desligar, idPonto, ligar, montarUnifilar, rotasDaFibra, tipoEntre,
  type CadastroLigacoes, type CaboUni, type LigacaoUni, type PontoUni,
} from "@/lib/unifilar";
import { IconeElemento } from "./IconesRede";
import BuscaCliente from "./BuscaCliente";
import type { ClienteRede } from "@/lib/clientesRede";
import type { StatusPorta } from "@/lib/caixasRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * Unifilar da caixa (estilo GeoGrid): cabos que chegam à esquerda, que saem à direita, splitters no meio.
 * Editar = clicar num ponto e depois no destino. "Traçar rota" acende o caminho em laranja e mostra a rota inteira.
 */
interface Props {
  chave: string;
  nome: string;
  rotas: RotaOptica[];
  cad?: CaixaRede;
  /** HUB/CTO/CDOI: mostra e edita os splitters; CEO: só cabos e fusões */
  comSplitters: boolean;
  modelos?: ItemCatalogo[];
  usuario: string;
  onSalva: (c: CaixaRede) => void;
  onCancelar: () => void;
  /** Fibra escolhida no "Traçar rota": a árvore destaca o caminho dela */
  onVerFibra?: (cabo: string, fibra: number) => void;
  /** Clientes do cadastro (perna com cliente) e os já ligados em outras caixas */
  clientes?: ClienteRede[];
  clientesOcupados?: Set<string>;
  /** CDOI: perna só livre ou cliente (não sai ramal) */
  semRamal?: boolean;
}

const ROW = 15, HEAD = 30, BW = 158, GAPB = 16, PAD = 14;
const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const LARANJA = "#f97316";

export default function Unifilar({ chave, nome, rotas, cad, comSplitters, modelos = [], usuario, onSalva, onCancelar, onVerFibra, clientes = [], clientesOcupados, semRamal }: Props) {
  const base: CadastroLigacoes = useMemo(() => ({
    emendas: cad?.emendas ?? [],
    regras_emenda: cad?.regras_emenda ?? [],
    splitters: cad?.splitters?.length
      ? cad.splitters
      : cad?.splitter
        ? [{ id: "s1", relacao: cad.splitter, modelo_id: cad.splitter_modelo, entrada: {}, portas: portasPara(cad.splitter, cad.portas ?? []) }]
        : [],
  }), [cad]);
  // HUB/CTO/CDOI: completa com o que as rotas dizem (um splitter por porta PON e as pernas)
  const auto = useMemo(() => (comSplitters ? completarPelasRotas(chave, rotas, base) : { ed: base, splitters: 0, pernas: 0 }), [comSplitters, chave, rotas, base]);
  const [ed, setEd] = useState<CadastroLigacoes>(auto.ed);
  const [hist, setHist] = useState<CadastroLigacoes[]>([]);
  const [modo, setModo] = useState<"editar" | "clientes" | "tracar">("editar");
  /** Modo Clientes: a perna escolhida */
  const [pernaSel, setPernaSel] = useState<{ spl: string; porta: number } | null>(null);
  const [sel, setSel] = useState<PontoUni | null>(null);
  const [selLig, setSelLig] = useState<string | null>(null);
  const [traco, setTraco] = useState<Set<string> | null>(null);
  const [rotasTraco, setRotasTraco] = useState<ReturnType<typeof rotasDaFibra>>([]);
  const [rotaIdx, setRotaIdx] = useState(0);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [cheia, setCheia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ccChega, setCcChega] = useState("");
  const [ccSai, setCcSai] = useState("");

  const modelo = useMemo(() => montarUnifilar(chave, rotas, { ...cad, ...ed, splitters: comSplitters ? ed.splitters : [] }), [chave, rotas, cad, ed, comSplitters]);
  const mudar = (n: CadastroLigacoes) => { setHist((h) => [...h.slice(-49), ed]); setEd(n); };
  const modelosSpl = modelos.filter((m) => m.categoria === "splitter" && m.relacao);

  // ---------- pontos ocupados e porta PON de cada splitter ----------
  const ocupados = new Map<string, LigacaoUni>();
  modelo.ligacoes.forEach((l) => { if (l.origem !== "rota" || l.tipo === "passa") { ocupados.set(idPonto(l.a), l); ocupados.set(idPonto(l.b), l); } });
  const ponDaFibra = (cabo: string, fibra: number) => {
    const r = rotas.find((x) => x.elementos.some((e) => chaveElemento(e) === chave && !!e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(cabo) && e.fibra_entrada === fibra));
    return r ? portaPonDaRota(r).rotulo.replace(/^.*· /, "") : undefined;
  };
  const nomeSpl = (s: SplitterCaixa) => `S${ed.splitters.indexOf(s) + 1}`;

  // ---------- layout ----------
  const fibrasVisiveis = (c: CaboUni): number[] => {
    const todas = Array.from({ length: c.capacidade }, (_, i) => i + 1);
    if (abertos.has(c.id)) return todas;
    const usadas = new Set<number>([...c.sinal.keys()]);
    for (const id of ocupados.keys()) {
      const m = id.match(/^f:(chega|sai):(.+):(\d+)$/);
      if (m && m[1] === c.lado && m[2] === c.chave) usadas.add(+m[3]);
    }
    if (sel?.k === "fibra" || sel?.k === "porta" || sel?.k === "entrada") {
      // ligando: mostra o cabo inteiro do outro lado, para escolher fibra livre
      if (!(sel.k === "fibra" && sel.lado === c.lado)) return todas;
    }
    const tubos = new Set([...usadas].map((f) => corFibra(f, c.nome).tubo ?? 1));
    const vis = todas.filter((f) => tubos.has(corFibra(f, c.nome).tubo ?? 1));
    return vis.length ? vis : todas.slice(0, Math.min(12, todas.length));
  };
  const esquerda = modelo.cabos.filter((c) => c.lado === "chega");
  const direita = modelo.cabos.filter((c) => c.lado === "sai");
  const W_MEIO = comSplitters ? 280 : 200;
  const xE = PAD, xD = PAD + BW + W_MEIO, W = xD + BW + PAD;
  const pos = new Map<string, [number, number]>();
  const blocos: { c: CaboUni; x: number; y: number; fibras: number[]; h: number }[] = [];
  const empilhar = (lista: CaboUni[], x: number) => {
    let y = PAD + 22;
    for (const c of lista) {
      const fibras = fibrasVisiveis(c);
      const h = HEAD + fibras.length * ROW + (fibras.length < c.capacidade ? ROW : 0) + 6;
      blocos.push({ c, x, y, fibras, h });
      fibras.forEach((f, k) => pos.set(idPonto({ k: "fibra", lado: c.lado, cabo: c.nome, fibra: f }), [c.lado === "chega" ? x + BW : x, y + HEAD + k * ROW + ROW / 2]));
      y += h + GAPB;
    }
    return y;
  };
  const hE = empilhar(esquerda, xE), hD = empilhar(direita, xD);
  // splitters no meio
  const spls = comSplitters ? ed.splitters : [];
  const SW = 112;
  const xS = PAD + BW + (W_MEIO - SW) / 2;
  let yS = PAD + 22;
  const caixasSpl: { s: SplitterCaixa; y: number; h: number; portas: ReturnType<typeof portasPara> }[] = [];
  // cada splitter fica na altura da fibra que o alimenta (menos linhas cruzando), sem encavalar
  const yEntradaDe = (s: SplitterCaixa) => (s.entrada.fibra ? pos.get(idPonto({ k: "fibra", lado: "chega", ...s.entrada.fibra }))?.[1] ?? 1e6 : 1e6);
  for (const s of [...spls].sort((a, b) => yEntradaDe(a) - yEntradaDe(b))) {
    const portas = portasPara(s.relacao, s.portas);
    const h = 26 + portas.length * ROW + 8;
    const yIn = yEntradaDe(s);
    const y0 = Math.max(yS, yIn < 1e6 ? yIn - (26 + (portas.length * ROW) / 2) : yS);
    caixasSpl.push({ s, y: y0, h, portas });
    pos.set(idPonto({ k: "entrada", spl: s.id }), [xS - 6, y0 + 26 + (portas.length * ROW) / 2]);
    portas.forEach((p, k) => pos.set(idPonto({ k: "porta", spl: s.id, porta: p.numero }), [xS + SW + 6, y0 + 26 + k * ROW + ROW / 2]));
    yS = y0 + h + 18;
  }
  const H = Math.max(hE, hD, yS) + PAD;

  // ---------- ações ----------
  function clicarPonto(p: PontoUni) {
    setErro(null);
    if (modo === "clientes") {
      if (p.k === "porta") setPernaSel({ spl: p.spl, porta: p.porta });
      return;
    }
    if (modo === "tracar") {
      setTraco(caminhoNaCaixa(modelo, p));
      if (p.k === "fibra") {
        const rs = rotasDaFibra(rotas, p.cabo, p.fibra);
        setRotasTraco(rs);
        setRotaIdx(0);
        onVerFibra?.(p.cabo, p.fibra);
      }
      return;
    }
    if (!sel) { setSel(p); setSelLig(null); return; }
    if (idPonto(sel) === idPonto(p)) { setSel(null); return; }
    const t = tipoEntre(sel, p);
    if (!["fusao", "entrada", "perna", "nivel2"].includes(t)) { setErro(t); return; }
    const ocupA = ocupados.get(idPonto(sel)), ocupB = ocupados.get(idPonto(p));
    const ocupCad = [ocupA, ocupB].filter((l) => l && l.tipo !== "passa");
    if (ocupCad.length && !confirm("Um dos pontos já está ligado. Trocar a ligação?")) return;
    const r = ligar(ed, sel, p);
    if (typeof r === "string") { setErro(r); return; }
    mudar(r);
    setSel(null);
  }
  function clicarLigacao(l: LigacaoUni) {
    if (modo === "tracar") { clicarPonto(l.a); return; }
    setSel(null);
    setSelLig(selLig === l.id ? null : l.id);
  }
  const ligSel = modelo.ligacoes.find((l) => l.id === selLig);
  const sugestoes = modelo.ligacoes.filter((l) => l.origem === "rota" && l.tipo === "fusao");
  function aceitarSugestoes() {
    let n = ed;
    for (const l of sugestoes) { const r = ligar(n, l.a, l.b); if (typeof r !== "string") n = r; }
    mudar(n);
  }
  function addSplitter() {
    const m = modelosSpl.find((x) => x.relacao === "1:8") ?? modelosSpl[0];
    if (!m?.relacao) { setErro("Cadastre um splitter primeiro (Cadastros → Splitters)."); return; }
    mudar({ ...ed, splitters: [...ed.splitters, { id: `s${Date.now().toString(36)}`, relacao: m.relacao, modelo_id: m.id, entrada: {}, portas: portasPara(m.relacao, []) }] });
  }
  async function salvar() {
    if (comSplitters) {
      const semEntrada = ed.splitters.find((s) => !s.entrada.fibra && !s.entrada.splitter);
      if (semEntrada) { setErro(`${nomeSpl(semEntrada)}: ligue a entrada (clique numa fibra que chega e depois na entrada do splitter).`); return; }
      const semModelo = ed.splitters.find((s) => !modelosSpl.some((m) => m.id === s.modelo_id));
      if (semModelo) { setErro(`${nomeSpl(semModelo)}: escolha o modelo do cadastro.`); return; }
    }
    setSalvando(true);
    setErro(null);
    try {
      const salva = await salvarCaixa({
        chave,
        nome,
        splitter: comSplitters ? undefined : cad?.splitter,
        splitter_modelo: comSplitters ? undefined : cad?.splitter_modelo,
        portas: comSplitters ? [] : cad?.portas ?? [],
        splitters: comSplitters ? ed.splitters : cad?.splitters,
        obs: cad?.obs,
        regras_emenda: ed.regras_emenda,
        emendas: ed.emendas,
        atendimento: cad?.atendimento,
        atualizado_por: usuario,
      });
      onSalva(salva);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // ---------- arrastar a área ----------
  const area = useRef<HTMLDivElement>(null);
  const arr = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const moveu = useRef(false);

  // ---------- desenho ----------
  const realcado = (id: string) => !!traco?.has(id);
  const corDe = (p: PontoUni, alt?: PontoUni) => {
    const f = p.k === "fibra" ? p : alt?.k === "fibra" ? alt : null;
    return f ? corFibra(f.fibra, f.cabo).hex : "#e2e8f0";
  };
  const candidato = (p: PontoUni) => !!sel && modo === "editar" && idPonto(sel) !== idPonto(p) && ["fusao", "entrada", "perna", "nivel2"].includes(tipoEntre(sel, p));
  const ponto = (p: PontoUni, x: number, y: number, cor: string) => {
    const id = idPonto(p);
    const ativo = sel && idPonto(sel) === id;
    const ocup = ocupados.has(id);
    const cand = candidato(p);
    return (
      <g key={`pt${id}`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (!moveu.current) clicarPonto(p); }}>
        <circle cx={x} cy={y} r={9} fill="transparent" />
        {cand && <circle cx={x} cy={y} r={7.5} fill="none" stroke="#4ade80" strokeWidth={1.4} opacity={0.8} />}
        {ativo && <circle cx={x} cy={y} r={8} fill="#facc15" opacity={0.45} />}
        <circle cx={x} cy={y} r={4.3} fill={realcado(id) ? LARANJA : ocup ? cor : "#1f2937"} stroke={realcado(id) ? "#fff" : ocup ? "#0f172a" : cor} strokeWidth={1.3} />
      </g>
    );
  };

  const caminhoSel = rotasTraco[rotaIdx];

  return (
    <div className={`space-y-2 ${cheia ? "fixed inset-0 z-[70] flex flex-col bg-white p-3" : ""}`}>
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
          {(comSplitters ? ([["editar", "Editar conexões"], ["clientes", "Clientes nas portas"], ["tracar", "Traçar rota"]] as const) : ([["editar", "Editar conexões"], ["tracar", "Traçar rota"]] as const)).map(([k, r]) => (
            <button key={k} type="button" onClick={() => { setModo(k); setSel(null); setSelLig(null); setPernaSel(null); if (k !== "tracar") { setTraco(null); setRotasTraco([]); } }}
              className={`flex items-center gap-1 px-2.5 py-1.5 font-semibold ${modo === k ? (k === "tracar" ? "bg-orange-500 text-white" : "bg-slate-900 text-white") : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {k === "tracar" && <RouteIcon className="h-3.5 w-3.5" />} {r}
            </button>
          ))}
        </div>
        {modo === "editar" && comSplitters && (
          <button type="button" onClick={addSplitter} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-semibold text-slate-700 hover:border-emerald-400"><Plus className="h-3.5 w-3.5" /> Splitter</button>
        )}
        {modo === "editar" && sugestoes.length > 0 && (
          <button type="button" onClick={aceitarSugestoes} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 font-semibold text-amber-800 hover:bg-amber-100">Aceitar {sugestoes.length} da{sugestoes.length !== 1 ? "s" : ""} rota{sugestoes.length !== 1 ? "s" : ""}</button>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} className="rounded p-1.5 hover:bg-slate-100" aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" onClick={() => setZoom(1)} className="w-10 rounded py-1 text-center tabular-nums hover:bg-slate-100">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="rounded p-1.5 hover:bg-slate-100" aria-label="Aumentar zoom"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCheia((v) => !v)} className="rounded p-1.5 hover:bg-slate-100" aria-label="Tela cheia">{cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </span>
      </div>
      <p className="text-[11px] text-slate-500">
        {modo === "tracar"
          ? "Clique numa fibra, porta ou ligação: o caminho acende em laranja e a rota inteira aparece embaixo."
          : modo === "clientes"
            ? "Clique numa porta de splitter para marcar o cliente (ou deixar livre). A porta em ramal é ligada no modo Editar conexões."
          : sel
            ? "Agora clique no destino (os pontos com anel verde aceitam a ligação). Clique de novo no mesmo ponto para cancelar."
            : "Clique num ponto (fibra, entrada ou porta do splitter) e depois no destino. Clique numa linha para desligar."}
      </p>

      {auto.ed !== base && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-900">
          Montado pelas rotas: {auto.splitters ? `${auto.splitters} splitter${auto.splitters !== 1 ? "s" : ""} novo${auto.splitters !== 1 ? "s" : ""}, ` : ""}{auto.pernas} perna{auto.pernas !== 1 ? "s" : ""} ligada{auto.pernas !== 1 ? "s" : ""}. Confira e clique em <b>Salvar conexões</b>.
        </p>
      )}

      {/* Desenho */}
      <div
        ref={area}
        className={`overflow-auto rounded-2xl border border-slate-800 bg-[#1b1d21] ${cheia ? "min-h-0 flex-1" : "max-h-[62vh]"} cursor-grab active:cursor-grabbing select-none`}
        onPointerDown={(e) => { if (e.pointerType !== "mouse" || e.button !== 0 || !area.current) return; arr.current = { x: e.clientX, y: e.clientY, sl: area.current.scrollLeft, st: area.current.scrollTop }; moveu.current = false; }}
        onPointerMove={(e) => { const a = arr.current; if (!a || !area.current) return; const dx = e.clientX - a.x, dy = e.clientY - a.y; if (!moveu.current && Math.abs(dx) + Math.abs(dy) > 5) moveu.current = true; if (moveu.current) { area.current.scrollLeft = a.sl - dx; area.current.scrollTop = a.st - dy; } }}
        onPointerUp={() => { arr.current = null; setTimeout(() => { moveu.current = false; }, 0); }}
        onClick={() => { if (!moveu.current) { setSel(null); setSelLig(null); } }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width={W * zoom} height={H * zoom} className="block" role="img" aria-label={`Unifilar de ${nome}`}>
          <defs>
            <pattern id="gradeUni" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#262a30" strokeWidth=".7" /></pattern>
          </defs>
          <rect width={W} height={H} fill="url(#gradeUni)" />
          <text x={xE} y={PAD + 8} fontSize={9} fontWeight={800} fill="#94a3b8" letterSpacing=".08em">CHEGAM</text>
          {comSplitters && <text x={xS + SW / 2} y={PAD + 8} fontSize={9} fontWeight={800} fill="#94a3b8" letterSpacing=".08em" textAnchor="middle">SPLITTERS</text>}
          <text x={xD + BW} y={PAD + 8} fontSize={9} fontWeight={800} fill="#94a3b8" letterSpacing=".08em" textAnchor="end">SAEM</text>

          {/* Ligações (atrás dos pontos) */}
          {modelo.ligacoes.map((l) => {
            const a = pos.get(idPonto(l.a)), b = pos.get(idPonto(l.b));
            if (!a || !b) return null;
            const mx = (a[0] + b[0]) / 2;
            const d = `M${a[0]} ${a[1]} C ${mx} ${a[1]}, ${mx} ${b[1]}, ${b[0]} ${b[1]}`;
            const tr = realcado(`L:${l.id}`);
            const sl = selLig === l.id;
            const cor = corDe(l.a, l.b);
            const sug = l.origem === "rota" && l.tipo !== "passa";
            return (
              <g key={l.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (!moveu.current) clicarLigacao(l); }}>
                <title>{l.tipo === "passa" ? "Passa direto (mesma fibra, sem corte)" : sug ? "Sugestão: a rota passa por aqui e o cadastro ainda não tem" : l.origem === "regra" ? "Cor com cor" : "Fusão / ligação"}</title>
                <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                {(tr || sl) && <path d={d} fill="none" stroke={tr ? LARANJA : "#facc15"} strokeWidth={6} opacity={tr ? 0.9 : 0.55} strokeLinecap="round" />}
                {l.tipo === "passa" ? (
                  <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 4" />
                ) : sug ? (
                  <path d={d} fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="2 3" />
                ) : (
                  <>
                    <path d={d} fill="none" stroke="#0b0d10" strokeWidth={3.6} opacity={l.origem === "regra" ? 0.5 : 0.9} />
                    <path d={d} fill="none" stroke={cor} strokeWidth={1.9} opacity={l.origem === "regra" ? 0.55 : 1} />
                  </>
                )}
              </g>
            );
          })}

          {/* Blocos dos cabos */}
          {blocos.map(({ c, x, y, fibras, h }) => {
            const ehE = c.lado === "chega";
            const cod = codigoDoCabo(c.nome);
            return (
              <g key={c.id}>
                <rect x={x} y={y} width={BW} height={h} rx={6} fill="#2a2e35" stroke="#3b4048" />
                <rect x={x} y={y} width={BW} height={HEAD - 4} rx={6} fill="#0f1115" />
                <text x={x + 6} y={y + 11} fontSize={8.5} fontWeight={800} fill="#e2e8f0">{curto(semCodigo(c.nome), 28)}</text>
                <text x={x + 6} y={y + 21} fontSize={7.5} fill="#94a3b8">{cod ?? "sem código"} · {c.capacidade} fibras{c.outraPonta ? ` · ${ehE ? "de" : "p/"} ${curto(c.outraPonta, 14)}` : ""}</text>
                {fibras.map((f, k) => {
                  const cf = corFibra(f, c.nome);
                  const yy = y + HEAD + k * ROW + ROW / 2;
                  const xb = ehE ? x + 4 : x + BW - 9;
                  const sinal = c.sinal.has(f);
                  const pt: PontoUni = { k: "fibra", lado: c.lado, cabo: c.nome, fibra: f };
                  return (
                    <g key={f}>
                      <title>{`${cf.rotulo} ${cf.nome.toLowerCase()}${sinal ? ` · em uso: ${c.sinal.get(f)!.join(", ")}` : " · livre"}`}</title>
                      <rect x={xb} y={yy - ROW / 2} width={5} height={ROW} fill={cf.corTubo?.hex ?? "#64748b"} />
                      <rect x={ehE ? x + 13 : x + BW - 44} y={yy - 5} width={31} height={10} rx={2.5} fill={cf.hex} stroke="#0b0d10" strokeWidth={0.6} />
                      <text x={ehE ? x + 28.5 : x + BW - 28.5} y={yy + 3} fontSize={7} fontWeight={800} textAnchor="middle" fill={["#f4f4f0", "#f2c200", "#ee86b0", "#20bdc9", "#8a949b", "#f08a1c", "#b48ae6"].includes(cf.hex) ? "#0b0d10" : "#fff"}>{`F${String(f).padStart(2, "0")}`}</text>
                      <text x={ehE ? x + 48 : x + BW - 50} y={yy + 3} fontSize={7} fill="#94a3b8" textAnchor={ehE ? "start" : "end"}>{`T${cf.tubo ?? 1}`}</text>
                      {sinal && <circle cx={ehE ? x + 66 : x + BW - 66} cy={yy} r={2.6} fill="#facc15"><title>com sinal</title></circle>}
                      {ponto(pt, ehE ? x + BW : x, yy, cf.hex)}
                    </g>
                  );
                })}
                {fibras.length < c.capacidade && (
                  <text x={x + BW / 2} y={y + HEAD + fibras.length * ROW + 10} fontSize={8} fill="#60a5fa" textAnchor="middle" className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setAbertos((s) => new Set([...s, c.id])); }}>
                    + mostrar as {c.capacidade - fibras.length} fibras escondidas
                  </text>
                )}
              </g>
            );
          })}

          {/* Splitters */}
          {caixasSpl.map(({ s, y, h, portas }) => {
            const m = modelos.find((x) => x.id === s.modelo_id);
            const pon = s.entrada.fibra ? ponDaFibra(s.entrada.fibra.cabo, s.entrada.fibra.fibra) : undefined;
            const yIn = y + 26 + (portas.length * ROW) / 2;
            return (
              <g key={s.id}>
                {/* estilo GeoGrid: cabeçalho, entrada à esquerda, leque e as portas numeradas à direita */}
                <rect x={xS} y={y} width={SW} height={h} rx={6} fill="#0f2a1c" stroke="#22c55e" strokeWidth={1.2} />
                <rect x={xS} y={y} width={SW} height={20} rx={6} fill="#14532d" />
                <text x={xS + 6} y={y + 13} fontSize={9} fontWeight={800} fill="#dcfce7">{nomeSpl(s)} · {s.relacao}</text>
                <text x={xS + SW - 6} y={y + 13} fontSize={7.5} fill="#86efac" textAnchor="end">{pon ? pon : s.entrada.fibra ? `F${String(s.entrada.fibra.fibra).padStart(2, "0")} · sem rota` : s.entrada.splitter ? "2º nível" : "sem entrada"}</text>
                {!pon && s.entrada.fibra && <rect x={xS} y={y} width={SW} height={h} rx={6} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3"><title>Esta fibra não tem rota: confira ou tire o splitter</title></rect>}
                <path d={`M${xS + 10} ${yIn - 5} L${xS + SW - 30} ${y + 26} L${xS + SW - 30} ${y + h - 8} L${xS + 10} ${yIn + 5} Z`} fill="#22c55e" opacity={0.18} />
                <rect x={xS - 2} y={yIn - 6} width={12} height={12} rx={2} fill="#16a34a" stroke="#0b0d10" />
                <text x={xS + 20} y={yIn + 3} fontSize={6.5} fill="#86efac">{perdaSplitter(s.relacao, m?.perda_db).toFixed(1).replace(".", ",")} dB</text>
                {ponto({ k: "entrada", spl: s.id }, xS - 6, yIn, "#4ade80")}
                {portas.map((p, k) => {
                  const yy = y + 26 + k * ROW + ROW / 2;
                  const cor = p.status === "cliente" ? "#0284c7" : p.status === "ramal" ? "#d97706" : "#1f3d33";
                  return (
                    <g key={p.numero}>
                      <title>{`Porta ${p.numero} · ${p.status === "cliente" ? `cliente ${p.descricao ?? ""}` : p.status === "ramal" ? `ramal ${p.descricao ?? ""}` : "livre"}`}</title>
                      <rect x={xS + SW - 26} y={yy - 6} width={20} height={12} rx={2} fill={cor} stroke="#0b0d10" />
                      <text x={xS + SW - 16} y={yy + 3} fontSize={7} fontWeight={800} fill="#fff" textAnchor="middle">{p.numero}</text>
                      {p.status === "cliente" && <text x={xS + SW - 32} y={yy + 3} fontSize={7} textAnchor="end">👤</text>}
                      {ponto({ k: "porta", spl: s.id, porta: p.numero }, xS + SW + 6, yy, "#4ade80")}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">{erro}</p>}

      {/* Modo Clientes: a perna escolhida */}
      {modo === "clientes" && pernaSel && (() => {
        const s = ed.splitters.find((x) => x.id === pernaSel.spl);
        if (!s) return null;
        const pt = portasPara(s.relacao, s.portas).find((x) => x.numero === pernaSel.porta);
        if (!pt) return null;
        const mudarPorta = (m: Partial<typeof pt>) => mudar({
          ...ed,
          splitters: ed.splitters.map((x) => (x.id === s.id ? { ...x, portas: portasPara(x.relacao, x.portas).map((y) => (y.numero === pt.numero ? { ...y, ...m } : y)) } : x)),
        });
        const opcoes: StatusPorta[] = semRamal ? ["livre", "cliente"] : ["livre", "cliente"];
        return (
          <div className="space-y-1.5 rounded-xl border border-sky-200 bg-sky-50/60 p-2.5 text-[11px]">
            <p className="font-semibold text-sky-900">{nomeSpl(s)} · porta {pt.numero}{pt.status === "ramal" ? " · em ramal (ligada a uma fibra que sai)" : ""}</p>
            <div className="flex gap-1">
              {opcoes.map((st) => (
                <button key={st} type="button" onClick={() => mudarPorta(st === "livre" ? { status: "livre", cliente_id: undefined, descricao: undefined, saida: undefined } : { status: "cliente", saida: undefined })}
                  className={`rounded-md px-2 py-1 font-semibold ${pt.status === st ? (st === "cliente" ? "bg-sky-600 text-white" : "bg-slate-700 text-white") : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                  {st === "livre" ? "Livre" : "Cliente"}
                </button>
              ))}
            </div>
            {pt.status === "cliente" && (
              <BuscaCliente
                cadastro={clientes}
                clienteId={pt.cliente_id}
                ocupado={(id) => !!clientesOcupados?.has(id) || ed.splitters.some((x) => x.portas.some((y) => y.cliente_id === id && !(x.id === s.id && y.numero === pt.numero)))}
                onEscolher={(c) => mudarPorta(c ? { cliente_id: c.id, descricao: c.nome } : { cliente_id: undefined, descricao: undefined })}
              />
            )}
          </div>
        );
      })()}

      {/* Ligação selecionada */}
      {modo === "editar" && ligSel && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px]">
          <span className="font-semibold text-slate-700">
            {ligSel.tipo === "passa" ? "Passa direto (vem da rota)" : ligSel.origem === "rota" ? "Sugestão da rota" : ligSel.origem === "regra" ? "Cor com cor" : "Ligação"}
          </span>
          {ligSel.tipo !== "passa" && ligSel.origem === "rota" && (
            <button type="button" onClick={() => { const r = ligar(ed, ligSel.a, ligSel.b); if (typeof r !== "string") mudar(r); setSelLig(null); }} className="rounded-md bg-amber-500 px-2 py-1 font-semibold text-white">Aceitar</button>
          )}
          {ligSel.tipo !== "passa" && ligSel.origem !== "rota" && (
            <button type="button" onClick={() => { mudar(desligar(ed, ligSel)); setSelLig(null); }} className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 font-semibold text-white"><X className="h-3 w-3" /> Desligar</button>
          )}
          {ligSel.origem === "regra" && <span className="text-slate-500">desligar cria uma exceção à regra só nesta fibra</span>}
        </div>
      )}

      {/* Splitters: modelo e remover */}
      {modo === "editar" && comSplitters && ed.splitters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ed.splitters.map((s) => (
            <span key={s.id} className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-[11px]">
              <b className="text-emerald-800">{nomeSpl(s)}</b>
              <select className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px]" value={s.modelo_id ?? ""}
                onChange={(e) => { const m = modelosSpl.find((x) => x.id === e.target.value); if (m?.relacao) mudar({ ...ed, splitters: ed.splitters.map((x) => (x.id === s.id ? { ...x, modelo_id: m.id, relacao: m.relacao!, portas: portasPara(m.relacao!, x.portas) } : x)) }); }}>
                <option value="" disabled>modelo…</option>
                {modelosSpl.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              <button type="button" title="Tirar o splitter" onClick={() => mudar({ ...ed, splitters: ed.splitters.filter((x) => x.id !== s.id).map((x) => (x.entrada.splitter?.id === s.id ? { ...x, entrada: {} } : x)) })} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Cor com cor */}
      {modo === "editar" && esquerda.length > 0 && direita.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-slate-600">Cor com cor:</span>
          <select className="rounded border border-slate-300 px-1 py-0.5" value={ccChega} onChange={(e) => setCcChega(e.target.value)}>
            <option value="">cabo que chega…</option>
            {esquerda.map((c) => <option key={c.id} value={c.nome}>{curto(semCodigo(c.nome), 30)}</option>)}
          </select>
          <span>→</span>
          <select className="rounded border border-slate-300 px-1 py-0.5" value={ccSai} onChange={(e) => setCcSai(e.target.value)}>
            <option value="">cabo que sai…</option>
            {direita.map((c) => <option key={c.id} value={c.nome}>{curto(semCodigo(c.nome), 30)}</option>)}
          </select>
          <button type="button" disabled={!ccChega || !ccSai} onClick={() => { mudar(corComCor(ed, ccChega, ccSai)); setCcChega(""); setCcSai(""); }} className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-white disabled:opacity-40">Ligar F1→F1, F2→F2…</button>
          {ed.regras_emenda.map((g) => (
            <span key={g.de} className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-blue-900">
              {curto(semCodigo(g.de), 14)} → {curto(semCodigo(g.para), 14)}
              <button type="button" onClick={() => mudar({ ...ed, regras_emenda: ed.regras_emenda.filter((x) => x !== g) })} aria-label="Tirar a regra"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Rota traçada */}
      {modo === "tracar" && caminhoSel && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-orange-600" />
            <p className="text-xs font-bold text-orange-900">Rota</p>
            {rotasTraco.length > 1 ? (
              <select className="ml-auto max-w-[220px] rounded border border-orange-200 bg-white px-1 py-0.5 text-[11px]" value={rotaIdx} onChange={(e) => setRotaIdx(+e.target.value)}>
                {rotasTraco.map((r, i) => <option key={r.rota.id} value={i}>{r.rota.nome}</option>)}
              </select>
            ) : <span className="ml-auto truncate text-[11px] text-orange-800">{caminhoSel.rota.nome}</span>}
          </div>
          <ol className="max-h-56 space-y-0.5 overflow-y-auto">
            {caminhoSel.passos.map((p, i) => {
              const aqui = p.chave === chave;
              const cf = p.fibra ? corFibra(p.fibra, p.cabo) : null;
              return (
                <li key={i}>
                  {i > 0 && p.cabo && (
                    <p className="ml-3 flex items-center gap-1 border-l-2 border-orange-400 py-0.5 pl-3 text-[10px] text-slate-600">
                      {cf && <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: cf.hex }} />}
                      {curto(semCodigo(p.cabo), 30)}{cf ? ` · ${cf.rotulo}` : ""}
                    </p>
                  )}
                  <p className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${aqui ? "bg-orange-500 font-bold text-white" : "text-slate-800"}`}>
                    <IconeElemento tipo={p.tipo} tamanho={16} /> {curto(p.nome, 34)}{p.porta ? ` · ${p.porta}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {modo === "tracar" && traco && !caminhoSel && <p className="text-[11px] text-slate-500">Esse ponto não está em nenhuma rota salva.</p>}

      {/* Salvar */}
      {modo !== "tracar" && (
        <div className="flex items-center justify-end gap-2">
          <button type="button" disabled={!hist.length} onClick={() => { setEd(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); }} className="mr-auto flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button>
          <button type="button" onClick={onCancelar} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Cancelar</button>
          <button type="button" disabled={salvando} onClick={salvar} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar conexões
          </button>
        </div>
      )}
    </div>
  );
}
