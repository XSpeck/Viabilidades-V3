import { lerColecao } from "./colecaoVersionada";
import { haversineDistance } from "./ctos";
import { plusCodeToCoords } from "./pluscode";
import { nomeSimilar } from "./nomePredio";

// As duas listas vêm da cópia local com versão (colecaoVersionada.ts)

export interface PredioEstruturado {
  id: string;
  predio_ftta: string;
  plus_code_cliente: string;
  tipo_instalacao: string;
  data_auditoria: string | undefined;
}

/** Mantido por compatibilidade: a cópia local já se invalida sozinha a cada gravação */
export function bustPrediosCache(): void {}

type Bruto = { id: string; condominio?: string; localizacao?: string; tecnologia?: string; observacao?: string; data_estruturacao?: string; data_registro?: string };

export async function getPrediosEstruturados(): Promise<PredioEstruturado[]> {
  const docs = await lerColecao<Bruto>("predios_atendidos");
  return docs.flatMap((raw) => (!raw.condominio || !raw.localizacao) ? [] : [{
    id: raw.id,
    predio_ftta: raw.condominio,
    plus_code_cliente: raw.localizacao,
    tipo_instalacao: raw.tecnologia ?? "Prédio",
    data_auditoria: raw.data_estruturacao,
  }]);
}

export interface PredioSemViab {
  id: string;
  predio_ftta: string;
  plus_code_cliente: string;
  tipo_instalacao: string;
  motivo_rejeicao: string | undefined;
  data_auditoria: string | undefined;
}

export async function getPrediosSemViab(): Promise<PredioSemViab[]> {
  const docs = await lerColecao<Bruto>("predios_sem_viabilidade");
  return docs.flatMap((raw) => (!raw.condominio || !raw.localizacao) ? [] : [{
    id: raw.id,
    predio_ftta: raw.condominio,
    plus_code_cliente: raw.localizacao,
    tipo_instalacao: "Prédio",
    motivo_rejeicao: raw.observacao,
    data_auditoria: raw.data_registro,
  }]);
}

// ─── Matching inteligente ──────────────────────────────────────────
// Nome com tolerância a erro de digitação mora em nomePredio.ts (testado).

/** Raio do aviso automático (local + nome parecido) */
export const RAIO_MATCH = { "Prédio": 50, "Condomínio": 150 } as const;
/** Raio das sugestões "perto daqui" */
export const RAIO_SUGESTAO = { "Prédio": 100, "Condomínio": 250 } as const;

/** Coordenadas já resolvidas de cada Plus Code (evita decodificar a lista toda a cada tecla) */
const _coords = new Map<string, { lat: number; lon: number } | null>();

async function resolverCoords(plusCode: string): Promise<{ lat: number; lon: number } | null> {
  if (_coords.has(plusCode)) return _coords.get(plusCode)!;
  let c: { lat: number; lon: number } | null = null;
  try { c = await plusCodeToCoords(plusCode); } catch { c = null; }
  _coords.set(plusCode, c);
  return c;
}

/** Registros com a distância até o ponto do cliente, do mais perto ao mais longe, até o raio */
async function comDistancia<T extends { plus_code_cliente: string }>(registros: T[], plusCode: string, raio: number) {
  const cliente = await resolverCoords(plusCode);
  if (!cliente) return [];
  const lista = await Promise.all(registros.map(async (r) => {
    const c = await resolverCoords(r.plus_code_cliente);
    return { registro: r, distancia: c ? haversineDistance(cliente.lat, cliente.lon, c.lat, c.lon) : Infinity };
  }));
  return lista.filter((x) => x.distancia <= raio).sort((a, b) => a.distancia - b.distancia);
}

// Genérico: o mais perto que esteja no raio E com nome parecido
async function findBestMatch<T extends { plus_code_cliente: string; predio_ftta: string }>(
  registros: T[],
  plusCode: string,
  nomePredio?: string,
  raio: number = RAIO_MATCH["Prédio"],
): Promise<{ registro: T; distancia: number; porNome: boolean; porProximidade: boolean } | null> {
  if (!registros.length || !nomePredio?.trim()) return null;
  const achado = (await comDistancia(registros, plusCode, raio)).find((x) => nomeSimilar(nomePredio, x.registro.predio_ftta));
  return achado ? { ...achado, porNome: true, porProximidade: true } : null;
}

export interface PredioPerto {
  nome: string;
  distancia: number;
  situacao: "atendido" | "sem_viabilidade";
  motivo?: string;
}

/** Prédios já atendidos ou recusados perto do ponto (para o atendente escolher com um clique) */
export async function prediosPerto(plusCode: string, raio: number, limite = 5): Promise<PredioPerto[]> {
  const [est, sem] = await Promise.all([getPrediosEstruturados(), getPrediosSemViab()]);
  const [a, b] = await Promise.all([comDistancia(est, plusCode, raio), comDistancia(sem, plusCode, raio)]);
  return [
    ...a.map((x) => ({ nome: x.registro.predio_ftta, distancia: x.distancia, situacao: "atendido" as const })),
    ...b.map((x) => ({ nome: x.registro.predio_ftta, distancia: x.distancia, situacao: "sem_viabilidade" as const, motivo: x.registro.motivo_rejeicao })),
  ].sort((x, y) => x.distancia - y.distancia).slice(0, limite);
}

export interface MatchPredio {
  predio: PredioEstruturado;
  distancia: number;
  porNome: boolean;
  porProximidade: boolean;
}

export interface MatchPredioSemViab {
  predio: PredioSemViab;
  distancia: number;
  porNome: boolean;
  porProximidade: boolean;
}

export async function findPredioEstruturado(plusCode: string, nomePredio?: string, raio?: number): Promise<MatchPredio | null> {
  const predios = await getPrediosEstruturados();
  const match = await findBestMatch(predios, plusCode, nomePredio, raio);
  if (!match) return null;
  return { predio: match.registro, distancia: match.distancia, porNome: match.porNome, porProximidade: match.porProximidade };
}

export async function findPredioSemViab(plusCode: string, nomePredio?: string, raio?: number): Promise<MatchPredioSemViab | null> {
  const predios = await getPrediosSemViab();
  const match = await findBestMatch(predios, plusCode, nomePredio, raio);
  if (!match) return null;
  return { predio: match.registro, distancia: match.distancia, porNome: match.porNome, porProximidade: match.porProximidade };
}
