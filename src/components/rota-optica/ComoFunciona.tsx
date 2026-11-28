"use client";

import { Boxes, Cable, Map as MapIcon, Pencil, Zap } from "lucide-react";

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
    edita: ["caixas e a posição de cada uma", "cabos e o traçado nos postes", "botão Cabo: tipo, capacidade, observação e troca de fibra em várias rotas", "a fibra que cada rota usa", "OLT, porta PON e DIO da estação", "prédios (blocos, andares e CDOIs)"],
    Icone: Pencil,
    cor: "border-indigo-200 bg-indigo-50 text-indigo-900",
  },
  {
    n: "2",
    titulo: "Unifilar",
    onde: "aba Unifilar",
    serve: "O que tem dentro de cada caixa, ligação por ligação, com a potência (dBm) em cada ponta.",
    edita: ["splitters (colocar e tirar)", "emendas e cor com cor", "pernas em ramal (porta da CTO → CT)", "cliente em cada porta e em cada fibra da CT", "adaptador do DIO de cada rota", "trocar a fibra: vale no trecho inteiro do cabo (rotas e a caixa da outra ponta)", "prédio: botão Editar no prédio (fibra de cada CDOI)"],
    Icone: Cable,
    cor: "border-slate-700 bg-[#16181c] text-slate-100",
  },
  {
    n: "3",
    titulo: "Mapa da rede",
    onde: "aba Mapa da rede",
    serve: "A rede inteira para análise. Escolha uma PON para o resumo dela.",
    edita: [],
    Icone: MapIcon,
    cor: "border-slate-200 bg-slate-50 text-slate-800",
  },
] as const;

const OLHAR = [
  { titulo: "Simular rompimento", serve: "Onde rompeu e quem fica sem sinal.", Icone: Zap },
];

const CADASTROS = "Cadastros de equipamentos, clientes, importar KML e limpeza ficam em “Mais ▾”.";

export default function ComoFunciona() {
  return (
    <div className="space-y-3 p-3 text-xs">
      <p className="text-slate-600">
        Cada coisa se muda <b>num lugar só</b>. A sequência é: desenhe a rota no mapa → ligue as fibras e confira a potência no Unifilar → analise a rede no Mapa da rede.
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
              <p className="mt-1.5 opacity-80">Só para ver: cores por PON, potência, ocupação e alertas. Cada caixa e cada cabo têm <b>Abrir no Unifilar</b>.</p>
            )}
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
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
