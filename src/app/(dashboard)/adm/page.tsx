"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Network, Settings, Users, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import RestaurarArquivados from "@/components/adm/RestaurarArquivados";
import ImportCtos from "@/components/adm/ImportCtos";
import ImportRedes from "@/components/adm/ImportRedes";
import GestaoUsuarios from "@/components/adm/GestaoUsuarios";
import GerenciarPrediosAtendidos from "@/components/adm/PrediosAtendidos";
import GerenciarPrediosSemViabilidade from "@/components/adm/PrediosSemViabilidade";
import GerenciarBairros from "@/components/adm/Bairros";

const ABAS = [
  { id: "usuarios", rotulo: "Usuários", icone: Users, desc: "Cadastro, cargos e senhas" },
  { id: "rede", rotulo: "Rede", icone: Network, desc: "CTOs, redes das distribuidoras e bairros" },
  { id: "predios", rotulo: "Prédios", icone: Building2, desc: "Prédios atendidos e sem viabilidade" },
  { id: "ferramentas", rotulo: "Ferramentas", icone: Wrench, desc: "Correções em massa" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

function Conteudo() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = params.get("aba");
  const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "usuarios";

  if (!canAccess(user ?? null, "adm")) {
    return <div className="py-20 text-center text-red-500">🚫 Acesso restrito a administradores.</div>;
  }

  // a aba fica no endereço (?aba=rede): dá para mandar o link direto
  const trocar = (id: Aba) => router.replace(`${pathname}?aba=${id}`, { scroll: false });
  const atual = ABAS.find((a) => a.id === aba)!;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Settings className="h-7 w-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administração</h1>
          <p className="mt-0.5 text-sm text-gray-500">{atual.desc}</p>
        </div>
      </div>

      <div className="flex overflow-x-auto rounded-xl border bg-white p-1 shadow-sm" role="tablist">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => trocar(id)}
            className={`flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${aba === id ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === "usuarios" && <GestaoUsuarios />}

      {aba === "rede" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ImportCtos />
          <ImportRedes />
          <div className="lg:col-span-2"><GerenciarBairros /></div>
        </div>
      )}

      {aba === "predios" && (
        <div className="grid grid-cols-1 gap-6">
          <GerenciarPrediosAtendidos />
          <GerenciarPrediosSemViabilidade />
        </div>
      )}

      {aba === "ferramentas" && (
        <div className="grid grid-cols-1 gap-6">
          <RestaurarArquivados />
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  // useSearchParams precisa de Suspense no App Router
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}
