// =====================
// Rota óptica — tipos, leitura do KML do GeoGrid, cálculos e Firestore
// =====================

/** "predio" é um agrupador (como a estação): junta as CDOIs de um prédio; não entra na potência */
export type TipoElementoRota = "olt" | "dio" | "ceo" | "ct" | "hub" | "cto" | "cdoi" | "predio" | "onu" | "outro";

export const TIPO_ELEMENTO_LABEL: Record<TipoElementoRota, string> = {
  olt: "OLT",
  dio: "DIO",
  ceo: "Caixa de emenda (CEO)",
  ct: "Caixa de transporte (CT)",
  hub: "Hub splitter",
  cto: "CTO",
  cdoi: "CDOI (prédio)",
  predio: "Prédio",
  onu: "Cliente / ONU",
  outro: "Outro",
};

/** Tipo para exibir: rotas antigas gravaram CDOI como CTO; o nome resolve. */
export function tipoVisual(e: { tipo: TipoElementoRota; nome: string }): TipoElementoRota {
  if (e.tipo === "cto" && /^\s*CDOI/i.test(e.nome)) return "cdoi";
  if ((e.tipo === "outro" || e.tipo === "ceo") && /^\s*CT\b(?!O)|TRANSPORTE/i.test(e.nome)) return "ct";
  return e.tipo;
}

/** Um elemento da rota (OLT, caixa, hub, CTO...), na ordem em que o sinal passa. */
export interface ElementoRota {
  nome: string;
  tipo: TipoElementoRota;
  /** Código do ponto no GeoGrid, ex.: PT2816 */
  codigo?: string;
  lat?: number;
  lon?: number;
  /** Cabo pelo qual a fibra chega neste elemento */
  cabo_entrada?: string;
  fibra_entrada?: number;
  /** Cabo pelo qual a fibra sai deste elemento (vazio no último) */
  cabo_saida?: string;
  fibra_saida?: number;
  /** Porta usada (OLT, DIO ou splitter), em texto livre: "PL 04 - Porta 13" */
  porta?: string;
  /** Splitter do elemento, ex.: "1:8" */
  splitter?: string;
  /** Modelo de splitter do cadastro de equipamentos */
  splitter_modelo?: string;
  /** O trecho que chega aqui é um link no mesmo poste (ex.: HUB → CTO ao lado): sem traçado e sem reserva técnica */
  mesmo_poste?: boolean;
  /** HUB/CTO que, nesta rota, é só passagem (o splitter é de outra porta ou de outra fibra): a fibra segue sem dividir */
  passagem?: boolean;
  /** HUB com meia porta: um 1:2 antes do primário (uma perna no primário, a outra segue para a HUB da outra metade) */
  meia_porta?: boolean;
  /** Montado (não gravado): a fibra sai desta HUB pela outra perna do 1:2, sem passar no primário */
  via_meia_porta?: boolean;
  /** OLT ou DIO do cadastro de equipamentos */
  equipamento_id?: string;
  /** Metros de cabo desde o elemento anterior */
  distancia_m?: number;
  /** Potência (dBm) na chegada / na saída do elemento */
  potencia_entrada?: number;
  potencia_saida?: number;
  obs?: string;
}

/** Traçado de um cabo no mapa. */
export interface TrechoCabo {
  nome: string;
  cor?: string;
  pontos: { lat: number; lon: number }[];
  /** Rota desenhada no site: índice do elemento onde o trecho chega */
  ate?: number;
}

/** Distância em metros entre dois pontos (haversine). */
export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Comprimento de um traçado (soma dos segmentos), em metros. */
export function comprimentoTracado(pontos: { lat: number; lon: number }[]): number {
  let t = 0;
  for (let i = 1; i < pontos.length; i++) t += distanciaMetros(pontos[i - 1], pontos[i]);
  return t;
}

export type OrigemRota = "geogrid" | "manual";

/** Sub-rota: de qual rota e de qual caixa ela sai */
export interface PaiRota {
  rota_id: string;
  /** chaveElemento da caixa onde ramifica (ex.: "PT:100002") */
  chave: string;
  /** sai pela outra perna do 1:2 da meia porta (e não pelo primário da HUB) */
  meia_porta?: boolean;
}

export interface RotaOptica {
  id: string;
  nome: string;
  /** Sub-rota: sai de outra rota (o tronco vem de lá) */
  pai?: PaiRota;
  /** Montado: quantos elementos vêm da rota-mãe (incluindo a caixa onde ramifica) */
  tronco?: number;
  /** Montado: a caixa de onde a sub-rota sai não existe mais na rota-mãe */
  orfa?: boolean;
  origem: OrigemRota;
  elementos: ElementoRota[];
  trechos: TrechoCabo[];
  /** Cálculo automático de potência (parâmetros usados no editor) */
  calculo_potencia?: CalculoPotencia;
  obs?: string;
  criado_por?: string;
  criado_em?: string;
  atualizado_em?: string;
}

export type RotaOpticaInput = Omit<RotaOptica, "id" | "criado_em" | "atualizado_em" | "tronco" | "orfa">;

// =====================
// Cálculo de potência ao longo da rota
// =====================
export interface CalculoPotencia {
  auto: boolean;
  /** Atenuação da fibra (dB/km) */
  atenuacao_db_km: number;
  /** Perda por fusão (dB) */
  emenda_db: number;
  /** Perda por conector (dB) */
  conector_db: number;
  /** Reserva técnica de cabo em cada lado de CTO/CEO/CT/HUB (m) */
  reserva_caixa_m?: number;
  /** Reserva técnica de cabo na CDOI (m) — local pequeno */
  reserva_cdoi_m?: number;
}

export const CALCULO_PADRAO: CalculoPotencia = { auto: true, atenuacao_db_km: 0.35, emenda_db: 0.1, conector_db: 0.5, reserva_caixa_m: 15, reserva_cdoi_m: 2 };

/** Reserva técnica de cabo que fica numa caixa, de um lado (o cabo que chega ou o que sai) */
export function reservaTecnica(tipo: TipoElementoRota, c: Partial<CalculoPotencia> = CALCULO_PADRAO): number {
  if (tipo === "cto" || tipo === "ceo" || tipo === "ct" || tipo === "hub") return c.reserva_caixa_m ?? 15;
  if (tipo === "cdoi") return c.reserva_cdoi_m ?? 2;
  return 0;
}

/**
 * Reserva de um trecho de cabo (da caixa anterior até esta): a sobra na saída da anterior + a sobra na chegada desta.
 * Assim uma caixa no meio fica com 15 + 15 = 30 m e a caixa da ponta só com os 15 m do cabo que chega.
 */
export function reservaTrecho(tipoAnterior: TipoElementoRota | undefined, tipo: TipoElementoRota, c: Partial<CalculoPotencia> = CALCULO_PADRAO): number {
  return (tipoAnterior ? reservaTecnica(tipoAnterior, c) : 0) + reservaTecnica(tipo, c);
}

/** Perda típica de splitter balanceado (dB) */
export const PERDA_SPLITTER: Record<string, number> = { "1:2": 3.7, "1:4": 7.3, "1:8": 10.5, "1:16": 13.7, "1:32": 17.1, "1:64": 20.5 };

export function perdaSplitter(relacao?: string, perdaModelo?: number): number {
  if (perdaModelo !== undefined) return perdaModelo;
  const m = relacao?.match(/1\s*:\s*(\d+)/);
  if (!m) return 0;
  return PERDA_SPLITTER[`1:${m[1]}`] ?? Math.round(10 * Math.log10(+m[1]) * 1.1 * 10) / 10;
}

export interface EntradaPotencia {
  tipo: TipoElementoRota;
  distancia_m?: number;
  splitter?: string;
  /** Perda do modelo de splitter cadastrado, se houver */
  perda_splitter?: number;
}

export interface PotenciaCalculada {
  entrada: number;
  saida: number;
  /** Explicação das perdas neste elemento */
  detalhe: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Potência em cada elemento, a partir da potência de saída da porta PON (tx):
 * chegada = saída do anterior − fibra (km × dB/km) − fusões/conectores do elemento;
 * saída = chegada − splitter (− conector de saída da CTO).
 * DIO: conector + fusão do pigtail; caixa de emenda/HUB/CTO: 1 fusão; cliente: 1 conector.
 */
export function calcularPotencias(elementos: EntradaPotencia[], tx: number, p: CalculoPotencia): PotenciaCalculada[] {
  const out: PotenciaCalculada[] = [];
  elementos.forEach((e, i) => {
    if (i === 0) {
      const spl = e.splitter ? perdaSplitter(e.splitter, e.perda_splitter) : 0;
      out.push({ entrada: r2(tx), saida: r2(tx - spl), detalhe: `porta PON ${fmt(tx)} dBm` });
      return;
    }
    const ant = out[i - 1].saida;
    const fibra = ((e.distancia_m ?? 0) / 1000) * p.atenuacao_db_km;
    let local = 0;
    const partes = [`fibra ${fmt(fibra)} dB`];
    if (e.tipo === "dio") { local = p.conector_db + p.emenda_db; partes.push(`conector + fusão ${fmt(local)} dB`); }
    else if (e.tipo === "onu") { local = p.conector_db; partes.push(`conector ${fmt(local)} dB`); }
    else if (e.tipo === "predio") { local = 0; partes.push("entrada do prédio (sem perda)"); }
    else { local = p.emenda_db; partes.push(`fusão ${fmt(local)} dB`); }
    const entrada = ant - fibra - local;
    let saida = entrada;
    if (e.splitter) {
      const spl = perdaSplitter(e.splitter, e.perda_splitter);
      saida -= spl;
      partes.push(`splitter ${e.splitter} ${fmt(spl)} dB`);
      if (e.tipo === "cto" || e.tipo === "cdoi") { saida -= p.conector_db; partes.push(`conector de saída ${fmt(p.conector_db)} dB`); }
    }
    out.push({ entrada: r2(entrada), saida: r2(saida), detalhe: partes.join(" + ") });
  });
  return out;
}

// =====================
// Cores de fibra (ABNT, sequência de 12 cores)
// =====================
const CORES_FIBRA: [string, string][] = [
  ["Verde", "#2e9e4f"],
  ["Amarelo", "#f2c200"],
  ["Branco", "#f4f4f0"],
  ["Azul", "#1f6fd1"],
  ["Vermelho", "#d6322f"],
  ["Lilás", "#b48ae6"],
  ["Marrom", "#7a4a2a"],
  ["Rosa", "#ee86b0"],
  ["Preto", "#222222"],
  ["Cinza", "#8a949b"],
  ["Laranja", "#f08a1c"],
  ["Aqua", "#20bdc9"],
];

// =====================
// Tubos: depende da capacidade do cabo (padrão do GeoGrid)
//   até 12 fibras → 1 tubo só (cores 1..12)
//   24 a 72 fibras → tubos de 6 fibras (24 = 4 tubos, 48 = 8, 72 = 12), cores verde→lilás em cada tubo
//   acima de 72 → tubos de 12 fibras
// O tubo também segue a sequência de cores (tubo 1 verde, 2 amarelo, 3 branco, 4 azul...).
// =====================
export function fibrasPorTubo(capacidade: number): number {
  if (capacidade <= 12) return 12;
  if (capacidade <= 72) return 6;
  return 12;
}

const CAPACIDADES_PADRAO = [2, 4, 6, 12, 24, 36, 48, 72, 96, 144, 288];

/** Menor capacidade padrão que comporta a fibra. */
export function capacidadeMinima(fibra: number): number {
  return CAPACIDADES_PADRAO.find((c) => c >= fibra) ?? Math.ceil(fibra / 12) * 12;
}

function chaveNomeCabo(nome: string): string {
  const cod = nome.match(/\[(CB-\d{6})\]/) ?? nome.trim().match(/^(CB-\d{6})$/);
  if (cod) return cod[1];
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Capacidade conhecida de cada cabo (cadastrada ou estimada pelas rotas); preenchida pela tela. */
const capacidadesCabos = new Map<string, number>();
/** Fibras por tubo vindas do tipo de cabo cadastrado (quando foge do padrão). */
const tubosCabos = new Map<string, number>();

export function registrarCapacidadesCabos(capacidades: Map<string, number>, fibrasTubo?: Map<string, number>): void {
  capacidadesCabos.clear();
  capacidades.forEach((v, k) => capacidadesCabos.set(chaveNomeCabo(k), v));
  tubosCabos.clear();
  fibrasTubo?.forEach((v, k) => tubosCabos.set(chaveNomeCabo(k), v));
}

/** Capacidade cadastrada para o cabo (pelo nome), se houver */
export function capacidadeRegistrada(cabo: string | undefined): number | undefined {
  return cabo ? capacidadesCabos.get(chaveNomeCabo(cabo)) : undefined;
}

export function capacidadeDoCabo(cabo: string | undefined, fibra: number): number {
  const c = cabo ? capacidadesCabos.get(chaveNomeCabo(cabo)) : undefined;
  return c && c >= fibra ? c : capacidadeMinima(fibra);
}

export interface InfoFibra {
  nome: string;
  hex: string;
  tubo?: number;
  posicao?: number;
  corTubo?: { nome: string; hex: string };
  /** "T6 F33" */
  rotulo: string;
}

/** Cor e tubo de uma fibra conhecendo a capacidade do cabo. */
export function corFibraPorCapacidade(fibra: number | undefined, capacidade: number, fibrasTubo?: number): InfoFibra {
  if (!fibra || fibra < 1) return { nome: "sem cor", hex: "#7c8a90", rotulo: "" };
  const porTubo = fibrasTubo && fibrasTubo > 0 ? fibrasTubo : fibrasPorTubo(capacidade);
  const tubo = Math.ceil(fibra / porTubo);
  const posicao = ((fibra - 1) % porTubo) + 1;
  const [nome, hex] = CORES_FIBRA[(posicao - 1) % 12];
  const [nomeTubo, hexTubo] = CORES_FIBRA[(tubo - 1) % 12];
  return {
    nome,
    hex,
    tubo,
    posicao,
    corTubo: { nome: nomeTubo, hex: hexTubo },
    rotulo: `T${tubo} F${String(fibra).padStart(2, "0")}`,
  };
}

/** Cor e tubo da fibra num cabo (usa a capacidade cadastrada/estimada do cabo). */
export function corFibra(fibra?: number, cabo?: string): InfoFibra {
  if (!fibra || fibra < 1) return { nome: "sem cor", hex: "#7c8a90", rotulo: "" };
  const cap = capacidadeDoCabo(cabo, fibra);
  const t = cabo ? tubosCabos.get(chaveNomeCabo(cabo)) : undefined;
  return corFibraPorCapacidade(fibra, cap, t && cap >= fibra ? t : undefined);
}

/** KML usa aabbggrr; devolve #rrggbb. */
export function kmlColorToHex(kml?: string | null): string | undefined {
  if (!kml) return undefined;
  const c = kml.trim();
  if (!/^[0-9a-fA-F]{8}$/.test(c)) return undefined;
  return `#${c.slice(6, 8)}${c.slice(4, 6)}${c.slice(2, 4)}`.toLowerCase();
}

// =====================
// Leitura do KML "Rota da fibra" exportado do GeoGrid
// =====================

interface EntradaDescricao {
  rotulo: string;
  tipo: "Porta" | "Fibra";
  numero: number;
  lado: string; // "A", "B", "Entrada", "Saída"
  potencia?: number;
  comprimento?: number;
}

function num(v: string): number | undefined {
  const n = parseFloat(v.replace(",", "."));
  return isFinite(n) ? n : undefined;
}

/** Lê o texto da descrição de um ponto do GeoGrid em entradas (cabo/porta + potência + comprimento). */
export function parseDescricaoGeoGrid(texto: string): EntradaDescricao[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entradas: EntradaDescricao[] = [];
  for (const linha of linhas) {
    const m = linha.match(/^(.*?)\s*-\s*(Porta|Fibra):\s*(\d+)\s*\(([^)]+)\)\s*$/i);
    if (m) {
      entradas.push({
        rotulo: m[1].trim(),
        tipo: m[2].toLowerCase() === "porta" ? "Porta" : "Fibra",
        numero: parseInt(m[3], 10),
        lado: m[4].trim(),
      });
      continue;
    }
    const atual = entradas[entradas.length - 1];
    if (!atual) continue;
    const pot = linha.match(/Pot[êe]ncia:\s*(-?[\d.,]+)\s*dBm/i);
    if (pot) { atual.potencia = num(pot[1]); continue; }
    const comp = linha.match(/Comp\.?\s*at[ée]:\s*([\d.,]+)\s*m/i);
    if (comp) atual.comprimento = num(comp[1]);
  }
  return entradas;
}

export function detectarTipoElemento(nome: string): TipoElementoRota {
  const n = nome.trim().toUpperCase();
  if (n.startsWith("OLT")) return "olt";
  if (n.startsWith("DIO")) return "dio";
  if (n.startsWith("HUB")) return "hub";
  if (n.startsWith("CDOI")) return "cdoi";
  if (n.startsWith("CTO")) return "cto";
  if (/^CT\b/.test(n) || n.includes("TRANSPORTE")) return "ct";
  if (n.startsWith("CE ") || n.startsWith("CEO") || n.includes("EMENDA")) return "ceo";
  if (n.startsWith("ONU") || n.startsWith("CLIENTE")) return "onu";
  return "outro";
}

function limparNomePonto(nome: string): { nome: string; codigo?: string; ordem?: number } {
  let resto = nome.trim();
  let ordem: number | undefined;
  const mOrdem = resto.match(/\((\d+)\)\s*$/);
  if (mOrdem) { ordem = parseInt(mOrdem[1], 10); resto = resto.slice(0, mOrdem.index).trim(); }
  let codigo: string | undefined;
  const mCod = resto.match(/\((PT\d+|ES\d+)\)\s*$/i);
  if (mCod) { codigo = mCod[1].toUpperCase(); resto = resto.slice(0, mCod.index).trim(); }
  return { nome: resto.replace(/\s+/g, " "), codigo, ordem };
}

function coordsDe(el: Element | null): { lat: number; lon: number }[] {
  const txt = el?.querySelector("coordinates")?.textContent?.trim();
  if (!txt) return [];
  const pts: { lat: number; lon: number }[] = [];
  for (const par of txt.split(/\s+/)) {
    const [lonS, latS] = par.split(",");
    const lat = parseFloat(latS);
    const lon = parseFloat(lonS);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const ult = pts[pts.length - 1];
    if (ult && ult.lat === lat && ult.lon === lon) continue; // GeoGrid repete vértices
    pts.push({ lat, lon });
  }
  return pts;
}

/**
 * Converte o KML "Rota da fibra" do GeoGrid numa rota:
 * - cada Point vira um elemento (na ordem do número entre parênteses no fim do nome);
 * - cada LineString com nome de cabo vira um trecho no mapa (o "Rota" geral é ignorado).
 */
export function parseGeoGridKml(kmlText: string): { elementos: ElementoRota[]; trechos: TrechoCabo[]; nomeSugerido: string } {
  const doc = new DOMParser().parseFromString(kmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Arquivo KML inválido.");

  // Estilos: id -> cor
  const cores: Record<string, string> = {};
  doc.querySelectorAll("Style").forEach((s) => {
    const id = s.getAttribute("id");
    const cor = kmlColorToHex(s.querySelector("LineStyle > color")?.textContent);
    if (id && cor) cores[id] = cor;
  });

  const trechos: TrechoCabo[] = [];
  const pontos: (ElementoRota & { _ordem: number })[] = [];
  let seq = 0;

  doc.querySelectorAll("Placemark").forEach((pm) => {
    const nomeBruto = pm.querySelector("name")?.textContent?.trim() ?? "";
    const line = pm.querySelector("LineString");
    if (line) {
      if (/^rota$/i.test(nomeBruto)) return;
      const estilo = pm.querySelector("styleUrl")?.textContent?.replace("#", "").trim() ?? "";
      const pts = coordsDe(line);
      if (pts.length >= 2) trechos.push({ nome: nomeBruto || "Cabo", cor: cores[estilo], pontos: pts });
      return;
    }
    const point = pm.querySelector("Point");
    if (!point) return;
    const [coord] = coordsDe(point);
    const { nome, codigo, ordem } = limparNomePonto(nomeBruto);
    const entradas = parseDescricaoGeoGrid(pm.querySelector("description")?.textContent ?? "");

    const fibras = entradas.filter((e) => e.tipo === "Fibra");
    const portas = entradas.filter((e) => e.tipo === "Porta");
    const chegada = fibras.find((e) => e.lado.toUpperCase() === "B");
    const saida = [...fibras].reverse().find((e) => e.lado.toUpperCase() === "A");
    const primeira = entradas[0];
    const ultima = entradas[entradas.length - 1];

    const el: ElementoRota & { _ordem: number } = {
      // O ponto de origem (OLT) vem sem número de ordem e sem fibra de chegada: vai para o início.
      _ordem: ordem ?? (chegada ? 1000 + seq++ : -1),
      nome,
      tipo: detectarTipoElemento(nome),
      codigo,
      lat: coord?.lat,
      lon: coord?.lon,
      cabo_entrada: chegada?.rotulo,
      fibra_entrada: chegada?.numero,
      cabo_saida: saida?.rotulo,
      fibra_saida: saida?.numero,
      porta: portas.length ? portas.map((p) => `${p.rotulo} - Porta ${p.numero} (${p.lado})`).join(" · ") : undefined,
      distancia_m: chegada?.comprimento,
      potencia_entrada: primeira?.potencia,
      potencia_saida: ultima?.potencia,
    };
    pontos.push(el);
  });

  pontos.sort((a, b) => a._ordem - b._ordem);
  const elementos: ElementoRota[] = pontos.map(({ _ordem, ...e }) => { void _ordem; return e; });
  if (!elementos.length) throw new Error("Nenhum ponto encontrado no KML. Use o arquivo \"Rota da fibra\" exportado do GeoGrid.");

  const ultimo = elementos[elementos.length - 1];
  const nomeSugerido = `${elementos[0].nome} → ${ultimo.nome}`;
  return { elementos, trechos, nomeSugerido };
}

// =====================
// Cálculos
// =====================
export interface ResumoRota {
  distancia_m: number;
  potencia_inicial?: number;
  potencia_final?: number;
  perda_db?: number;
  emendas: number;
  hubs: number;
  ctos: number;
  cabos: string[];
}

export function resumoRota(elementos: ElementoRota[]): ResumoRota {
  const distancia_m = elementos.reduce((s, e) => s + (e.distancia_m ?? 0), 0);
  const comPot = elementos.filter((e) => e.potencia_saida !== undefined || e.potencia_entrada !== undefined);
  // No primeiro elemento (OLT) vale a potência de saída da porta, que é a primeira lida.
  const potencia_inicial = comPot[0]?.potencia_entrada ?? comPot[0]?.potencia_saida;
  const fim = comPot[comPot.length - 1];
  const potencia_final = fim?.potencia_saida ?? fim?.potencia_entrada;
  const perda_db =
    potencia_inicial !== undefined && potencia_final !== undefined && comPot.length > 1
      ? Math.round((potencia_inicial - potencia_final) * 100) / 100
      : undefined;
  const cabos: string[] = [];
  for (const e of elementos) {
    for (const c of [e.cabo_entrada, e.cabo_saida]) if (c && !cabos.includes(c)) cabos.push(c);
  }
  return {
    distancia_m,
    potencia_inicial,
    potencia_final,
    perda_db,
    emendas: elementos.filter((e) => e.tipo === "ceo").length,
    hubs: elementos.filter((e) => e.tipo === "hub").length,
    ctos: elementos.filter((e) => e.tipo === "cto" || e.tipo === "cdoi" || /\/\s*CTO/i.test(e.nome)).length,
    cabos,
  };
}

/** Medidas da Rota Óptica sempre em metros (o técnico mede em metros): "1.131 m" */
export function formatMetros(m: number): string {
  return `${Math.round(m).toLocaleString("pt-BR")} m`;
}

export function formatDbm(v?: number): string {
  return v === undefined ? "—" : `${v.toFixed(2).replace(".", ",")} dBm`;
}

/** Texto de busca: nome da rota + todos os elementos e cabos. */
export function textoBuscaRota(r: Pick<RotaOptica, "nome" | "elementos">): string {
  return [r.nome, ...r.elementos.flatMap((e) => [e.nome, e.codigo, e.cabo_entrada, e.cabo_saida, e.porta])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// =====================
// Firestore (coleção rotas_opticas)
// =====================
const COLECAO = "rotas_opticas";

/** Firestore não aceita undefined: remove chaves vazias recursivamente. */
function semUndefined<T>(v: T): T {
  if (Array.isArray(v)) return v.map(semUndefined) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined || (typeof val === "number" && !isFinite(val))) continue;
      out[k] = semUndefined(val);
    }
    return out as T;
  }
  return v;
}

function isoDe(v: unknown): string | undefined {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof v === "string" ? v : undefined;
}

export async function listarRotas(): Promise<RotaOptica[]> {
  const { collection, getDocs } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const snap = await getDocs(collection(db, COLECAO));
  const rotas = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      nome: data.nome ?? "Rota sem nome",
      origem: data.origem ?? "manual",
      elementos: data.elementos ?? [],
      trechos: data.trechos ?? [],
      calculo_potencia: data.calculo_potencia,
      ...(data.pai ? { pai: data.pai } : {}),
      obs: data.obs,
      criado_por: data.criado_por,
      criado_em: isoDe(data.criado_em),
      atualizado_em: isoDe(data.atualizado_em),
    } as RotaOptica;
  });
  return rotas.sort((a, b) => (b.atualizado_em ?? "").localeCompare(a.atualizado_em ?? ""));
}

export async function criarRota(rota: RotaOpticaInput): Promise<string> {
  const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const ref = await addDoc(collection(db, COLECAO), {
    ...semUndefined(rota),
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  });
  return ref.id;
}

export async function atualizarRota(id: string, rota: RotaOpticaInput): Promise<void> {
  const { doc, updateDoc, serverTimestamp, deleteField } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const { criado_por, tronco, orfa, ...resto } = rota as RotaOptica;
  void criado_por; void tronco; void orfa;
  await updateDoc(doc(db, COLECAO, id), { ...semUndefined(resto), ...(resto.pai ? {} : { pai: deleteField() }), atualizado_em: serverTimestamp() });
}

export async function excluirRota(id: string): Promise<void> {
  const { doc, deleteDoc } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  await deleteDoc(doc(db, COLECAO, id));
}
