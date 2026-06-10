import type { AppUser, UserCargo } from "@/types";

export const PAGE_CARGOS: Record<string, UserCargo[]> = {
  home:             ["adm", "agendamento", "auditor", "usuario"],
  resultados:       ["adm", "usuario"],
  viabilidades:     ["adm", "auditor"],
  auditoria:        ["adm", "auditor"],
  agenda:           ["adm", "auditor"],
  "agenda-tecnica": ["adm", "agendamento"],
  relatorios:       ["adm", "auditor"],
  "analise-rede":   ["adm", "auditor"],
  adm:              ["adm"],
};

export const CARGO_DEFAULT_ROUTE: Record<UserCargo, string> = {
  adm:         "/viabilidades",
  auditor:     "/viabilidades",
  agendamento: "/home",
  usuario:     "/home",
};

export const CARGO_LABEL: Record<UserCargo, string> = {
  adm:         "ADM",
  auditor:     "Auditor",
  agendamento: "Agendamento",
  usuario:     "Usuário",
};

export function getCargo(user: AppUser): UserCargo {
  return user.cargo ?? (user.nivel === 1 ? "auditor" : "usuario");
}

export function canAccess(user: AppUser | null, page: string): boolean {
  if (!user) return false;
  return PAGE_CARGOS[page]?.includes(getCargo(user)) ?? true;
}
