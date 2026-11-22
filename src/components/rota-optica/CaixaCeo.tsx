"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { capacidadeDoCabo, capacidadeRegistrada, corFibra, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, type NoArvore } from "@/lib/arvorePon";
import { chaveCabo } from "@/lib/cabosRede";
import { salvarCaixa, type CaixaRede, type EmendaCaixa, type PontaFibra, type RegraEmenda } from "@/lib/caixasRede";
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
  usuario: string;
  onSalva: (c: CaixaRede) => void;
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

export default function CaixaCeo({ no, rotas, usuario, onSalva }: Props) {
  const el = no.elemento;
  const chave = chaveElemento(el);
  const [editando, setEditando] = useState(false);
  const [regras, setRegras] = useState<RegraEmenda[]>(no.caixa?.regras_emenda ?? []);
  const [avulsas, setAvulsas] = useState<EmendaCaixa[]>(no.caixa?.emendas ?? []);
  const [todas, setTodas] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState<{ deCabo: string; deFibra: string; paraCabo: string; paraFibra: string }>({ deCabo: "", deFibra: "", paraCabo: "", paraFibra: "" });
  const [novaRegra, setNovaRegra] = useState<{ de: string; para: string }>({ de: "", para: "" });

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

  // ---------- Edição ----------
  function addRegra() {
    if (!novaRegra.de || !novaRegra.para) return setErro("Escolha o cabo que chega e o que sai.");
    if (chaveCabo(novaRegra.de) === chaveCabo(novaRegra.para)) return setErro("Escolha cabos diferentes.");
    setRegras((l) => [...l.filter((r) => chaveCabo(r.de) !== chaveCabo(novaRegra.de)), { ...novaRegra }]);
    setNovaRegra({ de: "", para: "" });
    setErro(null);
  }
  function addAvulsa() {
    const df = +nova.deFibra, pf = +nova.paraFibra;
    if (!nova.deCabo || !nova.paraCabo || !df || !pf) return setErro("Preencha cabo e fibra dos dois lados.");
    const e: EmendaCaixa = { de: { cabo: nova.deCabo, fibra: df }, para: { cabo: nova.paraCabo, fibra: pf } };
    setAvulsas((l) => [...l.filter((a) => k(a.de) !== k(e.de)), e]);
    setNova((x) => ({ ...x, deFibra: "", paraFibra: "" }));
    setErro(null);
  }
  function trazerDasRotas() {
    const novas = conf.filter((c) => c.st !== "ok").map((c) => ({ de: c.s.de, para: c.s.para! }));
    setAvulsas((l) => [...l.filter((a) => !novas.some((n) => k(n.de) === k(a.de))), ...novas]);
  }
  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const c = no.caixa;
      const salva = await salvarCaixa({
        chave,
        nome: el.nome,
        splitter: c?.splitter,
        splitter_modelo: c?.splitter_modelo,
        portas: c?.portas ?? [],
        splitters: c?.splitters,
        obs: c?.obs,
        regras_emenda: regras,
        emendas: avulsas,
        atendimento: c?.atendimento,
        atualizado_por: usuario,
      });
      onSalva(salva);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  function cancelar() {
    setRegras(no.caixa?.regras_emenda ?? []);
    setAvulsas(no.caixa?.emendas ?? []);
    setEditando(false);
    setErro(null);
  }

  const campo = "rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px]";
  const opcoesFibra = (c: string) =>
    c ? Array.from({ length: cap(c) }, (_, i) => i + 1).map((f) => <option key={f} value={f}>F{f} {corFibra(f, c).nome.toLowerCase()} · {corFibra(f, c).rotulo.split(" ")[0]}</option>) : null;
  const rotuloPonta = (p: PontaFibra) => `${curto(p.cabo, 24)} ${corFibra(p.fibra, p.cabo).rotulo}`;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-500">Mapa de emendas: cor com cor e as exceções.</p>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} className="ml-auto shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-400">
            ✎ Editar emendas
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
      {!editando && (
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

      {/* Edição */}
      {editando && (
        <div className="space-y-2.5">
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2 space-y-1.5">
            <p className="text-[11px] font-bold text-blue-900">Cor com cor (fibra N → fibra N)</p>
            {regras.map((r) => (
              <div key={r.de} className="flex items-center gap-1 text-[11px]">
                <span className="min-w-0 flex-1 truncate">{curto(r.de, 26)} → {curto(r.para, 26)}</span>
                <button type="button" onClick={() => setRegras((l) => l.filter((x) => x !== r))} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
              <select className={campo} value={novaRegra.de} onChange={(e) => setNovaRegra((x) => ({ ...x, de: e.target.value }))}>
                <option value="">Cabo que chega…</option>
                {cabosEntram.map((c) => <option key={c} value={c}>{curto(c, 30)}</option>)}
              </select>
              <select className={campo} value={novaRegra.para} onChange={(e) => setNovaRegra((x) => ({ ...x, para: e.target.value }))}>
                <option value="">Cabo que sai…</option>
                {cabosSaem.map((c) => <option key={c} value={c}>{curto(c, 30)}</option>)}
              </select>
              <button type="button" onClick={addRegra} className="rounded-md bg-blue-600 px-2 text-[11px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-700">Emendas avulsas (exceções)</p>
            {avulsas.map((a) => (
              <div key={k(a.de)} className="flex items-center gap-1 text-[11px]">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: corFibra(a.de.fibra, a.de.cabo).hex }} />
                <span className="min-w-0 flex-1 truncate">{rotuloPonta(a.de)} → {rotuloPonta(a.para)}</span>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: corFibra(a.para.fibra, a.para.cabo).hex }} />
                <button type="button" onClick={() => setAvulsas((l) => l.filter((x) => x !== a))} className="text-slate-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1">
              <select className={campo} value={nova.deCabo} onChange={(e) => setNova((x) => ({ ...x, deCabo: e.target.value, deFibra: "" }))}>
                <option value="">Cabo que chega…</option>
                {cabosEntram.map((c) => <option key={c} value={c}>{curto(c, 30)}</option>)}
              </select>
              <select className={campo} value={nova.deFibra} disabled={!nova.deCabo} onChange={(e) => setNova((x) => ({ ...x, deFibra: e.target.value }))}>
                <option value="">fibra…</option>
                {opcoesFibra(nova.deCabo)}
              </select>
              <select className={campo} value={nova.paraCabo} onChange={(e) => setNova((x) => ({ ...x, paraCabo: e.target.value, paraFibra: "" }))}>
                <option value="">Cabo que sai…</option>
                {cabosSaem.map((c) => <option key={c} value={c}>{curto(c, 30)}</option>)}
              </select>
              <select className={campo} value={nova.paraFibra} disabled={!nova.paraCabo} onChange={(e) => setNova((x) => ({ ...x, paraFibra: e.target.value }))}>
                <option value="">fibra…</option>
                {opcoesFibra(nova.paraCabo)}
              </select>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={addAvulsa} className="flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white">
                <Plus className="h-3.5 w-3.5" /> Adicionar emenda
              </button>
              {conf.some((c) => c.st !== "ok") && (
                <button type="button" onClick={trazerDasRotas} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700">
                  Trazer as emendas das rotas
                </button>
              )}
            </div>
          </div>
          {repetidas.size > 0 && <p className="text-[11px] font-semibold text-red-600">Há fibra de saída emendada duas vezes (em vermelho no desenho).</p>}
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelar} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Cancelar</button>
            <button type="button" disabled={salvando} onClick={salvar} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar emendas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
