"use client";
import { confirmar } from "@/lib/dialogo";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, MousePointerClick, Route as RouteIcon, Save, Search, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, perdaSplitter, tipoVisual, TIPO_ELEMENTO_LABEL, type RotaOptica, type TipoElementoRota } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { chaveCabo, codigoDoCabo, semCodigo } from "@/lib/cabosRede";
import { idCaixa, portasPara, salvarLayoutUnifilar, type CaixaRede, type LayoutUnifilar, type SplitterCaixa } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import {
  caminhoNaCaixa, completarPelasRotas, desligar, idPonto, ligar, montarUnifilar, rotasDaFibra, tipoEntre, trocarPortaDio,
  type CadastroLigacoes, type CaboUni, type ModeloUnifilar, type PontoUni,
} from "@/lib/unifilar";
import { IconeElemento, iconeSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";
import { CALCULO_PADRAO } from "@/lib/rotaOptica";
import { potenciaPortasFinais } from "@/lib/potenciaCaixa";
import { COR_NIVEL, nivelPotencia } from "@/lib/analiseRede";
import { sincronizarSplitterCdoi } from "@/lib/sincronizar";
import { caixasDoPlano, planoPelaCaixa, planoPelasRotas, type PlanoTroca } from "@/lib/trocaFibra";
import { gravarTroca } from "@/lib/gravarTroca";
import { ligacoesDosClientes, type ClienteRede } from "@/lib/clientesRede";
import type { PortaCaixa, StatusPorta } from "@/lib/caixasRede";
import BuscaCliente from "./BuscaCliente";

/**
 * Unifilar da rede (estilo GeoGrid): uma janela escura onde as caixas vão abrindo em sequência.
 * Começa por uma caixa; clicando numa fibra de um cabo, a caixa do outro lado do cabo abre ao lado,
 * e o caminho da fibra acende em laranja por todas as caixas abertas.
 */
interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  catalogo: ItemCatalogo[];
  usuario: string;
  onCaixaSalva: (c: CaixaRede) => void;
  onAbrirRota: (id: string) => void;
  /** Rotas gravadas (troca de porta do DIO, splitter da CDOI): recarregar */
  onRotasMudaram?: () => void;
  /** Clientes do cadastro (modo Clientes nas portas) */
  clientes?: ClienteRede[];
  /** Prédio: a fibra de cada CDOI se edita na janela do prédio */
  onEditarPredio?: (chave: string) => void;
  /** Caixa que já abre (vindo da Árvore, do Mapa da rede ou do editor da rota) */
  inicial?: string | string[];
}

const ROW = 15, HEAD = 30, HEAD_CABO = 20, BW = 158, TOPO = 40, GAP_CAIXA = 120, LAR = "#f97316";
const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const COR_TIPO: Partial<Record<TipoElementoRota, string>> = { hub: "#ca8a04", cto: "#059669", cdoi: "#ea580c", ceo: "#2563eb", ct: "#525252", dio: "#475569", predio: "#0284c7" };
const textoSobre = (hex: string) => (["#f4f4f0", "#f2c200", "#ee86b0", "#20bdc9", "#8a949b", "#f08a1c", "#b48ae6"].includes(hex) ? "#0b0d10" : "#fff");

type Pt = { chave: string; p: PontoUni };

/** O que está aberto e sendo feito no Unifilar fica guardado no navegador (some só com Limpar, o "x" ou Salvar/Descartar) */
const CHAVE_ESTADO = "unifilar_estado_v1";
interface EstadoGuardado {
  abertas: string[];
  boxOff: Record<string, { dx: number; dy: number }>;
  eds: Record<string, CadastroLigacoes>;
  atds: Record<string, PortaCaixa[]>;
  dioPend: Record<string, { chave: string; cordao: string; n: number }>;
  cabosAbertos: string[];
  zoom: number;
  modo: "navegar" | "editar" | "clientes";
  inicioTraco: Pt | null;
  fibraTraco: { cabo: string; fibra: number } | null;
  rotaIdx: number;
  rolagem: { l: number; t: number };
}
function lerEstado(): Partial<EstadoGuardado> {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_ESTADO) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Cores do splitter: HUB laranja, CTO azul, CDOI (e outras) verde */
const TEMA_SPL = {
  hub: { fundo: "#2a1607", borda: "#ea580c", cabeca: "#9a3412", texto: "#ffedd5", suave: "#fdba74", ponto: "#fb923c", porta: "#4a2410" },
  cto: { fundo: "#0b1b33", borda: "#3b82f6", cabeca: "#1e3a8a", texto: "#dbeafe", suave: "#93c5fd", ponto: "#60a5fa", porta: "#172b4d" },
  verde: { fundo: "#0f2a1c", borda: "#22c55e", cabeca: "#14532d", texto: "#dcfce7", suave: "#86efac", ponto: "#4ade80", porta: "#1f3d33" },
} as const;

function inicialDe(cad?: CaixaRede): CadastroLigacoes {
  return {
    emendas: cad?.emendas ?? [],
    regras_emenda: cad?.regras_emenda ?? [],
    splitters: cad?.splitters?.length
      ? cad.splitters
      : cad?.splitter
        ? [{ id: "s1", relacao: cad.splitter, modelo_id: cad.splitter_modelo, entrada: {}, portas: portasPara(cad.splitter, cad.portas ?? []) }]
        : [],
  };
}

export default function UnifilarRede({ rotas: rotasBase, caixas, catalogo, usuario, onCaixaSalva, onAbrirRota, onRotasMudaram, clientes = [], inicial, onEditarPredio }: Props) {
  /** Trocas de adaptador do DIO ainda não gravadas: chave do DIO | cordão → adaptador */
  const [salvo] = useState(lerEstado);
  const [dioPend, setDioPend] = useState<Record<string, { chave: string; cordao: string; n: number }>>(salvo.dioPend ?? {});
  /** As rotas como ficam com as trocas pendentes (o desenho já mostra o novo adaptador) */
  const rotas = useMemo(() => {
    const pend = Object.values(dioPend);
    if (!pend.length) return rotasBase;
    return rotasBase.map((r) => {
      if (r.pai) return r;
      let els = r.elementos;
      for (const d of pend) {
        const usa = els.some((e) => chaveElemento(e) === d.chave && e.tipo === "dio" && !!e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(d.cordao));
        if (!usa) continue;
        els = trocarPortaDio({ ...r, elementos: els }, d.chave, d.n) ?? els;
      }
      return els === r.elementos ? r : { ...r, elementos: els };
    });
  }, [rotasBase, dioPend]);
  const rotasMudadas = rotas.filter((r, i) => r !== rotasBase[i]);
  const cadDe = useMemo(() => new Map(caixas.map((c) => [c.chave, c])), [caixas]);
  /** Todas as caixas da rede (a OLT também), para começar */
  const todasCaixas = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; tipo: TipoElementoRota; equip?: string }>();
    rotas.forEach((r) => r.elementos.forEach((e) => { const k = chaveElemento(e); if (!m.has(k)) m.set(k, { chave: k, nome: e.nome, tipo: tipoVisual(e), equip: e.equipamento_id }); }));
    return [...m.values()];
  }, [rotas]);
  const infoDe = useMemo(() => new Map(todasCaixas.map((c) => [c.chave, c])), [todasCaixas]);

  // o que já estava aberto continua; a caixa pedida por outra tela entra junto
  const [abertas, setAbertas] = useState<string[]>(() => {
    const pedidas = Array.isArray(inicial) ? inicial : inicial ? [inicial] : [];
    const antes = (salvo.abertas ?? []).filter((k) => typeof k === "string");
    return [...antes, ...pedidas.filter((k) => !antes.includes(k))];
  });
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"navegar" | "editar" | "clientes">(salvo.modo ?? "navegar");
  /** Modo Clientes: a perna escolhida; Editar: o splitter escolhido (para remover) */
  const [pernaSel, setPernaSel] = useState<{ chave: string; spl: string; porta: number } | null>(null);
  const [splSel, setSplSel] = useState<{ chave: string; id: string } | null>(null);
  /** CT: o cliente de cada fibra que chega (atendimento), ainda não gravado */
  const [atds, setAtds] = useState<Record<string, PortaCaixa[]>>(salvo.atds ?? {});
  const [fibraCt, setFibraCt] = useState<{ chave: string; fibra: number } | null>(null);
  const atdDe = (chave: string) => atds[chave] ?? cadDe.get(chave)?.atendimento ?? [];
  /** Arrumação: a posição da caixa na tela (só nesta sessão) e o arrasto em andamento */
  const [boxOff, setBoxOff] = useState<Record<string, { dx: number; dy: number }>>(salvo.boxOff ?? {});
  const [vivo, setVivo] = useState<{ chave: string; id: string; dx: number; dy: number } | null>(null);
  const arrasto = useRef<{ chave: string; id: string; sx: number; sy: number; base: { dx: number; dy: number }; moveu: boolean } | null>(null);
  /** Potência (dBm) de cada fibra que chega em cada caixa, pelas rotas: chave → "CB|fibra" → dBm */
  const potChega = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rotas) r.elementos.forEach((e, i) => {
      if (i === 0 || !e.cabo_entrada || !e.fibra_entrada || e.potencia_entrada === undefined) return;
      const k = chaveElemento(e);
      const mm = m.get(k) ?? new Map<string, number>();
      const kf = `${chaveCabo(e.cabo_entrada)}|${e.fibra_entrada}`;
      if (!mm.has(kf)) mm.set(kf, e.potencia_entrada);
      m.set(k, mm);
    });
    return m;
  }, [rotas]);
  /** dBm em cada porta de splitter da caixa (HUB: a perna vai fundida no cabo; CTO/CDOI: conector do cliente) */
  const potPortas = (chave: string, spls: SplitterCaixa[]) => {
    const mm = potChega.get(chave);
    if (!mm) return new Map<string, number>();
    const entradas = [...mm].map(([k, pot]) => { const [cabo, f] = k.split("|"); return { cabo, fibra: +f, pot }; });
    const base = potenciaPortasFinais(spls, entradas, (id) => catalogo.find((q) => q.id === id)?.perda_db);
    if (infoDe.get(chave)?.tipo !== "hub") return base;
    return new Map([...base].map(([k, v]) => [k, v + CALCULO_PADRAO.conector_db - CALCULO_PADRAO.emenda_db]));
  };
  const dbm = (v?: number) => (v === undefined ? "" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`);

  /** Ir até uma caixa (clique no nome no painel da rota): rola até ela e pisca a borda */
  const irPara = useRef<string | null>(Array.isArray(inicial) ? inicial[0] ?? null : inicial ?? null);
  const [destaque, setDestaque] = useState<string | null>(null);
  useEffect(() => {
    const k = irPara.current;
    if (!k || !area.current) return;
    const el = area.current.querySelector(`[data-caixa="${CSS.escape(k)}"]`);
    if (!el) return;
    irPara.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  });
  function irParaCaixa(chave: string) {
    setAbertas((a) => (a.includes(chave) ? a : [...a, chave]));
    irPara.current = chave;
    setDestaque(chave);
    setTimeout(() => setDestaque((d) => (d === chave ? null : d)), 1800);
  }
  const layoutDe = (chave: string): LayoutUnifilar => cadDe.get(chave)?.layout_unifilar ?? {};
  /** Deslocamento de um item ("box" = a caixa inteira) em relação ao lugar automático */
  const off = (chave: string, id: string) =>
    vivo && vivo.chave === chave && vivo.id === id ? vivo : (id === "box" ? boxOff[chave] : layoutDe(chave)[id]) ?? { dx: 0, dy: 0 };
  const [eds, setEds] = useState<Record<string, CadastroLigacoes>>(salvo.eds ?? {});
  const [hist, setHist] = useState<Record<string, CadastroLigacoes>[]>([]);
  const [sel, setSel] = useState<Pt | null>(null);
  const [selLig, setSelLig] = useState<{ chave: string; id: string } | null>(null);
  /** Ponto clicado no "Navegar": o caminho laranja é recalculado quando novas caixas abrem */
  const [inicioTraco, setTraco] = useState<Pt | null>(salvo.inicioTraco ?? null);
  /** Fibra traçada: as rotas dela saem das rotas (sempre atualizadas) */
  const [fibraTraco, setFibraTraco] = useState<{ cabo: string; fibra: number } | null>(salvo.fibraTraco ?? null);
  const rotasTraco = useMemo(() => (fibraTraco ? rotasDaFibra(rotas, fibraTraco.cabo, fibraTraco.fibra) : []), [rotas, fibraTraco]);
  const [rotaIdx, setRotaIdx] = useState(salvo.rotaIdx ?? 0);
  const [cabosAbertos, setCabosAbertos] = useState<Set<string>>(() => new Set(salvo.cabosAbertos ?? []));
  const [zoom, setZoom] = useState(typeof salvo.zoom === "number" ? salvo.zoom : 1);
  const [cheia, setCheia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  // guarda o que está sendo feito (atualizar a página, trocar de aba e voltar: continua igual)
  const rolagem = useRef(salvo.rolagem ?? { l: 0, t: 0 });
  useEffect(() => {
    try {
      const estado: EstadoGuardado = {
        abertas, boxOff, eds, atds, dioPend, cabosAbertos: [...cabosAbertos], zoom, modo, inicioTraco, fibraTraco, rotaIdx, rolagem: rolagem.current,
      };
      window.localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estado));
    } catch { /* navegador sem espaço ou bloqueado: segue sem guardar */ }
  }, [abertas, boxOff, eds, atds, dioPend, cabosAbertos, zoom, modo, inicioTraco, fibraTraco, rotaIdx]);
  // volta para onde estava rolado (se não veio pedir uma caixa)
  useEffect(() => {
    if (irPara.current) return;
    const el = area.current;
    const r = salvo.rolagem;
    if (el && r) { el.scrollLeft = r.l; el.scrollTop = r.t; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const guardaRolagem = useRef<ReturnType<typeof setTimeout> | null>(null);
  function aoRolar(e: React.UIEvent<HTMLDivElement>) {
    rolagem.current = { l: e.currentTarget.scrollLeft, t: e.currentTarget.scrollTop };
    if (guardaRolagem.current) clearTimeout(guardaRolagem.current);
    guardaRolagem.current = setTimeout(() => {
      try {
        const v = JSON.parse(window.localStorage.getItem(CHAVE_ESTADO) ?? "{}");
        window.localStorage.setItem(CHAVE_ESTADO, JSON.stringify({ ...v, rolagem: rolagem.current }));
      } catch { /* sem guardar */ }
    }, 300);
  }


  useEffect(() => {
    if (!cheia) return;
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") setCheia(false); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [cheia]);

  const comSpl = (chave: string) => ["hub", "cto", "cdoi"].includes(infoDe.get(chave)?.tipo ?? "");
  /** O cadastro da caixa completado pelas rotas (splitter de cada porta + pernas), sem gravar */
  const automatico = useMemo(() => {
    const m = new Map<string, { ed: CadastroLigacoes; mudou: boolean }>();
    for (const k of abertas) {
      const base = inicialDe(cadDe.get(k));
      if (!["hub", "cto", "cdoi"].includes(infoDe.get(k)?.tipo ?? "")) { m.set(k, { ed: base, mudou: false }); continue; }
      const r = completarPelasRotas(k, rotas, base);
      m.set(k, { ed: r.ed, mudou: r.ed !== base });
    }
    return m;
  }, [abertas, rotas, cadDe, infoDe]);
  const edDe = (chave: string) => eds[chave] ?? automatico.get(chave)?.ed ?? inicialDe(cadDe.get(chave));
  const modelos = useMemo(() => {
    const m = new Map<string, ModeloUnifilar>();
    for (const k of abertas) {
      const e = eds[k] ?? automatico.get(k)?.ed ?? inicialDe(cadDe.get(k));
      m.set(k, montarUnifilar(k, rotas, { ...cadDe.get(k), ...e, splitters: comSpl(k) ? e.splitters : [] }));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertas, eds, rotas, cadDe, automatico]);
  /** caixas para gravar: as editadas e as montadas pelas rotas que ainda não estão no cadastro */
  const sujas = [...new Set([...Object.keys(eds), ...Object.keys(atds), ...abertas.filter((k) => automatico.get(k)?.mudou)])];
  const pendentes = sujas.length + rotasMudadas.length;

  function mudar(chave: string, n: CadastroLigacoes) {
    setHist((h) => [...h.slice(-49), eds]);
    setEds((x) => ({ ...x, [chave]: n }));
  }

  // ---------- layout das caixas abertas, lado a lado ----------
  // Cada item tem um lugar automático (sem sobrepor: cada bloco empurra o de baixo) e o deslocamento
  // que o usuário arrastou, gravado na caixa (layout_unifilar). A caixa envolve o que tem dentro.
  type Bloco = { chave: string; c: CaboUni; x: number; y: number; fibras: number[]; h: number; id: string };
  type Painel = { x: number; y: number; w: number; h: number };
  const pos = new Map<string, [number, number]>();
  /** Fibras de cabo: ponto dos dois lados do bloco; a ligação usa o lado mais perto da outra ponta */
  const lados = new Map<string, { l: [number, number]; r: [number, number] }>();
  const blocos: Bloco[] = [];
  const caixasDes: { chave: string; x: number; y: number; w: number; h: number; spl: { s: SplitterCaixa; x: number; y: number; h: number; w: number; portas: ReturnType<typeof portasPara>; id: string }[]; pons: string[]; capDio: number; olt?: Painel; dio?: Painel; arrumada: boolean }[] = [];
  const COLS = 12, CEL = 16;
  let xCur = 20;
  let minX = 0, minY = 0, maxX = 900, maxY = 300;
  for (const chave of abertas) {
    const m = modelos.get(chave)!;
    const ed = edDe(chave);
    const temSpl = comSpl(chave) && ed.splitters.length > 0;
    const tipoCx = infoDe.get(chave)?.tipo;
    const bo = off(chave, "box");
    const X0 = xCur + bo.dx, T = TOPO + bo.dy;
    // DIO: grade de adaptadores no meio (capacidade do DIO no cadastro de equipamentos)
    const adaptUsados = m.ligacoes.flatMap((l) => [l.a, l.b]).filter((q): q is { k: "adaptador"; n: number } => q.k === "adaptador").map((q) => q.n);
    const capDio = tipoCx === "dio" ? Math.max(catalogo.find((q) => q.id === infoDe.get(chave)?.equip)?.portas ?? 0, ...adaptUsados, 12) : 0;
    const MID = temSpl ? 240 : tipoCx === "dio" ? COLS * CEL + 60 : 130;
    const xE = X0 + 12, xD = X0 + 12 + BW + MID;
    const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
    const itens: Painel[] = [];
    const vis = (c: CaboUni) => {
      const todas = Array.from({ length: c.capacidade }, (_, i) => i + 1);
      if (cabosAbertos.has(`${chave}|${c.id}`)) return todas;
      const usadas = new Set<number>([...c.sinal.keys()]);
      todas.forEach((f) => { if (ocup.has(idPonto({ k: "fibra", lado: c.lado, cabo: c.nome, fibra: f }))) usadas.add(f); });
      if (modo === "editar" && sel?.chave === chave) return todas;
      const tubos = new Set([...usadas].map((f) => corFibra(f, c.nome).tubo ?? 1));
      const v = todas.filter((f) => tubos.has(corFibra(f, c.nome).tubo ?? 1));
      return v.length ? v : todas.slice(0, Math.min(12, todas.length));
    };
    const empilhar = (lista: CaboUni[], x: number) => {
      let y = T + 44;
      for (const c of lista) {
        const fibras = vis(c);
        const h = HEAD_CABO + fibras.length * ROW + (fibras.length < c.capacidade ? ROW : 0) + 6;
        const id = `c:${c.lado}:${c.chave}`;
        const o = off(chave, id);
        const bx = x + o.dx, by = y + o.dy;
        blocos.push({ chave, c, x: bx, y: by, fibras, h, id });
        itens.push({ x: bx, y: by, w: BW, h });
        fibras.forEach((f, k) => {
          const kk = `${chave}#${idPonto({ k: "fibra", lado: c.lado, cabo: c.nome, fibra: f })}`;
          const yy = by + HEAD_CABO + k * ROW + ROW / 2;
          pos.set(kk, [c.lado === "chega" ? bx + BW : bx, yy]);
          lados.set(kk, { l: [bx, yy], r: [bx + BW, yy] });
        });
        y += h + 16;
      }
    };
    // OLT: a coluna da esquerda é a própria OLT, com as portas PON usadas
    const pons = m.ligacoes.filter((l) => l.tipo === "cordao").map((l) => (l.a as { k: "pon"; porta: string }).porta).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    let olt: Painel | undefined;
    if (tipoCx === "olt") {
      const o = off(chave, "olt");
      olt = { x: xE + o.dx, y: T + 44 + o.dy, w: BW, h: HEAD + pons.length * (ROW + 4) + 4 };
      pons.forEach((pp, k) => pos.set(`${chave}#${idPonto({ k: "pon", porta: pp })}`, [olt!.x + BW, olt!.y + HEAD + k * (ROW + 4) + ROW / 2]));
      itens.push(olt);
    }
    let dio: Painel | undefined;
    if (tipoCx === "dio") {
      const o = off(chave, "dio");
      dio = { x: xE + BW + 20 + o.dx, y: T + 50 + o.dy, w: COLS * CEL + 20, h: Math.ceil(capDio / COLS) * CEL + 30 };
      for (let n = 1; n <= capDio; n++) {
        const k = n - 1;
        pos.set(`${chave}#${idPonto({ k: "adaptador", n })}`, [dio.x + 10 + (k % COLS) * CEL + CEL / 2, dio.y + 20 + Math.floor(k / COLS) * CEL + CEL / 2]);
      }
      itens.push({ ...dio, h: dio.h + 10 });
    }
    if (tipoCx !== "olt") empilhar(m.cabos.filter((c) => c.lado === "chega"), xE);
    empilhar(m.cabos.filter((c) => c.lado === "sai"), xD);
    // splitters: no meio, cada um perto da fibra que o alimenta (sem passar por cima do de cima)
    const spl: (typeof caixasDes)[number]["spl"] = [];
    if (temSpl) {
      const SW = 112, xS = xE + BW + (MID - SW) / 2;
      let yMin = T + 44;
      const yEntrada = (sp: SplitterCaixa) =>
        sp.entrada.fibra ? pos.get(`${chave}#${idPonto({ k: "fibra", lado: "chega", ...sp.entrada.fibra })}`)?.[1] ?? 9999 : 9999;
      const ord = [...ed.splitters].sort((a, b) => yEntrada(a) - yEntrada(b));
      for (const sp of ord) {
        const portas = portasPara(sp.relacao, sp.portas);
        const h = 26 + portas.length * ROW + 8;
        const alvo = yEntrada(sp) < 9999 ? yEntrada(sp) - h / 2 : yMin;
        const yAuto = Math.max(yMin, alvo);
        const id = `s:${sp.id}`;
        const o = off(chave, id);
        const x = xS + o.dx, y = yAuto + o.dy;
        spl.push({ s: sp, x, y, h, w: SW, portas, id });
        itens.push({ x, y, w: SW, h });
        pos.set(`${chave}#${idPonto({ k: "entrada", spl: sp.id })}`, [x - 6, y + 26 + (portas.length * ROW) / 2]);
        portas.forEach((pt, k) => pos.set(`${chave}#${idPonto({ k: "porta", spl: sp.id, porta: pt.numero })}`, [x + SW + 6, y + 26 + k * ROW + ROW / 2]));
        yMin = yAuto + h + 18;
      }
    }
    // a caixa envolve tudo o que tem dentro (cresce se um item foi arrastado para fora)
    const wAuto = 24 + BW * 2 + MID;
    const x0 = Math.min(X0, ...itens.map((q) => q.x - 12));
    const y0 = Math.min(T, ...itens.map((q) => q.y - 44));
    const x1 = Math.max(X0 + wAuto, ...itens.map((q) => q.x + q.w + 12));
    const y1 = Math.max(T + 120, ...itens.map((q) => q.y + q.h + 12));
    const lay = layoutDe(chave);
    caixasDes.push({ chave, x: x0, y: y0, w: x1 - x0, h: y1 - y0, spl, pons, capDio, olt, dio, arrumada: Object.keys(lay).length > 0 || !!boxOff[chave] });
    minX = Math.min(minX, x0 - 20); minY = Math.min(minY, y0 - 20);
    maxX = Math.max(maxX, x1 + 20); maxY = Math.max(maxY, y1 + 20);
    // a próxima caixa começa depois desta (se um item foi arrastado para a direita, ela abre espaço)
    xCur = Math.max(xCur + wAuto, x1 - bo.dx) + GAP_CAIXA;
  }
  const W = maxX - minX, H = maxY - minY;

  /** Centro de um ponto (a fibra fica no meio do bloco do cabo) */
  const centro = (k: string): [number, number] | undefined => {
    const l = lados.get(k);
    return l ? [(l.l[0] + l.r[0]) / 2, l.l[1]] : pos.get(k);
  };
  /** Onde a ligação encosta: na fibra, o lado do bloco mais perto da outra ponta; e para que lado ela sai */
  const encaixe = (k: string, alvoX: number): { p: [number, number]; dir: number } | undefined => {
    const l = lados.get(k);
    if (l) return Math.abs(l.l[0] - alvoX) <= Math.abs(l.r[0] - alvoX) ? { p: l.l, dir: -1 } : { p: l.r, dir: 1 };
    const p0 = pos.get(k);
    if (!p0) return undefined;
    const id = k.slice(k.indexOf("#") + 1);
    const dir = id.startsWith("e:") ? -1 : id.startsWith("p:") || id.startsWith("o:") ? 1 : alvoX < p0[0] ? -1 : 1;
    return { p: p0, dir };
  };
  /** Curva entre duas pontas, saindo de cada uma para o lado dela */
  const curva = (ka: string, kb: string): string | null => {
    const ca = centro(ka), cb = centro(kb);
    if (!ca || !cb) return null;
    const a = encaixe(ka, cb[0]), b = encaixe(kb, ca[0]);
    if (!a || !b) return null;
    const t = Math.max(30, Math.abs(b.p[0] - a.p[0]) / 2);
    return `M${a.p[0]} ${a.p[1]} C ${a.p[0] + a.dir * t} ${a.p[1]}, ${b.p[0] + b.dir * t} ${b.p[1]}, ${b.p[0]} ${b.p[1]}`;
  };

  // ---------- arrastar caixa e itens ----------
  /** Grava a arrumação da caixa (só o desenho; não mexe em ligações) */
  function gravarLayout(chave: string, layout: LayoutUnifilar) {
    const cad = cadDe.get(chave);
    const nome = infoDe.get(chave)?.nome ?? cad?.nome ?? chave;
    onCaixaSalva({ ...(cad ?? { id: idCaixa(chave), chave, nome, portas: [] }), layout_unifilar: Object.keys(layout).length ? layout : undefined });
    salvarLayoutUnifilar(chave, nome, layout).catch((e) => setErro(e instanceof Error ? `Arrumação não gravada: ${e.message}` : "Arrumação não gravada."));
  }
  function reorganizar(chave: string) {
    setBoxOff((b) => { const n = { ...b }; delete n[chave]; return n; });
    if (Object.keys(layoutDe(chave)).length) gravarLayout(chave, {});
  }
  /** Props de um item arrastável (cabeçalho ou fundo dele) */
  const arrastavel = (chave: string, id: string) => ({
    className: "cursor-move",
    onPointerDown: (e: React.PointerEvent<SVGElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      arrasto.current = { chave, id, sx: e.clientX, sy: e.clientY, base: off(chave, id), moveu: false };
    },
    onPointerMove: (e: React.PointerEvent<SVGElement>) => {
      const a = arrasto.current;
      if (!a) return;
      const dx = (e.clientX - a.sx) / zoom, dy = (e.clientY - a.sy) / zoom;
      if (!a.moveu && Math.abs(dx) + Math.abs(dy) < 4) return;
      a.moveu = true;
      moveu.current = true;
      setVivo({ chave: a.chave, id: a.id, dx: a.base.dx + dx, dy: a.base.dy + dy });
    },
    onPointerUp: () => {
      const a = arrasto.current;
      arrasto.current = null;
      if (!a?.moveu || !vivo) { setVivo(null); return; }
      const fim = { dx: Math.round(vivo.dx), dy: Math.round(vivo.dy) };
      if (a.id === "box") setBoxOff((b) => ({ ...b, [a.chave]: fim }));
      else gravarLayout(a.chave, { ...layoutDe(a.chave), [a.id]: fim });
      setVivo(null);
      setTimeout(() => { moveu.current = false; }, 0);
    },
  });

  // ---------- ações ----------
  /** Abre a caixa do outro lado do cabo (sai → à direita; chega → à esquerda) */
  function abrirVizinha(chave: string, c: CaboUni) {
    if (!c.outraChave || abertas.includes(c.outraChave) || !infoDe.has(c.outraChave)) return;
    const i = abertas.indexOf(chave);
    const n = [...abertas];
    n.splice(c.lado === "sai" ? i + 1 : i, 0, c.outraChave);
    setAbertas(n);
  }
  /** Caminho laranja: dentro da caixa e atravessando os cabos para as caixas abertas */
  function calcularTraco(inicio: Pt): Set<string> {
    const acesos = new Set<string>();
    const fila: Pt[] = [inicio];
    const vistos = new Set<string>();
    while (fila.length) {
      const { chave, p } = fila.shift()!;
      const k0 = `${chave}#${idPonto(p)}`;
      if (vistos.has(k0)) continue;
      vistos.add(k0);
      const m = modelos.get(chave);
      if (!m) continue;
      const cam = caminhoNaCaixa(m, p);
      cam.forEach((x) => acesos.add(`${chave}#${x}`));
      // fibras acesas que saem/chegam por cabos ligados a outra caixa aberta: segue para lá
      for (const x of cam) {
        const mm = x.match(/^f:(chega|sai):(.+):(\d+)$/);
        if (!mm) continue;
        const cabo = m.cabos.find((c) => c.lado === mm[1] && c.chave === mm[2]);
        if (!cabo?.outraChave || !abertas.includes(cabo.outraChave)) continue;
        fila.push({ chave: cabo.outraChave, p: { k: "fibra", lado: mm[1] === "sai" ? "chega" : "sai", cabo: cabo.nome, fibra: +mm[3] } });
      }
    }
    return acesos;
  }
  const traco = inicioTraco ? calcularTraco(inicioTraco) : null;
  const tracar = (inicio: Pt) => setTraco(inicio);
  /** Cabo que sai desta caixa para um prédio: devolve a chave do prédio */
  function predioDoCabo(chave: string, p: PontoUni): string | undefined {
    if (p.k !== "fibra" || p.lado !== "sai") return undefined;
    const c = modelos.get(chave)?.cabos.find((x) => x.lado === "sai" && x.chave === chaveCabo(p.cabo));
    return c?.outraChave && infoDe.get(c.outraChave)?.tipo === "predio" ? c.outraChave : undefined;
  }
  async function clicarPonto(chave: string, p: PontoUni) {
    setErro(null);
    if (modo === "clientes") {
      if (p.k === "porta") { setPernaSel({ chave, spl: p.spl, porta: p.porta }); setFibraCt(null); }
      else if (p.k === "fibra" && p.lado === "chega" && infoDe.get(chave)?.tipo === "ct") { setFibraCt({ chave, fibra: p.fibra }); setPernaSel(null); }
      else setErro("No modo Clientes, clique numa porta (perna) de splitter ou, na CT, numa fibra que chega.");
      return;
    }
    if (modo === "navegar") {
      // porta PON ou adaptador do DIO: segue pela fibra ligada a eles
      if (p.k === "pon" || p.k === "adaptador") {
        const l = modelos.get(chave)?.ligacoes.find((x) => (x.tipo === "cordao" || x.tipo === "dio") && idPonto(x.a) === idPonto(p) && x.b.k === "fibra");
        if (l && l.b.k === "fibra") {
          const fb = l.b;
          const c = modelos.get(chave)?.cabos.find((x) => x.lado === "sai" && x.chave === chaveCabo(fb.cabo));
          if (c) abrirVizinha(chave, c);
          setFibraTraco({ cabo: fb.cabo, fibra: fb.fibra });
          setRotaIdx(0);
        }
      }
      if (p.k === "fibra") {
        const c = modelos.get(chave)?.cabos.find((x) => x.lado === p.lado && x.chave === chaveCabo(p.cabo));
        if (c) abrirVizinha(chave, c);
        setFibraTraco({ cabo: p.cabo, fibra: p.fibra });
        setRotaIdx(0);
      }
      tracar({ chave, p });
      return;
    }
    if (infoDe.get(chave)?.tipo === "predio") {
      setErro("No prédio, qual fibra alimenta cada CDOI se muda na janela do prédio (botão Editar no prédio).");
      onEditarPredio?.(chave);
      return;
    }
    if (!sel) { setSel({ chave, p }); setSelLig(null); return; }
    if (sel.chave !== chave) {
      setErro(`As ligações são feitas dentro de uma mesma caixa. Agora o ponto escolhido é desta (${curto(infoDe.get(chave)?.nome ?? "", 30)}): clique no destino com anel verde.`);
      setSel({ chave, p });
      return;
    }
    if (idPonto(sel.p) === idPonto(p)) { setSel(null); return; }
    // DIO: cordão que chega + adaptador = a rota passa a usar aquele adaptador (grava na rota)
    const cordao = sel.p.k === "fibra" && sel.p.lado === "chega" ? sel.p : p.k === "fibra" && p.lado === "chega" ? p : null;
    const adapt = sel.p.k === "adaptador" ? sel.p : p.k === "adaptador" ? p : null;
    if (cordao && adapt) { moverPortaDio(chave, cordao.cabo, adapt.n); setSel(null); return; }
    // cabo que vai para um prédio: a fibra de cada CDOI é do prédio (lá se troca, e esta caixa acompanha sozinha)
    const pr = predioDoCabo(chave, p) ?? predioDoCabo(chave, sel.p);
    if (pr) {
      setErro(`Esse cabo vai para o ${infoDe.get(pr)?.nome ?? "prédio"}: a fibra de cada CDOI se troca na janela do prédio, e a perna aqui acompanha sozinha.`);
      setSel(null);
      onEditarPredio?.(pr);
      return;
    }
    const t = tipoEntre(sel.p, p);
    if (!["fusao", "entrada", "perna", "nivel2"].includes(t)) { setErro(t); return; }
    const m = modelos.get(chave)!;
    const ocup = m.ligacoes.some((l) => l.tipo !== "passa" && l.origem !== "rota" && [idPonto(l.a), idPonto(l.b)].some((x) => x === idPonto(p) || x === idPonto(sel.p)));
    if (ocup && !(await confirmar("Um dos pontos já está ligado. Trocar a ligação?", { ok: "Trocar" }))) return;
    const r = ligar(edDe(chave), sel.p, p);
    if (typeof r === "string") { setErro(r); return; }
    mudar(chave, r);
    setSel(null);
  }
  /** Troca o adaptador do DIO das rotas que chegam por este cordão (grava nas rotas no Salvar) */
  function moverPortaDio(chave: string, cordao: string, n: number) {
    const donas = rotas.filter((r) => !r.pai && r.elementos.some((e) => chaveElemento(e) === chave && e.tipo === "dio" && !!e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(cordao)));
    if (!donas.length) { setErro("Nenhuma rota chega por esse cordão."); return; }
    const ocupante = rotas.find((r) => !donas.includes(r) && !r.pai && r.elementos.some((e) => chaveElemento(e) === chave && e.tipo === "dio" && /Porta\s*0*(\d+)/i.exec(e.porta ?? "")?.[1] === String(n)));
    if (ocupante) { setErro(`O adaptador ${n} já é usado por ${ocupante.nome}. Mude essa rota antes.`); return; }
    setDioPend((d) => ({ ...d, [`${chave}|${chaveCabo(cordao)}`]: { chave, cordao, n } }));
  }

  /** Revisão antes de gravar: o plano da troca (rotas que mudam e caixas das pontas dos cabos) */
  const [revisao, setRevisao] = useState<PlanoTroca | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** Rotas da revisão (as que mudam por causa de ligações mudadas nas caixas) */
  const rotasDaRevisao = (p: PlanoTroca) => [...new Set(p.mudancas.map((m) => m.rota.id))];

  /** Tudo o que está pendente vira um plano só: trocas de adaptador do DIO e ligações mudadas nas caixas */
  function montarPlano(): PlanoTroca {
    // DIO: outro adaptador = outra fibra no cabo que sai dele (a caixa da outra ponta acompanha)
    const plano = planoPelasRotas(rotasBase, rotasMudadas);
    // caixa por caixa, uma mudança em cima da outra
    let atuais = rotas;
    for (const chave of sujas) {
      const p = planoPelaCaixa(chave, atuais, inicialDe(cadDe.get(chave)), edDe(chave));
      p.rotas.forEach((r, id) => plano.rotas.set(id, r));
      plano.mudancas.push(...p.mudancas);
      plano.pontas.push(...p.pontas);
      plano.bloqueadas.push(...p.bloqueadas);
      if (p.rotas.size) atuais = atuais.map((x) => p.rotas.get(x.id) ?? x);
    }
    return plano;
  }

  function revisarESalvar() {
    setErro(null);
    const plano = montarPlano();
    // nada muda nas rotas por causa das caixas: grava direto
    if (!plano.mudancas.length && !plano.bloqueadas.length) { void salvar(plano, new Set()); return; }
    setMarcadas(new Set(rotasDaRevisao(plano)));
    setRevisao(plano);
  }

  /** Cadastro completo da caixa para gravar (o que o Unifilar mexe + o resto como está) */
  function caixaParaGravar(chave: string, ed: CadastroLigacoes) {
    const cad = cadDe.get(chave);
    const temSpl = comSpl(chave);
    if (temSpl && ed.splitters.some((s) => !s.entrada.fibra && !s.entrada.splitter)) throw new Error(`${infoDe.get(chave)?.nome}: um splitter está sem entrada.`);
    return {
      chave, nome: infoDe.get(chave)?.nome ?? cad?.nome ?? chave,
      splitter: temSpl ? undefined : cad?.splitter, splitter_modelo: temSpl ? undefined : cad?.splitter_modelo,
      portas: temSpl ? [] : cad?.portas ?? [], splitters: temSpl ? ed.splitters : cad?.splitters,
      obs: cad?.obs, regras_emenda: ed.regras_emenda, emendas: ed.emendas, atendimento: atds[chave] ?? cad?.atendimento,
      layout_unifilar: cad?.layout_unifilar, atualizado_por: usuario,
    };
  }

  /** Grava o plano de uma vez (rotas e caixas juntas): as trocas do DIO sempre, as da revisão se marcadas */
  async function salvar(plano: PlanoTroca, marcadasAgora: Set<string>) {
    setSalvando(true);
    setErro(null);
    try {
      const valem = new Set([...rotasMudadas.map((r) => r.id), ...marcadasAgora]);
      const rotasGravar = [...plano.rotas.values()].filter((r) => valem.has(r.id));
      // as caixas editadas + as das pontas dos cabos trocados (só caixa que já tem cadastro)
      const cadastroDe = (k: string) => (cadDe.has(k) || eds[k] ? edDe(k) : undefined);
      const cadastros = caixasDoPlano(plano.pontas, cadastroDe, new Map(sujas.map((k) => [k, edDe(k)])), valem);
      const gravadas = await gravarTroca(rotasGravar, [...cadastros].map(([k, ed]) => caixaParaGravar(k, ed)));
      gravadas.forEach(onCaixaSalva);
      // CDOI: o splitter do Unifilar passa para o prédio e para a rota (conta de potência)
      const rotasDepois = rotasBase.map((x) => rotasGravar.find((r) => r.id === x.id) ?? x);
      let mudouRota = rotasGravar.length > 0;
      for (const c of gravadas) {
        if (infoDe.get(c.chave)?.tipo === "cdoi" && (await sincronizarSplitterCdoi(c, rotasDepois, catalogo, usuario))) mudouRota = true;
      }
      setDioPend({});
      setEds({});
      setAtds({});
      setHist([]);
      setRevisao(null);
      if (mudouRota) onRotasMudaram?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // ---------- arrastar a área ----------
  const arr = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const moveu = useRef(false);

  const aceso = (id: string) => !!traco?.has(id);
  const ponto = (chave: string, p: PontoUni, x: number, y: number, cor: string, ocup: boolean, lado = "") => {
    const id = `${chave}#${idPonto(p)}`;
    const ativo = sel && sel.chave === chave && idPonto(sel.p) === idPonto(p);
    const dioPar = !!sel && ((sel.p.k === "fibra" && sel.p.lado === "chega" && p.k === "adaptador") || (sel.p.k === "adaptador" && p.k === "fibra" && p.lado === "chega"));
    const cand = modo === "editar" && sel?.chave === chave && !ativo && (dioPar || ["fusao", "entrada", "perna", "nivel2"].includes(tipoEntre(sel.p, p)));
    const apagado = modo === "editar" && !!sel && !ativo && !cand;
    return (
      <g key={`pt${id}${lado}`} className="cursor-pointer" opacity={apagado ? 0.3 : 1} onClick={(e) => { e.stopPropagation(); if (!moveu.current) clicarPonto(chave, p); }}>
        <circle cx={x} cy={y} r={9} fill="transparent" />
        {cand && <circle cx={x} cy={y} r={7.5} fill="none" stroke="#4ade80" strokeWidth={1.4} />}
        {ativo && <circle cx={x} cy={y} r={8} fill="#facc15" opacity={0.45} />}
        <circle cx={x} cy={y} r={4.3} fill={aceso(id) ? LAR : ocup ? cor : "#1f2937"} stroke={aceso(id) ? "#fff" : ocup ? "#0b0d10" : cor} strokeWidth={1.3} />
      </g>
    );
  };

  const filtradas = todasCaixas.filter((c) => !busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase())).slice(0, 40);
  const caminho = rotasTraco[rotaIdx];

  return (
    <div className={`rolagem-escura overflow-hidden border border-slate-800 bg-[#16181c] text-slate-200 ${cheia ? "fixed inset-0 z-50 flex flex-col" : "rounded-2xl"}`}>
      {/* Barra */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-[#0f1115] px-3 py-2 text-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Abrir caixa…" className="w-56 rounded-lg border border-slate-700 bg-[#1b1d21] py-1.5 pl-7 pr-2 text-xs text-slate-200 outline-none focus:border-indigo-500" />
          {busca.trim() && (
            <ul className="absolute left-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-slate-700 bg-[#1b1d21] py-1 shadow-2xl">
              {filtradas.map((c) => (
                <li key={c.chave}>
                  <button type="button" onClick={() => { setAbertas((a) => (a.includes(c.chave) ? a : [...a, c.chave])); setBusca(""); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-800">
                    <IconeElemento tipo={c.tipo} tamanho={18} /> <span className="truncate">{c.nome}</span>
                  </button>
                </li>
              ))}
              {filtradas.length === 0 && <li className="px-2.5 py-2 text-slate-500">Nenhuma caixa.</li>}
            </ul>
          )}
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
          {([["navegar", "Navegar e traçar"], ["editar", "Editar conexões"], ["clientes", "Clientes nas portas"]] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => { setModo(k); setSel(null); setSelLig(null); setPernaSel(null); setSplSel(null); setFibraCt(null); }}
              className={`px-2.5 py-1.5 font-semibold ${modo === k ? (k === "navegar" ? "bg-orange-500 text-white" : k === "clientes" ? "bg-sky-600 text-white" : "bg-indigo-600 text-white") : "bg-[#1b1d21] text-slate-400 hover:text-slate-200"}`}>
              {r}
            </button>
          ))}
        </div>
        {abertas.length > 0 && <button type="button" onClick={() => { setAbertas([]); setTraco(null); setFibraTraco(null); setBoxOff({}); setCabosAbertos(new Set()); }} className="rounded-lg border border-slate-700 px-2 py-1.5 text-slate-400 hover:text-slate-200">Limpar</button>}
        {pendentes > 0 && (
          <>
            <button type="button" disabled={!hist.length} onClick={() => { setEds(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); }} className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-slate-300 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button>
            <button type="button" onClick={() => { setEds({}); setHist([]); setDioPend({}); setAtds({}); }} className="rounded-lg border border-slate-700 px-2 py-1.5 text-slate-300">Descartar</button>
            <button type="button" disabled={salvando} onClick={revisarESalvar} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-60">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar{sujas.length ? ` ${sujas.length} caixa${sujas.length !== 1 ? "s" : ""}` : ""}{rotasMudadas.length ? `${sujas.length ? " +" : ""} ${rotasMudadas.length} rota${rotasMudadas.length !== 1 ? "s" : ""} (DIO)` : ""}
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} className="rounded p-1.5 hover:bg-slate-800" aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></button>
          <button type="button" onClick={() => setZoom(1)} className="w-10 rounded py-1 text-center tabular-nums hover:bg-slate-800">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="rounded p-1.5 hover:bg-slate-800" aria-label="Aumentar zoom"><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCheia((v) => !v)} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-slate-800">{cheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </span>
      </div>
      {erro && <p className="border-b border-red-900 bg-red-950 px-3 py-1.5 text-[11px] text-red-300">{erro}</p>}

      <div className={`flex ${cheia ? "min-h-0 flex-1" : "h-[74vh]"}`}>
        {/* Área */}
        <div
          ref={area}
          onScroll={aoRolar}
          className="min-w-0 flex-1 cursor-grab select-none overflow-auto active:cursor-grabbing"
          onPointerDown={(e) => { if (e.pointerType !== "mouse" || e.button !== 0 || !area.current) return; arr.current = { x: e.clientX, y: e.clientY, sl: area.current.scrollLeft, st: area.current.scrollTop }; moveu.current = false; }}
          onPointerMove={(e) => { const a = arr.current; if (!a || !area.current) return; const dx = e.clientX - a.x, dy = e.clientY - a.y; if (!moveu.current && Math.abs(dx) + Math.abs(dy) > 5) moveu.current = true; if (moveu.current) { e.currentTarget.scrollLeft = a.sl - dx; e.currentTarget.scrollTop = a.st - dy; } }}
          onPointerUp={() => { arr.current = null; setTimeout(() => { moveu.current = false; }, 0); }}
          onClick={() => { if (!moveu.current) { setSel(null); setSelLig(null); } }}
        >
          {abertas.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-400">
              <MousePointerClick className="h-8 w-8 text-slate-600" />
              <p className="font-semibold text-slate-200">Abra uma caixa para começar</p>
              <p className="max-w-sm text-xs">Busque no campo &quot;Abrir caixa…&quot;. Depois clique nas fibras: a caixa do outro lado do cabo abre ao lado, uma por uma, e o caminho acende em laranja.</p>
            </div>
          ) : (
            <svg viewBox={`${minX} ${minY} ${W} ${H}`} width={W * zoom} height={H * zoom} className="block" role="img" aria-label="Unifilar da rede">
              <defs>
                <pattern id="gradeUR" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#22252b" strokeWidth=".7" /></pattern>
              </defs>
              <rect x={minX} y={minY} width={W} height={H} fill="url(#gradeUR)" />

              {/* Caixas */}
              {caixasDes.map((cx) => {
                const info = infoDe.get(cx.chave);
                const t = info?.tipo ?? "outro";
                const m = modelos.get(cx.chave)!;
                const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
                return (
                  <g key={cx.chave} data-caixa={cx.chave}>
                    <rect x={cx.x} y={cx.y} width={cx.w} height={cx.h} rx={10} fill="#1d2025" stroke={destaque === cx.chave ? "#facc15" : COR_TIPO[t] ?? "#475569"} strokeWidth={destaque === cx.chave ? 4 : 1.4} />
                    <rect x={cx.x} y={cx.y} width={cx.w} height={30} rx={10} fill={COR_TIPO[t] ?? "#475569"} opacity={0.9} {...arrastavel(cx.chave, "box")}>
                      <title>Arraste para mover a caixa</title>
                    </rect>
                    <g transform={`translate(${cx.x + 8} ${cx.y + 4})`} pointerEvents="none" dangerouslySetInnerHTML={{ __html: iconeSvg(t, 22) }} />
                    <text x={cx.x + 36} y={cx.y + 13} fontSize={10} fontWeight={800} fill="#fff" pointerEvents="none">{curto(info?.nome ?? cx.chave, 40)}</text>
                    <text x={cx.x + 36} y={cx.y + 24} fontSize={8} fill="#f1f5f9" opacity={0.85} pointerEvents="none">{TIPO_ELEMENTO_LABEL[t]}{cx.chave.startsWith("PT:") ? ` · ${cx.chave.slice(3)}` : ""}{eds[cx.chave] ? " · alterada" : automatico.get(cx.chave)?.mudou ? " · splitters montados pelas rotas (falta salvar)" : ""}</text>
                    {t === "predio" && onEditarPredio && (
                      <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onEditarPredio(cx.chave); }}>
                        <title>Qual fibra alimenta cada CDOI, blocos e andares</title>
                        <rect x={cx.x + cx.w - (cx.arrumada ? 206 : 124)} y={cx.y + 6} width={96} height={18} rx={9} fill="#fff" />
                        <text x={cx.x + cx.w - (cx.arrumada ? 158 : 76)} y={cx.y + 18} fontSize={8.5} fontWeight={800} fill="#0369a1" textAnchor="middle">✎ Editar no prédio</text>
                      </g>
                    )}
                    {t === "predio" && (
                      <text x={cx.x + 16} y={cx.y + 48} fontSize={8.5} fill="#7dd3fc" pointerEvents="none">Fibra de cada CDOI, blocos e andares: na janela do prédio.</text>
                    )}
                    {cx.arrumada && (
                      <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); reorganizar(cx.chave); }}>
                        <title>Reorganizar: volta ao desenho automático</title>
                        <rect x={cx.x + cx.w - 104} y={cx.y + 7} width={78} height={16} rx={8} fill="#00000040" />
                        <text x={cx.x + cx.w - 65} y={cx.y + 18} fontSize={8} fontWeight={700} fill="#fff" textAnchor="middle">↺ Reorganizar</text>
                      </g>
                    )}
                    <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setAbertas((a) => a.filter((x) => x !== cx.chave)); }}>
                      <title>Fechar esta caixa</title>
                      <circle cx={cx.x + cx.w - 14} cy={cx.y + 15} r={8} fill="#00000033" />
                      <path d={`M${cx.x + cx.w - 18} ${cx.y + 11} l8 8 M${cx.x + cx.w - 10} ${cx.y + 11} l-8 8`} stroke="#fff" strokeWidth={1.6} />
                    </g>

                    {/* ligações dentro da caixa */}
                    {m.ligacoes.map((l) => {
                      const d = curva(`${cx.chave}#${idPonto(l.a)}`, `${cx.chave}#${idPonto(l.b)}`);
                      if (!d) return null;
                      const tr = aceso(`${cx.chave}#L:${l.id}`);
                      const sl = selLig?.chave === cx.chave && selLig.id === l.id;
                      const f = l.a.k === "fibra" ? l.a : l.b.k === "fibra" ? l.b : null;
                      const cor = f ? corFibra(f.fibra, f.cabo).hex : "#4ade80";
                      const sug = l.origem === "rota" && l.tipo === "fusao";
                      const corL = l.tipo === "cordao" ? "#facc15" : cor;
                      return (
                        <g key={l.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (moveu.current) return; if (modo === "navegar") clicarPonto(cx.chave, l.a); else setSelLig(sl ? null : { chave: cx.chave, id: l.id }); }}>
                          <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                          {(tr || sl) && <path d={d} fill="none" stroke={tr ? LAR : "#facc15"} strokeWidth={6} opacity={0.85} strokeLinecap="round" />}
                          {l.tipo === "passa" ? <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 4" />
                            : sug ? <path d={d} fill="none" stroke="#fbbf24" strokeWidth={1.6} strokeDasharray="2 3" />
                              : <><path d={d} fill="none" stroke="#0b0d10" strokeWidth={3.6} /><path d={d} fill="none" stroke={corL} strokeWidth={l.tipo === "cordao" ? 2.6 : 1.9} opacity={l.origem === "regra" ? 0.6 : 1} /></>}
                        </g>
                      );
                    })}

                    {/* OLT: placa com as portas PON usadas */}
                    {t === "olt" && cx.olt && (
                      <g>
                        <rect x={cx.olt.x} y={cx.olt.y} width={BW} height={cx.olt.h} rx={6} fill="#0f172a" stroke="#334155" {...arrastavel(cx.chave, "olt")} />
                        <text x={cx.olt.x + 8} y={cx.olt.y + 14} fontSize={9} fontWeight={800} fill="#e2e8f0" pointerEvents="none">Portas PON</text>
                        {cx.pons.map((pp, k) => {
                          const xO = cx.olt!.x;
                          const yy = cx.olt!.y + HEAD + k * (ROW + 4) + ROW / 2;
                          const lp = pp.match(/PL\s*0*(\d+)\D+0*(\d+)/i);
                          const rotulo = lp ? `0/${+lp[1]}/${+lp[2]}` : pp;
                          return (
                            <g key={pp}>
                              <rect x={xO + 8} y={yy - 7} width={BW - 26} height={14} rx={3} fill="#1e293b" stroke="#475569" pointerEvents="none" />
                              <rect x={xO + 12} y={yy - 4} width={8} height={8} rx={1.5} fill="#16a34a" pointerEvents="none" />
                              <text x={xO + 26} y={yy + 3} fontSize={8} fontWeight={700} fill="#e2e8f0" pointerEvents="none">PON {rotulo}</text>
                              <text x={xO + BW - 22} y={yy + 3} fontSize={7} fill="#94a3b8" textAnchor="end" pointerEvents="none">{pp.replace(/^PL\s*/i, "PL ")}</text>
                              {ponto(cx.chave, { k: "pon", porta: pp }, xO + BW, yy, "#facc15", true)}
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {/* DIO: grade de adaptadores (porta N = fibra N do cabo que sai) */}
                    {t === "dio" && cx.dio && (
                      <g>
                        <rect x={cx.dio.x} y={cx.dio.y} width={cx.dio.w} height={cx.dio.h} rx={6} fill="#111827" stroke="#334155" {...arrastavel(cx.chave, "dio")} />
                        <text x={cx.dio.x + 8} y={cx.dio.y + 13} fontSize={8.5} fontWeight={800} fill="#cbd5e1" pointerEvents="none">Adaptadores do DIO · {cx.capDio}</text>
                        {Array.from({ length: cx.capDio }, (_, k) => {
                          const n = k + 1;
                          const pp = pos.get(`${cx.chave}#${idPonto({ k: "adaptador", n })}`)!;
                          const usado = ocup.has(idPonto({ k: "adaptador", n }));
                          return (
                            <g key={n}>
                              <title>{`Adaptador ${n}${usado ? " · em uso" : " · livre"}`}</title>
                              <rect x={pp[0] - 7} y={pp[1] - 7} width={14} height={14} rx={2.5} fill={usado ? "#1e3a8a" : "#1f2937"} stroke={usado ? "#60a5fa" : "#374151"} pointerEvents="none" />
                              <text x={pp[0]} y={pp[1] + 2.5} fontSize={6} fill={usado ? "#dbeafe" : "#6b7280"} textAnchor="middle" fontWeight={700} pointerEvents="none">{n}</text>
                              {(usado || modo === "editar") && ponto(cx.chave, { k: "adaptador", n }, pp[0], pp[1] + 9, "#60a5fa", usado)}
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {/* splitters (estilo GeoGrid: entrada à esquerda, leque, portas numeradas à direita) */}
                    {(() => { const pp = potPortas(cx.chave, edDe(cx.chave).splitters); return cx.spl.map(({ s, x, y, h, w, portas, id: idSpl }) => {
                      const tm = t === "hub" ? TEMA_SPL.hub : t === "cto" ? TEMA_SPL.cto : TEMA_SPL.verde;
                      const modelo = catalogo.find((q) => q.id === s.modelo_id);
                      const ent = s.entrada.fibra;
                      const pon = ent ? rotas.find((r) => r.elementos.some((e) => chaveElemento(e) === cx.chave && !!e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(ent.cabo) && e.fibra_entrada === ent.fibra)) : undefined;
                      const yIn = y + 26 + (portas.length * ROW) / 2;
                      const idx = (edDe(cx.chave).splitters.indexOf(s) + 1) || 1;
                      return (
                        <g key={s.id}>
                          <rect x={x} y={y} width={w} height={h} rx={6} fill={tm.fundo} stroke={tm.borda} strokeWidth={1.2} {...arrastavel(cx.chave, idSpl)} />
                          <rect x={x} y={y} width={w} height={20} rx={6} fill={splSel?.chave === cx.chave && splSel.id === s.id ? "#a16207" : tm.cabeca}
                            {...arrastavel(cx.chave, idSpl)}
                            onClick={(e) => { if (modo !== "editar" || moveu.current) return; e.stopPropagation(); setSplSel({ chave: cx.chave, id: s.id }); setSelLig(null); setSel(null); }}>
                            <title>{modo === "editar" ? "Arraste para mover · clique para ver ou remover este splitter" : "Arraste para mover"}</title>
                          </rect>
                          <text x={x + 6} y={y + 13} fontSize={9} fontWeight={800} fill={tm.texto} pointerEvents="none">S{idx} · {s.relacao}</text>
                          <text x={x + w - 6} y={y + 13} fontSize={7.5} fill={tm.suave} textAnchor="end" pointerEvents="none">{pon ? portaPonDaRota(pon).rotulo.replace(/^.*· /, "") : ent ? `F${String(ent.fibra).padStart(2, "0")} · sem rota` : s.entrada.splitter ? "2º nível" : "sem entrada"}</text>
                          {!pon && ent && <rect x={x} y={y} width={w} height={h} rx={6} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3"><title>Esta fibra não tem rota: confira ou tire o splitter</title></rect>}
                          <path d={`M${x + 10} ${yIn - 5} L${x + w - 30} ${y + 26} L${x + w - 30} ${y + h - 8} L${x + 10} ${yIn + 5} Z`} fill={tm.borda} opacity={0.18} pointerEvents="none" />
                          <rect x={x - 2} y={yIn - 6} width={12} height={12} rx={2} fill={tm.borda} stroke="#0b0d10" pointerEvents="none" />
                          <text x={x + 20} y={yIn + 3} fontSize={6.5} fill={tm.suave} pointerEvents="none">{perdaSplitter(s.relacao, modelo?.perda_db).toFixed(1).replace(".", ",")} dB</text>
                          {ponto(cx.chave, { k: "entrada", spl: s.id }, x - 6, yIn, tm.ponto, ocup.has(idPonto({ k: "entrada", spl: s.id })))}
                          {portas.map((p, k) => {
                            const yy = y + 26 + k * ROW + ROW / 2;
                            const cor = p.status === "cliente" ? "#0284c7" : p.status === "ramal" ? "#d97706" : tm.porta;
                            return (
                              <g key={p.numero}>
                                <title>{`Porta ${p.numero} · ${p.status === "cliente" ? `cliente ${p.descricao ?? ""}` : p.status === "ramal" ? `ramal ${p.descricao ?? ""}` : "livre"}`}</title>
                                <rect x={x + w - 26} y={yy - 6} width={20} height={12} rx={2} fill={cor} stroke="#0b0d10" />
                                <text x={x + w - 16} y={yy + 3} fontSize={7} fontWeight={800} fill="#fff" textAnchor="middle">{p.numero}</text>
                                {p.status === "cliente" && <text x={x + w - 32} y={yy + 3} fontSize={7} textAnchor="end">👤</text>}
                                {pp.has(`${s.id}|${p.numero}`) && <text x={x + w - (p.status === "cliente" ? 44 : 30)} y={yy + 2.5} fontSize={6.5} fontWeight={700} textAnchor="end" fill={COR_NIVEL[nivelPotencia(pp.get(`${s.id}|${p.numero}`))]} pointerEvents="none">{dbm(pp.get(`${s.id}|${p.numero}`))}</text>}
                                {pernaSel?.chave === cx.chave && pernaSel.spl === s.id && pernaSel.porta === p.numero && <rect x={x + w - 28} y={yy - 8} width={24} height={16} rx={3} fill="none" stroke="#38bdf8" strokeWidth={1.6} />}
                                {ponto(cx.chave, { k: "porta", spl: s.id, porta: p.numero }, x + w + 6, yy, tm.ponto, ocup.has(idPonto({ k: "porta", spl: s.id, porta: p.numero })))}
                              </g>
                            );
                          })}
                        </g>
                      );
                    }); })()}
                  </g>
                );
              })}

              {/* Cabos entre caixas abertas: uma linha por fibra, na cor dela */}
              {blocos.filter((b) => b.c.lado === "sai" && b.c.outraChave && abertas.includes(b.c.outraChave)).map((b) => {
                const dest = blocos.find((x) => x.chave === b.c.outraChave && x.c.lado === "chega" && x.c.chave === b.c.chave);
                if (!dest) return null;
                // a fibra entre as caixas segue a ligação dentro da caixa de onde ela sai (desligou lá, apaga aqui).
                // Se só a caixa de destino usa a fibra, ela aparece tracejada e apagada (sem sinal chegando).
                const ligA = new Set(modelos.get(b.chave)?.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]) ?? []);
                const ligB = new Set(modelos.get(dest.chave)?.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]) ?? []);
                const comSinal = (f: number) => ligA.has(idPonto({ k: "fibra", lado: "sai", cabo: b.c.nome, fibra: f }));
                const semSinal = (f: number) => !comSinal(f) && ligB.has(idPonto({ k: "fibra", lado: "chega", cabo: dest.c.nome, fibra: f }));
                const emUso = (f: number) => comSinal(f) || semSinal(f);
                return (
                  <g key={`cab${b.chave}${b.c.id}`}>
                    {b.fibras.filter((f) => dest.fibras.includes(f) && emUso(f)).map((f) => {
                      const ka = `${b.chave}#${idPonto({ k: "fibra", lado: "sai", cabo: b.c.nome, fibra: f })}`;
                      const kb = `${dest.chave}#${idPonto({ k: "fibra", lado: "chega", cabo: dest.c.nome, fibra: f })}`;
                      const d = curva(ka, kb);
                      if (!d) return null;
                      const cf = corFibra(f, b.c.nome);
                      const tr = aceso(ka) && aceso(kb);
                      return (
                        <g key={f} className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (moveu.current) return;
                            // a ponta mais perto do clique: a fibra que sai da caixa da esquerda ou a que chega na da direita
                            const r = (e.currentTarget as SVGGElement).getBoundingClientRect();
                            const perto = e.clientX < r.left + r.width / 2
                              ? { chave: b.chave, p: { k: "fibra" as const, lado: "sai" as const, cabo: b.c.nome, fibra: f } }
                              : { chave: dest.chave, p: { k: "fibra" as const, lado: "chega" as const, cabo: dest.c.nome, fibra: f } };
                            if (modo === "clientes") { setErro(`${cf.rotulo} do cabo ${curto(semCodigo(b.c.nome), 30)}. Clientes se marcam nas portas dos splitters.`); return; }
                            void clicarPonto(perto.chave, perto.p);
                          }}>
                          <title>{`${cf.rotulo} ${cf.nome.toLowerCase()} · ${semCodigo(b.c.nome)}${semSinal(f) ? " · sem sinal: nada ligado nela na caixa de onde sai" : ""}${modo === "editar" ? " · clique para escolher esta fibra na ponta mais perto" : " · clique para traçar"}`}</title>
                          <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                          {tr && <path d={d} fill="none" stroke={LAR} strokeWidth={5} opacity={0.85} strokeLinecap="round" />}
                          {semSinal(f) ? (
                            <path d={d} fill="none" stroke={cf.hex} strokeWidth={1.4} strokeDasharray="3 4" opacity={0.45} />
                          ) : (
                            <>
                              <path d={d} fill="none" stroke="#0b0d10" strokeWidth={3.4} />
                              <path d={d} fill="none" stroke={cf.hex} strokeWidth={1.9} />
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* blocos dos cabos (por cima) */}
              {blocos.map(({ chave, c, x, y, fibras, h, id: idBloco }) => {
                const ehE = c.lado === "chega";
                const m = modelos.get(chave)!;
                const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
                const viz = c.outraChave && infoDe.get(c.outraChave);
                const aberta = !!c.outraChave && abertas.includes(c.outraChave);
                return (
                  <g key={`${chave}${c.id}`}>
                    <rect x={x} y={y} width={BW} height={h} rx={6} fill="#2a2e35" stroke="#3b4048" {...arrastavel(chave, idBloco)} />
                    <rect x={x} y={y} width={BW} height={HEAD_CABO - 4} rx={6} fill="#0f1115" {...arrastavel(chave, idBloco)}><title>{`${semCodigo(c.nome)} · arraste para mover`}</title></rect>
                    <text x={x + 6} y={y + 11} fontSize={7.5} className={viz && !aberta ? "cursor-pointer" : undefined}
                      onClick={(e) => { e.stopPropagation(); abrirVizinha(chave, c); }}>
                      <title>{viz && !aberta ? `Clique para abrir ${viz.nome}` : ehE ? "Cabo que chega nesta caixa" : "Cabo que sai desta caixa"}</title>
                      <tspan fontWeight={800} fill={ehE ? "#6ee7b7" : "#93c5fd"}>{ehE ? "◀ chega" : "sai ▶"}{viz ? (ehE ? " de " : " para ") : ""}</tspan>
                      {viz && <tspan fill={!aberta ? "#60a5fa" : "#cbd5e1"} textDecoration={!aberta ? "underline" : undefined}>{curto(viz.nome, 14)}</tspan>}
                      <tspan fill="#64748b"> · {codigoDoCabo(c.nome) ?? "sem código"} · {c.capacidade}f</tspan>
                    </text>
                    {fibras.map((f, k) => {
                      const cf = corFibra(f, c.nome);
                      const yy = y + HEAD_CABO + k * ROW + ROW / 2;
                      const pt: PontoUni = { k: "fibra", lado: c.lado, cabo: c.nome, fibra: f };
                      const sinal = c.sinal.has(f);
                      return (
                        <g key={f}>
                          <title>{`${cf.rotulo} ${cf.nome.toLowerCase()}${sinal ? ` · ${c.sinal.get(f)!.join(", ")}` : " · livre"}`}</title>
                          <rect x={ehE ? x + 4 : x + BW - 9} y={yy - ROW / 2} width={5} height={ROW} fill={cf.corTubo?.hex ?? "#64748b"} />
                          <rect x={ehE ? x + 13 : x + BW - 44} y={yy - 5} width={31} height={10} rx={2.5} fill={cf.hex} stroke="#0b0d10" strokeWidth={0.6} />
                          <text x={ehE ? x + 28.5 : x + BW - 28.5} y={yy + 3} fontSize={7} fontWeight={800} textAnchor="middle" fill={textoSobre(cf.hex)}>{`F${String(f).padStart(2, "0")}`}</text>
                          <text x={ehE ? x + 48 : x + BW - 50} y={yy + 3} fontSize={7} fill="#94a3b8" textAnchor={ehE ? "start" : "end"}>{`T${cf.tubo ?? 1}`}</text>
                          {sinal && <circle cx={ehE ? x + 66 : x + BW - 66} cy={yy} r={2.6} fill="#facc15" />}
                          {ehE && potChega.get(chave)?.has(`${chaveCabo(c.nome)}|${f}`) && (() => {
                            const v = potChega.get(chave)!.get(`${chaveCabo(c.nome)}|${f}`)!;
                            return <text x={x + 74} y={yy + 2.5} fontSize={6.5} fontWeight={700} fill={COR_NIVEL[nivelPotencia(v)]} pointerEvents="none">{dbm(v)} dBm</text>;
                          })()}
                          {ehE && infoDe.get(chave)?.tipo === "ct" && (() => {
                            const at = atdDe(chave).find((q) => q.numero === f);
                            const sel = fibraCt?.chave === chave && fibraCt.fibra === f;
                            return (
                              <>
                                {sel && <rect x={x + BW + 2} y={yy - 7} width={86} height={14} rx={3} fill="none" stroke="#38bdf8" strokeWidth={1.4} />}
                                {at?.status === "cliente" && <text x={x + BW + 12} y={yy + 3} fontSize={7.5} fill="#7dd3fc">👤 {curto(at.descricao ?? "cliente", 14)}</text>}
                              </>
                            );
                          })()}
                          {ponto(chave, pt, x, yy, cf.hex, ocup.has(idPonto(pt)), "l")}
                          {ponto(chave, pt, x + BW, yy, cf.hex, ocup.has(idPonto(pt)), "r")}
                        </g>
                      );
                    })}
                    {fibras.length < c.capacidade && (
                      <text x={x + BW / 2} y={y + HEAD_CABO + fibras.length * ROW + 10} fontSize={8} fill="#60a5fa" textAnchor="middle" className="cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setCabosAbertos((s) => new Set([...s, `${chave}|${c.id}`])); }}>
                        + {c.capacidade - fibras.length} fibras escondidas
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Painel: rota traçada e a ligação escolhida */}
        {(caminho || (modo === "editar" && (selLig || splSel)) || (modo === "clientes" && (pernaSel || fibraCt))) && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-800 bg-[#0f1115] p-3 text-[11px]">
            {modo === "editar" && splSel && (() => {
              const ed = edDe(splSel.chave);
              const sp = ed.splitters.find((x) => x.id === splSel.id);
              if (!sp) return null;
              const idx = ed.splitters.indexOf(sp) + 1;
              const alimenta = ed.splitters.filter((x) => x.entrada.splitter?.id === sp.id);
              const comCliente = portasPara(sp.relacao, sp.portas).filter((p) => p.status === "cliente").length;
              return (
                <div className="mb-3 space-y-1.5 rounded-xl border border-slate-700 p-2">
                  <p className="font-semibold">S{idx} · {sp.relacao} · {curto(infoDe.get(splSel.chave)?.nome ?? "", 22)}</p>
                  <p className="text-slate-400">{sp.entrada.fibra ? `Entrada: ${curto(semCodigo(sp.entrada.fibra.cabo), 22)} F${String(sp.entrada.fibra.fibra).padStart(2, "0")}` : sp.entrada.splitter ? "Entrada: porta de outro splitter (2º nível)" : "Sem entrada"}</p>
                  {comCliente > 0 && <p className="text-amber-300">{comCliente} porta{comCliente !== 1 ? "s" : ""} com cliente: tirar o splitter solta esses clientes.</p>}
                  {alimenta.length > 0
                    ? <p className="text-amber-300">Alimenta {alimenta.length} splitter{alimenta.length !== 1 ? "s" : ""} de 2º nível: tire esses antes.</p>
                    : <button type="button" onClick={async () => { if (comCliente && !(await confirmar(`Tirar o S${idx}? ${comCliente} cliente(s) ficam sem porta.`, { ok: "Tirar" }))) return; mudar(splSel.chave, { ...ed, splitters: ed.splitters.filter((x) => x.id !== sp.id) }); setSplSel(null); }}
                      className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 font-semibold text-white"><Trash2 className="h-3 w-3" /> Tirar este splitter</button>}
                  <p className="text-slate-500">Só vale depois de clicar em Salvar, no topo.</p>
                </div>
              );
            })()}
            {modo === "clientes" && fibraCt && (() => {
              const lista = atdDe(fibraCt.chave);
              const at = lista.find((x) => x.numero === fibraCt.fibra) ?? { numero: fibraCt.fibra, status: "livre" as StatusPorta };
              const mudarAt = (mm: Partial<PortaCaixa>) => {
                const nova = { ...at, ...mm };
                setAtds((a) => ({ ...a, [fibraCt.chave]: [...lista.filter((x) => x.numero !== fibraCt.fibra), nova].sort((x, y) => x.numero - y.numero) }));
              };
              return (
                <div className="mb-3 space-y-1.5 rounded-xl border border-sky-800 bg-sky-950/40 p-2">
                  <p className="font-semibold text-sky-200">CT {curto(infoDe.get(fibraCt.chave)?.nome ?? "", 22)} · fibra {fibraCt.fibra}</p>
                  <div className="flex gap-1">
                    {(["livre", "cliente"] as StatusPorta[]).map((st) => (
                      <button key={st} type="button" onClick={() => mudarAt(st === "livre" ? { status: "livre", descricao: undefined, cliente_id: undefined } : { status: "cliente" })}
                        className={`rounded-md px-2 py-1 font-semibold ${at.status === st ? (st === "cliente" ? "bg-sky-600 text-white" : "bg-slate-600 text-white") : "bg-slate-800 text-slate-300"}`}>
                        {st === "livre" ? "Livre" : "Cliente"}
                      </button>
                    ))}
                  </div>
                  {at.status === "cliente" && (
                    <input value={at.descricao ?? ""} onChange={(e) => mudarAt({ descricao: e.target.value || undefined })} placeholder="Cliente / login"
                      className="w-full rounded border border-slate-700 bg-[#1b1d21] px-2 py-1 text-slate-200 outline-none focus:border-sky-500" />
                  )}
                  <p className="text-slate-500">A porta da CTO que desce nesta fibra se liga na CTO (Editar conexões: porta → fibra do cabo). Só vale depois de Salvar.</p>
                </div>
              );
            })()}
            {modo === "clientes" && pernaSel && (() => {
              const ed = edDe(pernaSel.chave);
              const sp = ed.splitters.find((x) => x.id === pernaSel.spl);
              if (!sp) return null;
              const pt = portasPara(sp.relacao, sp.portas).find((x) => x.numero === pernaSel.porta);
              if (!pt) return null;
              const mudarPorta = (mm: Partial<typeof pt>) => mudar(pernaSel.chave, {
                ...ed,
                splitters: ed.splitters.map((x) => (x.id === sp.id ? { ...x, portas: portasPara(x.relacao, x.portas).map((y) => (y.numero === pt.numero ? { ...y, ...mm } : y)) } : x)),
              });
              const fora = new Set([...ligacoesDosClientes(rotasBase, caixas)].filter(([, l]) => l.chave !== pernaSel.chave).map(([id]) => id));
              const ehRamal = pt.status === "ramal";
              return (
                <div className="mb-3 space-y-1.5 rounded-xl border border-sky-800 bg-sky-950/40 p-2">
                  <p className="font-semibold text-sky-200">S{ed.splitters.indexOf(sp) + 1} · porta {pt.numero} · {curto(infoDe.get(pernaSel.chave)?.nome ?? "", 20)}</p>
                  {ehRamal ? (
                    <p className="text-slate-400">Esta porta está em ramal (ligada numa fibra que sai). Para mudar, use Editar conexões.</p>
                  ) : (
                    <>
                      <div className="flex gap-1">
                        {(["livre", "cliente"] as StatusPorta[]).map((st) => (
                          <button key={st} type="button" onClick={() => mudarPorta(st === "livre" ? { status: "livre", cliente_id: undefined, descricao: undefined, saida: undefined } : { status: "cliente", saida: undefined })}
                            className={`rounded-md px-2 py-1 font-semibold ${pt.status === st ? (st === "cliente" ? "bg-sky-600 text-white" : "bg-slate-600 text-white") : "bg-slate-800 text-slate-300"}`}>
                            {st === "livre" ? "Livre" : "Cliente"}
                          </button>
                        ))}
                      </div>
                      {pt.status === "cliente" && (
                        <div className="rounded-lg bg-white p-1.5 text-slate-800">
                          <BuscaCliente
                            cadastro={clientes}
                            clienteId={pt.cliente_id}
                            ocupado={(id) => fora.has(id) || ed.splitters.some((x) => x.portas.some((y) => y.cliente_id === id && !(x.id === sp.id && y.numero === pt.numero)))}
                            onEscolher={(c) => mudarPorta(c ? { cliente_id: c.id, descricao: c.nome } : { cliente_id: undefined, descricao: undefined })}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-slate-500">Só vale depois de clicar em Salvar, no topo.</p>
                </div>
              );
            })()}
            {modo === "editar" && selLig && (() => {
              const m = modelos.get(selLig.chave);
              const l = m?.ligacoes.find((x) => x.id === selLig.id);
              if (!l) return null;
              return (
                <div className="mb-3 space-y-1.5 rounded-xl border border-slate-700 p-2">
                  <p className="font-semibold">{l.tipo === "passa" ? "Passa direto (vem da rota)" : l.origem === "rota" ? "Sugestão da rota" : l.origem === "regra" ? "Cor com cor" : "Ligação"}</p>
                  {l.tipo !== "passa" && l.origem === "rota" && <button type="button" onClick={() => { const r = ligar(edDe(selLig.chave), l.a, l.b); if (typeof r !== "string") mudar(selLig.chave, r); setSelLig(null); }} className="rounded-md bg-amber-500 px-2 py-1 font-semibold text-white">Aceitar</button>}
                  {l.tipo !== "passa" && l.origem !== "rota" && <button type="button" onClick={() => {
                    const pr = predioDoCabo(selLig.chave, l.a) ?? predioDoCabo(selLig.chave, l.b);
                    if (pr) { setErro(`Essa perna vai para o ${infoDe.get(pr)?.nome ?? "prédio"}: troque a fibra da CDOI na janela do prédio.`); onEditarPredio?.(pr); setSelLig(null); return; }
                    mudar(selLig.chave, desligar(edDe(selLig.chave), l)); setSelLig(null);
                  }} className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 font-semibold text-white"><X className="h-3 w-3" /> Desligar</button>}
                </div>
              );
            })()}
            {caminho && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <RouteIcon className="h-4 w-4 text-orange-400" />
                  <p className="font-bold text-orange-300">Rota</p>
                </div>
                {rotasTraco.length > 1 && (
                  <select className="mb-1.5 w-full rounded border border-slate-700 bg-[#1b1d21] px-1 py-0.5" value={rotaIdx} onChange={(e) => setRotaIdx(+e.target.value)}>
                    {rotasTraco.map((r, i) => <option key={r.rota.id} value={i}>{r.rota.nome}</option>)}
                  </select>
                )}
                <p className="mb-1.5 truncate text-slate-400">{caminho.rota.nome}</p>
                <div className="mb-2 flex gap-1">
                  <button type="button" onClick={() => setAbertas(caminho.passos.map((p) => p.chave).filter((k, i, a) => infoDe.has(k) && a.indexOf(k) === i))} className="rounded-md bg-orange-500 px-2 py-1 font-semibold text-white">Abrir a rota toda</button>
                  <button type="button" onClick={() => onAbrirRota(caminho.rota.id)} className="rounded-md border border-slate-700 px-2 py-1 text-slate-300">Ver rota</button>
                </div>
                <ol className="space-y-0.5">
                  {caminho.passos.map((p, i) => {
                    const cf = p.fibra ? corFibra(p.fibra, p.cabo) : null;
                    const aberta = abertas.includes(p.chave);
                    return (
                      <li key={i}>
                        {i > 0 && p.cabo && (
                          <p className="ml-3 flex items-center gap-1 border-l-2 border-orange-500 py-0.5 pl-3 text-[10px] text-slate-400">
                            {cf && <span className="inline-block h-2 w-2 rounded-full" style={{ background: cf.hex }} />}{curto(semCodigo(p.cabo), 26)}{cf ? ` · ${cf.rotulo}` : ""}
                          </p>
                        )}
                        <button type="button" disabled={!infoDe.has(p.chave)} onClick={() => irParaCaixa(p.chave)} title="Ir até esta caixa"
                          className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left ${aberta ? "bg-orange-500/20 text-orange-200" : "text-slate-200 hover:bg-slate-800"} disabled:cursor-default disabled:hover:bg-transparent`}>
                          <IconeElemento tipo={p.tipo} tamanho={15} /> <span className="min-w-0 flex-1 truncate">{curto(p.nome, 30)}{p.porta ? ` · ${p.porta}` : ""}</span>
                          {p.pot !== undefined && <span className="shrink-0 tabular-nums text-[10px] font-semibold" style={{ color: COR_NIVEL[nivelPotencia(p.pot)] }}>{dbm(p.pot)}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </aside>
        )}
      </div>
      {revisao && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/60 p-4" onClick={() => !salvando && setRevisao(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#16181c] text-xs text-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-800 bg-[#0f1115] px-4 py-3">
              <p className="text-sm font-bold">A fibra muda no trecho inteiro do cabo</p>
              <p className="mt-0.5 text-[11px] text-slate-400">As ligações mudadas trocam a fibra destas rotas, e a caixa da outra ponta do cabo acompanha. Desmarque a rota que não deve mudar (ela fica com a fibra antiga e a diferença aparece no Unifilar).</p>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
              {rotasDaRevisao(revisao).map((id) => {
                const r = revisao.rotas.get(id) ?? revisao.mudancas.find((m) => m.rota.id === id)!.rota;
                const ms = revisao.mudancas.filter((m) => m.rota.id === id);
                return (
                  <label key={id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 ${marcadas.has(id) ? "border-orange-500/60 bg-orange-500/10" : "border-slate-700"}`}>
                    <input type="checkbox" className="mt-0.5" checked={marcadas.has(id)} onChange={(e) => setMarcadas((x) => { const n = new Set(x); if (e.target.checked) n.add(id); else n.delete(id); return n; })} />
                    <span className="min-w-0">
                      <b className="block truncate">{r.nome}</b>
                      {ms.map((m, k) => {
                        const cv = corFibra(m.de.fibra, m.de.cabo), cn = corFibra(m.para.fibra, m.para.cabo);
                        return (
                          <span key={k} className="mt-0.5 block text-[11px] text-slate-300">
                            {m.sentido === "chega" ? <>chega de <b>{curto(m.ponta, 22)}</b>: </> : <>até <b>{curto(m.ponta, 22)}</b>: </>}
                            <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: cv.hex }} /> {chaveCabo(m.de.cabo) !== chaveCabo(m.para.cabo) ? `${curto(semCodigo(m.de.cabo), 18)} ` : ""}F{String(m.de.fibra).padStart(2, "0")} →{" "}
                            <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: cn.hex }} /> {chaveCabo(m.de.cabo) !== chaveCabo(m.para.cabo) ? `${curto(semCodigo(m.para.cabo), 18)} ` : ""}F{String(m.para.fibra).padStart(2, "0")}
                            {m.seguem.length > 0 && <span className="text-slate-500"> · o cabo passa por {m.seguem.map((x) => curto(x, 16)).join(", ")}</span>}
                          </span>
                        );
                      })}
                    </span>
                  </label>
                );
              })}
              {revisao.pontas.filter((pt) => pt.rotas.some((id) => marcadas.has(id) || rotasMudadas.some((r) => r.id === id))).length > 0 && (
                <div className="rounded-xl border border-slate-700 p-2">
                  <p className="mb-1 font-semibold text-slate-300">E na caixa da outra ponta do cabo:</p>
                  {revisao.pontas.filter((pt) => pt.rotas.some((id) => marcadas.has(id) || rotasMudadas.some((r) => r.id === id))).map((pt, k) => (
                    <p key={k} className="text-[11px] text-slate-400">
                      <b className="text-slate-200">{curto(pt.nome, 26)}</b>: {curto(semCodigo(pt.cabo), 22)} {pt.lado === "sai" ? "sai" : "chega"} pela F{String(pt.para).padStart(2, "0")} no lugar da F{String(pt.de).padStart(2, "0")}
                    </p>
                  ))}
                </div>
              )}
              {revisao.bloqueadas.map((b, k) => (
                <p key={`b${k}`} className="rounded-xl border border-red-900 bg-red-950/50 p-2 text-[11px] text-red-300"><b>{b.rota.nome}</b> não muda sozinha: {b.motivo}</p>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 bg-[#0f1115] px-4 py-3">
              <button type="button" disabled={salvando} onClick={() => setRevisao(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300">Voltar</button>
              <button type="button" disabled={salvando} onClick={() => void salvar(revisao, marcadas)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60">
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar caixas{marcadas.size ? ` e ${marcadas.size} rota${marcadas.size !== 1 ? "s" : ""}` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="border-t border-slate-800 bg-[#0f1115] px-3 py-1.5 text-[10px] text-slate-500">
        {modo === "clientes"
          ? "Clique numa porta (perna) de splitter, ou numa fibra que chega na CT, para marcar o cliente ou deixar livre. Salve no topo."
          : modo === "navegar"
          ? "Clique numa fibra: a caixa do outro lado do cabo abre ao lado e o caminho acende em laranja. O nome azul embaixo do cabo também abre a vizinha."
          : sel ? "Agora clique no destino na mesma caixa (anel verde)." : "Clique num ponto e depois no destino. Clique numa linha para desligar ou aceitar, e no nome de um splitter para tirá-lo. No DIO: cordão + adaptador muda a porta da rota. Salve no topo."}
      </p>
    </div>
  );
}
