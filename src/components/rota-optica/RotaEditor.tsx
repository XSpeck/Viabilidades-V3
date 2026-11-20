"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Loader2, MapPin, MousePointer2, Plus, Route, Save, Settings2, Trash2, Undo2, X,
} from "lucide-react";
import {
  CALCULO_PADRAO,
  calcularPotencias,
  capacidadeDoCabo,
  comprimentoTracado,
  distanciaMetros,
  type CalculoPotencia,
  corFibraPorCapacidade,
  fibrasPorTubo,
  formatMetros,
  TIPO_ELEMENTO_LABEL,
  type ElementoRota,
  type RotaOptica,
  type RotaOpticaInput,
  type TipoElementoRota,
  type TrechoCabo,
  reservaTrecho,
} from "@/lib/rotaOptica";
import { chaveCabo, salvarCabo, type CaboRede } from "@/lib/cabosRede";
import { lerPortaOlt, numeracaoOlt, resumoItem, textoPortaOlt, type ItemCatalogo } from "@/lib/catalogoRede";
import type { Ferramenta, PontoEditor, PontoRede } from "./RotaEditorMapa";
import { chaveElemento } from "@/lib/arvorePon";
import { andaresDoBloco, listarPredios, novoId, predioNovo, rotuloAndarCurto, salvarPredio, type PredioRede } from "@/lib/prediosRede";
import { IconeCabo, IconeElemento } from "./IconesRede";
import EstacaoOltDio, { type DadosEstacao } from "./EstacaoOltDio";

const RotaEditorMapa = dynamic(() => import("./RotaEditorMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-100 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  ),
});

type Ponto = { lat: number; lon: number };

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
  /** Distância calculada pelo mapa (muda sozinha quando mexe no mapa) */
  dist_auto: boolean;
  potencia_entrada: string;
  potencia_saida: string;
  splitter: string;
  splitter_modelo: string;
  /** HUB só de passagem nesta rota (splitter de outra porta) */
  passagem: boolean;
  /** Trecho que chega é um link no mesmo poste (sem traçado e sem reserva) */
  mesmoPoste: boolean;
  equipamento_id: string;
  porta: string;
  coords: string;
  /** Postes do cabo no trecho que chega neste elemento */
  vertices: Ponto[];
  obs: string;
  /** CDOI colocada com a ferramenta Prédio: em que prédio, bloco e andar ela fica (gravado no prédio ao salvar) */
  predio?: VinculoPredio;
}

/** id vazio = prédio novo (criado ao salvar com este nome) */
interface VinculoPredio {
  id: string;
  nome: string;
  /** id do bloco (prédio existente) ou nome do bloco (prédio novo) */
  bloco: string;
  andar: number;
}

const s = (v?: number) => (v === undefined ? "" : String(v).replace(".", ","));
const pad2 = (v: number) => String(v).padStart(2, "0");
const fmtDbm = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")} dBm`;
const fmtCoord = (p: Ponto) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

function paraLinha(e: ElementoRota, vertices: Ponto[] = []): Linha {
  return {
    nome: e.nome,
    tipo: e.tipo,
    codigo: e.codigo ?? "",
    cabo_entrada: e.cabo_entrada ?? "",
    fibra_entrada: s(e.fibra_entrada),
    cabo_saida: e.cabo_saida ?? "",
    fibra_saida: s(e.fibra_saida),
    distancia_m: s(e.distancia_m),
    dist_auto: e.distancia_m === undefined,
    potencia_entrada: s(e.potencia_entrada),
    potencia_saida: s(e.potencia_saida),
    splitter: e.splitter ?? "",
    splitter_modelo: e.splitter_modelo ?? "",
    passagem: !!e.passagem,
    mesmoPoste: !!e.mesmo_poste,
    equipamento_id: e.equipamento_id ?? "",
    porta: e.porta ?? "",
    coords: e.lat !== undefined && e.lon !== undefined ? `${e.lat}, ${e.lon}` : "",
    vertices,
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

function posDe(l: Linha): Ponto | null {
  const c = parseCoords(l.coords);
  return c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : null;
}

/** Comprimento pelo mapa do trecho que chega em ls[i] (anterior → postes → este). */
function distMapa(ls: Linha[], i: number): number | null {
  if (i === 0) return null;
  const a = posDe(ls[i - 1]);
  const b = posDe(ls[i]);
  if (!a || !b) return null;
  return Math.round(comprimentoTracado([a, ...ls[i].vertices, b]));
}

/** Distância do trecho para o OTDR: traçado no mapa + reservas técnicas das duas caixas */
function distTotal(ls: Linha[], i: number, c: Partial<CalculoPotencia>): number | null {
  const d = distMapa(ls, i);
  return d === null ? null : d + reservaTrecho(ls[i - 1]?.tipo, ls[i].tipo, c);
}

function recalcular(ls: Linha[], c: Partial<CalculoPotencia> = CALCULO_PADRAO): Linha[] {
  return ls.map((l, i) => {
    if (!l.dist_auto) return l;
    const d = distTotal(ls, i, c);
    return d === null ? l : { ...l, distancia_m: String(d) };
  });
}

/** Índice do segmento (entre pts[j] e pts[j+1]) mais perto do ponto, em plano local. */
function segmentoMaisPerto(pts: Ponto[], p: Ponto): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  let melhor = 0;
  let dMin = Infinity;
  for (let j = 0; j < pts.length - 1; j++) {
    const ax = pts[j].lon * k, ay = pts[j].lat, bx = pts[j + 1].lon * k, by = pts[j + 1].lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
    if (d < dMin) { dMin = d; melhor = j; }
  }
  return melhor;
}

const normNome = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** Postes do trecho i (anterior → i) tirados do traçado do KML: pedaço do cabo entre os pontos mais perto das duas caixas. */
function verticesDoKml(els: ElementoRota[], i: number, kml: TrechoCabo[]): Ponto[] {
  const a = els[i - 1];
  const b = els[i];
  if (!a || !b || a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return [];
  const pa = { lat: a.lat, lon: a.lon };
  const pb = { lat: b.lat, lon: b.lon };
  const nomeCabo = normNome(b.cabo_entrada ?? "");
  let melhor: { score: number; pts: Ponto[] } | null = null;
  for (const t of kml) {
    if (t.pontos.length < 2) continue;
    let ia = 0, da = Infinity, ib = 0, db = Infinity;
    t.pontos.forEach((p, k) => {
      const d1 = distanciaMetros(pa, p);
      if (d1 < da) { da = d1; ia = k; }
      const d2 = distanciaMetros(pb, p);
      if (d2 < db) { db = d2; ib = k; }
    });
    if (da > 80 || db > 80 || ia === ib) continue;
    const score = da + db - (nomeCabo && normNome(t.nome) === nomeCabo ? 1000 : 0);
    if (!melhor || score < melhor.score) {
      const pts = ia < ib ? t.pontos.slice(ia + 1, ib) : t.pontos.slice(ib + 1, ia).reverse();
      melhor = { score, pts: pts.map((p) => ({ lat: p.lat, lon: p.lon })) };
    }
  }
  return melhor?.pts ?? [];
}

/** Tipo de elemento que a ferramenta coloca (null = Mover/Poste) */
function tipoDaFerramenta(f: Ferramenta): TipoElementoRota | null {
  if (f === "predio") return "cdoi";
  return f === "selecionar" || f === "poste" || f === "estacao" ? null : f;
}

const PALETA: { t: TipoElementoRota; rot: string }[] = [
  { t: "olt", rot: "OLT" },
  { t: "dio", rot: "DIO" },
  { t: "ceo", rot: "CEO" },
  { t: "ct", rot: "CT" },
  { t: "hub", rot: "HUB" },
  { t: "cto", rot: "CTO" },
  { t: "predio", rot: "Prédio" },
  { t: "onu", rot: "Cliente" },
];

const PREFIXO: Record<TipoElementoRota, string> = {
  olt: "OLT", dio: "DIO", ceo: "CEO", ct: "CT", hub: "HUB", cto: "CTO", cdoi: "CDOI", predio: "Prédio", onu: "Cliente", outro: "Ponto",
};

/** Parte curta do nome de um elemento, usada no nome automático do cabo ("24 FO ASO · HUB 1 → CTO 2") */
function curtoNome(s0: string) {
  return s0.split(" - ")[0].split(" / ")[0].trim();
}

/** Depois de um splitter (HUB/CTO/CDOI) a fibra segue num cabo novo: não herda o cabo do trecho anterior */
function herdaCabo(ant?: Linha): ant is Linha {
  return !!ant && ant.tipo !== "dio" && ((ant.tipo !== "hub" && ant.tipo !== "cto") || ant.passagem) && ant.tipo !== "cdoi";
}

/** Nome automático ("CDOI 3"): pula os nomes que já existem nesta rota e na rede */
function nomeAuto(tipo: TipoElementoRota, ls: Linha[], outros: string[] = []): string {
  const qtd = ls.filter((l) => l.tipo === tipo).length;
  if (tipo === "olt" && qtd === 0) return "OLT";
  const usados = new Set([...ls.map((l) => l.nome), ...outros].map((x) => x.trim().toUpperCase()));
  let k = qtd + 1;
  while (usados.has(`${PREFIXO[tipo]} ${k}`.toUpperCase())) k++;
  return `${PREFIXO[tipo]} ${k}`;
}

function nivelCor(v?: number) {
  if (v === undefined) return "text-slate-500";
  if (v >= -20) return "text-emerald-600";
  if (v >= -25) return "text-lime-600";
  if (v >= -27) return "text-amber-600";
  return "text-red-600";
}

interface Props {
  inicial?: RotaOptica | null;
  usuario: string;
  catalogo: ItemCatalogo[];
  cabos: CaboRede[];
  /** Nomes de cabos já usados nas rotas (sugestões) */
  nomesCabos: string[];
  centroPadrao?: [number, number];
  /** Outras rotas salvas: formam a rede mostrada ao fundo e podem ser usadas como ponto de partida */
  rede: RotaOptica[];
  onCaboSalvo: (c: CaboRede) => void;
  onCancelar: () => void;
  onSalvar: (dados: RotaOpticaInput) => Promise<void>;
}

export default function RotaEditor({ inicial, usuario, catalogo, cabos, nomesCabos, centroPadrao, rede, onCaboSalvo, onCancelar, onSalvar }: Props) {
  // Todo traçado é editável: o do KML (rotas do GeoGrid) vira postes de cada trecho ao abrir
  const trechosFixos: TrechoCabo[] = [];
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial?.elementos.length
      ? inicial.elementos.map((e, i) =>
          paraLinha(
            e,
            inicial.trechos.some((t) => t.ate !== undefined)
              ? inicial.trechos.find((t) => t.ate === i)?.pontos.slice(1, -1) ?? []
              : verticesDoKml(inicial.elementos, i, inicial.trechos)
          )
        ).map((l) => {
          // splitter salvo só com a relação (ex.: "1:8"): liga ao modelo do cadastro com a mesma relação
          if (!l.splitter || catalogo.some((m) => m.categoria === "splitter" && m.id === l.splitter_modelo)) return l;
          const m = catalogo.find((x) => x.categoria === "splitter" && x.relacao === l.splitter);
          return m ? { ...l, splitter_modelo: m.id } : l;
        })
      : []
  );
  const [sel, setSel] = useState<number | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(inicial?.elementos.length ? "selecionar" : "estacao");
  const [pendentes, setPendentes] = useState<Ponto[]>([]);
  const [tiposCabo, setTiposCabo] = useState<Record<string, string>>(() =>
    Object.fromEntries(cabos.filter((c) => c.tipo_id).map((c) => [c.chave, c.tipo_id!]))
  );
  // Potência: automática por padrão; rotas do GeoGrid já vêm com a potência calculada lá
  const [calc, setCalc] = useState<CalculoPotencia>(
    () => inicial?.calculo_potencia ?? (inicial?.origem === "geogrid" ? { ...CALCULO_PADRAO, auto: false } : CALCULO_PADRAO)
  );
  const [verCalc, setVerCalc] = useState(false);
  const [verPendencias, setVerPendencias] = useState(false);
  /** Pede ao mapa para enquadrar um trecho (ex.: cabo curto que sai da estação) */
  const [focoTrecho, setFocoTrecho] = useState<{ i: number; vez: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Nome da caixa antes de começar a editar (para renomear os cabos ao terminar) */
  const nomeAntes = useRef("");
  /** Cabo sendo renomeado (lápis no quadro do cabo) */
  const [renomear, setRenomear] = useState<{ i: number; antigo: string } | null>(null);
  /** Prédios cadastrados (a ferramenta Prédio coloca a CDOI num deles ou cria um novo) */
  const [predios, setPredios] = useState<PredioRede[]>([]);
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setPredios(ps)).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Linha[][]>([]);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Rede já cadastrada: uma caixa por chave (código PT ou nome) e os cabos de todas as rotas
  const redeInfo = useMemo(() => {
    const vistos = new Map<string, { el: ElementoRota; rota: RotaOptica; i: number }>();
    const cabosRede: { pts: [number, number][]; cor?: string }[] = [];
    for (const r of rede) {
      r.elementos.forEach((e, i) => {
        if (e.lat === undefined || e.lon === undefined) return;
        const k = chaveElemento(e);
        if (!vistos.has(k)) vistos.set(k, { el: e, rota: r, i });
      });
      if (r.trechos.length) {
        r.trechos.forEach((t) => cabosRede.push({ pts: t.pontos.map((p) => [p.lat, p.lon] as [number, number]), cor: t.cor }));
      } else {
        const pts = r.elementos.filter((e) => e.lat !== undefined && e.lon !== undefined).map((e) => [e.lat!, e.lon!] as [number, number]);
        if (pts.length > 1) cabosRede.push({ pts });
      }
    }
    return { itens: [...vistos.values()], cabos: cabosRede };
  }, [rede]);
  /** Próximo código numérico livre (considera a rede toda e esta rota). Séries de 6 dígitos a partir de 100001. */
  function proximoCodigo(ls: Linha[], extra = 0): string {
    const usados = [
      ...rede.flatMap((r) => r.elementos.map((e) => e.codigo ?? "")),
      ...ls.map((l) => l.codigo),
    ].filter((c) => /^\d+$/.test(c.trim())).map((c) => parseInt(c, 10));
    return String(Math.max(100000, ...usados) + 1 + extra);
  }

  const chaveLinha = (l: Linha) => chaveElemento({ nome: l.nome, codigo: l.codigo.trim() || undefined, tipo: l.tipo });
  const chavesNaRota = new Set(linhas.map(chaveLinha));
  // CDOIs de um mesmo prédio viram um marcador só (o prédio), na posição da primeira CDOI
  const predioDaChave = new Map<string, PredioRede>();
  predios.forEach((p) => p.chaves.forEach((k) => predioDaChave.set(k, p)));
  const pontosRede: PontoRede[] = [];
  /** Para cada marcador da rede: o item (caixa) que ele representa */
  const itemDoPonto: number[] = [];
  const prediosNoMapa = new Set<string>();
  redeInfo.itens.forEach(({ el }, k) => {
    const pr = predioDaChave.get(chaveElemento(el));
    if (pr) {
      if (prediosNoMapa.has(pr.id)) return;
      prediosNoMapa.add(pr.id);
      pontosRede.push({
        nome: `${pr.nome} · ${pr.pontos.length} CDOI${pr.pontos.length !== 1 ? "s" : ""}`,
        tipo: "predio",
        lat: el.lat!,
        lon: el.lon!,
        naRota: pr.chaves.some((c) => chavesNaRota.has(c)),
      });
      itemDoPonto.push(k);
      return;
    }
    pontosRede.push({ nome: el.nome, tipo: el.tipo, lat: el.lat!, lon: el.lon!, naRota: chavesNaRota.has(chaveElemento(el)) });
    itemDoPonto.push(k);
  });
  /** Clique num marcador da rede: no prédio com a ferramenta Prédio, a CDOI nova entra nele */
  function clicarRede(k: number) {
    const p = pontosRede[k];
    if (p?.tipo === "predio" && ferramenta === "predio") return clicarMapa(p.lat, p.lon);
    usarDaRede(itemDoPonto[k], p?.tipo === "predio" ? p.nome.split(" · ")[0] : undefined);
  }

  const tiposDeCabo = catalogo.filter((c) => c.categoria === "cabo");
  /** Nomes das caixas da rede (para o nome automático não repetir) */
  const nomesRede = rede.flatMap((r) => r.elementos.map((e) => e.nome));
  const modelosSplitter = catalogo.filter((c) => c.categoria === "splitter");
  const olts = catalogo.filter((c) => c.categoria === "olt");
  const dios = catalogo.filter((c) => c.categoria === "dio");

  useEffect(() => {
    if (sel !== null) itemRefs.current[sel]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  // ---------- Alterações (com histórico para desfazer) ----------
  function mudar(fn: (ls: Linha[]) => Linha[]) {
    setHistorico((h) => [...h.slice(-49), linhas]);
    setLinhas((ls) => recalcular(fn(ls), calc));
  }
  function alterar(i: number, mudanca: Partial<Linha>) {
    mudar((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));
  }

  /**
   * Caixa renomeada: os nomes automáticos dos cabos acompanham ("… · CEO 1 → HUB 1" vira "… → HUB 0/3/10").
   * Roda quando o nome termina de ser editado (ao sair do campo), não a cada letra.
   */
  function renomearCabos(nomeVelho: string, nomeNovo: string) {
    const velho = curtoNome(nomeVelho);
    const novo = curtoNome(nomeNovo);
    if (!velho || !novo || velho === novo) return;
    const esc = velho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const troca = (c: string) => c.replace(`· ${velho} →`, `· ${novo} →`).replace(new RegExp(`→ ${esc}(?=( \\(mesmo poste\\))?$)`), `→ ${novo}`).replace(new RegExp(`^Cordão ${esc} →`), `Cordão ${novo} →`);
    setTiposCabo((tc) => {
      const c = { ...tc };
      linhas.forEach((l) => {
        const nv = troca(l.cabo_entrada);
        if (nv !== l.cabo_entrada && tc[chaveCabo(l.cabo_entrada)]) c[chaveCabo(nv)] = tc[chaveCabo(l.cabo_entrada)];
      });
      return c;
    });
    mudar((ls) => ls.map((l) => {
      const nv = troca(l.cabo_entrada);
      return nv !== l.cabo_entrada ? { ...l, cabo_entrada: nv } : l;
    }));
  }
  function desfazer() {
    if (pendentes.length) return setPendentes((p) => p.slice(0, -1));
    const ant = historico[historico.length - 1];
    if (ant) {
      setHistorico((h) => h.slice(0, -1));
      setLinhas(ant);
      setSel((s0) => (s0 !== null && s0 < ant.length ? s0 : null));
    }
  }

  // Atalhos: Esc = Selecionar; Ctrl+Z = desfazer (fora dos campos)
  const desfazerRef = useRef(desfazer);
  useEffect(() => { desfazerRef.current = desfazer; });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const campoAtivo = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if (e.key === "Escape") { setFerramenta("selecionar"); setAviso(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !campoAtivo) { e.preventDefault(); desfazerRef.current(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  function mover(i: number, d: -1 | 1) {
    mudar((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      // Os postes pertencem ao trecho, que mudou: descarta os dos trechos afetados
      [i, j, Math.max(i, j) + 1].forEach((k) => { if (c[k]) c[k] = { ...c[k], vertices: [] }; });
      return c;
    });
    setSel((s0) => (s0 === i ? i + d : s0));
  }

  function remover(i: number) {
    mudar((ls) => {
      const c = [...ls];
      const tirado = c[i];
      const prox = c[i + 1];
      // O cabo passa direto: postes do trecho removido + local da caixa removida viram postes do próximo trecho
      if (prox) {
        const p = posDe(tirado);
        c[i + 1] = { ...prox, vertices: i === 0 ? [] : [...tirado.vertices, ...(p ? [p] : []), ...prox.vertices], dist_auto: true };
      }
      c.splice(i, 1);
      return c;
    });
    setSel(null);
  }

  // ---------- Mapa ----------
  /** Posição de cada CDOI da rede (para achar o prédio perto do clique) */
  function posCdoiRede(chaveCdoi: string): Ponto | null {
    for (const r of rede) for (const e of r.elementos) if (e.lat !== undefined && e.lon !== undefined && chaveElemento(e) === chaveCdoi) return { lat: e.lat, lon: e.lon };
    return null;
  }
  /** Prédios perto de um ponto (até 200 m), do mais perto ao mais longe */
  function prediosPerto(p: Ponto) {
    return predios
      .map((pr) => {
        const ds = pr.chaves.map(posCdoiRede).filter((x): x is Ponto => !!x).map((x) => distanciaMetros(p, x));
        return { pr, d: ds.length ? Math.min(...ds) : Infinity };
      })
      .filter((x) => x.d <= 200)
      .sort((a, b) => a.d - b.d);
  }
  function vinculoPerto(p: Ponto): VinculoPredio {
    const perto = prediosPerto(p)[0];
    if (perto && perto.d <= 60) return { id: perto.pr.id, nome: perto.pr.nome, bloco: perto.pr.blocos[0]?.id ?? "", andar: 0 };
    return { id: "", nome: "", bloco: "Bloco A", andar: 0 };
  }

  /** HUB logo antes desta CTO no mesmo poste (para o transporte voltar por ela) */
  function hubAntes(i: number): number | null {
    for (let j = i - 1; j >= 0; j--) {
      if (linhas[j].tipo === "hub") return linhas[i].mesmoPoste || j === i - 1 ? j : null;
      if (!linhas[j + 1]?.mesmoPoste) return null;
    }
    return null;
  }

  /** Link curto entre caixas no mesmo poste: menor cabo do cadastro com mais de uma fibra (leva o link e a volta) */
  function tipoLinkPoste() {
    return [...tiposDeCabo].filter((t) => (t.capacidade ?? 0) >= 2).sort((a, b) => (a.capacidade ?? 0) - (b.capacidade ?? 0))[0];
  }

  /** ＋ CTO no mesmo poste: entra logo depois da HUB, no mesmo ponto, ligada por cabo curto (3 m, sem reserva) */
  function ctoNoMesmoPoste(i: number) {
    const hub = linhas[i];
    const p = posDe(hub);
    const nomeCto = nomeAuto("cto", linhas, nomesRede);
    const t = tipoLinkPoste();
    const nomeCabo = `${t ? t.nome : "Cabo"} · ${curtoNome(hub.nome)} → ${nomeCto} (mesmo poste)`;
    if (t) setTiposCabo((tc) => ({ ...tc, [chaveCabo(nomeCabo)]: t.id }));
    const nova: Linha = {
      ...linhaVazia("cto"),
      nome: nomeCto,
      codigo: proximoCodigo(linhas),
      coords: p ? fmtCoord({ lat: p.lat + 0.00001, lon: p.lon + 0.00001 }) : "",
      vertices: [],
      dist_auto: false,
      distancia_m: "3",
      mesmoPoste: true,
      cabo_entrada: nomeCabo,
      fibra_entrada: "1",
    };
    mudar((ls) => {
      const c = [...ls];
      c.splice(i + 1, 0, nova);
      return c;
    });
    setSel(i + 1);
    setAviso(`${nomeCto} criada no mesmo poste da ${curtoNome(hub.nome)}, ligada por ${nomeCabo.split(" · ")[0]} (3 m, sem reserva). Escolha o splitter dela.`);
  }

  /** ↩ Voltar para a HUB: a fibra de uma porta da CTO volta pelo mesmo cabo, em outra fibra, e atravessa a HUB */
  function voltarParaHub(i: number) {
    const h = hubAntes(i);
    if (h === null) return;
    const hub = linhas[h];
    const cto = linhas[i];
    const cabo = cto.cabo_entrada;
    const usadas = new Set(linhas.filter((l) => l.cabo_entrada && chaveCabo(l.cabo_entrada) === chaveCabo(cabo)).map((l) => n(l.fibra_entrada)));
    let f = 2;
    while (usadas.has(f)) f++;
    const volta: Linha = {
      ...hub,
      vertices: [],
      dist_auto: false,
      distancia_m: cto.distancia_m || "3",
      mesmoPoste: true,
      passagem: true,
      splitter: "",
      splitter_modelo: "",
      cabo_entrada: cabo,
      fibra_entrada: String(f),
      potencia_entrada: "",
      potencia_saida: "",
    };
    mudar((ls) => {
      const c = [...ls];
      c.splice(i + 1, 0, volta);
      return c;
    });
    setSel(i + 1);
    setAviso(`Transporte: a fibra F${f} volta da ${curtoNome(cto.nome)} para a ${curtoNome(hub.nome)} (passagem). Agora coloque as próximas caixas (ex.: a CT).`);
  }

  /** Cartão "Prédio" da CDOI: escolhe o prédio (ou cria um), o bloco e o andar */
  function campoPredio(i: number) {
    const l = linhas[i];
    const v = l.predio;
    if (!v) {
      return (
        <button
          type="button"
          onClick={() => { const pos = posDe(l); alterar(i, { predio: pos ? vinculoPerto(pos) : { id: "", nome: "", bloco: "Bloco A", andar: 0 } }); }}
          className="w-full rounded-lg border border-dashed border-sky-300 bg-sky-50 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100"
        >
          🏢 Colocar esta CDOI num prédio
        </button>
      );
    }
    const pos = posDe(l);
    const opcoes = pos ? prediosPerto(pos) : predios.map((pr) => ({ pr, d: Infinity }));
    const pr = predios.find((x) => x.id === v.id);
    const bloco = pr?.blocos.find((b) => b.id === v.bloco) ?? pr?.blocos[0];
    const andares = bloco ? andaresDoBloco(bloco) : Array.from({ length: 31 }, (_, k) => k);
    const set = (m: Partial<VinculoPredio>) => alterar(i, { predio: { ...v, ...m } });
    return (
      <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <IconeElemento tipo="predio" tamanho={18} /> Prédio
          <button type="button" onClick={() => alterar(i, { predio: undefined })} className="ml-auto font-normal text-slate-400 hover:text-red-600">tirar do prédio</button>
        </p>
        <select
          className={campo}
          value={v.id || "__novo"}
          onChange={(e) => {
            const id = e.target.value === "__novo" ? "" : e.target.value;
            const np = predios.find((x) => x.id === id);
            set({ id, nome: np?.nome ?? "", bloco: np?.blocos[0]?.id ?? "Bloco A", andar: 0 });
          }}
        >
          {opcoes.map(({ pr: x, d }) => (
            <option key={x.id} value={x.id}>{x.nome}{Number.isFinite(d) ? ` · ${Math.round(d)} m` : ""}</option>
          ))}
          <option value="__novo">+ Prédio novo…</option>
        </select>
        {!v.id && (
          <input className={`${campo} ${!v.nome.trim() ? "border-red-400" : ""}`} value={v.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome do prédio (ex.: Ed Majestoso)" />
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className={rot}>Bloco</label>
            {pr ? (
              <select className={campo} value={bloco?.id ?? ""} onChange={(e) => set({ bloco: e.target.value })}>
                {pr.blocos.map((b) => {
                  const cheio = pr.pontos.filter((o) => o.bloco === b.id).length >= 4;
                  return <option key={b.id} value={b.id} disabled={cheio}>{b.nome}{cheio ? " (4 CDOIs)" : ""}</option>;
                })}
              </select>
            ) : (
              <input className={campo} value={v.bloco} onChange={(e) => set({ bloco: e.target.value })} placeholder="Bloco A" />
            )}
          </div>
          <div>
            <label className={rot}>Andar da CDOI</label>
            <select className={campo} value={v.andar} onChange={(e) => set({ andar: +e.target.value })}>
              {andares.map((a) => <option key={a} value={a}>{rotuloAndarCurto(a)}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-slate-500">
          {pr ? "Ao salvar, a CDOI entra neste prédio." : "Ao salvar, o prédio é criado com esta CDOI (blocos e andares você ajusta na janela do prédio)."}
        </p>
      </div>
    );
  }

  /** Grava nos prédios as CDOIs colocadas com a ferramenta Prédio */
  async function gravarPredios(elementos: ElementoRota[]) {
    const atuais = await listarPredios(true);
    const novos = new Map<string, PredioRede>();
    for (let i = 0; i < linhas.length; i++) {
      const v = linhas[i].predio;
      if (!v || linhas[i].tipo !== "cdoi") continue;
      const el = elementos[i];
      const chaveCdoi = chaveElemento(el);
      if (v.id) {
        const pr = atuais.find((x) => x.id === v.id);
        if (!pr || pr.pontos.some((o) => o.chave === chaveCdoi)) continue;
        const b = pr.blocos.find((x) => x.id === v.bloco) ?? pr.blocos[0];
        const ponto = { id: novoId(), chave: chaveCdoi, nome: el.nome, bloco: b.id, andar: v.andar, atende_de: v.andar <= 0 ? Math.min(1, b.andares) : v.andar, atende_ate: v.andar <= 0 ? b.andares : v.andar };
        await salvarPredio({ ...pr, pontos: [...pr.pontos, ponto] }, usuario);
      } else {
        const k = v.nome.trim().toUpperCase();
        const pr = novos.get(k) ?? predioNovo(v.nome.trim(), chaveCdoi, el.nome);
        if (novos.has(k)) {
          pr.pontos.push({ ...pr.pontos[0], id: novoId(), chave: chaveCdoi, nome: el.nome, andar: v.andar });
        } else {
          pr.blocos[0].nome = v.bloco.trim() || "Bloco A";
          pr.pontos[0].andar = v.andar;
        }
        novos.set(k, pr);
      }
    }
    for (const pr of novos.values()) await salvarPredio(pr, usuario);
  }

  function clicarMapa(lat: number, lon: number) {
    setAviso(null);
    const p = { lat, lon };
    if (ferramenta === "poste") {
      if (!linhas.some((l) => posDe(l))) return setAviso("Coloque primeiro a OLT (ou o ponto de partida) no mapa.");
      setPendentes((ps) => [...ps, p]);
      return;
    }
    if (ferramenta === "selecionar") {
      if (sel !== null && !posDe(linhas[sel])) alterar(sel, { coords: fmtCoord(p) });
      return;
    }
    if ((ferramenta === "estacao" || ferramenta === "olt") && !olts.length) {
      return setAviso("Cadastre a OLT primeiro (Cadastros → OLTs). Só equipamentos cadastrados são aceitos.");
    }
    if (ferramenta === "estacao") {
      if (linhas.length) return setAviso("A estação é o começo da rota. Para mudar a OLT ou o DIO, use o cartão Estação ao lado.");
      montarEstacao(p);
      return;
    }
    const tipo: TipoElementoRota = ferramenta === "predio" ? "cdoi" : ferramenta;
    // Ferramenta Prédio: a CDOI entra no prédio mais perto (até 60 m) ou num prédio novo
    const extraPredio: Partial<Linha> = ferramenta === "predio" ? { predio: vinculoPerto(p) } : {};
    // Com um elemento do meio selecionado, o novo entra logo depois dele
    if (sel !== null && sel < linhas.length - 1 && tipo !== "olt") {
      const prox = linhas[sel + 1];
      const ref = linhas[sel];
      const nomeNovo = nomeAuto(tipo, linhas, nomesRede);
      const extra = tipo === "dio" && ref.tipo === "olt" ? dioDepoisDaOlt(ref, nomeNovo, prox) : {};
      mudar((ls) => {
        const c = [...ls];
        c.splice(sel + 1, 0, {
          ...linhaVazia(tipo),
          nome: nomeNovo,
          codigo: proximoCodigo(ls),
          coords: fmtCoord(p),
          vertices: pendentes,
          dist_auto: true,
          cabo_entrada: prox.cabo_entrada,
          fibra_entrada: prox.fibra_entrada,
          ...extra,
          ...extraPredio,
        });
        return c;
      });
      setPendentes([]);
      setSel(sel + 1);
      return;
    }
    // Colocar um elemento: entra no fim, ligado ao anterior pelo mesmo cabo/fibra, com os postes marcados
    const novoIndice = linhas.length;
    const ultimo = linhas[linhas.length - 1];
    const extraDio = tipo === "dio" && ultimo?.tipo === "olt" ? dioDepoisDaOlt(ultimo, nomeAuto("dio", linhas, nomesRede)) : {};
    const olt = tipo === "olt" && olts.length === 1 ? olts[0] : undefined;
    mudar((ls) => {
      const ant = ls[ls.length - 1];
      const nova: Linha = {
        ...linhaVazia(tipo),
        nome: olt?.nome ?? nomeAuto(tipo, ls, nomesRede),
        // OLT é a raiz e é reconhecida pelo nome; os demais ganham código único
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        coords: fmtCoord(p),
        vertices: ls.length ? pendentes : [],
        dist_auto: true,
        // Depois do DIO sai o cabo da estação: a fibra é a porta do DIO
        cabo_entrada: herdaCabo(ant) ? ant.cabo_entrada : "",
        fibra_entrada: ant?.tipo === "dio" ? ant.porta.match(/Porta\s*0*(\d+)/i)?.[1] ?? "" : herdaCabo(ant) ? ant.fibra_entrada : "",
        equipamento_id: olt?.id ?? "",
        potencia_saida: olt?.potencia_tx !== undefined ? s(olt.potencia_tx) : "",
        ...extraDio,
        ...extraPredio,
      };
      return [...ls, nova];
    });
    setPendentes([]);
    setSel(novoIndice);
    // Depois da OLT, o normal é seguir com caixas de emenda
    // Depois da OLT normalmente vem o DIO; depois do DIO, a caixa de emenda
    if (tipo === "olt") setFerramenta("dio");
    else if (tipo === "dio") setFerramenta("ceo");
  }

  /**
   * DIO colocado logo depois da OLT: chega por um cordão (3 m, fibra 1); a porta do DIO é a fibra do cabo
   * que já sai para fora (porta N = fibra N) e o DIO sugerido é o do mesmo tamanho desse cabo.
   */
  function dioDepoisDaOlt(olt: Linha, nomeDio: string, saida?: Linha): Partial<Linha> {
    const cordao = tiposDeCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
    const fibra = saida ? n(saida.fibra_entrada) : undefined;
    const cap = saida ? tipoDoCabo(saida.cabo_entrada)?.capacidade : undefined;
    const dio =
      (cap ? dios.find((d) => d.portas === cap) : undefined) ??
      [...dios].filter((d) => (d.portas ?? 0) >= (fibra ?? 1)).sort((a, b) => (a.portas ?? 0) - (b.portas ?? 0))[0] ??
      (dios.length === 1 ? dios[0] : undefined);
    const nomeCordao = `Cordão ${olt.nome.split(" / ")[0]} → ${dio?.nome ?? nomeDio}`;
    if (cordao) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: cordao.id }));
    return {
      nome: dio?.nome ?? nomeDio,
      cabo_entrada: nomeCordao,
      fibra_entrada: "1",
      distancia_m: "3",
      dist_auto: false,
      vertices: [],
      equipamento_id: dio?.id ?? "",
      porta: fibra ? `Porta ${pad2(fibra)}` : "",
    };
  }

  /** Cria OLT + DIO no mesmo local, ligados por um cordão */
  function montarEstacao(p: Ponto) {
    const olt = olts.length === 1 ? olts[0] : undefined;
    const dio = dios.length === 1 ? dios[0] : undefined;
    const cordao = tiposDeCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
    const nomeOlt = olt?.nome ?? "OLT";
    const nomeDio = dio?.nome ?? "DIO 1";
    const nomeCordao = `Cordão ${nomeOlt} → ${nomeDio}`;
    if (cordao) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: cordao.id }));
    mudar(() => [
      {
        ...linhaVazia("olt"),
        nome: nomeOlt,
        coords: fmtCoord(p),
        equipamento_id: olt?.id ?? "",
        potencia_saida: olt?.potencia_tx !== undefined ? s(olt.potencia_tx) : "",
      },
      {
        ...linhaVazia("dio"),
        nome: nomeDio,
        codigo: proximoCodigo([]),
        coords: fmtCoord(p),
        equipamento_id: dio?.id ?? "",
        cabo_entrada: nomeCordao,
        fibra_entrada: "1",
        distancia_m: "3",
        dist_auto: false,
      },
    ]);
    setSel(null);
    setFerramenta("ceo");
    setAviso("Estação criada! Escolha a porta PON e a porta do DIO no cartão ao lado e clique onde fica a primeira caixa fora da estação.");
  }

  /** Mudanças vindas do cartão Estação (elementos 1 = OLT, 2 = DIO e 3 = primeira caixa fora) */
  function aplicarEstacao(p: Partial<DadosEstacao>) {
    // Tipo do cabo de saída: mesma regra do painel do elemento (cabo compartilhado com outro trecho vira cabo novo)
    const tSaida = p.saidaTipo ? tiposDeCabo.find((t) => t.id === p.saidaTipo) : undefined;
    if (tSaida && linhas[2] && Object.keys(p).length === 1) return usarTipoCabo(2, tSaida);
    const l1 = linhas[1];
    const l2 = linhas[2];
    const nomeCordao = l1?.cabo_entrada.trim() || `Cordão ${p.oltNome ?? linhas[0]?.nome ?? "OLT"} → ${p.dioNome ?? l1?.nome ?? "DIO"}`;
    const nomeSaida = p.saidaCabo ?? (l2?.cabo_entrada.trim() || `Saída ${p.dioNome ?? l1?.nome ?? "DIO"}`);
    if (p.cordaoTipo !== undefined) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: p.cordaoTipo! }));
    if (p.saidaTipo !== undefined && l2) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeSaida)]: p.saidaTipo! }));
    // OLT ou DIO trocados: o nome automático do cordão e do cabo de saída acompanha
    const renomearDepois: [string, string][] = [];
    if (p.oltNome !== undefined && linhas[0] && p.oltNome !== linhas[0].nome) renomearDepois.push([linhas[0].nome, p.oltNome]);
    if (p.dioNome !== undefined && l1 && p.dioNome !== l1.nome) renomearDepois.push([l1.nome, p.dioNome]);
    mudar((ls) => {
      const c = ls.map((x) => ({ ...x }));
      if (!c[0] || !c[1]) return ls;
      if (p.oltNome !== undefined) c[0].nome = p.oltNome;
      if (p.oltEquip !== undefined) c[0].equipamento_id = p.oltEquip;
      if (p.oltPorta !== undefined) c[0].porta = p.oltPorta;
      if (p.oltPot !== undefined) c[0].potencia_saida = p.oltPot;
      if (p.dioNome !== undefined) c[1].nome = p.dioNome;
      if (p.dioEquip !== undefined) c[1].equipamento_id = p.dioEquip;
      if (p.dioPorta !== undefined) c[1].porta = p.dioPorta;
      if (p.cordaoMetros !== undefined) { c[1].distancia_m = p.cordaoMetros; c[1].dist_auto = false; }
      if (p.cordaoTipo !== undefined) { c[1].cabo_entrada = nomeCordao; c[1].fibra_entrada = "1"; }
      if (c[2]) {
        if (p.saidaCabo !== undefined) c[2].cabo_entrada = p.saidaCabo;
        if (p.saidaTipo !== undefined) c[2].cabo_entrada = nomeSaida;
        if (p.saidaFibra !== undefined) c[2].fibra_entrada = p.saidaFibra;
      }
      return c;
    });
    renomearDepois.forEach(([a0, b0]) => renomearCabos(a0, b0));
  }

  /** Clique numa caixa da rede existente */
  function usarDaRede(k: number, predioNome?: string) {
    const it = redeInfo.itens[k];
    if (!it) return;
    // Rota vazia e clique num prédio: copia o caminho até a caixa de onde o cabo sai (ex.: a HUB) e já fica com a ferramenta Prédio
    if (predioNome && !linhas.length && it.i > 0) {
      const r = it.rota;
      const manual = r.origem !== "geogrid";
      const novas = r.elementos.slice(0, it.i).map((x, j) => ({
        ...paraLinha(x, manual ? r.trechos.find((t) => t.ate === j)?.pontos.slice(1, -1) ?? [] : []),
        dist_auto: false,
      }));
      mudar(() => novas);
      if (r.calculo_potencia) setCalc(r.calculo_potencia);
      setSel(it.i - 1);
      setFerramenta("predio");
      setAviso(`Começando pelo caminho até ${r.elementos[it.i - 1].nome}. Agora clique no prédio ${predioNome} para colocar a nova CDOI.`);
      return;
    }
    const e = it.el;
    const ja = linhas.findIndex((l) => chaveLinha(l) === chaveElemento(e));
    if (ja >= 0) { setSel(ja); return; }
    if (ferramenta === "poste") { clicarMapa(e.lat!, e.lon!); return; }
    if (!linhas.length) {
      // Rota vazia: começa copiando o caminho da rota existente da OLT até esta caixa (vira um ramo na árvore)
      const r = it.rota;
      const manual = r.origem !== "geogrid";
      const novas = r.elementos.slice(0, it.i + 1).map((x, j) => ({
        ...paraLinha(x, manual ? r.trechos.find((t) => t.ate === j)?.pontos.slice(1, -1) ?? [] : []),
        dist_auto: false,
      }));
      mudar(() => novas);
      if (r.calculo_potencia) setCalc(r.calculo_potencia);
      setSel(it.i);
      setFerramenta("ceo");
      setAviso(`Começando pelo caminho da rota "${r.nome}" até ${e.nome} (${it.i + 1} elementos). Agora coloque as próximas caixas.`);
      return;
    }
    // Rota em andamento: usa a caixa existente (mesmo nome/código/local/splitter), ligada pelo mesmo cabo do trecho anterior
    const ant = linhas[linhas.length - 1];
    const base: ElementoRota = { ...e, cabo_entrada: undefined, fibra_entrada: undefined, cabo_saida: undefined, fibra_saida: undefined, distancia_m: undefined, potencia_entrada: undefined, potencia_saida: undefined };
    const novoIndice = linhas.length;
    mudar((ls) => [...ls, { ...paraLinha(base), vertices: pendentes, dist_auto: true, cabo_entrada: herdaCabo(ant) ? ant.cabo_entrada : "", fibra_entrada: herdaCabo(ant) ? ant.fibra_entrada : "" }]);
    setPendentes([]);
    setSel(novoIndice);
  }

  /**
   * Cabos que já saem da caixa anterior (nas outras rotas salvas), com as fibras em uso.
   * Ex.: da HUB já sai "06 FO ASO · HUB → CDOI Ed Majestoso" com a F1: a próxima CDOI pode seguir nele na F2.
   */
  function cabosSaindoDe(i: number) {
    const ant = linhas[i - 1];
    if (!ant || i < 1) return [];
    const k = chaveLinha(ant);
    const mapa = new Map<string, { nome: string; usadas: Set<number> }>();
    for (const r of rede) {
      r.elementos.forEach((e, j) => {
        if (chaveElemento(e) !== k) return;
        const prox = r.elementos[j + 1];
        if (!prox?.cabo_entrada?.trim()) return;
        const kc = chaveCabo(prox.cabo_entrada);
        const m = mapa.get(kc) ?? { nome: prox.cabo_entrada.trim(), usadas: new Set<number>() };
        if (prox.fibra_entrada) m.usadas.add(prox.fibra_entrada);
        mapa.set(kc, m);
      });
    }
    return [...mapa.entries()].map(([chave, m]) => {
      const cap = tipoDoCabo(m.nome)?.capacidade ?? 12;
      let livre: number | undefined;
      for (let f = 1; f <= cap; f++) if (!m.usadas.has(f)) { livre = f; break; }
      return { chave, nome: m.nome, usadas: [...m.usadas].sort((a, b) => a - b), livre, cap };
    });
  }

  /** Segue num cabo que já sai da caixa anterior, na próxima fibra livre */
  function continuarCabo(i: number, nome: string, fibra?: number) {
    alterar(i, { cabo_entrada: nome, fibra_entrada: fibra ? String(fibra) : "" });
  }

  /** Escolhe um tipo de cabo do cadastro para o trecho que chega em i */
  function usarTipoCabo(i: number, t: ItemCatalogo) {
    const l = linhas[i];
    const ant = linhas[i - 1];
    const atual = l.cabo_entrada.trim();
    const kAtual = atual ? chaveCabo(atual) : "";
    // O tipo vale pelo nome do cabo. Se outro trecho usa esse mesmo nome com outro tipo (ex.: o 72 que chega no HUB),
    // trocar aqui mudaria os dois: então este trecho vira um cabo novo, com nome próprio.
    const compartilhado = !!kAtual && linhas.some((x, j) => j !== i && j > 0 && x.cabo_entrada.trim() && chaveCabo(x.cabo_entrada) === kAtual);
    const trocouTipo = tiposCabo[kAtual] !== t.id;
    const separar = compartilhado && trocouTipo;
    // nome criado pelo editor ("72 FO ASO · DIO → CEO 1"): ao trocar o tipo, o nome acompanha
    const nomeAutomatico = tiposDeCabo.some((c) => atual.startsWith(`${c.nome} · `));
    const nomeCabo =
      atual && !separar && !(nomeAutomatico && (trocouTipo || !atual.startsWith(`${t.nome} · `))) ? atual : `${t.nome} · ${curtoNome(ant?.nome ?? "")} → ${curtoNome(l.nome)}`;
    setTiposCabo((tc) => ({ ...tc, [chaveCabo(nomeCabo)]: t.id }));
    const fibraOk = (f: string) => {
      const v = n(f);
      return t.capacidade === 1 || !v || (t.capacidade && v > t.capacidade) ? "1" : f;
    };
    mudar((ls) =>
      ls.map((x, j) => {
        if (j === i) return { ...x, cabo_entrada: nomeCabo, fibra_entrada: fibraOk(x.fibra_entrada) };
        // os trechos seguintes que continuam no mesmo cabo (passando por CEO/CT, sem splitter no meio) seguem junto
        if (
          nomeCabo !== atual &&
          j > i &&
          ls.slice(i + 1, j + 1).every((y) => chaveCabo(y.cabo_entrada) === kAtual) &&
          ls.slice(i, j).every((y) => herdaCabo(y))
        ) {
          return { ...x, cabo_entrada: nomeCabo, fibra_entrada: fibraOk(x.fibra_entrada) };
        }
        return x;
      }),
    );
  }

  /** Distância (graus², plano local) do ponto ao segmento a–b, para achar o trecho clicado */
  function dist2(a: Ponto, b: Ponto, p: Ponto) {
    const k = Math.cos((p.lat * Math.PI) / 180);
    const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
  }

  /** Insere um elemento (tipo da ferramenta) no meio do trecho que chega em i, no ponto clicado */
  function inserirElemento(iHint: number, lat: number, lon: number, tipoForcado?: TipoElementoRota) {
    if (ferramenta === "estacao") return clicarMapa(lat, lon);
    const tipo = tipoForcado ?? tipoDaFerramenta(ferramenta) ?? "ceo";
    const p = { lat, lon };
    let i = iHint;
    if (i < 1) {
      // Descobre o trecho mais perto do ponto (rotas do GeoGrid: linha entre as caixas)
      let melhor = Infinity;
      for (let k = 1; k < linhas.length; k++) {
        const a = posDe(linhas[k - 1]);
        const b = posDe(linhas[k]);
        if (!a || !b) continue;
        const pts = [a, ...linhas[k].vertices, b];
        for (let j = 0; j < pts.length - 1; j++) {
          const d = dist2(pts[j], pts[j + 1], p);
          if (d < melhor) { melhor = d; i = k; }
        }
      }
    }
    if (i < 1) return clicarMapa(lat, lon);
    const cur = linhas[i];
    const a = posDe(linhas[i - 1]);
    const b = posDe(cur);
    const pts = a && b ? [a, ...cur.vertices, b] : [];
    const j = pts.length ? segmentoMaisPerto(pts, p) : 0;
    const antes = cur.vertices.slice(0, j);
    const depois = cur.vertices.slice(j);
    // Distância digitada (ex.: GeoGrid com reserva): divide na proporção do mapa
    let distNovo = "";
    let distCur = cur.distancia_m;
    const autoDist = cur.dist_auto || !n(cur.distancia_m);
    if (!autoDist && a && b) {
      const dA = comprimentoTracado([a, ...antes, p]);
      const dB = comprimentoTracado([p, ...depois, b]);
      const total = n(cur.distancia_m)!;
      const parte = Math.round((total * dA) / (dA + dB || 1));
      distNovo = String(parte);
      distCur = String(Math.max(0, Math.round(total - parte)));
    }
    mudar((ls) => {
      const c = [...ls];
      const nova: Linha = {
        ...linhaVazia(tipo),
        nome: nomeAuto(tipo, ls, nomesRede),
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        coords: fmtCoord(p),
        vertices: antes,
        dist_auto: autoDist,
        distancia_m: distNovo,
        // O mesmo cabo/fibra passa pela caixa nova
        cabo_entrada: cur.cabo_entrada,
        fibra_entrada: cur.fibra_entrada,
      };
      c[i] = { ...cur, vertices: depois, dist_auto: autoDist, distancia_m: autoDist ? cur.distancia_m : distCur };
      c.splice(i, 0, nova);
      return c;
    });
    setSel(i);
    setAviso(null);
  }

  /** Insere um elemento sem local antes de i (pela lista); o próximo clique no mapa posiciona */
  function inserirNaLista(i: number) {
    const tipo: TipoElementoRota = tipoDaFerramenta(ferramenta) ?? "ceo";
    const cur = linhas[i];
    mudar((ls) => {
      const c = [...ls];
      c.splice(i, 0, {
        ...linhaVazia(tipo),
        nome: nomeAuto(tipo, ls, nomesRede),
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        dist_auto: true,
        cabo_entrada: cur?.cabo_entrada ?? "",
        fibra_entrada: cur?.fibra_entrada ?? "",
      });
      // O trecho seguinte agora sai da caixa nova: os postes antigos ficam com ele
      return c;
    });
    setSel(i);
    setFerramenta("selecionar");
    setAviso(`Clique no mapa onde fica o novo ${PREFIXO[tipo]} (entre ${linhas[i - 1]?.nome ?? "o início"} e ${cur?.nome ?? "o fim"}).`);
  }

  function inserirCurva(i: number, lat: number, lon: number) {
    const a = posDe(linhas[i - 1]);
    const b = posDe(linhas[i]);
    if (!a || !b) return;
    const pts = [a, ...linhas[i].vertices, b];
    const j = segmentoMaisPerto(pts, { lat, lon });
    const v = [...linhas[i].vertices];
    v.splice(j, 0, { lat, lon });
    alterar(i, { vertices: v });
    setSel(i);
  }

  // Só equipamentos do cadastro: o que faltar vira pendência e impede salvar
  const pendencias: { i: number; msg: string }[] = [];
  if (linhas.length && linhas[0].tipo !== "olt") pendencias.push({ i: 0, msg: "A rota precisa começar numa OLT" });
  linhas.forEach((l, i) => {
    const nome = l.nome || `elemento ${i + 1}`;
    if (l.tipo === "olt" && !olts.some((o) => o.id === l.equipamento_id)) pendencias.push({ i, msg: `${nome}: escolha a OLT do cadastro` });
    if (l.tipo === "olt" && i === 0 && !lerPortaOlt(l.porta)) pendencias.push({ i, msg: `${nome}: escolha a placa e a porta PON` });
    if (l.tipo === "dio" && !dios.some((d) => d.id === l.equipamento_id)) pendencias.push({ i, msg: `${nome}: escolha o DIO do cadastro` });
    if (l.tipo === "hub" && !l.passagem && !l.splitter) pendencias.push({ i, msg: `${nome}: escolha o splitter primário da HUB (ou marque "Só passa")` });
    if (l.tipo === "cto" && !l.passagem && !l.splitter) pendencias.push({ i, msg: `${nome}: escolha o splitter da CTO (ou marque "Só passa")` });
    if (l.predio && !l.predio.id && !l.predio.nome.trim()) pendencias.push({ i, msg: `${nome}: dê o nome do prédio` });
    if (i > 0) {
      if (!l.cabo_entrada.trim()) pendencias.push({ i, msg: `${nome}: informe o cabo que chega` });
      else if (!tipoDoCabo(l.cabo_entrada)) pendencias.push({ i, msg: `${nome}: o cabo "${l.cabo_entrada}" precisa de um tipo do cadastro` });
      if (!n(l.fibra_entrada)) pendencias.push({ i, msg: `${nome}: escolha a fibra` });
    }
    if (l.splitter && !modelosSplitter.some((m) => m.id === l.splitter_modelo)) pendencias.push({ i, msg: `${nome}: splitter ${l.splitter} não é do cadastro` });
  });
  const pendentesDe = new Set(pendencias.map((p) => p.i));

  const temEstacao = linhas[0]?.tipo === "olt" && linhas[1]?.tipo === "dio";
  const estacao: DadosEstacao | null = temEstacao
    ? {
        oltNome: linhas[0].nome,
        oltEquip: linhas[0].equipamento_id,
        oltPorta: linhas[0].porta,
        oltPot: linhas[0].potencia_saida,
        dioNome: linhas[1].nome,
        dioEquip: linhas[1].equipamento_id,
        dioPorta: linhas[1].porta,
        cordaoNome: linhas[1].cabo_entrada,
        cordaoTipo: linhas[1].cabo_entrada.trim() ? tiposCabo[chaveCabo(linhas[1].cabo_entrada)] ?? "" : "",
        cordaoMetros: linhas[1].distancia_m,
        saidaCabo: linhas[2]?.cabo_entrada,
        saidaTipo: linhas[2]?.cabo_entrada.trim() ? tiposCabo[chaveCabo(linhas[2].cabo_entrada)] ?? "" : linhas[2] ? "" : undefined,
        saidaFibra: linhas[2]?.fibra_entrada,
        destino: linhas[2] ? linhas[2].nome : undefined,
      }
    : null;

  /** Metragem desde a OLT em cada elemento (soma dos trechos, já com as reservas) — é a que o OTDR mostra */
  const acumulado = linhas.reduce<number[]>((acc, l, i) => [...acc, (acc[i - 1] ?? 0) + (i > 0 ? n(l.distancia_m) ?? 0 : 0)], []);

  const pontosMapa: PontoEditor[] = linhas.map((l) => {
    const p = posDe(l);
    const emPredio = l.tipo === "cdoi" && (!!l.predio || predioDaChave.has(chaveLinha(l)));
    const f = n(l.fibra_entrada);
    const info = f ? infoFibra(l.cabo_entrada, l.fibra_entrada) : null;
    const d = n(l.distancia_m);
    return {
      nome: emPredio ? `${l.nome} · ${l.predio?.nome || predioDaChave.get(chaveLinha(l))?.nome || "prédio"}` : l.nome,
      tipo: emPredio ? "predio" : l.tipo,
      lat: p?.lat,
      lon: p?.lon,
      vertices: l.vertices,
      cor: info?.c.hex,
      rotulo: `${l.cabo_entrada.split(" - ")[0] || "cabo ?"}${info ? ` · ${info.c.rotulo}` : ""}${d !== undefined ? ` · ${formatMetros(d)}` : ""}`,
    };
  });

  // ---------- Potência ----------
  const tx = linhas[0] ? n(linhas[0].potencia_saida) ?? n(linhas[0].potencia_entrada) : undefined;
  const pots =
    calc.auto && tx !== undefined
      ? calcularPotencias(
          linhas.map((l) => ({
            tipo: l.tipo,
            distancia_m: n(l.distancia_m),
            splitter: l.splitter || undefined,
            perda_splitter: modelosSplitter.find((m) => m.id === l.splitter_modelo)?.perda_db,
          })),
          tx,
          calc
        )
      : null;
  const potDe = (i: number) => (pots ? pots[i]?.saida : n(linhas[i].potencia_saida) ?? n(linhas[i].potencia_entrada));
  const potFinal = linhas.length ? potDe(linhas.length - 1) : undefined;
  const totalDist = linhas.reduce((t, l) => t + (n(l.distancia_m) ?? 0), 0);

  // ---------- Cadastro ----------
  function tipoDoCabo(nomeCabo: string): ItemCatalogo | undefined {
    const id = nomeCabo.trim() ? tiposCabo[chaveCabo(nomeCabo)] : undefined;
    return id ? tiposDeCabo.find((t) => t.id === id) : undefined;
  }

  function infoFibra(nomeCabo: string, fibraTxt: string) {
    const f = n(fibraTxt);
    if (!f) return null;
    const t = tipoDoCabo(nomeCabo);
    const cap = t?.capacidade ?? capacidadeDoCabo(nomeCabo || undefined, f);
    return { c: corFibraPorCapacidade(f, Math.max(cap, f), t?.fibras_por_tubo), excede: !!t?.capacidade && f > t.capacidade };
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome para a rota (campo no topo).");
    if (linhas.length < 2) return setErro("A rota precisa de pelo menos 2 elementos: a OLT e o ponto final.");
    if (pendencias.length) {
      setVerPendencias(true);
      setSel(pendencias[0].i);
      return setErro(`Há ${pendencias.length} pendência${pendencias.length > 1 ? "s" : ""}: só são aceitos equipamentos e cabos do cadastro.`);
    }
    const elementos: ElementoRota[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l.nome.trim()) {
        setSel(i);
        return setErro(`Elemento ${i + 1} está sem nome.`);
      }
      const c = parseCoords(l.coords);
      if (c.erro) { setSel(i); return setErro(`Elemento ${i + 1}: coordenadas inválidas. Use "-28.6917, -49.3423".`); }
      if (infoFibra(l.cabo_entrada, l.fibra_entrada)?.excede) {
        setSel(i);
        return setErro(`Elemento ${i + 1}: a fibra ${l.fibra_entrada} não existe no cabo "${l.cabo_entrada}".`);
      }
      // Saída de um elemento = chegada do próximo (quando informada)
      const prox = linhas[i + 1];
      const caboSaida = prox?.cabo_entrada.trim() || l.cabo_saida.trim();
      const fibraSaida = prox && n(prox.fibra_entrada) !== undefined ? n(prox.fibra_entrada) : n(l.fibra_saida);
      elementos.push({
        nome: l.nome.trim(),
        tipo: l.tipo,
        codigo: l.codigo.trim() || undefined,
        cabo_entrada: i > 0 ? l.cabo_entrada.trim() || undefined : undefined,
        fibra_entrada: i > 0 ? n(l.fibra_entrada) : undefined,
        cabo_saida: prox ? caboSaida || undefined : undefined,
        fibra_saida: prox ? fibraSaida : undefined,
        distancia_m: i > 0 ? n(l.distancia_m) : undefined,
        potencia_entrada: pots ? pots[i].entrada : n(l.potencia_entrada),
        potencia_saida: pots ? pots[i].saida : n(l.potencia_saida),
        splitter: l.splitter.trim() || undefined,
        splitter_modelo: l.splitter ? l.splitter_modelo || undefined : undefined,
        passagem: (l.tipo === "hub" || l.tipo === "cto") && l.passagem ? true : undefined,
        mesmo_poste: i > 0 && l.mesmoPoste ? true : undefined,
        equipamento_id: l.tipo === "olt" || l.tipo === "dio" ? l.equipamento_id || undefined : undefined,
        porta: l.porta.trim() || undefined,
        lat: c.lat,
        lon: c.lon,
        obs: l.obs.trim() || undefined,
      });
    }

    // Traçado: rotas do GeoGrid mantêm o do KML; manuais usam o desenhado no mapa
    const trechos: TrechoCabo[] = linhas.flatMap((l, i) => {
      const a = i > 0 ? posDe(linhas[i - 1]) : null;
      const b = posDe(l);
      const cor = infoFibra(l.cabo_entrada, l.fibra_entrada)?.c.hex;
      return a && b ? [{ nome: l.cabo_entrada.trim() || `Trecho ${i}`, pontos: [a, ...l.vertices, b], ate: i, ...(cor ? { cor } : {}) }] : [];
    });

    setSalvando(true);
    try {
      // Tipo de cabo escolhido aqui vai para o cadastro do cabo (vale para todas as rotas)
      const nomesUsados = new Map<string, string>();
      linhas.forEach((l) => l.cabo_entrada.trim() && nomesUsados.set(chaveCabo(l.cabo_entrada), l.cabo_entrada.trim()));
      for (const [chave, nomeCabo] of nomesUsados) {
        const novo = tiposCabo[chave] ?? "";
        const atual = cabos.find((c) => c.chave === chave);
        if (novo === (atual?.tipo_id ?? "")) continue;
        const t = tiposDeCabo.find((x) => x.id === novo);
        const salvo = await salvarCabo({
          chave,
          nome: atual?.nome ?? nomeCabo,
          capacidade: t?.capacidade ?? atual?.capacidade,
          tipo_id: novo || undefined,
          fibras: atual?.fibras ?? [],
          obs: atual?.obs,
          atualizado_por: usuario,
        });
        onCaboSalvo(salvo);
      }
      if (linhas.some((l) => l.predio)) await gravarPredios(elementos);
      await onSalvar({
        nome: nome.trim(),
        origem: inicial?.origem ?? "manual",
        elementos,
        trechos,
        calculo_potencia: calc,
        obs: obs.trim() || undefined,
        criado_por: inicial?.criado_por ?? usuario,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // ---------- Campos do painel ----------
  const campo = "w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";
  const rot = "block text-[11px] font-medium text-slate-500 mb-0.5";

  function campoFibra(i: number) {
    const l = linhas[i];
    const t = tipoDoCabo(l.cabo_entrada);
    const info = infoFibra(l.cabo_entrada, l.fibra_entrada);
    // fibras deste cabo já usadas nas outras rotas (e para onde vão)
    const kc = l.cabo_entrada.trim() ? chaveCabo(l.cabo_entrada) : "";
    const emUso = new Map<number, string>();
    if (kc) {
      for (const r of rede) {
        r.elementos.forEach((e) => {
          if (e.fibra_entrada && e.cabo_entrada && chaveCabo(e.cabo_entrada) === kc && !emUso.has(e.fibra_entrada)) emUso.set(e.fibra_entrada, e.nome);
        });
      }
    }
    return (
      <div>
        <label className={rot}>Fibra</label>
        <div className="relative">
          {info && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-slate-800 pointer-events-none" style={{ background: info.c.hex }} />
          )}
          <select className={`${campo} ${info ? "pl-7" : ""} ${info?.excede ? "border-red-400" : ""}`} value={l.fibra_entrada} onChange={(e) => alterar(i, { fibra_entrada: e.target.value })}>
            <option value="">—</option>
            {Array.from({ length: Math.max(t?.capacidade ?? 144, n(l.fibra_entrada) ?? 0) }, (_, k) => k + 1).map((f) => {
              const uso = emUso.get(f);
              const sufixo = uso ? ` · em uso → ${uso.split(" - ")[0].split(" / ")[0].slice(0, 22)}` : "";
              if (!t?.capacidade) return <option key={f} value={String(f)}>F{pad2(f)} {corFibraPorCapacidade(f, 12).nome.toLowerCase()}{sufixo}</option>;
              const c = corFibraPorCapacidade(f, t.capacidade, t.fibras_por_tubo ?? fibrasPorTubo(t.capacidade));
              return <option key={f} value={String(f)}>F{pad2(f)} {c.nome.toLowerCase()} · T{c.tubo}{f > t.capacidade ? " ⚠" : ""}{sufixo}</option>;
            })}
          </select>
        </div>
      </div>
    );
  }

  function camposEquipamento(i: number) {
    const l = linhas[i];
    const lista = l.tipo === "olt" ? olts : l.tipo === "dio" ? dios : [];
    if (l.tipo !== "olt" && l.tipo !== "dio") return null;
    if (!lista.length) {
      return (
        <p className="col-span-2 text-[11px] text-red-600">
          Nenhuma {l.tipo === "olt" ? "OLT" : "DIO"} cadastrada. Cadastre em Cadastros → {l.tipo === "olt" ? "OLTs" : "DIOs"}.
        </p>
      );
    }
    const eq = lista.find((x) => x.id === l.equipamento_id);
    if (l.tipo === "olt") {
      const lida = lerPortaOlt(l.porta);
      const num = numeracaoOlt(eq);
      const setPorta = (pl: number, po: number) => alterar(i, { porta: textoPortaOlt(pl, po) });
      return (
        <>
          <div className="col-span-2">
            <label className={rot}>OLT do cadastro</label>
            <select
              className={campo}
              value={l.equipamento_id}
              onChange={(e) => {
                const x = lista.find((o) => o.id === e.target.value);
                alterar(i, {
                  equipamento_id: e.target.value,
                  nome: x && (!l.nome.trim() || /^OLT( \d+)?$/.test(l.nome)) ? x.nome : l.nome,
                  potencia_saida: x?.potencia_tx !== undefined ? s(x.potencia_tx) : l.potencia_saida,
                });
              }}
            >
              <option value="">— escolha a OLT —</option>
              {lista.map((o) => <option key={o.id} value={o.id}>{o.nome} · {resumoItem(o)}</option>)}
            </select>
          </div>
          {num.placas.length && num.portas.length ? (
            <>
              <div>
                <label className={rot}>Placa PON</label>
                <select className={campo} value={lida ? lida.placa : ""} onChange={(e) => setPorta(+e.target.value, lida?.porta ?? num.portas[0])}>
                  <option value="">—</option>
                  {num.placas.map((v) => <option key={v} value={v}>PL {pad2(v)}</option>)}
                </select>
              </div>
              <div>
                <label className={rot}>Porta PON</label>
                <select className={campo} value={lida ? lida.porta : ""} onChange={(e) => setPorta(lida?.placa ?? num.placas[0], +e.target.value)}>
                  <option value="">—</option>
                  {num.portas.map((v) => <option key={v} value={v}>Porta {pad2(v)}</option>)}
                </select>
              </div>
            </>
          ) : null}
        </>
      );
    }
    const m = l.porta.match(/Porta\s*0*(\d+)/i);
    return (
      <>
        <div className="col-span-2">
          <label className={rot}>DIO do cadastro</label>
          <select className={campo} value={l.equipamento_id} onChange={(e) => alterar(i, { equipamento_id: e.target.value })}>
            <option value="">— escolha o DIO —</option>
            {lista.map((o) => <option key={o.id} value={o.id}>{o.nome} · {resumoItem(o)}</option>)}
          </select>
        </div>
        {eq?.portas ? (
          <div>
            <label className={rot}>Porta do DIO</label>
            <select className={campo} value={m ? +m[1] : ""} onChange={(e) => alterar(i, { porta: e.target.value ? `Porta ${pad2(+e.target.value)}` : "" })}>
              <option value="">—</option>
              {Array.from({ length: eq.portas }, (_, k) => k + 1).map((v) => <option key={v} value={v}>Porta {pad2(v)}</option>)}
            </select>
          </div>
        ) : null}
      </>
    );
  }

  function campoSplitter(i: number) {
    const l = linhas[i];
    const valor = l.splitter_modelo && modelosSplitter.some((m) => m.id === l.splitter_modelo) ? `m:${l.splitter_modelo}` : l.splitter;
    const naoCadastrado = !!l.splitter && !valor.startsWith("m:");
    // HUB/CTO: nesta rota usa o splitter (obrigatório) ou só passa (a fibra atravessa a caixa)
    const ehHub = l.tipo === "hub" || l.tipo === "cto";
    const exige = ehHub && !l.passagem;
    const opcoes = l.tipo === "hub"
      ? ([[false, "Usa o splitter desta porta"], [true, "Só passa (HUB de outra porta)"]] as const)
      : ([[false, "Atende aqui (usa o splitter)"], [true, "Só passa (segue para frente)"]] as const);
    const escolhaHub = ehHub && (
      <div className="col-span-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {opcoes.map(([v, r0]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => alterar(i, v ? { passagem: true, splitter: "", splitter_modelo: "" } : { passagem: false })}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${l.passagem === v ? "bg-white text-indigo-700 shadow" : "text-slate-500"}`}
          >
            {r0}
          </button>
        ))}
      </div>
    );
    if (ehHub && l.passagem) {
      return (
        <>
          {escolhaHub}
          <p className="col-span-2 text-[10px] text-slate-500">Nesta rota a fibra só atravessa a {l.tipo === "hub" ? "HUB" : "CTO"}, sem dividir. O cabo e a fibra seguem como numa CEO.</p>
        </>
      );
    }
    return (
      <>
      {escolhaHub}
      <div>
        <label className={rot}>{exige && l.tipo === "hub" ? "Splitter primário" : "Splitter"}</label>
        <select
          className={campo}
          value={valor}
          onChange={(e) => {
            const v = e.target.value;
            const m = v.startsWith("m:") ? modelosSplitter.find((x) => x.id === v.slice(2)) : undefined;
            alterar(i, { splitter: m ? m.relacao ?? "" : v, splitter_modelo: m?.id ?? "" });
          }}
        >
          {exige ? <option value="" disabled>{l.tipo === "hub" ? "Escolha o splitter primário…" : "Escolha o splitter…"}</option> : <option value="">Sem splitter</option>}
          {modelosSplitter.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nome} · {resumoItem(m)}</option>)}
          {naoCadastrado && <option value={l.splitter}>{l.splitter} (não cadastrado)</option>}
        </select>
        {naoCadastrado && <p className="text-[10px] text-red-600 mt-0.5">Troque por um splitter do cadastro.</p>}
        {exige && !l.splitter && <p className="text-[10px] text-red-600 mt-0.5">{l.tipo === "hub" ? "Escolha o splitter primário (ou marque Só passa)." : "Escolha o splitter da CTO (ou marque Só passa)."}</p>}
        {!modelosSplitter.length && <p className="text-[10px] text-slate-500 mt-0.5">Nenhum splitter cadastrado (Cadastros → Splitters).</p>}
      </div>
      </>
    );
  }

  /** Painel do elemento selecionado (abre dentro da lista) */
  function painel(i: number) {
    const l = linhas[i];
    const dm = distMapa(linhas, i);
    const kCabo = l.cabo_entrada.trim() ? chaveCabo(l.cabo_entrada) : "";
    return (
      <div className="mt-2 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={rot}>Nome</label>
            <input
              className={`${campo} ${!l.nome.trim() ? "border-red-400" : ""}`}
              value={l.nome}
              onFocus={() => { nomeAntes.current = l.nome; }}
              onChange={(e) => alterar(i, { nome: e.target.value })}
              onBlur={() => renomearCabos(nomeAntes.current, l.nome)}
              placeholder="Ex.: CE 2222 - P. CHAMINE"
            />
          </div>
          <div>
            <label className={rot}>Tipo</label>
            <select className={campo} value={l.tipo} onChange={(e) => alterar(i, { tipo: e.target.value as TipoElementoRota })}>
              {Object.entries(TIPO_ELEMENTO_LABEL).filter(([k]) => k !== "predio").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={rot}>Código</label>
            <div className="flex gap-1">
              <input className={campo} value={l.codigo} onChange={(e) => alterar(i, { codigo: e.target.value })} placeholder="único" />
              {!l.codigo.trim() && (
                <button
                  type="button"
                  onClick={() => alterar(i, { codigo: proximoCodigo(linhas) })}
                  className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  title="Gerar código numérico único"
                >
                  Gerar
                </button>
              )}
            </div>
            {l.codigo.trim() && linhas.some((x, j) => j !== i && x.codigo.trim() === l.codigo.trim() && !(x.nome === l.nome && x.tipo === l.tipo)) && (
              <p className="text-[10px] text-red-600 mt-0.5">Código repetido nesta rota</p>
            )}
          </div>
          {camposEquipamento(i)}
          {l.tipo === "hub" && !l.passagem && (
            <button
              type="button"
              onClick={() => ctoNoMesmoPoste(i)}
              className="col-span-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              title="Cria uma CTO logo depois desta HUB, no mesmo poste, ligada por um cabo curto sem reserva"
            >
              ＋ CTO no mesmo poste
            </button>
          )}
          {l.tipo === "cto" && hubAntes(i) !== null && (
            <button
              type="button"
              onClick={() => voltarParaHub(i)}
              className="col-span-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 py-1.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
              title="Uma porta desta CTO volta pelo mesmo cabo, em outra fibra, até a HUB (passagem) e segue para outra rota (ex.: alimentar uma CT)"
            >
              ↩ Voltar para a HUB (transporte em outra fibra)
            </button>
          )}
          {l.tipo === "cdoi" && <div className="col-span-2">{campoPredio(i)}</div>}
          {i === 0 && (
            <div className="col-span-2">
              <label className={rot}>Potência da porta PON (dBm)</label>
              <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, { potencia_saida: e.target.value })} placeholder="ex.: 5" />
            </div>
          )}
        </div>

        {i > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 mb-1.5">
              <IconeCabo tamanho={16} /> Cabo que chega aqui
              <span className="ml-auto font-normal text-amber-700">em amarelo no mapa</span>
            </p>
            {(() => {
              const existentes = cabosSaindoDe(i);
              if (!existentes.length) return null;
              return (
                <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-1.5">
                  <p className="text-[10px] font-semibold text-emerald-800 mb-1">
                    Seguir num cabo que já sai de {linhas[i - 1]?.nome.split(" - ")[0].split(" / ")[0]} (usa a próxima fibra livre):
                  </p>
                  <div className="flex flex-col gap-1">
                    {existentes.map((c) => {
                      const ativo = kCabo === c.chave;
                      const cor = c.livre ? infoFibra(c.nome, String(c.livre))?.c ?? null : null;
                      return (
                        <button
                          key={c.chave}
                          type="button"
                          disabled={!c.livre && !ativo}
                          onClick={() => !ativo && continuarCabo(i, c.nome, c.livre)}
                          title={`Fibras em uso: ${c.usadas.map((f) => `F${f}`).join(", ") || "nenhuma"}`}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] ${ativo ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-white text-slate-700 hover:border-emerald-500"} disabled:opacity-50`}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                          <span className={`shrink-0 text-[10px] ${ativo ? "text-emerald-100" : "text-slate-500"}`}>
                            em uso {c.usadas.map((f) => `F${f}`).join(" ")}
                          </span>
                          {ativo ? (
                            <span className="shrink-0 text-[10px] font-bold">✓ neste cabo</span>
                          ) : c.livre ? (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">
                              <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: cor?.hex }} />
                              F{c.livre} (troque abaixo)
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-red-600">cheio</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {tiposDeCabo.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-slate-500 mb-1">{cabosSaindoDe(i).length ? "Ou um cabo novo do cadastro:" : "Cabo do cadastro:"}</p>
                <div className="flex flex-wrap gap-1">
                  {tiposDeCabo.map((t) => {
                    const ativo = !!kCabo && tiposCabo[kCabo] === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => usarTipoCabo(i, t)}
                        className={`text-[11px] rounded-full border px-2 py-0.5 ${ativo ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`}
                        title={resumoItem(t)}
                      >
                        {t.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {/* Nome do cabo: criado sozinho ao escolher o cabo; o lápis permite renomear */}
              {(l.cabo_entrada.trim() || renomear?.i === i) && (
                <div className="col-span-2 flex items-center gap-1 text-[10px] text-slate-500">
                  {renomear?.i === i ? (
                    <input
                      autoFocus
                      className={campo}
                      list="cabos-conhecidos"
                      value={l.cabo_entrada}
                      onChange={(e) => alterar(i, { cabo_entrada: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      onBlur={() => {
                        // o tipo do cabo vai junto para o nome novo
                        const tipoAntigo = tiposCabo[chaveCabo(renomear.antigo)];
                        if (tipoAntigo && l.cabo_entrada.trim()) setTiposCabo((t) => ({ ...t, [chaveCabo(l.cabo_entrada)]: t[chaveCabo(l.cabo_entrada)] ?? tipoAntigo }));
                        setRenomear(null);
                      }}
                      placeholder="Nome do cabo"
                    />
                  ) : (
                    <>
                      <span className="min-w-0 truncate">Cabo: <span className="font-medium text-slate-700">{l.cabo_entrada}</span></span>
                      <button type="button" onClick={() => setRenomear({ i, antigo: l.cabo_entrada })} className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title="Renomear o cabo">
                        ✎
                      </button>
                    </>
                  )}
                </div>
              )}
              {campoFibra(i)}
              <div>
                <label className={rot}>Distância (m){l.dist_auto && dm !== null ? " · pelo mapa" : ""}</label>
                <input className={campo} inputMode="decimal" value={l.distancia_m} onChange={(e) => alterar(i, { distancia_m: e.target.value, dist_auto: false })} />
                {l.mesmoPoste ? (
                  <p className="text-[10px] text-slate-500">link no mesmo poste · sem reserva</p>
                ) : dm !== null && (
                  <p className="text-[10px] text-slate-500">
                    traçado {formatMetros(dm)} + reserva {reservaTrecho(linhas[i - 1]?.tipo, l.tipo, calc)} m
                  </p>
                )}
                {!l.dist_auto && !l.mesmoPoste && dm !== null && (
                  <button type="button" onClick={() => alterar(i, { dist_auto: true })} className="text-[11px] text-indigo-600 hover:underline">
                    usar o mapa ({formatMetros(dm + reservaTrecho(linhas[i - 1]?.tipo, l.tipo, calc))})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {l.tipo !== "olt" && l.tipo !== "onu" && <div className="grid grid-cols-2 gap-2">{campoSplitter(i)}</div>}

        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 list-none">
            <ChevronDown className="w-3.5 h-3.5 transition group-open:rotate-180" /> Mais detalhes
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="col-span-2">
              <label className={rot}>Coordenadas (lat, lon)</label>
              <input className={campo} value={l.coords} onChange={(e) => alterar(i, { coords: e.target.value })} placeholder="clique no mapa ou -28.69170, -49.34236" />
            </div>
            <div className="col-span-2">
              <label className={rot}>Porta (texto)</label>
              <input className={campo} value={l.porta} onChange={(e) => alterar(i, { porta: e.target.value })} placeholder="Ex.: PL 04 - Porta 13" />
            </div>
            {!pots && i > 0 && (
              <>
                <div>
                  <label className={rot}>Potência chegada</label>
                  <input className={campo} inputMode="decimal" value={l.potencia_entrada} onChange={(e) => alterar(i, { potencia_entrada: e.target.value })} />
                </div>
                <div>
                  <label className={rot}>Potência saída</label>
                  <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, { potencia_saida: e.target.value })} />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className={rot}>Observação</label>
              <input className={campo} value={l.obs} onChange={(e) => alterar(i, { obs: e.target.value })} />
            </div>
          </div>
        </details>
        {pots && pots[i] && i > 0 && <p className="text-[10px] text-slate-500 leading-tight">Potência: −{pots[i].detalhe}</p>}
      </div>
    );
  }

  const nomeFerramenta =
    ferramenta === "selecionar" ? "" : ferramenta === "poste" ? "poste" : ferramenta === "estacao" ? "estação" : PALETA.find((p) => p.t === ferramenta)?.rot ?? "";
  const depoisDe = tipoDaFerramenta(ferramenta) && sel !== null && sel < linhas.length - 1 ? linhas[sel] : null;
  const dica =
    ferramenta === "estacao"
      ? "Clique no mapa onde fica a estação: entram a OLT, o DIO e o cordão entre eles."
      : depoisDe
        ? `O novo ${nomeFerramenta} entra logo depois de "${depoisDe.nome}" (selecionado).`
        : ferramenta === "selecionar"
      ? sel !== null && !posDe(linhas[sel])
        ? `Clique no mapa onde fica "${linhas[sel].nome || `elemento ${sel + 1}`}".`
        : sel !== null && sel > 0
          ? "Cabo selecionado (amarelo): clique nele de novo para criar um poste · arraste postes e caixas para ajustar"
          : "Clique num cabo para editar · arraste os ícones para mover · escolha um tipo acima para adicionar"
      : ferramenta === "poste"
        ? "Clique nos postes do caminho. Depois escolha o tipo da próxima caixa e clique onde ela fica."
        : linhas.length === 0
          ? pontosRede.length
            ? `Clique numa caixa da rede (ícones claros) para continuar a partir dela, ou no mapa para colocar a ${nomeFerramenta}.`
            : `Clique no mapa onde fica a ${nomeFerramenta}. Ela é o início da rota.`
          : `Clique no mapa para colocar ${nomeFerramenta} no fim, em cima de um cabo para inserir no meio, ou num ícone para o mesmo local${pendentes.length ? ` (o cabo passa pelos ${pendentes.length} poste${pendentes.length > 1 ? "s" : ""} marcados)` : ""}. Esc para parar.`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <datalist id="cabos-conhecidos">
        {nomesCabos.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Barra do topo */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/60">
        <span className="rounded-lg bg-indigo-600 text-white p-1.5"><Route className="w-4 h-4" /></span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={inicial ? "Nome da rota" : "Nome da nova rota (ex.: OLT1 PL04 P13 → HUB 0/4/13)"}
          className={`flex-1 min-w-[220px] bg-transparent text-base font-semibold text-slate-900 border-b-2 py-1 outline-none placeholder:font-normal placeholder:text-slate-400 ${
            erro && !nome.trim() ? "border-red-400" : "border-transparent focus:border-indigo-400"
          }`}
        />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1"><b>{linhas.length}</b> elementos</span>
          <span className="rounded-full bg-white border border-slate-200 px-2.5 py-1"><b>{formatMetros(totalDist)}</b></span>
          <span className={`rounded-full bg-white border border-slate-200 px-2.5 py-1 font-semibold ${nivelCor(potFinal)}`}>
            {potFinal !== undefined ? fmtDbm(potFinal) : "— dBm"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {linhas.length > 0 && (
            <button
              type="button"
              onClick={() => setVerPendencias((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs font-semibold ${
                pendencias.length ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-emerald-50 border-emerald-300 text-emerald-700"
              }`}
              title="Pendências para salvar"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {pendencias.length ? `${pendencias.length} pendência${pendencias.length > 1 ? "s" : ""}` : "tudo ok"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setVerCalc((v) => !v)}
            className={`p-2 rounded-lg border ${verCalc ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 hover:bg-slate-50"}`}
            title="Cálculo de potência"
            aria-label="Cálculo de potência"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={desfazer}
            disabled={!pendentes.length && !historico.length}
            className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40"
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 shadow-sm"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar rota
          </button>
        </div>
      </header>

      {erro && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:h-[calc(100vh-190px)] lg:min-h-[560px]">
        {/* Mapa com a paleta */}
        <div className="relative h-[460px] lg:h-full">
          <RotaEditorMapa
            pontos={pontosMapa}
            trechosFixos={trechosFixos}
            selecionado={sel}
            ferramenta={ferramenta}
            pendentes={pendentes}
            centroPadrao={centroPadrao}
            onSelect={(i) => setSel(i)}
            onClicarMapa={clicarMapa}
            onMoverElemento={(i, lat, lon) => alterar(i, { coords: fmtCoord({ lat, lon }) })}
            onMoverVertice={(i, k, lat, lon) => alterar(i, { vertices: linhas[i].vertices.map((v, j) => (j === k ? { lat, lon } : v)) })}
            onRemoverVertice={(i, k) => alterar(i, { vertices: linhas[i].vertices.filter((_, j) => j !== k) })}
            onInserirCurva={inserirCurva}
            onInserirElemento={(i, lat, lon) => inserirElemento(i, lat, lon)}
            focoTrecho={focoTrecho}
            onRemoverPendente={(k) => setPendentes((ps) => ps.filter((_, j) => j !== k))}
            rede={pontosRede}
            redeCabos={redeInfo.cabos}
            onClicarRede={clicarRede}
          />

          {/* Paleta de ferramentas */}
          <div className="absolute top-3 left-3 right-3 z-[500] pointer-events-none flex">
            <div className="pointer-events-auto flex flex-wrap items-stretch gap-1 rounded-2xl bg-white/95 backdrop-blur border border-slate-200 shadow-lg p-1.5">
              {([
                { k: "selecionar" as Ferramenta, rot: "Mover", icone: <MousePointer2 className="w-5 h-5 text-slate-700" /> },
                {
                  k: "poste" as Ferramenta,
                  rot: "Poste",
                  icone: (
                    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                      <path d="M3 18 Q 9 6 21 8" stroke="#f59e0b" strokeWidth="2.5" fill="none" strokeDasharray="4 3" />
                      <circle cx="9" cy="10.5" r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
                    </svg>
                  ),
                },
              ]).map((b) => (
                <button
                  key={b.k}
                  type="button"
                  onClick={() => { setFerramenta(b.k); setAviso(null); }}
                  className={`flex flex-col items-center justify-center w-12 rounded-xl py-1 ${ferramenta === b.k ? "bg-indigo-600 text-white [&_svg_path]:stroke-white" : "hover:bg-slate-100"}`}
                  title={b.rot}
                >
                  <span className={ferramenta === b.k ? "[&_*]:!text-white" : ""}>{b.icone}</span>
                  <span className={`text-[9px] font-semibold mt-0.5 ${ferramenta === b.k ? "text-white" : "text-slate-600"}`}>{b.rot}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setFerramenta("estacao"); setAviso(null); }}
                disabled={linhas.length > 0}
                className={`flex flex-col items-center justify-center w-12 rounded-xl py-1 disabled:opacity-30 ${ferramenta === "estacao" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                title={linhas.length ? "A estação é o começo da rota" : "Montar estação: OLT + DIO + cordão"}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
                  <path d="M3 21V9l9-6 9 6v12z" fill={ferramenta === "estacao" ? "#334155" : "#e2e8f0"} stroke="#475569" strokeWidth="1.5" strokeLinejoin="round" />
                  <rect x="8" y="11" width="8" height="10" rx="1" fill="#0f172a" />
                  <path d="M9.5 13.5h5M9.5 16h5M9.5 18.5h5" stroke="#4ade80" strokeWidth="1.2" />
                </svg>
                <span className={`text-[9px] font-semibold mt-0.5 ${ferramenta === "estacao" ? "text-white" : "text-slate-600"}`}>Estação</span>
              </button>
              <span className="w-px bg-slate-200 mx-0.5" />
              {PALETA.map((p) => (
                <button
                  key={p.t}
                  type="button"
                  onClick={() => { setFerramenta(p.t); setAviso(null); }}
                  className={`flex flex-col items-center justify-center w-12 rounded-xl py-1 ${ferramenta === p.t ? "bg-indigo-100 ring-2 ring-indigo-500" : "hover:bg-slate-100"}`}
                  title={`Adicionar ${TIPO_ELEMENTO_LABEL[p.t]}`}
                >
                  <IconeElemento tipo={p.t} tamanho={24} />
                  <span className="text-[9px] font-semibold text-slate-700 mt-0.5">{p.rot}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dica do que o clique faz */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] max-w-[90%] flex flex-col items-center gap-1.5 pointer-events-none">
            {aviso && <p className="pointer-events-auto rounded-xl bg-amber-500 text-white text-xs font-medium px-3 py-1.5 shadow">{aviso}</p>}
            {pendentes.length > 0 && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs px-3 py-1.5 shadow">
                <b>{pendentes.length}</b> poste{pendentes.length > 1 ? "s" : ""} marcado{pendentes.length > 1 ? "s" : ""}
                <button type="button" onClick={() => setPendentes((p) => p.slice(0, -1))} className="underline">desfazer</button>
                <button type="button" onClick={() => setPendentes([])} className="underline">limpar</button>
              </div>
            )}
            <p className="rounded-xl bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow text-center pointer-events-auto">
              {dica}
              {depoisDe && (
                <button type="button" onClick={() => setSel(null)} className="ml-2 underline font-semibold text-amber-300">
                  colocar no fim
                </button>
              )}
            </p>
          </div>

        </div>

        {/* Lista da rota */}
        <aside className="border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col min-h-0 bg-white">
          {verPendencias && linhas.length > 0 && (
            <div className="p-3 border-b border-slate-200 bg-amber-50/60">
              <p className="text-xs font-semibold text-slate-800 mb-1.5">
                {pendencias.length ? "Falta resolver para salvar (só equipamentos e cabos do cadastro):" : "Tudo certo para salvar."}
              </p>
              <ul className="space-y-1 max-h-40 overflow-auto">
                {pendencias.map((p, k) => (
                  <li key={k}>
                    <button type="button" onClick={() => setSel(p.i)} className="w-full text-left text-[11px] text-amber-900 hover:underline">
                      • {p.msg}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {verCalc && (
            <div className="p-3 border-b border-slate-200 bg-indigo-50/50 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" checked={calc.auto} onChange={(e) => setCalc((c) => ({ ...c, auto: e.target.checked }))} />
                Calcular a potência automaticamente
              </label>
              {calc.auto && (
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["atenuacao_db_km", "Fibra dB/km"],
                    ["emenda_db", "Fusão dB"],
                    ["conector_db", "Conector dB"],
                  ] as const).map(([k, r]) => (
                    <div key={k}>
                      <label className={rot}>{r}</label>
                      <input
                        className={campo}
                        inputMode="decimal"
                        defaultValue={String(calc[k]).replace(".", ",")}
                        onChange={(e) => { const v = n(e.target.value); if (v !== undefined) setCalc((c) => ({ ...c, [k]: v })); }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {([
                  ["reserva_caixa_m", "Reserva CTO/CEO/CT/HUB (m por lado)", 15],
                  ["reserva_cdoi_m", "Reserva CDOI (m)", 2],
                ] as const).map(([k, r0, padrao]) => (
                  <div key={k}>
                    <label className={rot}>{r0}</label>
                    <input
                      className={campo}
                      inputMode="decimal"
                      defaultValue={String(calc[k] ?? padrao).replace(".", ",")}
                      onChange={(e) => {
                        const v = n(e.target.value);
                        if (v === undefined) return;
                        const novo = { ...calc, [k]: v };
                        setCalc(novo);
                        setLinhas((ls) => recalcular(ls, novo));
                      }}
                    />
                  </div>
                ))}
                <p className="col-span-2 text-[10px] text-slate-500">
                  A metragem de cada trecho soma o traçado e as reservas: caixa no meio fica com 2 × {calc.reserva_caixa_m ?? 15} m, a ponta só com {calc.reserva_caixa_m ?? 15} m. É o que o OTDR mede.
                </p>
              </div>
              {calc.auto && tx === undefined && linhas.length > 0 && (
                <p className="text-xs text-amber-700">Informe a potência da porta PON no elemento 1 (OLT).</p>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto p-3">
            {linhas.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 text-slate-500">
                <IconeElemento tipo="olt" tamanho={44} />
                <p className="mt-3 font-semibold text-slate-800">Comece pela estação</p>
                <button
                  type="button"
                  onClick={() => { setFerramenta("estacao"); setAviso(null); }}
                  className="mt-2 flex items-center gap-2 rounded-xl bg-slate-900 text-white text-sm font-semibold px-4 py-2 shadow hover:bg-slate-800"
                >
                  <IconeElemento tipo="olt" tamanho={20} /> Montar estação (OLT + DIO)
                </button>
                <p className="mt-1 text-[11px] text-slate-500">depois clique no mapa onde ela fica</p>
                {pontosRede.length > 0 && (
                  <p className="mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 max-w-[280px]">
                    <b>Ramo de uma rota existente?</b> Clique na caixa da rede (ícones claros no mapa) de onde ele sai: o caminho desde a OLT é
                    copiado e você só continua.
                  </p>
                )}
                <ol className="mt-2 text-xs text-left space-y-1.5 max-w-[260px]">
                  <li><b>1.</b> Monte a <b>estação</b> (OLT + DIO) clicando no mapa e escolha as portas no cartão.</li>
                  <li><b>2.</b> Use <b>Poste</b> para marcar o caminho do cabo (opcional).</li>
                  <li><b>3.</b> Escolha <b>CEO, HUB, CTO…</b> e clique onde cada caixa fica. Clicando em cima de um cabo, ela entra no meio.</li>
                  <li><b>4.</b> Clique num item da lista para informar cabo, fibra e splitter.</li>
                </ol>
              </div>
            ) : (
              <>
              {estacao && (
                <div className={`mb-3 ${sel === 0 || sel === 1 ? "ring-2 ring-indigo-300 rounded-2xl" : ""}`}>
                  <EstacaoOltDio
                    dados={estacao}
                    olts={olts}
                    dios={dios}
                    tiposCabo={tiposDeCabo}
                    onMudar={aplicarEstacao}
                    onVerSaida={linhas[2] ? () => { setSel(2); setFerramenta("selecionar"); setFocoTrecho((f) => ({ i: 2, vez: (f?.vez ?? 0) + 1 })); } : undefined}
                  />
                  {linhas.length > 2 && <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Fora da estação</p>}
                </div>
              )}
              <ol>
                {linhas.map((l, i) => {
                  if (estacao && i < 2) return null;
                  const ativo = i === sel;
                  const info = i > 0 ? infoFibra(l.cabo_entrada, l.fibra_entrada) : null;
                  const pot = potDe(i);
                  const res = i > 0 ? reservaTrecho(linhas[i - 1].tipo, l.tipo, calc) : 0;
                  const emenda = i > 0 && linhas[i + 1] && l.cabo_entrada.trim() && linhas[i + 1].cabo_entrada.trim() && chaveCabo(l.cabo_entrada) !== chaveCabo(linhas[i + 1].cabo_entrada);
                  return (
                    <li key={i} ref={(el) => { itemRefs.current[i] = el; }}>
                      {/* Trecho de cabo que chega */}
                      {i > 0 && (
                        <div className="group/trecho relative flex items-stretch gap-2 pl-[22px]">
                          <button
                            type="button"
                            onClick={() => inserirNaLista(i)}
                            className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/trecho:opacity-100 focus:opacity-100 rounded-full border border-indigo-300 bg-white text-indigo-700 text-[10px] font-semibold px-2 py-0.5 shadow-sm hover:bg-indigo-50"
                            title="Inserir um elemento entre estes dois"
                          >
                            + inserir aqui
                          </button>
                          <span className="w-[6px] rounded-full border-2 border-slate-800 my-0.5" style={{ background: info?.c.hex ?? "#cbd5e1", minHeight: 26 }} />
                          <p className="text-[10.5px] text-slate-500 py-1 leading-tight truncate">
                            {l.cabo_entrada ? <span className="text-slate-700 font-medium">{l.cabo_entrada.split(" - ")[0]}</span> : <span className="text-amber-600">cabo não informado</span>}
                            {info ? ` · ${info.c.rotulo} ${info.c.nome.toLowerCase()}` : ""}
                            {l.distancia_m ? ` · ${formatMetros(n(l.distancia_m) ?? 0)}${l.dist_auto && res ? ` (c/ ${res} m reserva)` : ""}` : ""}
                            {l.vertices.length ? ` · ${l.vertices.length} poste${l.vertices.length > 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                      )}
                      <div
                        onClick={() => setSel(ativo ? null : i)}
                        className={`group rounded-xl border px-2.5 py-2 cursor-pointer transition ${
                          ativo ? "border-indigo-400 ring-2 ring-indigo-100 bg-white shadow-sm" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${ativo ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                            {i + 1}
                          </span>
                          <span className="relative">
                            <IconeElemento tipo={l.tipo} tamanho={26} />
                            {pendentesDe.has(i) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" title="Tem pendência" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold leading-tight truncate ${l.nome.trim() ? "text-slate-900" : "text-red-500"}`}>{l.nome || "sem nome"}</p>
                            <p className="text-[10.5px] text-slate-500 truncate flex items-center gap-1">
                              {TIPO_ELEMENTO_LABEL[l.tipo].split(" (")[0]}
                              {i > 0 && <span className="rounded bg-slate-100 px-1 tabular-nums text-slate-600" title="Metragem desde a OLT (para o OTDR)">{formatMetros(acumulado[i])}</span>}
                              {l.splitter ? ` · ${l.splitter}` : ""}
                              {(l.tipo === "hub" || l.tipo === "cto") && l.passagem && <span className="rounded bg-slate-200 px-1 text-slate-600">passagem</span>}
                              {!posDe(l) && <span className="text-amber-600 flex items-center gap-0.5"><MapPin className="w-3 h-3" />sem local</span>}
                              {emenda && <span className="rounded bg-amber-100 text-amber-800 px-1">emenda</span>}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums ${nivelCor(pot)}`}>{pot !== undefined ? fmtDbm(pot).replace(" dBm", "") : ""}</span>
                          <span className={`flex ${ativo ? "" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => remover(i)} className="p-1 rounded hover:bg-red-100 text-red-600" aria-label="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                          </span>
                        </div>
                        {ativo && painel(i)}
                      </div>
                    </li>
                  );
                })}
              </ol>
              </>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50/60">
            <button
              type="button"
              onClick={() => {
                const tipo: TipoElementoRota = tipoDaFerramenta(ferramenta) ?? (linhas.length ? "ceo" : "olt");
                const ant = linhas[linhas.length - 1];
                mudar((ls) => [...ls, { ...linhaVazia(tipo), nome: nomeAuto(tipo, ls, nomesRede), codigo: tipo === "olt" ? "" : proximoCodigo(ls), dist_auto: true, cabo_entrada: herdaCabo(ant) ? ant.cabo_entrada : "", fibra_entrada: herdaCabo(ant) ? ant.fibra_entrada : "" }]);
                setSel(linhas.length);
                setFerramenta("selecionar");
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 rounded-lg border border-dashed border-indigo-300 py-1.5 hover:bg-indigo-50"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar elemento sem o mapa
            </button>
            <input className={campo} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação da rota (opcional)" />
          </div>
        </aside>
      </div>
    </div>
  );
}
