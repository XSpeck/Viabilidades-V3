"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, MapPin, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
import { interpretarLocalizacao } from "@/lib/localizacao";
import { canAccess, getCargo } from "@/lib/access";
import type { PredioAtendido, PredioSemViabilidade } from "@/types";
import CampoLocalizacao from "@/components/home/CampoLocalizacao";
import FormSolicitacao, { type PedidoEnviado } from "@/components/home/FormSolicitacao";
import TabelasPredios from "@/components/home/TabelasPredios";

export default function HomePage() {
  const { user } = useAuth();
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<PedidoEnviado | null>(null);
  /** Troca a cada envio para o formulário começar limpo */
  const [rodada, setRodada] = useState(0);
  const [atendidos, setAtendidos] = useState<PredioAtendido[]>([]);
  const [semViab, setSemViab] = useState<PredioSemViabilidade[]>([]);

  const local = useMemo(() => interpretarLocalizacao(texto), [texto]);

  useEffect(() => {
    getPrediosAtendidos().then(setAtendidos).catch(() => {});
    getPrediosSemViabilidade().then(setSemViab).catch(() => {});
  }, []);

  if (!canAccess(user ?? null, "home")) return <div className="py-20 text-center text-red-500">🚫 Acesso restrito.</div>;

  const podeViabilizar = user ? ["adm", "usuario"].includes(getCargo(user)) : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{podeViabilizar ? "Solicitar viabilização" : "Consulta de prédios"}</h1>
        <p className="mt-1 text-gray-500">Bem-vindo, <strong>{user?.nome}</strong>!</p>
      </div>

      {podeViabilizar && user && (
        <>
          {enviado && (
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4" role="status">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-green-800">Pedido enviado: {enviado.cliente} ({enviado.tipo})</p>
                <p className="mt-0.5 text-sm text-green-700">
                  {enviado.posicao ? `É o ${enviado.posicao}º da fila de auditoria.` : "Já está com a auditoria."}
                </p>
                <Link href="/resultados" className="mt-2 inline-block rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                  Ver em Meus Resultados
                </Link>
              </div>
              <button onClick={() => setEnviado(null)} className="text-green-600 hover:text-green-800" aria-label="Fechar aviso">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="space-y-5 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">1</span>
                <MapPin className="h-4 w-4 text-indigo-600" /> Localização do cliente
              </h3>
              <CampoLocalizacao texto={texto} local={local} onTexto={(t) => { setTexto(t); if (t) setEnviado(null); }} />
            </section>

            {local ? (
              <FormSolicitacao
                key={rodada}
                local={local}
                user={user}
                onEnviado={(p) => { setEnviado(p); setTexto(""); setRodada((r) => r + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            ) : (
              <p className="text-sm text-gray-400">Informe a localização para escolher o tipo e preencher os dados.</p>
            )}
          </div>
        </>
      )}

      <TabelasPredios atendidos={atendidos} semViab={semViab} />
    </div>
  );
}
