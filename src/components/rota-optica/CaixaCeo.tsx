"use client";

import { useState } from "react";
import { capacidadeDoCabo, capacidadeRegistrada, corFibra, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, type NoArvore } from "@/lib/arvorePon";
import { chaveCabo } from "@/lib/cabosRede";
import { type EmendaCaixa, type PontaFibra, type RegraEmenda } from "@/lib/caixasRede";
import { cortar } from "@/lib/textoCompleto";
import DiagramaEmendas from "./DiagramaEmendas";

/**
 * CEO (caixa de emenda) por dentro: o mapa de emendas. O normal é emendar cor com cor (fibra N do cabo
 * que chega na fibra N do cabo que sai); as exceções são emendas avulsas. As rotas mostram quais fibras
 * têm sinal e o mapa é conferido com elas.
 */

interface Props {
  no: NoArvore;
  rotas: RotaOptica[];
  /** Abre a caixa na aba Unifilar (onde se editam as emendas) */
  onAbrirUnifilar?: () => void;
}

interface Sinal {
  de: PontaFibra;
  para?: PontaFibra;
  destino?: string;
  rota: string;
}

/** Nome curto do cabo que ainda diferencia um do outro: "12 FO · HUB → CE 9786" */
const curto = (s: string, n = 20) => {
  const [tipo, ...resto] = s.split(" · ");
  const t = (resto.length ? `${tipo.replace(/\s*ASO\b/i, "")} · ${resto.join(" · ")}` : tipo.split(" - ")[0]).trim();
  return cortar(t, n, s);
};
const k = (p: PontaFibra) => `${chaveCabo(p.cabo)}|${p.fibra}`;

export default function CaixaCeo({ no, rotas, onAbrirUnifilar }: Props) {
  const el = no.elemento;
  const chave = chaveElemento(el);
  const regras: RegraEmenda[] = no.caixa?.regras_emenda ?? [];
  const avulsas: EmendaCaixa[] = no.caixa?.emendas ?? [];
  const [todas, setTodas] = useState(false);

  // ---------- O que as rotas dizem: fibra que chega e para onde segue ----------
  const sinais: Sinal[] = [];
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada || !e.fibra_entrada) return;
      const prox = r.elementos[i + 1];
      const s: Sinal = {
        de: { cabo: e.cabo_entrada, fibra: e.fibra_entrada },
        para: prox?.cabo_entrada && prox.fibra_entrada ? { cabo: prox.cabo_entrada, fibra: prox.fibra_entrada } : undefined,
        destino: prox?.nome,
        rota: r.nome,
      };
      if (!sinais.some((x) => k(x.de) === k(s.de) && (x.para ? k(x.para) : "") === (s.para ? k(s.para) : ""))) sinais.push(s);
    });
  }
  const passam = sinais.filter((s) => s.para && chaveCabo(s.para.cabo) === chaveCabo(s.de.cabo) && s.para.fibra === s.de.fibra);
  const fusoes = sinais.filter((s) => s.para && !(chaveCabo(s.para.cabo) === chaveCabo(s.de.cabo) && s.para.fibra === s.de.fibra));
  const terminam = sinais.filter((s) => !s.para);

  const uniq = (l: string[]) => [...new Map(l.map((x) => [chaveCabo(x), x])).values()];
  const cabosEntram = uniq([...sinais.map((s) => s.de.cabo), ...regras.map((r) => r.de), ...avulsas.map((a) => a.de.cabo)]);
  const cabosSaem = uniq([...sinais.filter((s) => s.para).map((s) => s.para!.cabo), ...regras.map((r) => r.para), ...avulsas.map((a) => a.para.cabo)]);
  const maiorFibra = (c: string) => Math.max(1, ...sinais.flatMap((s) => [s.de, s.para]).filter((p): p is PontaFibra => !!p && chaveCabo(p.cabo) === chaveCabo(c)).map((p) => p.fibra));
  const cap = (c: string) => capacidadeRegistrada(c) ?? capacidadeDoCabo(c, maiorFibra(c));

  // ---------- Mapa de emendas: regras cor com cor + avulsas (as avulsas valem por cima) ----------
  const mapa = new Map<string, { de: PontaFibra; para: PontaFibra; origem: "regra" | "avulsa" }>();
  for (const rg of regras) {
    const n = Math.min(cap(rg.de), cap(rg.para));
    for (let f = 1; f <= n; f++) mapa.set(k({ cabo: rg.de, fibra: f }), { de: { cabo: rg.de, fibra: f }, para: { cabo: rg.para, fibra: f }, origem: "regra" });
  }
  for (const a of avulsas) mapa.set(k(a.de), { ...a, origem: "avulsa" });
  // fibra de saída usada duas vezes
  const usoSaida = new Map<string, number>();
  mapa.forEach((m) => usoSaida.set(k(m.para), (usoSaida.get(k(m.para)) ?? 0) + 1));
  const repetidas = new Set([...usoSaida.entries()].filter(([, q]) => q > 1).map(([x]) => x));

  // ---------- Conferência com as rotas ----------
  const temMapa = mapa.size > 0;
  const conf = fusoes.map((s) => {
    const m = mapa.get(k(s.de));
    const st: "ok" | "fora" | "diferente" = !m ? "fora" : k(m.para) === k(s.para!) ? "ok" : "diferente";
    return { s, m, st };
  });
  const divergentes = conf.filter((c) => c.st === "diferente" || (temMapa && c.st === "fora"));
  const comSinal = new Set(fusoes.map((s) => k(s.de)));

  // ---------- Linhas do desenho: as emendas com sinal, as avulsas e (se pedir) todas as da regra ----------
  type Linha = { de: PontaFibra; para: PontaFibra; sinal: boolean; origem: "regra" | "avulsa" | "rota"; ruim: boolean; destino?: string };
  const linhas: Linha[] = [];
  mapa.forEach((m) => {
    const sinal = comSinal.has(k(m.de));
    if (!todas && !sinal && m.origem === "regra") return;
    const c = conf.find((x) => k(x.s.de) === k(m.de));
    linhas.push({ de: m.de, para: m.para, sinal, origem: m.origem, ruim: c?.st === "diferente" || repetidas.has(k(m.para)), destino: c?.s.destino });
  });
  // fusões das rotas que o mapa não tem: aparecem como "pela rota"
  conf.filter((c) => c.st === "fora").forEach((c) => linhas.push({ de: c.s.de, para: c.s.para!, sinal: true, origem: "rota", ruim: temMapa, destino: c.s.destino }));
  linhas.sort((a, b) => a.de.cabo.localeCompare(b.de.cabo) || a.de.fibra - b.de.fibra);


  const rotuloPonta = (p: PontaFibra) => `${curto(p.cabo, 24)} ${corFibra(p.fibra, p.cabo).rotulo}`;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-500">Mapa de emendas: cor com cor e as exceções.</p>
          {onAbrirUnifilar && (
          <button type="button" onClick={onAbrirUnifilar} className="ml-auto shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-40" title="O que tem dentro da caixa se muda na aba Unifilar">
            Abrir no Unifilar
          </button>
          )}
      </div>

      {/* Números */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Cabos", v: `${cabosEntram.length} → ${cabosSaem.length}`, d: "chegam → saem" },
          { r: "Emendas", v: String(mapa.size), d: `${regras.length} cor com cor · ${avulsas.length} avulsa${avulsas.length !== 1 ? "s" : ""}` },
          { r: "Com sinal", v: String(fusoes.length), d: `${passam.length} passa${passam.length !== 1 ? "m" : ""} direto` },
          { r: "Conferência", v: divergentes.length ? String(divergentes.length) : "ok", d: divergentes.length ? "diferem das rotas" : temMapa ? "bate com as rotas" : "sem mapa ainda", cor: divergentes.length ? "#dc2626" : "#16a34a" },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="truncate text-sm font-bold" style={{ color: t.cor ?? "#1e293b" }}>{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      {/* Desenho: o mesmo da HUB e da CTO (cabos que chegam, bandeja, cabos que saem) */}
      <DiagramaEmendas chave={chave} nome={el.nome} rotas={rotas} mapa={linhas} semResumo />
      {regras.length > 0 && (
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar todas as fibras emendadas cor com cor (as sem sinal ficam apagadas)
        </label>
      )}

      {/* Legenda e listas */}
      {(
        <div className="space-y-1.5 text-[11px]">
          {regras.map((r) => (
            <p key={r.de} className="rounded-lg bg-blue-50 px-2 py-1 text-blue-900">
              <b>Cor com cor:</b> {curto(r.de, 30)} → {curto(r.para, 30)} ({Math.min(cap(r.de), cap(r.para))} fibras)
            </p>
          ))}
          {divergentes.map((c, i) => (
            <p key={i} className="rounded-lg bg-red-50 px-2 py-1 text-red-700">
              Rota “{curto(c.s.rota, 24)}”: {rotuloPonta(c.s.de)} → {rotuloPonta(c.s.para!)}
              {c.m ? `, mas o mapa diz ${rotuloPonta(c.m.para)}` : ", mas o mapa não tem esta emenda"}
            </p>
          ))}
          {passam.length > 0 && (
            <p className="text-slate-500">Passam direto (sem corte): {passam.map((s) => rotuloPonta(s.de)).join(", ")}</p>
          )}
          {terminam.length > 0 && <p className="text-slate-500">Terminam aqui: {terminam.map((s) => rotuloPonta(s.de)).join(", ")}</p>}
        </div>
      )}

    </div>
  );
}
