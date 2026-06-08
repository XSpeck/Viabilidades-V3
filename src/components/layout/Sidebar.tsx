"use client";

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
  LogOut,
  Settings,
  Wrench,
} from "lucide-react";
import { canAccess, getCargo, CARGO_LABEL } from "@/lib/access";
import type { UserCargo } from "@/types";

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
  { href: "/agenda",         label: "Agenda FTTA/UTP",        icon: <CalendarDays className="w-4 h-4" />, page: "agenda" },
  { href: "/agenda-tecnica", label: "Agenda Técnica",         icon: <Wrench className="w-4 h-4" />,       page: "agenda-tecnica" },
  { href: "/relatorios",     label: "Relatórios",             icon: <FileText className="w-4 h-4" />,     page: "relatorios" },
  { href: "/analise-rede",   label: "Análise da Rede",        icon: <Network className="w-4 h-4" />,      page: "analise-rede" },
  { href: "/adm",            label: "Administração",          icon: <Settings className="w-4 h-4" />,     page: "adm" },
];

const CARGO_BADGE_COLOR: Record<UserCargo, string> = {
  adm:         "text-purple-400",
  auditor:     "text-yellow-400",
  agendamento: "text-green-400",
  usuario:     "text-gray-400",
};

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const visibleItems = navItems.filter((item) => canAccess(user ?? null, item.page));

  return (
    <aside className="w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">🔍 Validador V3</h1>
        <p className="text-xs text-gray-400 mt-0.5">Sistema de Viabilização</p>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
            {user?.nome?.charAt(0).toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.nome}</p>
            {user && (
              <span className={`text-xs font-medium ${CARGO_BADGE_COLOR[getCargo(user)]}`}>
                {CARGO_LABEL[getCargo(user)]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="text-xs text-gray-500 uppercase tracking-wider px-3 py-2">Navegação</p>
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-red-900/50 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
