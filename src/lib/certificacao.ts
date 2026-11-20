// =====================
// Certificação de rota (OTDR): os eventos que o OTDR deve mostrar ao longo da rota, com a perda
// esperada e o limite de cada um, para comparar com o que foi medido em campo.
// Padrões: fusão ≤ 0,10 dB · conector ≤ 0,50 dB · splitter até +0,5 dB do nominal · distância ±2%.
// =====================
import { CALCULO_PADRAO, type ElementoRota, type RotaOptica } from "./rotaOptica";
import { acumuladoDaRota } from "./rompimento";
import { entradaPotencia } from "./subRotas";
import type { ResultadoRompimento, Sentido } from "./rompimento";

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

// =====================
// Leitura do OTDR → onde fica cada evento na rota e o que precisa de visita
// =====================

export interface LeituraOtdr {
  /** distância do evento a partir do OTDR (m) */
  distancia: number;
  /** perda do evento (Event-L, dB) */
  perda?: number;
  /** é o fim da fibra (último evento) */
  fim?: boolean;
}

export interface AnaliseEvento {
  leitura: LeituraOtdr;
  situacao: Situacao;
  /** onde fica, em texto para o técnico */
  onde: string;
  /** detalhe: o que era esperado e o que olhar */
  detalhe: string;
  /** evento esperado que bateu (caixa) */
  esperado?: EventoOtdr;
  /** localização na rota (quando caiu fora de caixa) */
  local?: ResultadoRompimento;
}

/** Tolerância de distância para casar a leitura com uma caixa */
export function toleranciaCasamento(d: number): number {
  return Math.max(10, d * TOLERANCIA.distanciaPct);
}

export function analisarLeitura(
  rota: RotaOptica,
  esperados: EventoOtdr[],
  leituras: LeituraOtdr[],
  localizar: (d: number) => ResultadoRompimento,
  nomeCurto: (s: string) => string
): AnaliseEvento[] {
  const els = rota.elementos;
  const fimEsp = esperados[esperados.length - 1];
  const nome = (i?: number) => (i !== undefined ? nomeCurto(els[i]?.nome ?? "") : "?");
  const descreverLocal = (l: ResultadoRompimento): string => {
    if (l.tipo === "reserva") return `Na reserva técnica da ${nome(l.reservaDe)}`;
    if (l.tipo === "tracado") return `No cabo entre ${nome(l.depoisDe)} e ${nome(l.antesDe)}, ≈ ${Math.round(l.metrosDepois ?? 0)} m depois da ${nome(l.depoisDe)}`;
    if (l.tipo === "alem") return `Depois do fim da rota (${Math.round(l.sobra ?? 0)} m além da ${nome(l.depoisDe)})`;
    return "Antes do início da rota";
  };
  return leituras.map((lt) => {
    const tol = toleranciaCasamento(lt.distancia);
    if (lt.fim) {
      const dif = lt.distancia - fimEsp.distancia;
      if (Math.abs(dif) <= tol) {
        return { leitura: lt, situacao: "ok", esperado: fimEsp, onde: `Fim da fibra na ${nome(fimEsp.i)}`, detalhe: `Comprimento esperado ${fimEsp.distancia} m: confere.` };
      }
      const local = localizar(lt.distancia);
      if (dif < 0) {
        return {
          leitura: lt, situacao: "fora", local, onde: descreverLocal(local),
          detalhe: `A fibra termina ${Math.round(-dif)} m antes do esperado (${fimEsp.distancia} m): provável rompimento ou conector aberto neste ponto.`,
        };
      }
      return {
        leitura: lt, situacao: "atencao", local, onde: `Fim ${Math.round(dif)} m depois da ${nome(fimEsp.i)}`,
        detalhe: "A fibra vai além do fim cadastrado: metragem da rota curta no cadastro, ou a fibra segue (drop / outra caixa).",
      };
    }
    // casa com a caixa mais próxima dentro da tolerância
    let melhor: EventoOtdr | undefined;
    for (const e of esperados) {
      const dif = Math.abs(e.distancia - lt.distancia);
      if (dif <= tol && (!melhor || dif < Math.abs(melhor.distancia - lt.distancia))) melhor = e;
    }
    if (melhor) {
      const s = lt.perda !== undefined ? situacaoPerda(lt.perda, melhor.limite) : "ok";
      const caixa = melhor.tipo === "lancamento" ? `Conector de lançamento (${nome(melhor.i)})` : `Na caixa ${nome(melhor.i)}`;
      return {
        leitura: lt, situacao: s, esperado: melhor, onde: caixa,
        detalhe:
          s === "ok"
            ? `${melhor.rotulo}: perda dentro do esperado (máx. ${melhor.limite.toFixed(2).replace(".", ",")} dB).`
            : `${melhor.rotulo}: esperado até ${melhor.limite.toFixed(2).replace(".", ",")} dB. Refazer a fusão / limpar ou trocar o conector nesta caixa.`,
      };
    }
    // fora de caixa: em que trecho / reserva caiu
    const local = localizar(lt.distancia);
    const p = lt.perda ?? 0;
    const s: Situacao = p <= 0.05 ? "ok" : p <= TOLERANCIA.fusao ? "atencao" : "fora";
    return {
      leitura: lt, situacao: s, local, onde: descreverLocal(local),
      detalhe:
        local.tipo === "reserva"
          ? `Evento sem caixa esperada, dentro do rolo de reserva: ${p ? `perda de ${p.toFixed(2).replace(".", ",")} dB, ` : ""}provável curvatura apertada no rolo.`
          : s === "ok"
            ? "Evento pequeno fora de caixa (sem perda relevante)."
            : `Perda de ${p.toFixed(2).replace(".", ",")} dB fora de caixa: verificar curvatura, cabo amassado/danificado ou emenda não cadastrada.`,
    };
  });
}
