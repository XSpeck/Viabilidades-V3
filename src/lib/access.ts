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
  tecnico:     "/financeiro",
};

export const CARGO_LABEL: Record<UserCargo, string> = {
  adm:         "ADM",
  auditor:     "Auditor",
  agendamento: "Agendamento",
  usuario:     "Usuário",
  tecnico:     "Técnico",
};

export function getCargo(user: AppUser): UserCargo {
  return user.cargo ?? (user.nivel === 1 ? "auditor" : "usuario");
}

/** "financeiro" não depende só do cargo: adm e técnico entram sempre; os demais precisam do papel_financeiro (auditor_servico ou financeiro), que coexiste com o cargo principal do usuário. */
function canAccessFinanceiro(user: AppUser): boolean {
  const cargo = getCargo(user);
  return cargo === "adm" || cargo === "tecnico" || !!user.papel_financeiro;
}

export function canAccess(user: AppUser | null, page: string): boolean {
  if (!user) return false;
  if (page === "financeiro") return canAccessFinanceiro(user);
  return PAGE_CARGOS[page]?.includes(getCargo(user)) ?? true;
}
