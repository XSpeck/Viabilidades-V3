// =====================
// Análise da rede para o Mapa da rede: cada caixa e cada trecho de cabo com ocupação, potência,
// portas PON e alertas; e os indicadores de um conjunto (o filtrado ou o visível no mapa).
// =====================
import { chaveElemento, portaPonDaRota } from "./arvorePon";
import { chaveCabo } from "./cabosRede";
import { resumoPortas, type CaixaRede } from "./caixasRede";
import { capacidadeDoCabo, capacidadeRegistrada, CALCULO_PADRAO, corFibra, perdaSplitter, tipoVisual, type RotaOptica, type TipoElementoRota } from "./rotaOptica";

export type Gravidade = "critico" | "atencao" | "cadastro";
export interface Alerta { gravidade: Gravidade; texto: string }

export type NivelPotencia = "otima" | "boa" | "limite" | "abaixo" | "sem";
/** Níveis de potência na ponta (dBm), os mesmos do resto do sistema */
export function nivelPotencia(v?: number): NivelPotencia {
  if (v === undefined || Number.isNaN(v)) return "sem";
  if (v >= -20) return "otima";
  if (v >= -25) return "boa";
  if (v >= -27) return "limite";
  return "abaixo";
}
export const COR_NIVEL: Record<NivelPotencia, string> = { otima: "#16a34a", boa: "#84cc16", limite: "#f59e0b", abaixo: "#dc2626", sem: "#94a3b8" };
export const ROTULO_NIVEL: Record<NivelPotencia, string> = { otima: "ótima (≥ −20)", boa: "boa (≥ −25)", limite: "no limite (≥ −27)", abaixo: "abaixo (< −27)", sem: "sem medida" };

/** Faixas de ocupação (portas ou fibras usadas / total) */
export type FaixaOcupacao = "baixa" | "media" | "alta" | "cheia" | "sem";
export function faixaOcupacao(usadas: number, total: number): FaixaOcupacao {
  if (!total) return "sem";
  const p = usadas / total;
  if (p >= 1) return "cheia";
  if (p >= 0.85) return "alta";
  if (p >= 0.5) return "media";
  return "baixa";
}
export const COR_OCUPACAO: Record<FaixaOcupacao, string> = { baixa: "#16a34a", media: "#eab308", alta: "#f97316", cheia: "#dc2626", sem: "#94a3b8" };
export const ROTULO_OCUPACAO: Record<FaixaOcupacao, string> = { baixa: "até 50%", media: "50 a 85%", alta: "85 a 99%", cheia: "cheia (100%)", sem: "sem cadastro" };

/** Paleta das portas PON (pela ordem) */
const PALETA_PON = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d", "#c026d3", "#0d9488", "#ea580c", "#4f46e5"];

export interface CaixaAnalise {
  chave: string;
  nome: string;
  tipo: TipoElementoRota;
  lat: number;
  lon: number;
  rotas: RotaOptica[];
  pons: string[];
  metrosOlt: number;
  /** Pior potência na ponta (CTO/CDOI com splitter) */
  potPonta?: number;
  ocupacao?: { total: number; clientes: number; ramais: number; livres: number };
  /** Prédio: quantas CDOIs foram juntadas aqui */
  cdois?: number;
  /** Atende alguma porta PON (não é só passagem em todas as rotas) */
  atende: boolean;
  alertas: Alerta[];
}

export interface CaboAnalise {
  chave: string;
  nome: string;
  cor: string;
  pts: [number, number][];
  rotas: RotaOptica[];
  pons: string[];
  fibras: number[];
  capacidade: number;
  metros: number;
  alertas: Alerta[];
}

export interface AnaliseRede {
  caixas: CaixaAnalise[];
  cabos: CaboAnalise[];
  /** Traçados importados sem índice de trecho (só desenho) */
  soltos: { rota: RotaOptica; nome: string; cor?: string; pts: [number, number][]; pons: string[] }[];
  pons: { chave: string; rotulo: string; cor: string }[];
  semCoordenada: { rota: RotaOptica; nome: string }[];
  orfas: RotaOptica[];
}

const ehAtendimento = (t: TipoElementoRota) => t === "cto" || t === "cdoi" || t === "hub";

/** Monta a análise com TODAS as rotas (a ocupação não depende do filtro); o filtro é só de exibição */
export function analisarRede(rotas: RotaOptica[], caixasCad: CaixaRede[], predioDe?: Map<string, { id: string; nome: string; cdois: number }>): AnaliseRede {
  const ponsMap = new Map<string, string>();
  rotas.forEach((r) => { const p = portaPonDaRota(r); ponsMap.set(p.chave, p.rotulo); });
  const pons = [...ponsMap.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true })).map(([chave, rotulo], i) => ({ chave, rotulo, cor: PALETA_PON[i % PALETA_PON.length] }));
  const cadDe = new Map(caixasCad.map((c) => [c.chave, c]));

  type Acc = CaixaAnalise & { metros: number[]; pons0: Set<string>; usaSplitter: boolean; soPassa: boolean; chavesEl: Set<string> };
  const caixas = new Map<string, Acc>();
  const semCoordenada: AnaliseRede["semCoordenada"] = [];
  for (const r of rotas) {
    const pon = portaPonDaRota(r).chave;
    const ini = r.pai && r.tronco ? r.tronco : 0;
    let acc = 0;
    r.elementos.forEach((e, i) => {
      if (i > 0) acc += e.distancia_m ?? 0;
      if (e.lat === undefined || e.lon === undefined) { if (i >= ini && e.tipo !== "predio") semCoordenada.push({ rota: r, nome: e.nome }); return; }
      const ke = chaveElemento(e);
      const pr = predioDe?.get(ke);
      const k = pr ? `PREDIO:${pr.id}` : ke;
      const tipo = pr ? "predio" : tipoVisual(e);
      const c = caixas.get(k) ?? {
        chave: k, nome: pr ? pr.nome : e.nome, tipo, lat: e.lat, lon: e.lon, rotas: [], pons: [], metrosOlt: 0, alertas: [],
        metros: [], pons0: new Set<string>(), usaSplitter: false, soPassa: true, chavesEl: new Set<string>(), cdois: pr?.cdois, atende: false,
      };
      if (!c.rotas.includes(r)) c.rotas.push(r);
      c.metros.push(acc);
      c.pons0.add(pon);
      c.chavesEl.add(ke);
      const tv = tipoVisual(e);
      if (!e.passagem) c.soPassa = false;
      if (e.splitter) c.usaSplitter = true;
      // potência na ponta: CTO/CDOI com splitter (pela rota; ou pelo diagrama da caixa)
      if ((tv === "cto" || tv === "cdoi") && !e.passagem) {
        let p: number | undefined;
        if (e.splitter) p = e.potencia_saida;
        else {
          const cad = cadDe.get(ke);
          const rel = cad?.splitters?.[0]?.relacao ?? cad?.splitter;
          if (rel && e.potencia_entrada !== undefined) p = e.potencia_entrada - perdaSplitter(rel) - CALCULO_PADRAO.conector_db;
        }
        if (p !== undefined && (c.potPonta === undefined || p < c.potPonta)) c.potPonta = p;
      }
      caixas.set(k, c);
    });
  }

  const listaCaixas: CaixaAnalise[] = [...caixas.values()].map((c) => {
    // ocupação: soma das caixas cadastradas (num prédio, as CDOIs)
    let oc: CaixaAnalise["ocupacao"];
    for (const ke of c.chavesEl) {
      const cad = cadDe.get(ke);
      if (cad?.splitters?.length || cad?.splitter) {
        const rp = resumoPortas(cad);
        if (rp) oc = { total: (oc?.total ?? 0) + rp.total, clientes: (oc?.clientes ?? 0) + rp.clientes, ramais: (oc?.ramais ?? 0) + rp.ramais, livres: (oc?.livres ?? 0) + rp.livres };
        c.usaSplitter = true;
      }
    }
    const alertas: Alerta[] = [];
    if (oc && oc.total) {
      const f = faixaOcupacao(oc.clientes + oc.ramais, oc.total);
      if (f === "cheia") alertas.push({ gravidade: "critico", texto: `Cheia: ${oc.total} de ${oc.total} portas ocupadas` });
      else if (f === "alta") alertas.push({ gravidade: "atencao", texto: `Quase cheia: ${oc.clientes + oc.ramais} de ${oc.total} portas (${Math.round(((oc.clientes + oc.ramais) / oc.total) * 100)}%)` });
    }
    const nv = nivelPotencia(c.potPonta);
    if (nv === "abaixo") alertas.push({ gravidade: "critico", texto: `Potência abaixo do mínimo: ${fmt(c.potPonta)} dBm` });
    else if (nv === "limite") alertas.push({ gravidade: "atencao", texto: `Potência no limite: ${fmt(c.potPonta)} dBm` });
    if (ehAtendimento(c.tipo) && !c.soPassa && !c.usaSplitter) alertas.push({ gravidade: "cadastro", texto: "Sem splitter cadastrado" });
    return {
      chave: c.chave, nome: c.nome, tipo: c.tipo, lat: c.lat, lon: c.lon, rotas: c.rotas, pons: [...c.pons0], metrosOlt: Math.min(...c.metros),
      potPonta: c.potPonta, ocupacao: oc, cdois: c.cdois, alertas, atende: !c.soPassa,
    };
  });

  // Cabos: um traçado por trecho (cabo + par de caixas); ida e volta juntas
  type AccC = Omit<CaboAnalise, "pons" | "fibras"> & { pons0: Set<string>; fibras0: Set<number> };
  const cabos = new Map<string, AccC>();
  for (const r of rotas) {
    const pon = portaPonDaRota(r).chave;
    r.elementos.forEach((e, i) => {
      if (i === 0) return;
      const t = r.trechos.find((x) => x.ate === i);
      const a = r.elementos[i - 1];
      const pts: [number, number][] = t?.pontos?.length
        ? t.pontos.map((p) => [p.lat, p.lon])
        : a.lat !== undefined && a.lon !== undefined && e.lat !== undefined && e.lon !== undefined ? [[a.lat, a.lon], [e.lat, e.lon]] : [];
      if (pts.length < 2) return;
      const k = `${chaveCabo(e.cabo_entrada ?? `trecho${i}`)}|${[chaveElemento(a), chaveElemento(e)].sort().join("|")}`;
      const c = cabos.get(k) ?? { chave: k, nome: e.cabo_entrada ?? "cabo", cor: (e.fibra_entrada && e.cabo_entrada ? corFibra(e.fibra_entrada, e.cabo_entrada).hex : undefined) ?? t?.cor ?? "#3b82f6", pts, rotas: [], pons0: new Set<string>(), fibras0: new Set<number>(), capacidade: 0, metros: e.distancia_m ?? 0, alertas: [] };
      if (!c.rotas.includes(r)) c.rotas.push(r);
      c.pons0.add(pon);
      if (e.fibra_entrada) c.fibras0.add(e.fibra_entrada);
      cabos.set(k, c);
    });
  }
  const listaCabos: CaboAnalise[] = [...cabos.values()].map((c) => {
    const fibras = [...c.fibras0].sort((x, y) => x - y);
    const ehCordao = /^Cordão /i.test(c.nome);
    const capacidade = capacidadeRegistrada(c.nome) ?? capacidadeDoCabo(c.nome, Math.max(1, ...fibras));
    const alertas: Alerta[] = [];
    if (!ehCordao && fibras.length && capacidade) {
      const f = faixaOcupacao(fibras.length, capacidade);
      if (f === "cheia") alertas.push({ gravidade: "critico", texto: `Sem fibra livre: ${fibras.length} de ${capacidade}` });
      else if (f === "alta") alertas.push({ gravidade: "atencao", texto: `Quase sem fibra: ${fibras.length} de ${capacidade} em uso` });
    }
    return { chave: c.chave, nome: c.nome, cor: c.cor, pts: c.pts, rotas: c.rotas, pons: [...c.pons0], fibras, capacidade, metros: c.metros, alertas };
  });

  const soltos = rotas.flatMap((r) => r.trechos.filter((t) => t.ate === undefined).map((t) => ({ rota: r, nome: t.nome, cor: t.cor, pts: t.pontos.map((p) => [p.lat, p.lon] as [number, number]), pons: [portaPonDaRota(r).chave] })));
  return { caixas: listaCaixas, cabos: listaCabos, soltos, pons, semCoordenada, orfas: rotas.filter((r) => r.orfa) };
}

export interface Indicadores {
  km: number;
  rotas: number;
  pons: number;
  caixasPorTipo: [TipoElementoRota, number][];
  portas: { total: number; clientes: number; ramais: number; livres: number };
  pior?: number;
  niveis: Record<NivelPotencia, number>;
  cabosCheios: number;
  alertas: Record<Gravidade, number>;
}

/** Números de um conjunto de caixas e cabos (o filtrado ou o visível) */
export function indicadores(caixas: CaixaAnalise[], cabos: CaboAnalise[], extras: Alerta[] = []): Indicadores {
  const porTipo = new Map<TipoElementoRota, number>();
  caixas.forEach((c) => porTipo.set(c.tipo, (porTipo.get(c.tipo) ?? 0) + 1));
  const portas = { total: 0, clientes: 0, ramais: 0, livres: 0 };
  caixas.forEach((c) => { if (c.ocupacao) { portas.total += c.ocupacao.total; portas.clientes += c.ocupacao.clientes; portas.ramais += c.ocupacao.ramais; portas.livres += c.ocupacao.livres; } });
  const niveis: Record<NivelPotencia, number> = { otima: 0, boa: 0, limite: 0, abaixo: 0, sem: 0 };
  // só as caixas que atendem (CTO/CDOI/prédio que não são só passagem)
  const pots = caixas.filter((c) => (c.tipo === "cto" || c.tipo === "cdoi" || c.tipo === "predio") && c.atende).map((c) => c.potPonta);
  pots.forEach((p) => niveis[nivelPotencia(p)]++);
  const medidas = pots.filter((p): p is number => p !== undefined);
  const alertas: Record<Gravidade, number> = { critico: 0, atencao: 0, cadastro: 0 };
  [...caixas.flatMap((c) => c.alertas), ...cabos.flatMap((c) => c.alertas), ...extras].forEach((a) => alertas[a.gravidade]++);
  const rotas = new Set([...caixas, ...cabos].flatMap((x) => x.rotas.map((r) => r.id)));
  const pons = new Set([...caixas, ...cabos].flatMap((x) => x.pons));
  return {
    km: cabos.filter((c) => !/^Cordão /i.test(c.nome)).reduce((s, c) => s + c.metros, 0) / 1000,
    rotas: rotas.size,
    pons: pons.size,
    caixasPorTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    portas,
    pior: medidas.length ? Math.min(...medidas) : undefined,
    niveis,
    cabosCheios: cabos.filter((c) => c.alertas.some((a) => a.gravidade !== "cadastro")).length,
    alertas,
  };
}

function fmt(v?: number) {
  return v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`;
}
