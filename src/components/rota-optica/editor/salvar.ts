// =====================
// Editor de rota: o que acontece ao salvar e que não depende da tela —
// códigos dos cabos, elemento gravado a partir da linha e comparação com o que já está gravado.
// =====================
import type { ElementoRota, RotaOptica } from "@/lib/rotaOptica";
import { chaveCabo, codigoDoCabo, comCodigo, normalizar, proximoCodigoCabo, semCodigo, type CaboRede } from "@/lib/cabosRede";
import { n, parseCoords, type Linha } from "./linhas";

/**
 * Todo cabo ganha um código fixo (CB-000123) no fim do nome: é a etiqueta que o técnico põe no cabo real.
 * Cabo com o mesmo nome já codificado em outra rota reaproveita o código.
 */
export function garantirCodigosCabos(
  linhas: Linha[],
  { rede, salvos, cabos, tiposCabo }: { rede: RotaOptica[]; salvos: ElementoRota[]; cabos: CaboRede[]; tiposCabo: Record<string, string> }
): { ls: Linha[]; tc: Record<string, string> } {
  const todos = [
    ...rede.flatMap((r) => r.elementos.flatMap((e) => [e.cabo_entrada ?? "", e.cabo_saida ?? ""])),
    ...linhas.map((l) => l.cabo_entrada),
    ...salvos.map((e) => e.cabo_entrada ?? ""),
    ...cabos.map((c) => c.chave),
  ];
  const porNome = new Map<string, string>();
  const anotar = (nm?: string) => {
    const c = codigoDoCabo(nm);
    if (c && nm) porNome.set(normalizar(semCodigo(nm)), c);
  };
  rede.forEach((r) => r.elementos.forEach((e) => anotar(e.cabo_entrada)));
  salvos.forEach((e) => anotar(e.cabo_entrada));
  linhas.forEach((l) => anotar(l.cabo_entrada));
  let extra = 0;
  const tc = { ...tiposCabo };
  const ls = linhas.map((l, i) => {
    const nm = l.cabo_entrada.trim();
    // a OLT não tem cabo de chegada; cordão da estação não leva etiqueta de cabo
    if (i === 0 || !nm || codigoDoCabo(nm) || /^Cordão /i.test(nm)) return l;
    const base = normalizar(nm);
    let cod = porNome.get(base);
    if (!cod) {
      cod = proximoCodigoCabo(todos, extra++);
      porNome.set(base, cod);
    }
    const tAnt = tiposCabo[chaveCabo(nm)];
    if (tAnt && !tc[cod]) tc[cod] = tAnt;
    return { ...l, cabo_entrada: comCodigo(nm, cod) };
  });
  return { ls, tc };
}

/** Elemento gravado a partir da linha do formulário (a saída é a chegada do próximo) */
export function elementoDaLinha(
  ls: Linha[],
  i: number,
  { pots, viaMeiaPorta, troncoEf }: { pots: { entrada: number; saida: number }[] | null; viaMeiaPorta: boolean; troncoEf: number }
): ElementoRota {
  const l = ls[i];
  const c = parseCoords(l.coords);
  // Saída de um elemento = chegada do próximo (quando informada)
  const prox = ls[i + 1];
  const caboSaida = prox?.cabo_entrada.trim() || l.cabo_saida.trim();
  const fibraSaida = prox && n(prox.fibra_entrada) !== undefined ? n(prox.fibra_entrada) : n(l.fibra_saida);
  return {
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
    meia_porta: l.tipo === "hub" && l.meiaPorta && !l.passagem ? true : undefined,
    via_meia_porta: viaMeiaPorta && i === troncoEf - 1 ? true : undefined,
    mesmo_poste: i > 0 && l.mesmoPoste ? true : undefined,
    equipamento_id: l.tipo === "olt" || l.tipo === "dio" ? l.equipamento_id || undefined : undefined,
    porta: l.porta.trim() || undefined,
    lat: c.lat,
    lon: c.lon,
    obs: l.obs.trim() || undefined,
  };
}

/** Texto comparável de um elemento (sem o que depende dos vizinhos ou da potência) */
export function comparavel(e?: ElementoRota): string {
  if (!e) return "";
  const { cabo_saida, fibra_saida, potencia_entrada, potencia_saida, ...resto } = e;
  void cabo_saida; void fibra_saida; void potencia_entrada; void potencia_saida;
  return JSON.stringify(Object.entries(resto).filter(([, v]) => v !== undefined && v !== "").sort(([a], [b]) => a.localeCompare(b)));
}
