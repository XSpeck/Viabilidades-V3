// =====================
// Potência nas portas de atendimento de uma caixa com um ou mais splitters (CTO em níveis).
// =====================
import { CALCULO_PADRAO, perdaSplitter } from "./rotaOptica";
import { portasFinais, type SplitterCaixa } from "./caixasRede";

export interface FibraQueChega {
  cabo: string;
  fibra: number;
  pot?: number;
}

/** Potência (dBm) em cada porta final, já com o conector. Chave: "idSplitter|porta". */
export function potenciaPortasFinais(
  spls: SplitterCaixa[],
  entradas: FibraQueChega[],
  perdaModelo: (modeloId?: string) => number | undefined,
  potPadrao?: number,
): Map<string, number> {
  const perda = (s: SplitterCaixa) => perdaSplitter(s.relacao, perdaModelo(s.modelo_id));
  const potEntrada = (s: SplitterCaixa, prof = 0): number | undefined => {
    if (prof > 8) return undefined;
    if (s.entrada.fibra) {
      const f = s.entrada.fibra;
      return entradas.find((x) => x.cabo === f.cabo && x.fibra === f.fibra)?.pot ?? potPadrao;
    }
    if (s.entrada.splitter) {
      const pai = spls.find((x) => x.id === s.entrada.splitter!.id);
      const p = pai ? potEntrada(pai, prof + 1) : undefined;
      return p !== undefined && pai ? p - perda(pai) : undefined;
    }
    return undefined;
  };
  const m = new Map<string, number>();
  for (const f of portasFinais(spls)) {
    const p = potEntrada(f.spl);
    if (p !== undefined) m.set(`${f.spl.id}|${f.porta.numero}`, p - perda(f.spl) - CALCULO_PADRAO.conector_db);
  }
  return m;
}
