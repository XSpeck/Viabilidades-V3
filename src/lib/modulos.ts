// =====================
// Módulos que podem ser ligados ou desligados (no futuro, por empresa/licença).
// =====================

export const MODULOS = {
  /**
   * Agendamento da instalação (Agenda Técnica, propostas de data no Meus Resultados) e a
   * Agenda FTTA/UTP de visitas. Desligado: a viabilidade aprovada termina no resultado, e a
   * estrutura de prédio/condomínio vira demanda na Análise da Rede (a equipe de rede agenda e conclui lá).
   * O código continua no projeto para ser religado depois.
   */
  agendamento: false,
} as const;

/** Telas que só existem com o módulo de agendamento ligado */
export const PAGINAS_AGENDAMENTO = ["agenda", "agenda-tecnica"];
