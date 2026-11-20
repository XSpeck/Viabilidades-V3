// =====================
// Certificação de rota (OTDR): os eventos que o OTDR deve mostrar ao longo da rota, com a perda
// esperada e o limite de cada um, para comparar com o que foi medido em campo.
// Padrões: fusão ≤ 0,10 dB · conector ≤ 0,50 dB · splitter até +0,5 dB do nominal · distância ±2%.
// =====================
import { CALCULO_PADRAO, type ElementoRota, type RotaOptica } from "./rotaOptica";
import { acumuladoDaRota } from "./rompimento";
import { entradaPotencia } from "./subRotas";
import type { Sentido } from "./rompimento";

export type Lambda = 1310 | 1550;

/** Atenuação típica da fibra monomodo (dB/km) */
export const ATENUACAO: Record<Lambda, number> = { 1310: 0.35, 1550: 0.25 };

export const TOLERANCIA = { fusao: 0.1, conector: 0.5, splitterExtra: 0.5, distanciaPct: 0.02, distanciaMin: 5 };

export type TipoEvento = "lancamento" | "conector" | "fusao" | "splitter" | "fim";

export interface EventoOtdr {
  /** índice do elemento na rota */
  i: number;
  elemento: ElementoRota;
  /** distância a partir do OTDR (m) */
  distancia: number;
  tipo: TipoEvento;
  /** o que é: "Fusão", "Splitter 1:8 + fusão", "Conector + fusão (DIO)"… */
  rotulo: string;
  /** perda esperada do evento (dB) */
  esperado: number;
  /** perda máxima aceita (dB) */
  limite: number;
  /** perda da fibra desde o evento anterior (dB) */
  fibra: number;
  /** perda total esperada até depois deste evento (dB) */
  acumulado: number;
  /** perda máxima aceita até depois deste evento (dB) */
  acumuladoLimite: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function perdaDoEvento(e: ElementoRota, ultimo: boolean, perdaModelo?: (id?: string) => number | undefined) {
  const c = CALCULO_PADRAO;
  const fus = c.emenda_db;
  const con = c.conector_db;
  if (e.tipo === "olt") return { tipo: "conector" as TipoEvento, rotulo: "Conector (OLT)", esperado: con, limite: TOLERANCIA.conector };
  if (e.tipo === "dio") return { tipo: "conector" as TipoEvento, rotulo: "Conector + fusão (DIO)", esperado: con + fus, limite: TOLERANCIA.conector + TOLERANCIA.fusao };
  if (e.tipo === "onu") return { tipo: "fim" as TipoEvento, rotulo: "Conector (cliente)", esperado: con, limite: TOLERANCIA.conector };
  const ent = entradaPotencia(e, perdaModelo);
  const spl = ent.perda_splitter ?? 0;
  if (spl > 0) {
    // CTO e CDOI: conector na saída do splitter
    const conSaida = e.tipo === "cto" || e.tipo === "cdoi" ? con : 0;
    return {
      tipo: "splitter" as TipoEvento,
      rotulo: `Splitter ${ent.splitter ?? ""} + fusão${conSaida ? " + conector" : ""}`,
      esperado: fus + spl + conSaida,
      limite: TOLERANCIA.fusao + spl + TOLERANCIA.splitterExtra + (conSaida ? TOLERANCIA.conector : 0),
    };
  }
  return {
    tipo: (ultimo ? "fim" : "fusao") as TipoEvento,
    rotulo: e.passagem ? "Fusão (passagem)" : ultimo ? "Fusão (fim da rota)" : "Fusão",
    esperado: fus,
    limite: TOLERANCIA.fusao,
  };
}

/** Eventos esperados a partir da caixa onde o OTDR está ligado, no sentido escolhido */
export function eventosEsperados(
  rota: RotaOptica,
  ref: number,
  sentido: Sentido,
  lambda: Lambda,
  perdaModelo?: (id?: string) => number | undefined
): EventoOtdr[] {
  const acc = acumuladoDaRota(rota);
  const aten = ATENUACAO[lambda] / 1000;
  const els = rota.elementos;
  const ordem: number[] = [];
  if (sentido === "ponta") for (let j = ref + 1; j < els.length; j++) ordem.push(j);
  else for (let j = ref - 1; j >= 0; j--) ordem.push(j);

  const out: EventoOtdr[] = [];
  // conector de lançamento (OTDR na porta da caixa)
  const lanc = TOLERANCIA.conector;
  let acum = CALCULO_PADRAO.conector_db;
  let acumLim = lanc;
  out.push({
    i: ref, elemento: els[ref], distancia: 0, tipo: "lancamento", rotulo: "Conector de lançamento (OTDR)",
    esperado: CALCULO_PADRAO.conector_db, limite: lanc, fibra: 0, acumulado: r2(acum), acumuladoLimite: r2(acumLim),
  });
  let anterior = 0;
  ordem.forEach((j, k) => {
    const d = Math.abs(acc[j] - acc[ref]);
    const fibra = (d - anterior) * aten;
    anterior = d;
    const p = perdaDoEvento(els[j], k === ordem.length - 1, perdaModelo);
    acum += fibra + p.esperado;
    acumLim += fibra + p.limite;
    out.push({ i: j, elemento: els[j], distancia: Math.round(d), ...p, esperado: r2(p.esperado), limite: r2(p.limite), fibra: r2(fibra), acumulado: r2(acum), acumuladoLimite: r2(acumLim) });
  });
  return out;
}

export type Situacao = "ok" | "atencao" | "fora";

/** Perda medida × limite do evento */
export function situacaoPerda(medido: number, limite: number): Situacao {
  if (medido <= limite + 0.005) return "ok";
  if (medido <= limite + 0.15) return "atencao";
  return "fora";
}

/** Distância medida × esperada (±2%, no mínimo 5 m) */
export function situacaoDistancia(medido: number, esperado: number): Situacao {
  const tol = Math.max(TOLERANCIA.distanciaMin, esperado * TOLERANCIA.distanciaPct);
  const dif = Math.abs(medido - esperado);
  if (dif <= tol) return "ok";
  if (dif <= tol * 2) return "atencao";
  return "fora";
}

/** Perda total medida × limite total */
export function situacaoTotal(medido: number, limiteTotal: number): Situacao {
  if (medido <= limiteTotal + 0.005) return "ok";
  if (medido <= limiteTotal + 0.5) return "atencao";
  return "fora";
}
