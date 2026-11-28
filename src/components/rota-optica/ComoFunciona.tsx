"use client";

import { Boxes, Cable, Map as MapIcon, Pencil, Zap } from "lucide-react";

/**
 * O mapa do sistema: para que serve cada tela e onde se muda cada coisa.
 * Regra: uma informação, um lugar para editar.
 */
const PASSOS = [
  {
    n: "1",
    titulo: "Mapa da rede · Editar",
    onde: "aba Mapa da rede, botão Editar rede",
    serve: "Onde as coisas estão e por onde o cabo passa. A rede é livre: nada de rotas.",
    edita: ["colocar OLT, DIO, CEO, CT, HUB, CTO e CDOI", "desenhar cabo de caixa em caixa (passando pelas do meio)", "pôr caixa em cima de um cabo", "arrastar e apagar", "na OLT: Ligar PON (cordão até o adaptador do DIO)", "tipo e capacidade do cabo"],
    Icone: Pencil,
    cor: "border-indigo-200 bg-indigo-50 text-indigo-900",
  },
  {
    n: "2",
    titulo: "Unifilar",
    onde: "aba Unifilar",
    serve: "O que liga em quê dentro de cada caixa. O sinal vem da porta PON e acende sozinho, com a potência em cada ponta.",
    edita: ["splitters (colocar e tirar)", "emendas e cor com cor", "pernas dos splitters", "cliente em cada porta e em cada fibra da CT", "adaptador do DIO (PON + adaptador novo)", "desligar não apaga nada: só tira o sinal", "não deixa duas PONs na mesma fibra"],
    Icone: Cable,
    cor: "border-slate-700 bg-[#16181c] text-slate-100",
  },
  {
    n: "3",
    titulo: "Mapa da rede · Análise",
    onde: "aba Mapa da rede, botão Análise",
    serve: "A rede inteira com o caminho da luz calculado. Escolha uma PON para o resumo dela.",
    edita: [],
    Icone: MapIcon,
    cor: "border-slate-200 bg-slate-50 text-slate-800",
  },
] as const;

const OLHAR = [
  { titulo: "Simular rompimento", serve: "Onde rompeu e quem fica sem sinal.", Icone: Zap },
];

const CADASTROS = "Cadastros de equipamentos, clientes e Começar rede nova ficam em “Mais ▾”.";

export default function ComoFunciona() {
  return (
    <div className="space-y-3 p-3 text-xs">
      <p className="text-slate-600">
        Cada coisa se muda <b>num lugar só</b>. A sequência é: desenhe elementos e cabos no mapa → ligue as fibras no Unifilar (o sinal aparece sozinho) → analise a rede.
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
