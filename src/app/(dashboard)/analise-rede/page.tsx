"use client";

import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";

export default function AnaliseRedePage() {
  const { user } = useAuth();

  if (!canAccess(user ?? null, "analise-rede")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">🔧 Análise da Rede</h1>
      <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
        <p className="text-lg">🚧 Em desenvolvimento</p>
        <p className="text-sm mt-2">Esta página será implementada em breve.</p>
      </div>
    </div>
  );
}
