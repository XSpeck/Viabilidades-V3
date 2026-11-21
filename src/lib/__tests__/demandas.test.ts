import { describe, expect, it } from "vitest";
import { corTecnico, diasAtraso, ordenarDemandas } from "../../components/analise-rede/constantes";

const d = (x: Partial<{ status: string; prioridade: string; data_criacao: string; data_agendamento: string; periodo_agendamento: string; data_conclusao: string; id: string }>) =>
  ({ status: "aberta", prioridade: "media", data_criacao: "2026-11-01", ...x });

describe("demandas da rede", () => {
  it("atraso só para agendada/em andamento com data passada", () => {
    expect(diasAtraso(d({ status: "agendada", data_agendamento: "2026-11-17" }), "2026-11-21")).toBe(4);
    expect(diasAtraso(d({ status: "agendada", data_agendamento: "2026-11-21" }), "2026-11-21")).toBe(0);
    expect(diasAtraso(d({ status: "concluida", data_agendamento: "2026-11-01" }), "2026-11-21")).toBe(0);
  });
  it("ordem: atrasada, agendada por data, aberta por prioridade, concluída", () => {
    const lista = [
      d({ id: "concl", status: "concluida", data_conclusao: "2026-11-20" }),
      d({ id: "aberta-baixa", prioridade: "baixa" }),
      d({ id: "aberta-urgente", prioridade: "urgente" }),
      d({ id: "ag-25", status: "agendada", data_agendamento: "2026-11-25" }),
      d({ id: "ag-22", status: "agendada", data_agendamento: "2026-11-22" }),
      d({ id: "atrasada", status: "em_andamento", data_agendamento: "2026-11-17" }),
    ];
    expect(ordenarDemandas(lista, "2026-11-21").map((x) => x.id)).toEqual(["atrasada", "ag-22", "ag-25", "aberta-urgente", "aberta-baixa", "concl"]);
  });
  it("cor do técnico é estável", () => {
    expect(corTecnico("Eduardo Nunes")).toBe(corTecnico("Eduardo Nunes"));
    expect(corTecnico("Eduardo Nunes")).toMatch(/^bg-/);
  });
});
