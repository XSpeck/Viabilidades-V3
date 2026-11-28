"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, MousePointerClick, Route as RouteIcon, Save, Search, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { corFibra, perdaSplitter, tipoVisual, TIPO_ELEMENTO_LABEL, type RotaOptica, type TipoElementoRota } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { chaveCabo, codigoDoCabo, semCodigo } from "@/lib/cabosRede";
import { portasPara, salvarCaixa, type CaixaRede, type SplitterCaixa } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import {
  caminhoNaCaixa, completarPelasRotas, desligar, idPonto, ligar, montarUnifilar, rotasDaFibra, tipoEntre, trocarPortaDio,
  type CadastroLigacoes, type CaboUni, type ModeloUnifilar, type PontoUni,
} from "@/lib/unifilar";
import { IconeElemento, iconeSvg } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";
import { atualizarRota } from "@/lib/rotaOptica";
import { paraGravar } from "@/lib/subRotas";
import { sincronizarSplitterCdoi } from "@/lib/sincronizar";
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
  /** Caixa que já abre (vindo da Árvore, do Mapa da rede ou do editor da rota) */
  inicial?: string;
}

const ROW = 15, HEAD = 30, BW = 158, TOPO = 40, GAP_CAIXA = 120, LAR = "#f97316";
const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const COR_TIPO: Partial<Record<TipoElementoRota, string>> = { hub: "#ca8a04", cto: "#059669", cdoi: "#ea580c", ceo: "#2563eb", ct: "#525252", dio: "#475569", predio: "#0284c7" };
const textoSobre = (hex: string) => (["#f4f4f0", "#f2c200", "#ee86b0", "#20bdc9", "#8a949b", "#f08a1c", "#b48ae6"].includes(hex) ? "#0b0d10" : "#fff");

type Pt = { chave: string; p: PontoUni };

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

export default function UnifilarRede({ rotas: rotasBase, caixas, catalogo, usuario, onCaixaSalva, onAbrirRota, onRotasMudaram, clientes = [], inicial }: Props) {
  /** Trocas de adaptador do DIO ainda não gravadas: chave do DIO | cordão → adaptador */
  const [dioPend, setDioPend] = useState<Record<string, { chave: string; cordao: string; n: number }>>({});
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

  const [abertas, setAbertas] = useState<string[]>(() => (inicial ? [inicial] : []));
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"navegar" | "editar" | "clientes">("navegar");
  /** Modo Clientes: a perna escolhida; Editar: o splitter escolhido (para remover) */
  const [pernaSel, setPernaSel] = useState<{ chave: string; spl: string; porta: number } | null>(null);
  const [splSel, setSplSel] = useState<{ chave: string; id: string } | null>(null);
  /** CT: o cliente de cada fibra que chega (atendimento), ainda não gravado */
  const [atds, setAtds] = useState<Record<string, PortaCaixa[]>>({});
  const [fibraCt, setFibraCt] = useState<{ chave: string; fibra: number } | null>(null);
  const atdDe = (chave: string) => atds[chave] ?? cadDe.get(chave)?.atendimento ?? [];
  const [eds, setEds] = useState<Record<string, CadastroLigacoes>>({});
  const [hist, setHist] = useState<Record<string, CadastroLigacoes>[]>([]);
  const [sel, setSel] = useState<Pt | null>(null);
  const [selLig, setSelLig] = useState<{ chave: string; id: string } | null>(null);
  /** Ponto clicado no "Navegar": o caminho laranja é recalculado quando novas caixas abrem */
  const [inicioTraco, setTraco] = useState<Pt | null>(null);
  const [rotasTraco, setRotasTraco] = useState<ReturnType<typeof rotasDaFibra>>([]);
  const [rotaIdx, setRotaIdx] = useState(0);
  const [cabosAbertos, setCabosAbertos] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [cheia, setCheia] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const area = useRef<HTMLDivElement>(null);

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
  type Bloco = { chave: string; c: CaboUni; x: number; y: number; fibras: number[]; h: number };
  const pos = new Map<string, [number, number]>();
  const blocos: Bloco[] = [];
  const caixasDes: { chave: string; x: number; w: number; h: number; spl: { s: SplitterCaixa; x: number; y: number; h: number; w: number; portas: ReturnType<typeof portasPara> }[]; pons: string[]; capDio: number; xE: number }[] = [];
  let xCur = 20;
  let hMax = 300;
  for (const chave of abertas) {
    const m = modelos.get(chave)!;
    const ed = edDe(chave);
    const temSpl = comSpl(chave) && ed.splitters.length > 0;
    const tipoCx = infoDe.get(chave)?.tipo;
    // DIO: grade de adaptadores no meio (capacidade do DIO no cadastro de equipamentos)
    const adaptUsados = m.ligacoes.flatMap((l) => [l.a, l.b]).filter((q): q is { k: "adaptador"; n: number } => q.k === "adaptador").map((q) => q.n);
    const capDio = tipoCx === "dio" ? Math.max(catalogo.find((q) => q.id === infoDe.get(chave)?.equip)?.portas ?? 0, ...adaptUsados, 12) : 0;
    const COLS = 12, CEL = 16;
    const MID = temSpl ? 240 : tipoCx === "dio" ? COLS * CEL + 60 : 130;
    const xE = xCur + 12, xD = xCur + 12 + BW + MID;
    const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
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
      let y = TOPO + 44;
      for (const c of lista) {
        const fibras = vis(c);
        const h = HEAD + fibras.length * ROW + (fibras.length < c.capacidade ? ROW : 0) + 6;
        blocos.push({ chave, c, x, y, fibras, h });
        fibras.forEach((f, k) => pos.set(`${chave}#${idPonto({ k: "fibra", lado: c.lado, cabo: c.nome, fibra: f })}`, [c.lado === "chega" ? x + BW : x, y + HEAD + k * ROW + ROW / 2]));
        y += h + 16;
      }
      return y;
    };
    // OLT: a coluna da esquerda é a própria OLT, com as portas PON usadas
    const pons = m.ligacoes.filter((l) => l.tipo === "cordao").map((l) => (l.a as { k: "pon"; porta: string }).porta).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    let hOlt = 0;
    if (tipoCx === "olt") {
      pons.forEach((pp, k) => pos.set(`${chave}#${idPonto({ k: "pon", porta: pp })}`, [xE + BW, TOPO + 44 + HEAD + k * (ROW + 4) + ROW / 2]));
      hOlt = TOPO + 44 + HEAD + pons.length * (ROW + 4) + 10;
    }
    let hDio = 0;
    if (tipoCx === "dio") {
      const xG = xE + BW + 30;
      for (let n = 1; n <= capDio; n++) {
        const k = n - 1;
        pos.set(`${chave}#${idPonto({ k: "adaptador", n })}`, [xG + (k % COLS) * CEL + CEL / 2, TOPO + 70 + Math.floor(k / COLS) * CEL + CEL / 2]);
      }
      hDio = TOPO + 70 + Math.ceil(capDio / COLS) * CEL + 16;
    }
    const hE = tipoCx === "olt" ? hOlt : empilhar(m.cabos.filter((c) => c.lado === "chega"), xE);
    const hD = empilhar(m.cabos.filter((c) => c.lado === "sai"), xD);
    // splitters: no meio, cada um perto da fibra que o alimenta
    const spl: (typeof caixasDes)[number]["spl"] = [];
    if (temSpl) {
      const SW = 112, xS = xE + BW + (MID - SW) / 2;
      let yMin = TOPO + 44;
      const ord = [...ed.splitters].sort((a, b) => yEntrada(a) - yEntrada(b));
      function yEntrada(s: SplitterCaixa) {
        if (s.entrada.fibra) return pos.get(`${chave}#${idPonto({ k: "fibra", lado: "chega", ...s.entrada.fibra })}`)?.[1] ?? 9999;
        return 9999;
      }
      for (const s of ord) {
        const portas = portasPara(s.relacao, s.portas);
        const h = 26 + portas.length * ROW + 8;
        const alvo = yEntrada(s) < 9999 ? yEntrada(s) - h / 2 : yMin;
        const y = Math.max(yMin, alvo);
        spl.push({ s, x: xS, y, h, w: SW, portas });
        pos.set(`${chave}#${idPonto({ k: "entrada", spl: s.id })}`, [xS - 6, y + 26 + (portas.length * ROW) / 2]);
        portas.forEach((p, k) => pos.set(`${chave}#${idPonto({ k: "porta", spl: s.id, porta: p.numero })}`, [xS + SW + 6, y + 26 + k * ROW + ROW / 2]));
        yMin = y + h + 18;
      }
      hMax = Math.max(hMax, yMin);
    }
    const w = 24 + BW * 2 + MID;
    const h = Math.max(hE, hD, hDio, ...spl.map((x) => x.y + x.h + 10)) - TOPO + 10;
    caixasDes.push({ chave, x: xCur, w, h, spl, pons, capDio, xE });
    hMax = Math.max(hMax, TOPO + h + 20);
    xCur += w + GAP_CAIXA;
  }
  const W = Math.max(xCur, 900), H = hMax + 20;

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
  function clicarPonto(chave: string, p: PontoUni) {
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
          setRotasTraco(rotasDaFibra(rotas, fb.cabo, fb.fibra));
          setRotaIdx(0);
        }
      }
      if (p.k === "fibra") {
        const c = modelos.get(chave)?.cabos.find((x) => x.lado === p.lado && x.chave === chaveCabo(p.cabo));
        if (c) abrirVizinha(chave, c);
        setRotasTraco(rotasDaFibra(rotas, p.cabo, p.fibra));
        setRotaIdx(0);
      }
      tracar({ chave, p });
      return;
    }
    if (!sel) { setSel({ chave, p }); setSelLig(null); return; }
    if (sel.chave !== chave) { setSel({ chave, p }); return; }
    if (idPonto(sel.p) === idPonto(p)) { setSel(null); return; }
    // DIO: cordão que chega + adaptador = a rota passa a usar aquele adaptador (grava na rota)
    const cordao = sel.p.k === "fibra" && sel.p.lado === "chega" ? sel.p : p.k === "fibra" && p.lado === "chega" ? p : null;
    const adapt = sel.p.k === "adaptador" ? sel.p : p.k === "adaptador" ? p : null;
    if (cordao && adapt) { moverPortaDio(chave, cordao.cabo, adapt.n); setSel(null); return; }
    const t = tipoEntre(sel.p, p);
    if (!["fusao", "entrada", "perna", "nivel2"].includes(t)) { setErro(t); return; }
    const m = modelos.get(chave)!;
    const ocup = m.ligacoes.some((l) => l.tipo !== "passa" && l.origem !== "rota" && [idPonto(l.a), idPonto(l.b)].some((x) => x === idPonto(p) || x === idPonto(sel.p)));
    if (ocup && !confirm("Um dos pontos já está ligado. Trocar a ligação?")) return;
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

  async function salvarTudo() {
    setSalvando(true);
    setErro(null);
    let mudouRota = false;
    try {
      for (const chave of sujas) {
        const ed = edDe(chave);
        const cad = cadDe.get(chave);
        const temSpl = comSpl(chave);
        const semEntrada = temSpl ? ed.splitters.find((s) => !s.entrada.fibra && !s.entrada.splitter) : undefined;
        if (semEntrada) throw new Error(`${infoDe.get(chave)?.nome}: um splitter está sem entrada.`);
        const salva = await salvarCaixa({
          chave, nome: infoDe.get(chave)?.nome ?? cad?.nome ?? chave,
          splitter: temSpl ? undefined : cad?.splitter, splitter_modelo: temSpl ? undefined : cad?.splitter_modelo,
          portas: temSpl ? [] : cad?.portas ?? [], splitters: temSpl ? ed.splitters : cad?.splitters,
          obs: cad?.obs, regras_emenda: ed.regras_emenda, emendas: ed.emendas, atendimento: atds[chave] ?? cad?.atendimento, atualizado_por: usuario,
        });
        onCaixaSalva(salva);
        // CDOI: o splitter do Unifilar passa para o prédio e para a rota (conta de potência)
        if (infoDe.get(chave)?.tipo === "cdoi" && (await sincronizarSplitterCdoi(salva, rotasBase, catalogo, usuario))) mudouRota = true;
      }
      // DIO: a porta nova vai para as rotas
      for (const r of rotasMudadas) {
        await atualizarRota(r.id, paraGravar({ pai: r.pai, tronco: r.tronco }, {
          nome: r.nome, origem: r.origem, elementos: r.elementos, trechos: r.trechos, calculo_potencia: r.calculo_potencia, obs: r.obs, criado_por: r.criado_por,
        }));
        mudouRota = true;
      }
      setDioPend({});
      if (mudouRota) onRotasMudaram?.();
      setEds({});
      setAtds({});
      setHist([]);
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
  const ponto = (chave: string, p: PontoUni, x: number, y: number, cor: string, ocup: boolean) => {
    const id = `${chave}#${idPonto(p)}`;
    const ativo = sel && sel.chave === chave && idPonto(sel.p) === idPonto(p);
    const dioPar = !!sel && ((sel.p.k === "fibra" && sel.p.lado === "chega" && p.k === "adaptador") || (sel.p.k === "adaptador" && p.k === "fibra" && p.lado === "chega"));
    const cand = modo === "editar" && sel?.chave === chave && !ativo && (dioPar || ["fusao", "entrada", "perna", "nivel2"].includes(tipoEntre(sel.p, p)));
    return (
      <g key={`pt${id}`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); if (!moveu.current) clicarPonto(chave, p); }}>
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
    <div className={`overflow-hidden border border-slate-800 bg-[#16181c] text-slate-200 ${cheia ? "fixed inset-0 z-50 flex flex-col" : "rounded-2xl"}`}>
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
        {abertas.length > 0 && <button type="button" onClick={() => { setAbertas([]); setTraco(null); setRotasTraco([]); }} className="rounded-lg border border-slate-700 px-2 py-1.5 text-slate-400 hover:text-slate-200">Limpar</button>}
        {pendentes > 0 && (
          <>
            <button type="button" disabled={!hist.length} onClick={() => { setEds(hist[hist.length - 1]); setHist((h) => h.slice(0, -1)); }} className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-slate-300 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button>
            <button type="button" onClick={() => { setEds({}); setHist([]); setDioPend({}); setAtds({}); }} className="rounded-lg border border-slate-700 px-2 py-1.5 text-slate-300">Descartar</button>
            <button type="button" disabled={salvando} onClick={salvarTudo} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 font-semibold text-white disabled:opacity-60">
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
          className="min-w-0 flex-1 cursor-grab select-none overflow-auto active:cursor-grabbing"
          onPointerDown={(e) => { if (e.pointerType !== "mouse" || e.button !== 0 || !area.current) return; arr.current = { x: e.clientX, y: e.clientY, sl: area.current.scrollLeft, st: area.current.scrollTop }; moveu.current = false; }}
          onPointerMove={(e) => { const a = arr.current; if (!a || !area.current) return; const dx = e.clientX - a.x, dy = e.clientY - a.y; if (!moveu.current && Math.abs(dx) + Math.abs(dy) > 5) moveu.current = true; if (moveu.current) { area.current.scrollLeft = a.sl - dx; area.current.scrollTop = a.st - dy; } }}
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
            <svg viewBox={`0 0 ${W} ${H}`} width={W * zoom} height={H * zoom} className="block" role="img" aria-label="Unifilar da rede">
              <defs>
                <pattern id="gradeUR" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#22252b" strokeWidth=".7" /></pattern>
              </defs>
              <rect width={W} height={H} fill="url(#gradeUR)" />

              {/* Cabos entre caixas abertas */}
              {blocos.filter((b) => b.c.lado === "sai" && b.c.outraChave && abertas.includes(b.c.outraChave)).map((b) => {
                const dest = blocos.find((x) => x.chave === b.c.outraChave && x.c.lado === "chega" && x.c.chave === b.c.chave);
                if (!dest) return null;
                const y1 = b.y + 14, y2 = dest.y + 14;
                const x1 = b.x + BW, x2 = dest.x;
                const d = `M${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`;
                return (
                  <g key={`cab${b.chave}${b.c.id}`}>
                    <path d={d} fill="none" stroke="#0b0d10" strokeWidth={9} strokeLinecap="round" />
                    <path d={d} fill="none" stroke="#3b82f6" strokeWidth={4} strokeLinecap="round" />
                    <rect x={x1} y={y1 - 6} width={14} height={12} rx={3} fill="#64748b" stroke="#0b0d10" />
                    <rect x={x2 - 14} y={y2 - 6} width={14} height={12} rx={3} fill="#64748b" stroke="#0b0d10" />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} fontSize={8} fill="#93c5fd" textAnchor="middle">{curto(semCodigo(b.c.nome), 30)}</text>
                  </g>
                );
              })}

              {/* Caixas */}
              {caixasDes.map((cx) => {
                const info = infoDe.get(cx.chave);
                const t = info?.tipo ?? "outro";
                const m = modelos.get(cx.chave)!;
                const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
                return (
                  <g key={cx.chave}>
                    <rect x={cx.x} y={TOPO} width={cx.w} height={cx.h} rx={10} fill="#1d2025" stroke={COR_TIPO[t] ?? "#475569"} strokeWidth={1.4} />
                    <rect x={cx.x} y={TOPO} width={cx.w} height={30} rx={10} fill={COR_TIPO[t] ?? "#475569"} opacity={0.9} />
                    <g transform={`translate(${cx.x + 8} ${TOPO + 4})`} dangerouslySetInnerHTML={{ __html: iconeSvg(t, 22) }} />
                    <text x={cx.x + 36} y={TOPO + 13} fontSize={10} fontWeight={800} fill="#fff">{curto(info?.nome ?? cx.chave, 40)}</text>
                    <text x={cx.x + 36} y={TOPO + 24} fontSize={8} fill="#f1f5f9" opacity={0.85}>{TIPO_ELEMENTO_LABEL[t]}{cx.chave.startsWith("PT:") ? ` · ${cx.chave.slice(3)}` : ""}{eds[cx.chave] ? " · alterada" : automatico.get(cx.chave)?.mudou ? " · splitters montados pelas rotas (falta salvar)" : ""}</text>
                    <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setAbertas((a) => a.filter((x) => x !== cx.chave)); }}>
                      <title>Fechar esta caixa</title>
                      <circle cx={cx.x + cx.w - 14} cy={TOPO + 15} r={8} fill="#00000033" />
                      <path d={`M${cx.x + cx.w - 18} ${TOPO + 11} l8 8 M${cx.x + cx.w - 10} ${TOPO + 11} l-8 8`} stroke="#fff" strokeWidth={1.6} />
                    </g>

                    {/* ligações dentro da caixa */}
                    {m.ligacoes.map((l) => {
                      const a = pos.get(`${cx.chave}#${idPonto(l.a)}`), b = pos.get(`${cx.chave}#${idPonto(l.b)}`);
                      if (!a || !b) return null;
                      const mx = (a[0] + b[0]) / 2;
                      const d = `M${a[0]} ${a[1]} C ${mx} ${a[1]}, ${mx} ${b[1]}, ${b[0]} ${b[1]}`;
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
                    {t === "olt" && (
                      <g>
                        <rect x={cx.xE} y={TOPO + 44} width={BW} height={HEAD + cx.pons.length * (ROW + 4) + 4} rx={6} fill="#0f172a" stroke="#334155" />
                        <text x={cx.xE + 8} y={TOPO + 58} fontSize={9} fontWeight={800} fill="#e2e8f0">Portas PON</text>
                        {cx.pons.map((pp, k) => {
                          const yy = TOPO + 44 + HEAD + k * (ROW + 4) + ROW / 2;
                          const lp = pp.match(/PL\s*0*(\d+)\D+0*(\d+)/i);
                          const rotulo = lp ? `0/${+lp[1]}/${+lp[2]}` : pp;
                          return (
                            <g key={pp}>
                              <rect x={cx.xE + 8} y={yy - 7} width={BW - 26} height={14} rx={3} fill="#1e293b" stroke="#475569" />
                              <rect x={cx.xE + 12} y={yy - 4} width={8} height={8} rx={1.5} fill="#16a34a" />
                              <text x={cx.xE + 26} y={yy + 3} fontSize={8} fontWeight={700} fill="#e2e8f0">PON {rotulo}</text>
                              <text x={cx.xE + BW - 22} y={yy + 3} fontSize={7} fill="#94a3b8" textAnchor="end">{pp.replace(/^PL\s*/i, "PL ")}</text>
                              {ponto(cx.chave, { k: "pon", porta: pp }, cx.xE + BW, yy, "#facc15", true)}
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {/* DIO: grade de adaptadores (porta N = fibra N do cabo que sai) */}
                    {t === "dio" && (
                      <g>
                        <rect x={cx.xE + BW + 20} y={TOPO + 50} width={12 * 16 + 20} height={Math.ceil(cx.capDio / 12) * 16 + 30} rx={6} fill="#111827" stroke="#334155" />
                        <text x={cx.xE + BW + 28} y={TOPO + 63} fontSize={8.5} fontWeight={800} fill="#cbd5e1">Adaptadores do DIO · {cx.capDio}</text>
                        {Array.from({ length: cx.capDio }, (_, k) => {
                          const n = k + 1;
                          const pp = pos.get(`${cx.chave}#${idPonto({ k: "adaptador", n })}`)!;
                          const usado = ocup.has(idPonto({ k: "adaptador", n }));
                          return (
                            <g key={n}>
                              <title>{`Adaptador ${n}${usado ? " · em uso" : " · livre"}`}</title>
                              <rect x={pp[0] - 7} y={pp[1] - 7} width={14} height={14} rx={2.5} fill={usado ? "#1e3a8a" : "#1f2937"} stroke={usado ? "#60a5fa" : "#374151"} />
                              <text x={pp[0]} y={pp[1] + 2.5} fontSize={6} fill={usado ? "#dbeafe" : "#6b7280"} textAnchor="middle" fontWeight={700}>{n}</text>
                              {(usado || modo === "editar") && ponto(cx.chave, { k: "adaptador", n }, pp[0], pp[1] + 9, "#60a5fa", usado)}
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {/* splitters (estilo GeoGrid: entrada à esquerda, leque, portas numeradas à direita) */}
                    {cx.spl.map(({ s, x, y, h, w, portas }) => {
                      const modelo = catalogo.find((q) => q.id === s.modelo_id);
                      const ent = s.entrada.fibra;
                      const pon = ent ? rotas.find((r) => r.elementos.some((e) => chaveElemento(e) === cx.chave && !!e.cabo_entrada && chaveCabo(e.cabo_entrada) === chaveCabo(ent.cabo) && e.fibra_entrada === ent.fibra)) : undefined;
                      const yIn = y + 26 + (portas.length * ROW) / 2;
                      const idx = (edDe(cx.chave).splitters.indexOf(s) + 1) || 1;
                      return (
                        <g key={s.id}>
                          <rect x={x} y={y} width={w} height={h} rx={6} fill="#0f2a1c" stroke="#22c55e" strokeWidth={1.2} />
                          <rect x={x} y={y} width={w} height={20} rx={6} fill={splSel?.chave === cx.chave && splSel.id === s.id ? "#a16207" : "#14532d"}
                            className={modo === "editar" ? "cursor-pointer" : undefined}
                            onClick={(e) => { if (modo !== "editar") return; e.stopPropagation(); setSplSel({ chave: cx.chave, id: s.id }); setSelLig(null); setSel(null); }}>
                            {modo === "editar" && <title>Clique para ver ou remover este splitter</title>}
                          </rect>
                          <text x={x + 6} y={y + 13} fontSize={9} fontWeight={800} fill="#dcfce7" pointerEvents="none">S{idx} · {s.relacao}</text>
                          <text x={x + w - 6} y={y + 13} fontSize={7.5} fill="#86efac" textAnchor="end">{pon ? portaPonDaRota(pon).rotulo.replace(/^.*· /, "") : ent ? `F${String(ent.fibra).padStart(2, "0")} · sem rota` : s.entrada.splitter ? "2º nível" : "sem entrada"}</text>
                          {!pon && ent && <rect x={x} y={y} width={w} height={h} rx={6} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4 3"><title>Esta fibra não tem rota: confira ou tire o splitter</title></rect>}
                          <path d={`M${x + 10} ${yIn - 5} L${x + w - 30} ${y + 26} L${x + w - 30} ${y + h - 8} L${x + 10} ${yIn + 5} Z`} fill="#22c55e" opacity={0.18} />
                          <rect x={x - 2} y={yIn - 6} width={12} height={12} rx={2} fill="#16a34a" stroke="#0b0d10" />
                          <text x={x + 20} y={yIn + 3} fontSize={6.5} fill="#86efac">{perdaSplitter(s.relacao, modelo?.perda_db).toFixed(1).replace(".", ",")} dB</text>
                          {ponto(cx.chave, { k: "entrada", spl: s.id }, x - 6, yIn, "#4ade80", ocup.has(idPonto({ k: "entrada", spl: s.id })))}
                          {portas.map((p, k) => {
                            const yy = y + 26 + k * ROW + ROW / 2;
                            const cor = p.status === "cliente" ? "#0284c7" : p.status === "ramal" ? "#d97706" : "#1f3d33";
                            return (
                              <g key={p.numero}>
                                <title>{`Porta ${p.numero} · ${p.status === "cliente" ? `cliente ${p.descricao ?? ""}` : p.status === "ramal" ? `ramal ${p.descricao ?? ""}` : "livre"}`}</title>
                                <rect x={x + w - 26} y={yy - 6} width={20} height={12} rx={2} fill={cor} stroke="#0b0d10" />
                                <text x={x + w - 16} y={yy + 3} fontSize={7} fontWeight={800} fill="#fff" textAnchor="middle">{p.numero}</text>
                                {p.status === "cliente" && <text x={x + w - 32} y={yy + 3} fontSize={7} textAnchor="end">👤</text>}
                                {pernaSel?.chave === cx.chave && pernaSel.spl === s.id && pernaSel.porta === p.numero && <rect x={x + w - 28} y={yy - 8} width={24} height={16} rx={3} fill="none" stroke="#38bdf8" strokeWidth={1.6} />}
                                {ponto(cx.chave, { k: "porta", spl: s.id, porta: p.numero }, x + w + 6, yy, "#4ade80", ocup.has(idPonto({ k: "porta", spl: s.id, porta: p.numero })))}
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* blocos dos cabos (por cima) */}
              {blocos.map(({ chave, c, x, y, fibras, h }) => {
                const ehE = c.lado === "chega";
                const m = modelos.get(chave)!;
                const ocup = new Set(m.ligacoes.flatMap((l) => [idPonto(l.a), idPonto(l.b)]));
                const viz = c.outraChave && infoDe.get(c.outraChave);
                const aberta = !!c.outraChave && abertas.includes(c.outraChave);
                return (
                  <g key={`${chave}${c.id}`}>
                    <rect x={x} y={y} width={BW} height={h} rx={6} fill="#2a2e35" stroke="#3b4048" />
                    <rect x={x} y={y} width={BW} height={HEAD - 4} rx={6} fill="#0f1115" />
                    <text x={x + 6} y={y + 11} fontSize={8.5} fontWeight={800} fill="#e2e8f0">{curto(semCodigo(c.nome), 28)}</text>
                    <text x={x + 6} y={y + 21} fontSize={7.5} fill={viz && !aberta ? "#60a5fa" : "#94a3b8"} className={viz && !aberta ? "cursor-pointer" : undefined}
                      onClick={(e) => { e.stopPropagation(); abrirVizinha(chave, c); }}>
                      {codigoDoCabo(c.nome) ?? "sem código"} · {c.capacidade}f{viz ? ` · ${ehE ? "◀" : "▶"} ${curto(viz.nome, 16)}` : ""}
                    </text>
                    {fibras.map((f, k) => {
                      const cf = corFibra(f, c.nome);
                      const yy = y + HEAD + k * ROW + ROW / 2;
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
                          {ponto(chave, pt, ehE ? x + BW : x, yy, cf.hex, ocup.has(idPonto(pt)))}
                        </g>
                      );
                    })}
                    {fibras.length < c.capacidade && (
                      <text x={x + BW / 2} y={y + HEAD + fibras.length * ROW + 10} fontSize={8} fill="#60a5fa" textAnchor="middle" className="cursor-pointer"
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
                    : <button type="button" onClick={() => { if (comCliente && !confirm(`Tirar o S${idx}? ${comCliente} cliente(s) ficam sem porta.`)) return; mudar(splSel.chave, { ...ed, splitters: ed.splitters.filter((x) => x.id !== sp.id) }); setSplSel(null); }}
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
                  {l.tipo !== "passa" && l.origem !== "rota" && <button type="button" onClick={() => { mudar(selLig.chave, desligar(edDe(selLig.chave), l)); setSelLig(null); }} className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 font-semibold text-white"><X className="h-3 w-3" /> Desligar</button>}
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
                        <button type="button" disabled={!infoDe.has(p.chave)} onClick={() => setAbertas((a) => (a.includes(p.chave) ? a : [...a, p.chave]))}
                          className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left ${aberta ? "bg-orange-500/20 text-orange-200" : "text-slate-200 hover:bg-slate-800"} disabled:cursor-default disabled:hover:bg-transparent`}>
                          <IconeElemento tipo={p.tipo} tamanho={15} /> <span className="truncate">{curto(p.nome, 30)}{p.porta ? ` · ${p.porta}` : ""}</span>
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
