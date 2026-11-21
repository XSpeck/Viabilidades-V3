// =====================
// Sincronização entre cadastros: uma informação, um dono.
// Splitter da CDOI: o diagrama da caixa (aba CDOI) manda; o prédio e a rota acompanham.
// =====================
import { chaveElemento } from "./arvorePon";
import { resumoPortas, type CaixaRede } from "./caixasRede";
import type { ItemCatalogo } from "./catalogoRede";
import { listarPredios, salvarPredio } from "./prediosRede";
import { atualizarRota, type RotaOptica } from "./rotaOptica";
import { paraGravar } from "./subRotas";

/**
 * Depois de salvar o diagrama de uma CDOI: o splitter dela (1:N pelas pernas) passa para o ponto do prédio
 * e para o elemento da rota (é ele que entra na conta de potência). Devolve true se mudou alguma rota.
 */
export async function sincronizarSplitterCdoi(
  caixa: CaixaRede,
  rotas: RotaOptica[],
  modelos: ItemCatalogo[],
  usuario: string
): Promise<boolean> {
  const total = resumoPortas(caixa)?.total;
  if (!total) return false;
  const rel = `1:${total}`;
  const modelo = modelos.find((m) => m.categoria === "splitter" && m.relacao === rel)?.id;

  // prédio
  const predios = await listarPredios(true);
  for (const p of predios) {
    const o = p.pontos.find((x) => x.chave === caixa.chave);
    if (o && o.splitter !== rel) {
      await salvarPredio({ ...p, pontos: p.pontos.map((x) => (x.id === o.id ? { ...x, splitter: rel } : x)) }, usuario);
    }
  }

  // rotas: só onde a CDOI é da própria rota (não do tronco herdado)
  let mudou = false;
  for (const r of rotas) {
    let alterou = false;
    const elementos = r.elementos.map((e, i) => {
      if (i < (r.tronco ?? 0) || chaveElemento(e) !== caixa.chave || e.splitter === rel) return e;
      alterou = true;
      return { ...e, splitter: rel, splitter_modelo: modelo };
    });
    if (!alterou) continue;
    await atualizarRota(
      r.id,
      paraGravar(r, {
        nome: r.nome, origem: r.origem, elementos, trechos: r.trechos,
        calculo_potencia: r.calculo_potencia, obs: r.obs, criado_por: r.criado_por,
      })
    );
    mudou = true;
  }
  return mudou;
}
