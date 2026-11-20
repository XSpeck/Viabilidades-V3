"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { signOut } from "@/lib/auth";
import {
  Home,
  BarChart2,
  ClipboardList,
  Search,
  CalendarDays,
  FileText,
  Network,
  Route,
  LogOut,
  Settings,
  Wrench,
  DollarSign,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { canAccess, getCargo, CARGO_LABEL } from "@/lib/access";
import type { UserCargo, PapelFinanceiro } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  page: string;
}

const navItems: NavItem[] = [
  { href: "/home",           label: "Solicitar Viabilização", icon: <Home className="w-4 h-4" />,         page: "home" },
  { href: "/resultados",     label: "Meus Resultados",        icon: <BarChart2 className="w-4 h-4" />,    page: "resultados" },
  { href: "/viabilidades",   label: "Viabilidades",           icon: <ClipboardList className="w-4 h-4" />, page: "viabilidades" },
  { href: "/auditoria",      label: "Auditoria",              icon: <Search className="w-4 h-4" />,        page: "auditoria" },
  { href: "/analise-rede",   label: "Análise da Rede",        icon: <Network className="w-4 h-4" />,      page: "analise-rede" },
  { href: "/rota-optica",    label: "Rota Óptica",            icon: <Route className="w-4 h-4" />,        page: "rota-optica" },
  { href: "/agenda",         label: "Agenda FTTA/UTP",        icon: <CalendarDays className="w-4 h-4" />, page: "agenda" },
  { href: "/agenda-tecnica", label: "Agenda Técnica",         icon: <Wrench className="w-4 h-4" />,       page: "agenda-tecnica" },
  { href: "/relatorios",     label: "Relatórios",             icon: <FileText className="w-4 h-4" />,     page: "relatorios" },
  { href: "/financeiro",     label: "Financeiro",             icon: <DollarSign className="w-4 h-4" />,   page: "financeiro" },
  { href: "/adm",            label: "Administração",          icon: <Settings className="w-4 h-4" />,     page: "adm" },
];

const CARGO_BADGE_COLOR: Record<UserCargo, string> = {
  adm:         "text-purple-400",
  auditor:     "text-yellow-400",
  agendamento: "text-green-400",
  usuario:     "text-gray-400",
  tecnico:     "text-blue-400",
};

const PAPEL_FINANCEIRO_LABEL: Record<PapelFinanceiro, string> = {
  auditor_servico: "Auditor de Serviço",
  financeiro:      "Financeiro",
};

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /** No computador o menu pode ficar recolhido (só ícones); a escolha fica guardada neste navegador */
  const [recolhido, setRecolhido] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("menu_recolhido") === "1";
    } catch {
      return false;
    }
  });
  function alternarRecolhido() {
    setRecolhido((v) => {
      try { window.localStorage.setItem("menu_recolhido", v ? "0" : "1"); } catch {}
      return !v;
    });
  }
  /** Some no computador quando recolhido (no celular o menu abre inteiro) */
  const soAberto = recolhido ? "md:hidden" : "";

  useEffect(() => { setOpen(false); }, [pathname]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const visibleItems = navItems.filter((item) => canAccess(user ?? null, item.page));

  return (
    <>
      {/* Barra mobile */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-900 text-white sticky top-0 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-800"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="font-semibold text-sm">🔍 Validador V3</span>
        <div className="w-9" />
      </div>

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-50 w-72 ${recolhido ? "md:w-16" : "md:w-64"} min-h-screen bg-gray-900 text-white flex flex-col shrink-0 transform transition-[transform,width] duration-200 ease-in-out md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center justify-between border-b border-gray-700 ${recolhido ? "p-6 md:justify-center md:px-2 md:py-5" : "p-6"}`}>
          <div className={soAberto}>
            <h1 className="text-lg font-bold text-white">🔍 Validador V3</h1>
            <p className="text-xs text-gray-400 mt-0.5">Sistema de Viabilização</p>
          </div>
          {recolhido && <span className="hidden md:block text-xl" title="Validador V3">🔍</span>}
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info */}
        <div className={`py-4 border-b border-gray-700 ${recolhido ? "px-4 md:px-0" : "px-4"}`}>
          <div className={`flex items-center gap-3 ${recolhido ? "md:justify-center" : ""}`}>
            <div className="w-9 h-9 shrink-0 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold" title={user?.nome}>
              {user?.nome?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className={`min-w-0 ${soAberto}`}>
              <p className="text-sm font-medium text-white truncate">{user?.nome}</p>
              {user && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-medium ${CARGO_BADGE_COLOR[getCargo(user)]}`}>
                    {CARGO_LABEL[getCargo(user)]}
                  </span>
                  {user.papel_financeiro && (
                    <span className="text-xs font-medium text-emerald-400">
                      · {PAPEL_FINANCEIRO_LABEL[user.papel_financeiro]}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 space-y-1 overflow-y-auto ${recolhido ? "p-3 md:px-2" : "p-3"}`}>
          <p className={`text-xs text-gray-500 uppercase tracking-wider px-3 py-2 ${soAberto}`}>Navegação</p>
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={recolhido ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-colors ${recolhido ? "md:justify-center md:px-0" : ""} ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {item.icon}
                <span className={soAberto}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className={`border-t border-gray-700 space-y-1 ${recolhido ? "p-3 md:px-2" : "p-3"}`}>
          <button
            onClick={alternarRecolhido}
            title={recolhido ? "Abrir o menu" : "Recolher o menu"}
            className={`hidden md:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors ${recolhido ? "justify-center px-0" : ""}`}
          >
            {recolhido ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            <span className={soAberto}>Recolher menu</span>
          </button>
          <button
            onClick={handleLogout}
            title={recolhido ? "Sair" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-red-900/50 hover:text-red-400 transition-colors ${recolhido ? "md:justify-center md:px-0" : ""}`}
          >
            <LogOut className="w-4 h-4" />
            <span className={soAberto}>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
