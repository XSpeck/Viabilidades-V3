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
  Shield,
  Settings,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/home", label: "Solicitar Viabilização", icon: <Home className="w-4 h-4" /> },
  { href: "/resultados", label: "Meus Resultados", icon: <BarChart2 className="w-4 h-4" /> },
  { href: "/viabilidades", label: "Viabilidades", icon: <ClipboardList className="w-4 h-4" />, adminOnly: true },
  { href: "/auditoria", label: "Auditoria", icon: <Search className="w-4 h-4" />, adminOnly: true },
  { href: "/agenda", label: "Agenda FTTA/UTP", icon: <CalendarDays className="w-4 h-4" />, adminOnly: true },
  { href: "/relatorios", label: "Relatórios", icon: <FileText className="w-4 h-4" />, adminOnly: true },
  { href: "/analise-rede", label: "Análise da Rede", icon: <Network className="w-4 h-4" />, adminOnly: true },
  { href: "/adm", label: "Administração", icon: <Settings className="w-4 h-4" />, adminOnly: true },
];

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user?.nivel === 1
  );

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
            {user?.nivel === 1 ? (
              <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                <Shield className="w-3 h-3" /> Admin
              </span>
            ) : (
              <span className="text-xs text-gray-400">Usuário</span>
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
