"use client";

import { Boxes, Cable, GitBranch, Map as MapIcon, Pencil, Zap } from "lucide-react";

/**
 * O mapa do sistema: para que serve cada tela e onde se muda cada coisa.
 * Regra: uma informação, um lugar para editar.
 */
const PASSOS = [
  {
    n: "1",
    titulo: "Mapa da rota",
    onde: "botão “Nova rota” ou “Editar” na janela da rota",
    serve: "Onde as coisas estão e por onde a fibra passa.",
    edita: ["caixas e a posição de cada uma", "cabos e o traçado nos postes", "a fibra que cada rota usa", "OLT, porta PON e DIO da estação", "prédios (blocos, andares e CDOIs)"],
    Icone: Pencil,
    cor: "border-indigo-200 bg-indigo-50 text-indigo-900",
  },
  {
    n: "2",
    titulo: "Árvore",
    onde: "aba Árvore",
    serve: "Cada porta PON em detalhe: caminho, potência e ocupação.",
    edita: [],
    Icone: GitBranch,
    cor: "border-slate-200 bg-slate-50 text-slate-800",
  },
  {
    n: "3",
    titulo: "Unifilar",
    onde: "aba Unifilar",
    serve: "O que tem dentro de cada caixa, ligação por ligação.",
    edita: ["splitters (colocar e tirar)", "emendas e cor com cor", "pernas em ramal", "cliente em cada porta", "adaptador do DIO de cada rota"],
    Icone: Cable,
    cor: "border-slate-700 bg-[#16181c] text-slate-100",
  },
] as const;

const OLHAR = [
  { titulo: "Mapa da rede", serve: "A rede inteira para análise: cores por PON, potência e ocupação, e os alertas.", Icone: MapIcon },
  { titulo: "Simular rompimento", serve: "Onde rompeu e quem fica sem sinal.", Icone: Zap },
];

const CADASTROS = "Cadastros de equipamentos, clientes, importar KML e limpeza ficam em “Mais ▾”. O tipo e a observação de um cabo, e a troca de fibra em várias rotas, ficam na janela do cabo. A ligação CTO → CT fica na aba CT.";

export default function ComoFunciona() {
  return (
    <div className="space-y-3 p-3 text-xs">
      <p className="text-slate-600">
        Cada coisa se muda <b>num lugar só</b>. A sequência é: desenhe a rota no mapa → confira na árvore → ligue as fibras no Unifilar.
      </p>
      <ol className="grid gap-2 sm:grid-cols-3">
        {PASSOS.map(({ n, titulo, onde, serve, edita, Icone, cor }) => (
          <li key={n} className={`rounded-xl border p-2.5 ${cor}`}>
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-[11px] ring-1 ring-current/30">{n}</span>
              <Icone className="h-4 w-4" /> {titulo}
            </p>
            <p className="mt-0.5 text-[10px] opacity-70">{onde}</p>
            <p className="mt-1.5 font-medium">{serve}</p>
            {edita.length ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 opacity-90">
                {edita.map((x) => <li key={x}>{x}</li>)}
              </ul>
            ) : (
              <p className="mt-1.5 opacity-80">Só para ver. Cada caixa tem <b>Abrir no Unifilar</b>, e cada rota tem <b>Editar</b> (mapa).</p>
            )}
          </li>
        ))}
      </ol>
      <div className="grid gap-2 sm:grid-cols-2">
        {OLHAR.map(({ titulo, serve, Icone }) => (
          <div key={titulo} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p><b>{titulo}</b> · só para ver. {serve}</p>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600">
        <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> {CADASTROS}
      </p>
    </div>
  );
}
