"use client";

import { useEffect, useState } from "react";
import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
import { capacidadeRegistrada, corFibra, distanciaMetros, tipoVisual, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento } from "@/lib/arvorePon";
import { resumoPortas, totalPernas, type CaixaRede } from "@/lib/caixasRede";
import { chaveCabo } from "@/lib/cabosRede";
import {
  andaresDoBloco,
  excluirPredio,
  listarPredios,
  novoId,
  predioNovo,
  rotuloAndar,
  rotuloAndarCurto,
  salvarPredio,
  type BlocoPredio,
  type PontoPredio,
  type PredioRede,
} from "@/lib/prediosRede";
import { IconeElementoSvg } from "./IconesRede";

/**
 * Prédio vertical: blocos lado a lado com térreo, andares e subsolos; cada CDOI no seu andar,
 * a prumada (riser) subindo pelos andares que ela atende, a fibra que chega da rua e os cabos entre blocos.
 * Tudo ligado às rotas pela chave da CDOI.
 */

const CORES = ["#0284c7", "#7c3aed", "#db2777", "#059669", "#ea580c", "#0d9488", "#4f46e5", "#ca8a04"];
const FH = 20; // altura de um andar
const GAP = 44; // espaço entre blocos (rótulos dos andares)
const ESQ = 96; // rua à esquerda (com o nome do cabo que chega)
const TOPO = 44; // telhado + nome do bloco
const POCO = 26; // largura do poço da prumada
/** Normalmente cabem no máximo 4 CDOIs por bloco */
const MAX_POR_BLOCO = 4;
/** Só entram no prédio as CDOIs que estão perto dele (metros) */
const RAIO_PREDIO = 60;
/** Meta: as portas das CDOIs atendem pelo menos 50% dos apartamentos */
const META_COBERTURA = 0.5;

function nivelCobertura(pct: number | null) {
  if (pct === null) return { cor: "#94a3b8", fundo: "bg-slate-50 border-slate-200 text-slate-600", texto: "cadastre os splitters das CDOIs" };
  if (pct >= META_COBERTURA) return { cor: "#16a34a", fundo: "bg-emerald-50 border-emerald-200 text-emerald-900", texto: "ótimo" };
  return { cor: "#d97706", fundo: "bg-amber-50 border-amber-300 text-amber-900", texto: "requer atenção" };
}

interface Props {
  chave: string;
  nome: string;
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  usuario: string;
  /** Abre a janela de uma rota (para trocar a fibra que chega numa CDOI) */
  onAbrirRota?: (id: string) => void;
}

const curto = (s: string, n = 26) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

interface CaboEntrada {
  cabo: string;
  /** Caixa de onde o cabo vem (ex.: o HUB perto do prédio) */
  de: string;
  /** Uma fibra para cada CDOI */
  gotas: { ponto: string; fibra?: number; planejada?: boolean }[];
}

/**
 * Como a fibra chega em cada CDOI. Normalmente é UM cabo que sai do HUB próximo e entra no prédio levando
 * várias fibras, uma para cada CDOI: as CDOIs que recebem pelo mesmo cabo viram um grupo só.
 * Cabo diferente entre duas CDOIs do prédio vira ligação interna (entre blocos).
 */
function chegadas(p: PredioRede, rotas: RotaOptica[]) {
  const lista: { ponto: string; cabo: string; fibra?: number; kAnt: string; antNome: string; rota: string }[] = [];
  const visto = new Set<string>();
  for (const o of p.pontos) {
    if (!o.chave) continue;
    for (const r of rotas) {
      const i = r.elementos.findIndex((e) => chaveElemento(e) === o.chave);
      if (i <= 0) continue;
      const e = r.elementos[i];
      const ant = r.elementos[i - 1];
      const cabo = e.cabo_entrada ?? "cabo não informado";
      // fibra que só passa por esta CDOI e segue no mesmo cabo para outra CDOI do prédio: não é desta
      const prox = r.elementos[i + 1];
      if (
        prox &&
        prox.fibra_entrada === e.fibra_entrada &&
        chaveCabo(prox.cabo_entrada ?? "") === chaveCabo(cabo) &&
        p.pontos.some((x) => x.chave === chaveElemento(prox))
      ) continue;
      const id = `${o.id}|${chaveCabo(cabo)}|${e.fibra_entrada}`;
      if (visto.has(id)) continue;
      visto.add(id);
      lista.push({ ponto: o.id, cabo, fibra: e.fibra_entrada, kAnt: chaveElemento(ant), antNome: ant.nome, rota: r.id });
    }
  }
  const dentro = (k: string) => p.pontos.find((x) => x.chave === k);
  const grupos = new Map<string, CaboEntrada>();
  for (const l of lista.filter((x) => !dentro(x.kAnt))) {
    const k = chaveCabo(l.cabo);
    const g = grupos.get(k) ?? { cabo: l.cabo, de: l.antNome, gotas: [] };
    if (!g.gotas.some((x) => x.ponto === l.ponto && x.fibra === l.fibra)) g.gotas.push({ ponto: l.ponto, fibra: l.fibra });
    grupos.set(k, g);
  }
  const internas: { de: string; para: string; cabo: string; fibra?: number }[] = [];
  for (const l of lista.filter((x) => dentro(x.kAnt))) {
    const g = grupos.get(chaveCabo(l.cabo));
    // mesmo cabo que entrou da rua, só passando por outra CDOI: é mais uma fibra do mesmo cabo
    if (g) {
      if (!g.gotas.some((x) => x.ponto === l.ponto && x.fibra === l.fibra)) g.gotas.push({ ponto: l.ponto, fibra: l.fibra });
    } else internas.push({ de: dentro(l.kAnt)!.id, para: l.ponto, cabo: l.cabo, fibra: l.fibra });
  }
  // CDOI sem rota com cabo e fibra planejados: entra como mais uma fibra do cabo (tracejada no desenho)
  for (const o of p.pontos) {
    if (lista.some((l) => l.ponto === o.id) || !o.cabo || !o.fibra) continue;
    const k = chaveCabo(o.cabo);
    const g = grupos.get(k) ?? { cabo: o.cabo, de: "planejado", gotas: [] };
    g.gotas.push({ ponto: o.id, fibra: o.fibra, planejada: true });
    grupos.set(k, g);
  }
  const cabos = [...grupos.values()];
  cabos.forEach((g) => g.gotas.sort((a, b) => (a.fibra ?? 0) - (b.fibra ?? 0)));
  /** Rota de cada CDOI (para abrir e trocar a fibra) */
  const rotaDe = new Map(lista.map((l) => [l.ponto, l.rota]));
  return { cabos, internas, rotaDe };
}

export default function PredioVertical({ chave, nome, rotas, caixas, usuario, onAbrirRota }: Props) {
  const [predios, setPredios] = useState<PredioRede[] | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<PredioRede | null>(null);
  const [selPonto, setSelPonto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarPredios()
      .then((ps) => vivo && setPredios(ps))
      .catch((e) => {
        if (!vivo) return;
        setPredios([]);
        setErroCarga(/permission/i.test(String(e)) ? "Sem permissão para ler os prédios: publique a regra predios_rede no Firebase." : "Não foi possível carregar os prédios.");
      });
    return () => { vivo = false; };
  }, []);

  const salvo = predios?.find((p) => p.chaves.includes(chave) || p.pontos.some((o) => o.chave === chave)) ?? null;
  const predio = rascunho ?? salvo;
  const editando = !!rascunho;

  // CDOIs da rede (todas as rotas), com a posição, para colocar no prédio
  const cdoisRede = new Map<string, string>();
  const posCdoi = new Map<string, { lat: number; lon: number }>();
  rotas.forEach((r) =>
    r.elementos.forEach((e) => {
      if (tipoVisual(e) !== "cdoi") return;
      const k = chaveElemento(e);
      cdoisRede.set(k, e.nome);
      if (e.lat !== undefined && e.lon !== undefined && !posCdoi.has(k)) posCdoi.set(k, { lat: e.lat, lon: e.lon });
    }),
  );
  if (!cdoisRede.has(chave)) cdoisRede.set(chave, nome);
  /** Está perto do prédio? (de qualquer CDOI já colocada nele, ou desta) */
  const pertoDe = (k: string, chaves: string[]) => {
    const a = posCdoi.get(k);
    if (!a) return false;
    return chaves.some((c) => {
      const b = posCdoi.get(c);
      return !!b && distanciaMetros(a, b) <= RAIO_PREDIO;
    });
  };
  const emOutroPredio = new Set((predios ?? []).filter((p) => p.id !== predio?.id).flatMap((p) => p.chaves));

  function mudar(fn: (p: PredioRede) => PredioRede) {
    setRascunho((r) => (r ? fn(r) : r));
  }
  function mudarBloco(id: string, m: Partial<BlocoPredio>) {
    mudar((p) => {
      const blocos = p.blocos.map((b) => (b.id === id ? { ...b, ...m } : b));
      const b = blocos.find((x) => x.id === id)!;
      // CDOIs do bloco continuam dentro dos andares que existem
      const pontos = p.pontos.map((o) =>
        o.bloco !== id
          ? o
          : {
              ...o,
              andar: Math.max(-b.subsolos, Math.min(b.andares, o.andar)),
              atende_de: Math.max(-b.subsolos, Math.min(b.andares, o.atende_de)),
              atende_ate: Math.max(-b.subsolos, Math.min(b.andares, o.atende_ate)),
            },
      );
      return { ...p, blocos, pontos };
    });
  }
  function mudarPonto(id: string, m: Partial<PontoPredio>) {
    mudar((p) => ({ ...p, pontos: p.pontos.map((o) => (o.id === id ? { ...o, ...m } : o)) }));
  }
  function addBloco() {
    mudar((p) => {
      const ult = p.blocos[p.blocos.length - 1];
      const letra = String.fromCharCode(65 + p.blocos.length);
      return { ...p, blocos: [...p.blocos, { id: novoId(), nome: `Bloco ${letra}`, andares: ult?.andares ?? 10, subsolos: ult?.subsolos ?? 0, aptos: ult?.aptos ?? 4 }] };
    });
  }
  function removerBloco(id: string) {
    mudar((p) => (p.blocos.length <= 1 ? p : { ...p, blocos: p.blocos.filter((b) => b.id !== id), pontos: p.pontos.filter((o) => o.bloco !== id) }));
  }
  function addPonto(k: string) {
    if (!rascunho) return;
    const qtd = (id: string) => rascunho.pontos.filter((o) => o.bloco === id).length;
    // vai para o primeiro bloco sem CDOI; senão, o que tiver menos (até 4 por bloco)
    const b =
      rascunho.blocos.find((x) => qtd(x.id) === 0) ??
      [...rascunho.blocos].filter((x) => qtd(x.id) < MAX_POR_BLOCO).sort((a, c) => qtd(a.id) - qtd(c.id))[0];
    if (!b) {
      setErro(`Todos os blocos já têm ${MAX_POR_BLOCO} CDOIs. Crie outro bloco.`);
      return;
    }
    setErro(null);
    const o: PontoPredio = { id: novoId(), chave: k, nome: cdoisRede.get(k) ?? "CDOI", bloco: b.id, andar: 0, atende_de: Math.min(1, b.andares), atende_ate: b.andares };
    mudar((p) => ({ ...p, pontos: [...p.pontos, o] }));
    setSelPonto(o.id);
  }
  function clicarAndar(bloco: string, andar: number) {
    if (!editando || !selPonto || !rascunho) return;
    const atual = rascunho.pontos.find((o) => o.id === selPonto);
    if (atual && atual.bloco !== bloco && rascunho.pontos.filter((o) => o.bloco === bloco).length >= MAX_POR_BLOCO) {
      setErro(`Este bloco já tem ${MAX_POR_BLOCO} CDOIs.`);
      return;
    }
    setErro(null);
    mudarPonto(selPonto, { bloco, andar });
  }

  async function salvar() {
    if (!rascunho) return;
    if (!rascunho.nome.trim()) return setErro("Dê um nome ao prédio.");
    if (!rascunho.pontos.length) return setErro("Coloque pelo menos uma CDOI.");
    setSalvando(true);
    setErro(null);
    try {
      const s = await salvarPredio(rascunho, usuario);
      setPredios((ps) => [...(ps ?? []).filter((p) => p.id !== s.id), s]);
      setRascunho(null);
    } catch (e) {
      setErro(/permission/i.test(String(e)) ? "Sem permissão: publique a regra predios_rede no Firebase." : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  async function excluir() {
    if (!salvo || !confirm(`Excluir o prédio "${salvo.nome}"? As CDOIs e rotas continuam.`)) return;
    await excluirPredio(salvo.id);
    setPredios((ps) => (ps ?? []).filter((p) => p.id !== salvo.id));
    setRascunho(null);
  }

  if (!predios) return <p className="p-4 text-xs text-slate-500">Carregando prédios…</p>;

  // ---------- Sem prédio: montar um ou entrar num existente ----------
  if (!predio) {
    // só prédios perto desta CDOI
    const outros = predios.filter((p) => !p.chaves.includes(chave) && pertoDe(chave, p.chaves));
    return (
      <div className="p-4 space-y-3">
        {erroCarga && <p className="text-xs text-red-600">{erroCarga}</p>}
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-4 text-center">
          <Building2 className="mx-auto h-9 w-9 text-sky-600" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Esta CDOI ainda não está num prédio</p>
          <p className="text-xs text-slate-500">Monte o prédio com blocos e andares e mostre em que andar fica cada CDOI e quais andares ela atende.</p>
          <button
            type="button"
            onClick={() => { const p = predioNovo(curto(nome.replace(/^\s*CDOI\s*/i, ""), 40) || "Prédio", chave, nome); setRascunho(p); setSelPonto(p.pontos[0].id); }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" /> Montar prédio
          </button>
        </div>
        {outros.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold text-slate-600">Ou colocar esta CDOI num prédio já montado</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              value=""
              onChange={(e) => {
                const p = outros.find((x) => x.id === e.target.value);
                if (!p) return;
                const b = p.blocos[0];
                const o: PontoPredio = { id: novoId(), chave, nome, bloco: b.id, andar: 0, atende_de: Math.min(1, b.andares), atende_ate: b.andares };
                setRascunho({ ...p, pontos: [...p.pontos, o] });
                setSelPonto(o.id);
              }}
            >
              <option value="">Escolha o prédio…</option>
              {outros.map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.blocos.length} bloco{p.blocos.length !== 1 ? "s" : ""}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  // ---------- Desenho ----------
  const cor = (o: PontoPredio) => CORES[predio.pontos.indexOf(o) % CORES.length];
  const maxAnd = Math.max(...predio.blocos.map((b) => b.andares), 1);
  const maxSub = Math.max(...predio.blocos.map((b) => b.subsolos), 0);
  const chao = TOPO + (maxAnd + 1) * FH;
  const yAndar = (a: number) => chao - (a + 1) * FH;
  const larguraJanelas = (b: BlocoPredio) => Math.max(70, 14 + Math.min(b.aptos, 8) * 14);
  const largura = (b: BlocoPredio) => larguraJanelas(b) + POCO;
  const xs: number[] = [];
  predio.blocos.reduce((x, b) => { xs.push(x); return x + largura(b) + GAP; }, ESQ);
  const W = (xs[xs.length - 1] ?? ESQ) + largura(predio.blocos[predio.blocos.length - 1]) + 16;
  const yVala = chao + maxSub * FH + 12; // vala por onde passam os cabos
  const { cabos, internas, rotaDe } = chegadas(predio, rotas);
  /** Fibra de cada CDOI (da rota ou planejada) e as repetidas no mesmo cabo */
  const fibraDe = (id: string) => {
    for (const g of cabos) {
      const gt = g.gotas.find((x) => x.ponto === id);
      if (gt) return { cabo: g.cabo, fibra: gt.fibra, planejada: !!gt.planejada };
    }
    return null;
  };
  const repetidas = new Set<string>();
  cabos.forEach((g) => {
    const vistos = new Map<number, string>();
    g.gotas.forEach((gt) => {
      if (!gt.fibra) return;
      const outro = vistos.get(gt.fibra);
      if (outro && outro !== gt.ponto) { repetidas.add(gt.ponto); repetidas.add(outro); }
      vistos.set(gt.fibra, gt.ponto);
    });
  });
  const yInterna = yVala + Math.max(cabos.length, 1) * 10 + 4;
  const H = yInterna + 10 + internas.length * 7;

  const posPonto = (o: PontoPredio) => {
    const bi = predio.blocos.findIndex((b) => b.id === o.bloco);
    if (bi < 0) return null;
    const b = predio.blocos[bi];
    const doBloco = predio.pontos.filter((x) => x.bloco === o.bloco);
    const k = doBloco.indexOf(o);
    const x = xs[bi] + larguraJanelas(b) + POCO / 2 + (doBloco.length > 1 ? (k - (doBloco.length - 1) / 2) * 7 : 0);
    return { x, y: yAndar(o.andar) + FH / 2, b, bi };
  };
  const atendeAndar = (bloco: string, a: number) => predio.pontos.find((o) => o.bloco === bloco && a >= Math.min(o.atende_de, o.atende_ate) && a <= Math.max(o.atende_de, o.atende_ate));

  const portasDe = (o: PontoPredio) => resumoPortas(caixas.find((c) => c.chave === o.chave));
  const totAptos = predio.blocos.reduce((s, b) => s + b.andares * b.aptos, 0);
  const totClientes = predio.pontos.reduce((s, o) => s + (portasDe(o)?.clientes ?? 0), 0);
  const totPortas = predio.pontos.reduce((s, o) => s + (portasDe(o)?.total ?? 0), 0);

  // ---------- Cobertura: portas das CDOIs × apartamentos (meta 50%) ----------
  /** Portas (pernas do splitter) da CDOI: do diagrama da caixa ou, sem ele, do splitter informado na rota */
  const capacidade = (o: PontoPredio): number | null => {
    const c = portasDe(o)?.total;
    if (c) return c;
    for (const r of rotas) {
      const e = r.elementos.find((x) => chaveElemento(x) === o.chave);
      const t = e ? totalPernas(e.splitter) : null;
      if (t) return t;
    }
    return totalPernas(o.splitter);
  };
  const cobertura = (pontos: PontoPredio[], aptos: number) => {
    const caps = pontos.map(capacidade);
    const portas = caps.reduce<number>((a, c) => a + (c ?? 0), 0);
    const semSplitter = caps.filter((c) => c === null).length;
    return { portas, aptos, pct: aptos > 0 && portas > 0 ? portas / aptos : null, semSplitter };
  };
  const cobGeral = cobertura(predio.pontos, totAptos);
  const cobBloco = (b: BlocoPredio) => cobertura(predio.pontos.filter((o) => o.bloco === b.id), b.andares * b.aptos);

  const campo = "w-full rounded-lg border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none";
  const rot = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";

  const desenho = (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full h-auto select-none" style={{ minWidth: Math.min(W, 420), maxWidth: W * 1.15 }}>
      <defs>
        <linearGradient id="ceuPredio" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#f8fafc" />
        </linearGradient>
        <linearGradient id="paredePredio" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#e2e8f0" />
        </linearGradient>
        <pattern id="terraPredio" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#d6c3a5" />
          <circle cx="2" cy="3" r=".8" fill="#b9a07c" />
          <circle cx="6" cy="6.5" r=".7" fill="#b9a07c" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height={chao} fill="url(#ceuPredio)" />
      <rect x="0" y={chao} width={W} height={H - chao} fill="url(#terraPredio)" />
      <rect x="0" y={chao - 1} width={W} height="3" fill="#78716c" />
      {/* calçada / rua */}
      <rect x="0" y={chao - 5} width={ESQ - 14} height="5" fill="#94a3b8" />
      <text x="6" y={chao - 9} fontSize="8" fill="#475569" fontWeight={700}>RUA</text>


      {predio.blocos.map((b, bi) => {
        const x0 = xs[bi];
        const lw = larguraJanelas(b);
        const lt = largura(b);
        const yTop = yAndar(b.andares);
        const aptos = Math.min(b.aptos, 8);
        return (
          <g key={b.id}>
            {/* nome e telhado */}
            <text x={x0 + lt / 2} y={yTop - 16} fontSize="10" fontWeight={800} textAnchor="middle" fill="#0f172a">{b.nome}</text>
            <text x={x0 + lt / 2} y={yTop - 6} fontSize="7.5" textAnchor="middle" fill="#64748b">
              {b.andares} andar{b.andares !== 1 ? "es" : ""}{b.subsolos ? ` · ${b.subsolos} subsolo${b.subsolos !== 1 ? "s" : ""}` : ""}
            </text>
            {(() => {
              const cb = cobBloco(b);
              if (cb.pct === null) return null;
              const nv = nivelCobertura(cb.pct);
              return (
                <g>
                  <title>{`${b.nome}: ${cb.portas} portas para ${cb.aptos} apartamentos (meta 50%)`}</title>
                  <rect x={x0 + lt / 2 - 22} y={yTop - 38} width="44" height="11" rx="5.5" fill={nv.cor} />
                  <text x={x0 + lt / 2} y={yTop - 30} fontSize="7" textAnchor="middle" fill="#fff" fontWeight={800}>{Math.round(cb.pct * 100)}% aptos</text>
                </g>
              );
            })()}
            <rect x={x0 - 3} y={yTop - 3} width={lt + 6} height="4" rx="1" fill="#475569" />
            {/* andares */}
            {andaresDoBloco(b).map((a) => {
              const y = yAndar(a);
              const sub = a < 0;
              const at = atendeAndar(b.id, a);
              const cAt = at ? cor(at) : null;
              return (
                <g key={a} className={editando && selPonto ? "cursor-pointer" : undefined} onClick={() => clicarAndar(b.id, a)}>
                  <title>{`${b.nome} · ${rotuloAndar(a)}${at ? ` · atendido por ${at.nome}` : ""}`}</title>
                  <rect x={x0} y={y} width={lt} height={FH} fill={sub ? "#64748b" : a === 0 ? "#cbd5e1" : "url(#paredePredio)"} stroke="#94a3b8" strokeWidth=".6" />
                  {a === 0 ? (
                    <>
                      <rect x={x0 + 8} y={y + 5} width="12" height={FH - 5} rx="1.5" fill="#334155" />
                      <rect x={x0 + 24} y={y + 5} width={lw - 32} height={FH - 10} rx="1.5" fill="#bae6fd" opacity=".8" />
                      <text x={x0 + 24 + (lw - 32) / 2} y={y + FH / 2 + 2.5} fontSize="7" textAnchor="middle" fill="#0c4a6e" fontWeight={700}>TÉRREO</text>
                    </>
                  ) : sub ? (
                    <text x={x0 + lw / 2} y={y + FH / 2 + 2.5} fontSize="7" textAnchor="middle" fill="#e2e8f0" fontWeight={700}>GARAGEM {rotuloAndarCurto(a)}</text>
                  ) : (
                    Array.from({ length: aptos }, (_, k) => (
                      <rect
                        key={k}
                        x={x0 + 8 + k * ((lw - 12) / aptos)}
                        y={y + 5}
                        width={(lw - 12) / aptos - 4}
                        height={FH - 10}
                        rx="1.2"
                        fill={cAt ?? "#cbd5e1"}
                        opacity={cAt ? 0.35 : 0.9}
                      />
                    ))
                  )}
                  {/* rótulo do andar */}
                  <text x={x0 - 4} y={y + FH / 2 + 2.5} fontSize="7" textAnchor="end" fill={sub ? "#f8fafc" : "#475569"}>{rotuloAndarCurto(a)}</text>
                  {editando && selPonto && <rect x={x0} y={y} width={lt} height={FH} fill="#0ea5e9" opacity="0" className="hover:opacity-20" />}
                </g>
              );
            })}
            {/* poço da prumada */}
            <rect x={x0 + lw} y={yTop} width={POCO} height={chao - yTop + b.subsolos * FH} fill="#0f172a" opacity=".1" />
            <line x1={x0 + lw} y1={yTop} x2={x0 + lw} y2={chao + b.subsolos * FH} stroke="#94a3b8" strokeWidth=".6" />
          </g>
        );
      })}

      {/* prumadas: sobem/descem pelos andares atendidos */}
      {predio.pontos.map((o) => {
        const p = posPonto(o);
        if (!p) return null;
        const de = Math.min(o.atende_de, o.atende_ate, o.andar);
        const ate = Math.max(o.atende_de, o.atende_ate, o.andar);
        const c = cor(o);
        const lw = larguraJanelas(p.b);
        const x0 = xs[p.bi];
        const andares: number[] = [];
        for (let a = Math.min(o.atende_de, o.atende_ate); a <= Math.max(o.atende_de, o.atende_ate); a++) andares.push(a);
        return (
          <g key={`pr${o.id}`}>
            <line x1={p.x} y1={yAndar(ate) + FH / 2} x2={p.x} y2={yAndar(de) + FH / 2} stroke={c} strokeWidth="2.4" strokeLinecap="round" />
            {andares.map((a) => (
              <g key={a}>
                <line x1={p.x} y1={yAndar(a) + FH / 2} x2={x0 + lw - 1} y2={yAndar(a) + FH / 2} stroke={c} strokeWidth=".8" strokeDasharray="1.5 1.2" opacity=".8" />
                <rect x={p.x - 2.2} y={yAndar(a) + FH / 2 - 2.2} width="4.4" height="4.4" rx="1" fill="#fff" stroke={c} strokeWidth="1" />
              </g>
            ))}
          </g>
        );
      })}

      {/* cabos entre blocos (pela vala) */}
      {internas.map((l, k) => {
        const a = predio.pontos.find((o) => o.id === l.de);
        const b = predio.pontos.find((o) => o.id === l.para);
        const pa = a && posPonto(a);
        const pb = b && posPonto(b);
        if (!pa || !pb) return null;
        const y = yInterna + k * 7;
        const c = corFibra(l.fibra, l.cabo).hex;
        return (
          <g key={`in${k}`}>
            <title>{`${l.cabo}${l.fibra ? ` · fibra ${l.fibra}` : ""}: ${a!.nome} → ${b!.nome}`}</title>
            <path d={`M${pa.x} ${pa.y} V${y} H${pb.x} V${pb.y}`} fill="none" stroke="#1e293b" strokeWidth="4" strokeLinejoin="round" opacity=".85" />
            <path d={`M${pa.x} ${pa.y} V${y} H${pb.x} V${pb.y}`} fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="4 2" strokeLinejoin="round" />
          </g>
        );
      })}

      {/* cabo que chega da rua (do HUB próximo): entra inteiro e abre uma fibra para cada CDOI */}
      {cabos.map((g, gi) => {
        const y = yVala + gi * 10;
        const gotas = g.gotas
          .map((gt) => {
            const o = predio.pontos.find((x) => x.id === gt.ponto);
            const p = o && posPonto(o);
            return o && p ? { ...gt, p, x: p.x - 3, c: corFibra(gt.fibra, g.cabo), nome: o.nome } : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
          .sort((a, b) => a.x - b.x);
        if (!gotas.length) return null;
        const xFim = Math.max(...gotas.map((x) => x.x));
        const xDesce = ESQ - 30 + gi * 4;
        const capa = `M4 ${chao - 2} H${xDesce} V${y} H${xFim}`;
        const n = gotas.length;
        const yRotulo = chao - 30 - gi * 20;
        return (
          <g key={`cb${gi}`}>
            <title>{`${g.cabo} · vem de ${g.de} · ${n} fibra${n !== 1 ? "s" : ""}`}</title>
            {/* capa do cabo */}
            <path d={capa} fill="none" stroke="#0f172a" strokeWidth={4 + Math.min(n, 6) * 1.2} strokeLinejoin="round" strokeLinecap="round" />
            {/* fibras dentro do cabo, cada uma saindo para a sua CDOI */}
            {gotas.map((gt, k) => {
              const d = (k - (n - 1) / 2) * 1.3;
              const caminho = `M4 ${chao - 2 + d} H${xDesce + d} V${y + d} H${gt.x} V${gt.p.y}`;
              return (
                <g key={k}>
                  <path d={caminho} fill="none" stroke={gt.c.hex} strokeWidth="1.3" strokeLinejoin="round" strokeDasharray={gt.planejada ? "3 2" : undefined} />
                  <circle r="1.6" fill="#fff" opacity=".9">
                    <animateMotion dur={`${3 + k * 0.4}s`} repeatCount="indefinite" path={caminho} />
                  </circle>
                </g>
              );
            })}
            {/* ponto onde cada fibra sai do cabo */}
            {gotas.map((gt, k) => (
              <g key={`d${k}`}>
                <title>{`${gt.fibra ? `Fibra ${gt.fibra} (${gt.c.nome})` : "Fibra"} → ${gt.nome}`}</title>
                <circle cx={gt.x} cy={y} r="2.6" fill="#fff" stroke={gt.c.hex} strokeWidth="1.4" />
                {gt.fibra && (
                  <text x={gt.x + 4} y={y - 4} fontSize="5.8" fontWeight={800} fill="#1c1917">F{gt.fibra}</text>
                )}
              </g>
            ))}
            {/* etiqueta na rua */}
            <text x="6" y={yRotulo} fontSize="6.5" fontWeight={800} fill="#0f172a">{curto(g.cabo, 20)}</text>
            <text x="6" y={yRotulo + 8} fontSize="5.8" fill="#475569">{n} fibra{n !== 1 ? "s" : ""} · de {curto(g.de, 12)}</text>
          </g>
        );
      })}

      {/* CDOIs */}
      {predio.pontos.map((o, i) => {
        const p = posPonto(o);
        if (!p) return null;
        const atual = o.chave === chave;
        const sel = editando && selPonto === o.id;
        return (
          <g key={`cd${o.id}`} className={editando ? "cursor-pointer" : undefined} onClick={(e) => { e.stopPropagation(); if (editando) setSelPonto(o.id); }}>
            <title>{`${o.nome} · ${rotuloAndar(o.andar)}`}</title>
            {(atual || sel) && (
              <circle cx={p.x} cy={p.y} r="12" fill="none" stroke={sel ? "#0ea5e9" : "#f59e0b"} strokeWidth="2">
                <animate attributeName="r" values="10;13;10" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <IconeElementoSvg tipo="cdoi" x={p.x} y={p.y} tamanho={19} />
            <circle cx={p.x + 8} cy={p.y - 8} r="5" fill={cor(o)} stroke="#fff" strokeWidth="1" />
            <text x={p.x + 8} y={p.y - 6.2} fontSize="6.5" textAnchor="middle" fill="#fff" fontWeight={800}>{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className="p-3 space-y-3">
      {erroCarga && <p className="text-xs text-red-600">{erroCarga}</p>}
      {/* Cabeçalho */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editando ? (
            <input className={`${campo} text-sm font-semibold`} value={predio.nome} onChange={(e) => mudar((p) => ({ ...p, nome: e.target.value }))} placeholder="Nome do prédio / condomínio" />
          ) : (
            <p className="truncate text-sm font-bold text-slate-800">{predio.nome}</p>
          )}
          {editando ? (
            <input className={`${campo} mt-1`} value={predio.endereco ?? ""} onChange={(e) => mudar((p) => ({ ...p, endereco: e.target.value }))} placeholder="Endereço (opcional)" />
          ) : (
            predio.endereco && <p className="truncate text-[11px] text-slate-500">{predio.endereco}</p>
          )}
        </div>
        {!editando && (
          <button
            type="button"
            onClick={() => { setRascunho(structuredClone(predio)); setSelPonto(predio.pontos.find((o) => o.chave === chave)?.id ?? predio.pontos[0]?.id ?? null); }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-sky-400"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>

      {/* Números */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          ["Blocos", String(predio.blocos.length)],
          ["Aptos", String(totAptos)],
          ["CDOIs", String(predio.pontos.length)],
          ["Clientes", totPortas ? `${totClientes}/${totPortas}` : "—"],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{r}</p>
            <p className="text-sm font-bold text-slate-800">{v}</p>
          </div>
        ))}
      </div>

      {/* Cobertura (meta: CDOIs para 50% dos apartamentos) */}
      {(() => {
        const nv = nivelCobertura(cobGeral.pct);
        const pct = cobGeral.pct ?? 0;
        return (
          <div className={`rounded-xl border px-3 py-2 text-[11px] ${nv.fundo}`}>
            <div className="flex items-center gap-2">
              <p className="font-semibold">Cobertura dos apartamentos</p>
              <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: nv.cor }}>
                {cobGeral.pct === null ? "sem dados" : `${Math.round(pct * 100)}% · ${nv.texto}`}
              </span>
            </div>
            <div className="relative mt-1.5 h-2.5 rounded-full bg-white/80 ring-1 ring-black/5">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: nv.cor }} />
              <div className="absolute -top-1 h-4.5 w-0.5 bg-slate-700" style={{ left: `${META_COBERTURA * 100}%` }} title="meta 50%" />
            </div>
            <p className="mt-1 opacity-90">
              {cobGeral.portas} porta{cobGeral.portas !== 1 ? "s" : ""} de CDOI para {cobGeral.aptos} apartamentos · meta: atender 50% ou mais
              {cobGeral.semSplitter > 0 ? ` · ${cobGeral.semSplitter} CDOI${cobGeral.semSplitter > 1 ? "s" : ""} sem splitter informado` : ""}
            </p>
            {predio.blocos.length > 1 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {predio.blocos.map((b) => {
                  const cb = cobBloco(b);
                  const n2 = nivelCobertura(cb.pct);
                  return (
                    <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px]">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: n2.cor }} />
                      {b.nome}: {cb.pct === null ? "—" : `${Math.round(cb.pct * 100)}%`} ({cb.portas}/{cb.aptos})
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Desenho */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-inner">{desenho}</div>
      {editando && selPonto && (
        <p className="text-[11px] text-sky-700">
          Clique num andar do desenho para mudar a <b>{predio.pontos.find((o) => o.id === selPonto)?.nome}</b> de lugar.
        </p>
      )}

      {/* Legenda das CDOIs */}
      {!editando && (
        <div className="space-y-1.5">
          {cabos.map((g, gi) => (
            <div key={gi} className="rounded-xl border border-slate-300 bg-slate-900 px-2.5 py-2 text-[11px] text-slate-100">
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="inline-block h-2.5 w-5 rounded-full bg-black ring-1 ring-slate-500" />
                {curto(g.cabo, 40)}
                <span className="ml-auto font-normal text-slate-400">de {curto(g.de, 22)}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {g.gotas.map((gt, k) => {
                  const o = predio.pontos.find((x) => x.id === gt.ponto);
                  const c = corFibra(gt.fibra, g.cabo);
                  return (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px]">
                      <span className="inline-block h-2 w-2 rounded-full ring-1 ring-white/40" style={{ background: c.hex }} />
                      {gt.fibra ? `F${gt.fibra}` : "fibra"} → {curto(o?.nome ?? "", 18)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          {predio.pontos.map((o, i) => {
            const b = predio.blocos.find((x) => x.id === o.bloco);
            const pr = portasDe(o);
            const chega = cabos.flatMap((g) => g.gotas.filter((x) => x.ponto === o.id).map((x) => ({ cabo: g.cabo, fibra: x.fibra })));
            const vemDe = internas.filter((l) => l.para === o.id).map((l) => predio.pontos.find((x) => x.id === l.de)?.nome).filter(Boolean);
            return (
              <div key={o.id} className={`flex items-start gap-2 rounded-xl border px-2.5 py-1.5 ${o.chave === chave ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"}`}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: cor(o) }}>{i + 1}</span>
                <div className="min-w-0 flex-1 text-[11px] leading-snug">
                  <p className="truncate font-semibold text-slate-800">{o.nome}</p>
                  <p className="text-slate-600">
                    {b?.nome} · {rotuloAndar(o.andar)} · atende {rotuloAndarCurto(Math.min(o.atende_de, o.atende_ate))} ao {rotuloAndarCurto(Math.max(o.atende_de, o.atende_ate))}
                  </p>
                  {chega.map((l, k) => (
                    <p key={k} className="flex items-center gap-1 text-slate-500">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: corFibra(l.fibra, l.cabo).hex }} />
                      {l.fibra ? `fibra ${l.fibra} (${corFibra(l.fibra, l.cabo).nome})` : "fibra"} do cabo {curto(l.cabo, 30)}
                    </p>
                  ))}
                  {vemDe.length > 0 && <p className="text-slate-500">recebe de: {vemDe.join(", ")}</p>}
                  {!o.chave && !o.fibra && <p className="text-amber-700">ainda sem rota</p>}
                  {o.fibra && !rotaDe.has(o.id) && o.cabo && (
                    <p className="text-slate-500">fibra {o.fibra} ({corFibra(o.fibra, o.cabo).nome}) planejada no cabo {curto(o.cabo, 26)} · sem rota</p>
                  )}
                  {repetidas.has(o.id) && <p className="font-semibold text-red-600">Fibra repetida: outra CDOI usa a mesma fibra deste cabo</p>}
                </div>
                {pr && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" title={`${pr.livres} livres · ${pr.ramais} ramais`}>
                    {pr.clientes}/{pr.total}
                  </span>
                )}
              </div>
            );
          })}
          {salvo?.atualizado_em && (
            <p className="text-[10px] text-slate-400">Atualizado em {new Date(salvo.atualizado_em).toLocaleDateString("pt-BR")}{salvo.atualizado_por ? ` por ${salvo.atualizado_por}` : ""}</p>
          )}
        </div>
      )}

      {/* Edição */}
      {editando && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="mb-1.5 flex items-center">
              <p className="text-[11px] font-bold text-slate-700">Blocos</p>
              <button type="button" onClick={addBloco} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Bloco
              </button>
            </div>
            <div className="space-y-1.5">
              {predio.blocos.map((b) => (
                <div key={b.id} className="grid grid-cols-[1fr_52px_52px_52px_20px] items-end gap-1.5">
                  <div>
                    <label className={rot}>Nome</label>
                    <input className={campo} value={b.nome} onChange={(e) => mudarBloco(b.id, { nome: e.target.value })} />
                  </div>
                  <div>
                    <label className={rot}>Andares</label>
                    <input className={campo} type="number" min={0} max={60} value={b.andares} onChange={(e) => mudarBloco(b.id, { andares: Math.max(0, Math.min(60, +e.target.value || 0)) })} />
                  </div>
                  <div>
                    <label className={rot}>Subsolo</label>
                    <input className={campo} type="number" min={0} max={6} value={b.subsolos} onChange={(e) => mudarBloco(b.id, { subsolos: Math.max(0, Math.min(6, +e.target.value || 0)) })} />
                  </div>
                  <div>
                    <label className={rot}>Apto/and</label>
                    <input className={campo} type="number" min={1} max={20} value={b.aptos} onChange={(e) => mudarBloco(b.id, { aptos: Math.max(1, Math.min(20, +e.target.value || 1)) })} />
                  </div>
                  <button type="button" disabled={predio.blocos.length <= 1} onClick={() => removerBloco(b.id)} className="mb-1 text-slate-400 hover:text-red-600 disabled:opacity-30" title="Remover bloco">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold text-slate-700">CDOIs</p>
            <div className="space-y-1.5">
              {predio.pontos.map((o, i) => {
                const b = predio.blocos.find((x) => x.id === o.bloco) ?? predio.blocos[0];
                const lista = andaresDoBloco(b);
                return (
                  <div
                    key={o.id}
                    onClick={() => setSelPonto(o.id)}
                    className={`rounded-lg border bg-white p-2 ${selPonto === o.id ? "border-sky-400 ring-2 ring-sky-100" : "border-slate-200"}`}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: cor(o) }}>{i + 1}</span>
                      <input className={`${campo} flex-1`} value={o.nome} onChange={(e) => mudarPonto(o.id, { nome: e.target.value })} />
                      <button type="button" onClick={(e) => { e.stopPropagation(); mudar((p) => ({ ...p, pontos: p.pontos.filter((x) => x.id !== o.id) })); }} className="text-slate-400 hover:text-red-600" title="Tirar do prédio">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      <div>
                        <label className={rot}>Bloco</label>
                        <select className={campo} value={o.bloco} onChange={(e) => {
                          const nb = predio.blocos.find((x) => x.id === e.target.value)!;
                          mudarPonto(o.id, { bloco: nb.id, andar: Math.min(o.andar, nb.andares), atende_de: Math.min(o.atende_de, nb.andares), atende_ate: Math.min(o.atende_ate, nb.andares) });
                        }}>
                          {predio.blocos.map((x) => {
                            const cheio = x.id !== o.bloco && predio.pontos.filter((y) => y.bloco === x.id).length >= MAX_POR_BLOCO;
                            return <option key={x.id} value={x.id} disabled={cheio}>{x.nome}{cheio ? " (4 CDOIs)" : ""}</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <label className={rot}>Fica no</label>
                        <select className={campo} value={o.andar} onChange={(e) => mudarPonto(o.id, { andar: +e.target.value })}>
                          {lista.map((a) => <option key={a} value={a}>{rotuloAndarCurto(a)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={rot}>Atende do</label>
                        <select className={campo} value={o.atende_de} onChange={(e) => mudarPonto(o.id, { atende_de: +e.target.value })}>
                          {lista.map((a) => <option key={a} value={a}>{rotuloAndarCurto(a)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={rot}>até o</label>
                        <select className={campo} value={o.atende_ate} onChange={(e) => mudarPonto(o.id, { atende_ate: +e.target.value })}>
                          {lista.map((a) => <option key={a} value={a}>{rotuloAndarCurto(a)}</option>)}
                        </select>
                      </div>
                    </div>
                    {(() => {
                      const doDiagrama = portasDe(o)?.total;
                      const daRota = rotas.flatMap((r) => r.elementos).find((x) => chaveElemento(x) === o.chave && totalPernas(x.splitter))?.splitter;
                      if (doDiagrama || daRota) {
                        return <p className="mt-1 text-[10px] text-slate-500">Splitter {doDiagrama ? `1:${doDiagrama} (diagrama da caixa)` : `${daRota} (da rota)`}</p>;
                      }
                      return (
                        <div className="mt-1 flex items-center gap-1.5">
                          <label className="text-[10px] font-semibold text-slate-500">Splitter</label>
                          <select className={`${campo} w-auto`} value={o.splitter ?? ""} onChange={(e) => mudarPonto(o.id, { splitter: e.target.value || undefined })}>
                            <option value="">não informado</option>
                            {["1:4", "1:8", "1:16", "1:32"].map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                          <span className="text-[10px] text-slate-400">para a cobertura</span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const f = fibraDe(o.id);
                      const rotaId = rotaDe.get(o.id);
                      if (rotaId && f) {
                        const c = corFibra(f.fibra, f.cabo);
                        return (
                          <div className="mt-1 flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: c.hex }} />
                            <span className="min-w-0 flex-1 truncate">Fibra {f.fibra ?? "?"} ({c.nome.toLowerCase()}) · {curto(f.cabo, 26)} · da rota</span>
                            {onAbrirRota && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); onAbrirRota(rotaId); }} className="shrink-0 font-semibold text-sky-700 hover:underline">
                                trocar na rota
                              </button>
                            )}
                          </div>
                        );
                      }
                      // sem rota: escolhe cabo e fibra (planejado)
                      const nomesCabos = [...new Set([...cabos.filter((g) => g.de !== "planejado").map((g) => g.cabo), ...(o.cabo ? [o.cabo] : [])])];
                      if (!nomesCabos.length) return <p className="mt-1 text-[10px] text-amber-700">CDOI sem rota: só aparece no desenho.</p>;
                      const caboSel = o.cabo ?? "";
                      const g = cabos.find((x) => chaveCabo(x.cabo) === chaveCabo(caboSel));
                      const cap = capacidadeRegistrada(caboSel) ?? 12;
                      return (
                        <div className="mt-1 grid grid-cols-[1fr_92px] gap-1">
                          <select className={campo} value={caboSel} onChange={(e) => mudarPonto(o.id, { cabo: e.target.value || undefined, fibra: undefined })} title="Cabo que leva a fibra até esta CDOI">
                            <option value="">Fibra que chega: escolha o cabo…</option>
                            {nomesCabos.map((nm) => <option key={nm} value={nm}>{curto(nm, 40)}</option>)}
                          </select>
                          <select className={campo} disabled={!caboSel} value={o.fibra ?? ""} onChange={(e) => mudarPonto(o.id, { fibra: e.target.value ? +e.target.value : undefined })}>
                            <option value="">fibra…</option>
                            {Array.from({ length: cap }, (_, k) => k + 1).map((fb) => {
                              const usada = g?.gotas.find((x) => x.fibra === fb && x.ponto !== o.id);
                              const dono = usada ? predio.pontos.find((x) => x.id === usada.ponto)?.nome : undefined;
                              return (
                                <option key={fb} value={fb} disabled={!!usada}>
                                  F{fb} {corFibra(fb, caboSel).nome.toLowerCase()}{dono ? ` → ${curto(dono, 12)}` : ""}
                                </option>
                              );
                            })}
                          </select>
                          <p className="col-span-2 text-[10px] text-amber-700">Sem rota: a fibra fica planejada (tracejada no desenho).</p>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            <select
              className={`${campo} mt-2`}
              value=""
              onChange={(e) => { if (e.target.value === "__nova") addPonto(""); else if (e.target.value) addPonto(e.target.value); }}
            >
              <option value="">+ Colocar outra CDOI…</option>
              {(() => {
                const ancoras = [chave, ...predio.pontos.map((o) => o.chave).filter(Boolean)];
                const livres = [...cdoisRede.entries()].filter(([k]) => !predio.pontos.some((o) => o.chave === k) && !emOutroPredio.has(k));
                const perto = livres.filter(([k]) => pertoDe(k, ancoras));
                return perto.length ? (
                  <optgroup label={`CDOIs perto deste prédio (até ${RAIO_PREDIO} m)`}>
                    {perto.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </optgroup>
                ) : null;
              })()}
              <option value="__nova">CDOI ainda sem rota (só desenho)</option>
            </select>
          </div>

          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex items-center gap-2">
            {salvo && (
              <button type="button" onClick={excluir} className="text-[11px] text-red-600 hover:underline">Excluir prédio</button>
            )}
            <button type="button" onClick={() => { setRascunho(null); setErro(null); }} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Cancelar</button>
            <button type="button" disabled={salvando} onClick={salvar} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
              {salvando ? "Salvando…" : "Salvar prédio"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
