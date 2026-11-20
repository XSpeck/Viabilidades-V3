"use client";

import { corFibra, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, portaPonDaRota, type NoArvore } from "@/lib/arvorePon";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * DIO por dentro: cada porta recebe o cordão de uma porta PON da OLT e sai numa fibra do cabo
 * que vai para a rua (porta N = fibra N). Mostra o painel de portas e a lista do que está ligado.
 */

interface Props {
  no: NoArvore;
  rotas: RotaOptica[];
  catalogo: ItemCatalogo[];
}

interface Ligacao {
  porta: number;
  pon: string;
  saidaCabo?: string;
  saidaFibra?: number;
  destino?: string;
  rotas: string[];
}

const curto = (s: string, n = 24) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);

export default function CaixaDio({ no, rotas, catalogo }: Props) {
  const el = no.elemento;
  const chave = chaveElemento(el);
  const equip = catalogo.find((c) => c.id === el.equipamento_id);

  // O que está ligado em cada porta (pelas rotas que passam por este DIO)
  const portas = new Map<number, Ligacao>();
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (chaveElemento(e) !== chave) return;
      const p = Number(e.porta?.match(/Porta\s*0*(\d+)/i)?.[1]) || r.elementos[i + 1]?.fibra_entrada;
      if (!p) return;
      const prox = r.elementos[i + 1];
      const l = portas.get(p) ?? { porta: p, pon: portaPonDaRota(r).rotulo, saidaCabo: prox?.cabo_entrada, saidaFibra: prox?.fibra_entrada, destino: prox?.nome, rotas: [] };
      if (!l.rotas.includes(r.nome)) l.rotas.push(r.nome);
      portas.set(p, l);
    });
  }
  const maior = Math.max(0, ...portas.keys());
  const total = equip?.portas ?? (maior <= 12 ? 12 : maior <= 24 ? 24 : maior <= 48 ? 48 : Math.ceil(maior / 12) * 12);
  const ligadas = [...portas.values()].sort((a, b) => a.porta - b.porta);
  const pons = new Set(ligadas.map((l) => l.pon));
  const cabos = new Set(ligadas.map((l) => l.saidaCabo).filter(Boolean));

  // Painel de portas (12 por linha)
  const COL = 12, PW = 26, PH = 22, X0 = 16, Y0 = 34;
  const linhas = Math.ceil(total / COL);
  const W = X0 * 2 + COL * PW;
  const H = Y0 + linhas * PH + 14;

  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Portas", v: `${ligadas.length}/${total}`, d: "em uso" },
          { r: "Portas PON", v: String(pons.size), d: "chegam pelo cordão" },
          { r: "Cabos", v: String(cabos.size), d: "saem para a rua" },
          { r: "Livres", v: String(total - ligadas.length), d: equip ? curto(equip.nome, 18) : "" },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="text-sm font-bold text-slate-800">{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-700 to-slate-800 shadow-lg">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none">
          <text x={X0} y="16" fontSize="9" fill="#e2e8f0" fontWeight={800}>DIO</text>
          <text x={X0 + 26} y="16" fontSize="8" fill="#cbd5e1">{curto(el.nome, 22)} · {total}p</text>
          <text x={W - X0} y="16" fontSize="7" fill="#94a3b8" textAnchor="end">porta N = fibra N do cabo de saída</text>
          {Array.from({ length: total }, (_, k) => {
            const p = k + 1;
            const x = X0 + (k % COL) * PW;
            const y = Y0 + Math.floor(k / COL) * PH;
            const l = portas.get(p);
            const c = l?.saidaFibra ? corFibra(l.saidaFibra, l.saidaCabo) : null;
            return (
              <g key={p}>
                <title>{l ? `Porta ${p} · ${l.pon} (cordão) → ${l.saidaCabo ?? "?"} F${l.saidaFibra ?? "?"} → ${l.destino ?? "?"}` : `Porta ${p} · livre`}</title>
                <rect x={x + 2} y={y} width={PW - 4} height={PH - 6} rx="3" fill={l ? c?.hex ?? "#22c55e" : "#f1f5f9"} stroke={l ? "#facc15" : "#94a3b8"} strokeWidth={l ? 1.8 : 0.6} />
                <text x={x + PW / 2} y={y + (PH - 6) / 2 + 3} fontSize="7" textAnchor="middle" fontWeight={700} fill={l ? (c && ["Branco", "Amarelo", "Aqua", "Rosa"].includes(c.nome) ? "#0f172a" : "#fff") : "#94a3b8"}>{p}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {ligadas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Nenhuma porta deste DIO está em rota.</p>
      ) : (
        <ul className="space-y-1.5">
          {ligadas.map((l) => {
            const c = l.saidaFibra ? corFibra(l.saidaFibra, l.saidaCabo) : null;
            return (
              <li key={l.porta} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]">
                <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ring-2 ring-yellow-400" style={{ background: c?.hex ?? "#22c55e", color: c && ["Branco", "Amarelo", "Aqua", "Rosa"].includes(c.nome) ? "#0f172a" : "#fff" }}>
                  P{l.porta}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-800">{l.pon} <span className="font-normal text-slate-400">· cordão</span></p>
                  <p className="truncate text-slate-500">
                    {l.saidaFibra ? `F${l.saidaFibra} ${c?.nome.toLowerCase() ?? ""}` : "fibra ?"} · {curto(l.saidaCabo ?? "cabo ?", 26)} → {curto(l.destino ?? "?", 20)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{l.rotas.length} rota{l.rotas.length !== 1 ? "s" : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
