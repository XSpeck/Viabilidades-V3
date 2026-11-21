import type { Viabilizacao } from "@/types";

/** Texto da demanda: prédio, contatos e preferência de data (o mesmo que a rota de API monta) */
export function descricaoEstrutura(v: Partial<Viabilizacao>): string {
  const cond = v.tipo_instalacao === "Condomínio";
  return [
    `Estruturação de rede — ${v.predio_ftta ?? (cond ? "Condomínio" : "Prédio")}`,
    v.nome_sindico && `${cond ? "Responsável" : "Síndico"}: ${v.nome_sindico}${v.contato_sindico ? ` · ${v.contato_sindico}` : ""}`,
    v.nome_cliente_predio && `Cliente: ${v.nome_cliente_predio}${v.contato_cliente_predio ? ` · ${v.contato_cliente_predio}` : ""}${v.apartamento ? ` · ${cond ? "casa" : "apto"} ${v.apartamento}` : ""}`,
    v.data_preferencia_visita && `Preferência de visita: ${v.data_preferencia_visita.split("-").reverse().join("/")} — ${v.periodo_preferencia_visita ?? "Manhã"}`,
    v.obs_agendamento && `Obs.: ${v.obs_agendamento}`,
  ].filter(Boolean).join("\n");
}
