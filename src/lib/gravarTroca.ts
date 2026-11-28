// =====================
// Grava uma troca de fibra de uma vez só: as rotas e as caixas entram juntas (lote do Firestore).
// Se algo falhar, nada fica pela metade.
// =====================
import { registroCaixa, COLECAO_CAIXAS, type CaixaRede } from "./caixasRede";
import { camposAtualizarRota, COLECAO_ROTAS, type RotaOptica } from "./rotaOptica";
import { paraGravar } from "./subRotas";
import { caixasDoPlano, planoPelasRotas } from "./trocaFibra";
import type { CadastroLigacoes } from "./unifilar";

/** Rotas (montadas) e caixas (cadastro completo) que mudam; devolve as caixas como ficam na tela */
export async function gravarTroca(rotas: RotaOptica[], caixas: Omit<CaixaRede, "id" | "atualizado_em">[]): Promise<CaixaRede[]> {
  if (!rotas.length && !caixas.length) return [];
  const { doc, writeBatch, serverTimestamp, deleteField } = await import("firebase/firestore");
  const { db } = await import("./firebase");
  const lote = writeBatch(db);
  for (const r of rotas) {
    const dados = paraGravar({ pai: r.pai, tronco: r.tronco }, {
      nome: r.nome, origem: r.origem, elementos: r.elementos, trechos: r.trechos,
      calculo_potencia: r.calculo_potencia, obs: r.obs, criado_por: r.criado_por,
    });
    lote.update(doc(db, COLECAO_ROTAS, r.id), camposAtualizarRota(dados, { serverTimestamp, deleteField }));
  }
  const gravadas: CaixaRede[] = [];
  for (const c of caixas) {
    const { id, registro, caixa } = registroCaixa(c);
    // merge: o que esta troca não mexe (arrumação do Unifilar) continua
    lote.set(doc(db, COLECAO_CAIXAS, id), { ...registro, atualizado_em: serverTimestamp() }, { merge: true });
    gravadas.push(caixa);
  }
  await lote.commit();
  return gravadas;
}

/** As ligações de uma caixa (só se ela tem cadastro de fusões, regras ou splitters) */
export function ligacoesDaCaixa(c?: CaixaRede): CadastroLigacoes | undefined {
  if (!c || (!c.splitters?.length && !c.emendas?.length && !c.regras_emenda?.length)) return undefined;
  return { emendas: c.emendas ?? [], regras_emenda: c.regras_emenda ?? [], splitters: c.splitters ?? [] };
}

/**
 * Rotas que mudaram de fibra (antes → depois, pelo id): as caixas das pontas dos cabos acompanham.
 * Grava as rotas (se pedido) e as caixas juntas; devolve as caixas gravadas.
 */
export async function gravarRotasEPontas(antes: RotaOptica[], depois: RotaOptica[], caixas: CaixaRede[], usuario: string, { gravarRotas = false } = {}): Promise<CaixaRede[]> {
  const plano = planoPelasRotas(antes, depois);
  const cadDe = (k: string) => ligacoesDaCaixa(caixas.find((c) => c.chave === k));
  const mudadas = caixasDoPlano(plano.pontas, cadDe);
  return gravarTroca(
    gravarRotas ? [...plano.rotas.values()] : [],
    [...mudadas].map(([k, ed]) => ({ ...caixas.find((c) => c.chave === k)!, ...ed, atualizado_por: usuario })),
  );
}
