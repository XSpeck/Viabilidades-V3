"use client";

import { corFibra, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento } from "@/lib/arvorePon";
import { chaveCabo } from "@/lib/cabosRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * Diagrama de emendas de uma caixa: cabos que chegam (esquerda) e que saem (direita), com tubo e fibra,
 * ligados no meio por fusão, passagem direta (sem corte), splitter ou "termina aqui".
 * Monta tudo a partir das rotas salvas que passam pela caixa.
 */

type Ligacao =
  | { tipo: "fusao" | "passa"; inCabo: string; inFibra?: number; outCabo: string; outFibra?: number; destino: string; rotas: string[] }
  | { tipo: "termina"; inCabo: string; inFibra?: number; rotas: string[] };

interface GrupoSplitter {
  inCabo: string;
  inFibra?: number;
  splitter: string;
  saidas: { outCabo: string; outFibra?: number; destino: string; rotas: string[] }[];
}

export function ligacoesDaCaixa(chave: string, rotas: RotaOptica[]) {
  const simples = new Map<string, Ligacao>();
  const splitters = new Map<string, GrupoSplitter>();
  for (const r of rotas) {
    const j = r.elementos.findIndex((e) => chaveElemento(e) === chave);
    if (j < 0) continue;
    const e = r.elementos[j];
    const prox = r.elementos[j + 1];
    const inCabo = e.cabo_entrada ?? "cabo não informado";
    const inFibra = e.fibra_entrada;
    // cabo que só leva até a entrada de um prédio (as fibras são escolhidas no prédio): não é uma ligação
    if (prox && prox.tipo === "predio" && prox.fibra_entrada === undefined) continue;
    if (e.splitter && prox) {
      const k = `${chaveCabo(inCabo)}|${inFibra}`;
      const g = splitters.get(k) ?? { inCabo, inFibra, splitter: e.splitter, saidas: [] };
      const outCabo = prox.cabo_entrada ?? "cabo não informado";
      const s0 = g.saidas.find((x) => chaveCabo(x.outCabo) === chaveCabo(outCabo) && x.outFibra === prox.fibra_entrada);
      if (s0) s0.rotas.push(r.nome);
      else g.saidas.push({ outCabo, outFibra: prox.fibra_entrada, destino: prox.nome, rotas: [r.nome] });
      splitters.set(k, g);
      continue;
    }
    if (!prox) {
      const k = `T|${chaveCabo(inCabo)}|${inFibra}`;
      const l = simples.get(k);
      if (l) l.rotas.push(r.nome);
      else simples.set(k, { tipo: "termina", inCabo, inFibra, rotas: [r.nome] });
      continue;
    }
    const outCabo = prox.cabo_entrada ?? "cabo não informado";
    const outFibra = prox.fibra_entrada;
    const passa = chaveCabo(inCabo) === chaveCabo(outCabo) && inFibra === outFibra;
    const k = `${chaveCabo(inCabo)}|${inFibra}>${chaveCabo(outCabo)}|${outFibra}`;
    const l = simples.get(k);
    if (l) l.rotas.push(r.nome);
    else simples.set(k, { tipo: passa ? "passa" : "fusao", inCabo, inFibra, outCabo, outFibra, destino: prox.nome, rotas: [r.nome] });
  }
  // "termina aqui" só quando nenhuma outra rota segue com a mesma fibra (ex.: o tronco termina na HUB, mas as sub-rotas continuam)
  for (const [k, l] of [...simples.entries()]) {
    if (l.tipo !== "termina") continue;
    const kIn = `${chaveCabo(l.inCabo)}|${l.inFibra}`;
    if (splitters.has(kIn) || [...simples.values()].some((x) => x !== l && x.tipo !== "termina" && `${chaveCabo(x.inCabo)}|${x.inFibra}` === kIn)) simples.delete(k);
  }
  const lista = [...simples.values()].sort((a, b) => a.inCabo.localeCompare(b.inCabo) || (a.inFibra ?? 0) - (b.inFibra ?? 0));
  return { simples: lista, splitters: [...splitters.values()] };
}

const curto = (t: string, n: number) => cortar(t, n);
const nomeCabo = (t: string) => t.split(" - ")[0].trim() || t;

export default function DiagramaEmendas({ chave, nome, rotas }: { chave: string; nome: string; rotas: RotaOptica[] }) {
  const { simples, splitters } = ligacoesDaCaixa(chave, rotas);

  // Linhas do desenho: cada ligação simples ocupa 1 linha; cada splitter ocupa uma linha por saída
  type Linha =
    | { k: "s"; l: Ligacao }
    | { k: "sp"; g: GrupoSplitter; idx: number };
  const linhas: Linha[] = [
    ...simples.map((l) => ({ k: "s" as const, l })),
    ...splitters.flatMap((g) => g.saidas.map((_, idx) => ({ k: "sp" as const, g, idx }))),
  ];

  if (!linhas.length) {
    return <p className="text-xs text-slate-500 p-3">Nenhuma rota salva passa por esta caixa.</p>;
  }

  const W = 440;
  const ROW = 30;
  const TOPO = 44;
  const H = TOPO + linhas.length * ROW + 34;
  const Y = (i: number) => TOPO + i * ROW + ROW / 2;
  const xStubE = 10, xTuboE = 40, xMeio = W / 2, xTuboD = W - 58, xStubD = W - 30;
  const fusoes = simples.filter((l) => l.tipo === "fusao").length;
  const passas = simples.filter((l) => l.tipo === "passa").length;

  // Grupos contínuos de linhas por cabo (para desenhar a "ponta" do cabo), de cada lado
  function grupos(lado: "e" | "d") {
    const gs: { cabo: string; de: number; ate: number }[] = [];
    linhas.forEach((ln, i) => {
      const cabo =
        ln.k === "s"
          ? lado === "e" ? ln.l.inCabo : ln.l.tipo === "termina" ? null : ln.l.outCabo
          : lado === "e" ? ln.g.inCabo : ln.g.saidas[ln.idx].outCabo;
      if (!cabo) return;
      const ult = gs[gs.length - 1];
      if (ult && chaveCabo(ult.cabo) === chaveCabo(cabo) && ult.ate === i - 1) ult.ate = i;
      else gs.push({ cabo, de: i, ate: i });
    });
    return gs;
  }

  /** Ponta do cabo: capa preta com o nome na vertical */
  function ponta(cabo: string, de: number, ate: number, x: number, k: string) {
    const y1 = Y(de) - ROW / 2 + 3;
    const h = (ate - de + 1) * ROW - 6;
    const max = Math.max(4, Math.floor(h / 6.2));
    return (
      <g key={k}>
        <title>{cabo}</title>
        <rect x={x} y={y1} width={20} height={h} rx={6} fill="#0f172a" />
        <rect x={x + 3} y={y1 + 3} width={3} height={h - 6} rx={1.5} fill="#334155" />
        <text transform={`translate(${x + 14} ${y1 + h / 2}) rotate(-90)`} fontSize={8.5} fontWeight={700} fill="#e2e8f0" textAnchor="middle">
          {curto(nomeCabo(cabo), max)}
        </text>
      </g>
    );
  }

  /** Tubo + fibra de um lado (pílula do tubo e etiqueta da fibra) */
  function fibraLado(cabo: string, fibra: number | undefined, y: number, lado: "e" | "d") {
    const c = corFibra(fibra, cabo);
    const xt = lado === "e" ? xTuboE : xTuboD;
    return (
      <g>
        <rect x={xt} y={y - 6} width={18} height={12} rx={6} fill={c.corTubo?.hex ?? "#cbd5e1"} stroke="#0f172a" strokeWidth={0.8} />
        <text x={xt + 9} y={y + 3} fontSize={7} textAnchor="middle" fontWeight={800} fill="#0f172a">{c.tubo ? `T${c.tubo}` : "–"}</text>
        <text x={lado === "e" ? xt + 24 : xt - 6} y={y - 5} fontSize={8.5} fontWeight={700} textAnchor={lado === "e" ? "start" : "end"} fill="#0f172a">
          {fibra ? `F${String(fibra).padStart(2, "0")}` : "F?"}
        </text>
        <text x={lado === "e" ? xt + 24 : xt - 6} y={y + 11} fontSize={7} textAnchor={lado === "e" ? "start" : "end"} fill="#64748b">
          {c.nome.toLowerCase()}
        </text>
      </g>
    );
  }

  /** Fibra desenhada (capa escura + cor) entre dois pontos */
  function fio(x1: number, y1: number, x2: number, y2: number, hex: string, tracejado = false) {
    const d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
    return (
      <>
        <path d={d} fill="none" stroke="#0f172a" strokeWidth={4.2} strokeLinecap="round" strokeDasharray={tracejado ? "5 4" : undefined} />
        <path d={d} fill="none" stroke={hex} strokeWidth={2.4} strokeLinecap="round" strokeDasharray={tracejado ? "5 4" : undefined} />
      </>
    );
  }

  const fimFibraE = xTuboE + 58;
  const inicioFibraD = xTuboD - 40;

  return (
    <div className="p-2 space-y-2">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-slate-800 text-white px-2 py-0.5 font-semibold">{linhas.length} ligaç{linhas.length !== 1 ? "ões" : "ão"}</span>
        {fusoes > 0 && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">{fusoes} fus{fusoes !== 1 ? "ões" : "ão"}</span>}
        {passas > 0 && <span className="rounded-full bg-sky-100 text-sky-800 px-2 py-0.5 font-medium">{passas} passa{passas !== 1 ? "m" : ""} direto</span>}
        {splitters.length > 0 && <span className="rounded-full bg-indigo-100 text-indigo-800 px-2 py-0.5 font-medium">{splitters.length} splitter{splitters.length !== 1 ? "s" : ""}</span>}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-1">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Diagrama de emendas de ${nome}`}>
          <defs>
            <pattern id="gradeEmendas" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M10 0H0V10" fill="none" stroke="#e2e8f0" strokeWidth=".6" />
            </pattern>
          </defs>
          <rect x={2} y={2} width={W - 4} height={H - 4} rx={12} fill="url(#gradeEmendas)" stroke="#94a3b8" />
          <text x={12} y={18} fontSize={9} fontWeight={800} fill="#475569" letterSpacing=".5">CHEGAM</text>
          <text x={W / 2} y={18} fontSize={9} fontWeight={800} fill="#475569" textAnchor="middle" letterSpacing=".5">BANDEJA DE EMENDA</text>
          <text x={W - 12} y={18} fontSize={9} fontWeight={800} fill="#475569" textAnchor="end" letterSpacing=".5">SAEM</text>
          {/* bandeja */}
          <rect x={xMeio - 46} y={TOPO - 12} width={92} height={linhas.length * ROW + 16} rx={10} fill="#ffffff" stroke="#cbd5e1" strokeDasharray="4 3" />

          {grupos("e").map((g, k) => ponta(g.cabo, g.de, g.ate, xStubE, `pe${k}`))}
          {grupos("d").map((g, k) => ponta(g.cabo, g.de, g.ate, xStubD, `pd${k}`))}

          {/* ligações simples */}
          {linhas.map((ln, i) => {
            if (ln.k !== "s") return null;
            const l = ln.l;
            const y = Y(i);
            const cIn = corFibra(l.inFibra, l.inCabo);
            const titulo = `${l.rotas.join(", ")}`;
            if (l.tipo === "termina") {
              return (
                <g key={`s${i}`}>
                  <title>{`Termina aqui · ${titulo}`}</title>
                  <line x1={xStubE + 20} y1={y} x2={xTuboE} y2={y} stroke="#0f172a" strokeWidth={3} />
                  {fibraLado(l.inCabo, l.inFibra, y, "e")}
                  {fio(fimFibraE, y, xMeio - 10, y, cIn.hex)}
                  <circle cx={xMeio - 6} cy={y} r={4} fill={cIn.hex} stroke="#0f172a" />
                  <text x={xMeio + 4} y={y + 3} fontSize={8.5} fill="#0f172a" fontWeight={700}>termina aqui</text>
                  <text x={xMeio + 4} y={y + 13} fontSize={7} fill="#64748b">atende os clientes da caixa</text>
                </g>
              );
            }
            const cOut = corFibra(l.outFibra, l.outCabo);
            return (
              <g key={`s${i}`}>
                <title>{`${l.tipo === "passa" ? "Passa direto" : "Fusão"} → ${l.destino} · ${titulo}`}</title>
                <line x1={xStubE + 20} y1={y} x2={xTuboE} y2={y} stroke="#0f172a" strokeWidth={3} />
                <line x1={xTuboD + 18} y1={y} x2={xStubD} y2={y} stroke="#0f172a" strokeWidth={3} />
                {fibraLado(l.inCabo, l.inFibra, y, "e")}
                {fibraLado(l.outCabo, l.outFibra, y, "d")}
                {l.tipo === "passa" ? (
                  <>
                    {fio(fimFibraE, y, inicioFibraD, y, cIn.hex, true)}
                    <rect x={xMeio - 30} y={y - 7} width={60} height={13} rx={6.5} fill="#e0f2fe" stroke="#0284c7" />
                    <text x={xMeio} y={y + 2.6} fontSize={7.5} textAnchor="middle" fontWeight={700} fill="#075985">passa direto</text>
                  </>
                ) : (
                  <>
                    {fio(fimFibraE, y, xMeio - 12, y, cIn.hex)}
                    {fio(xMeio + 12, y, inicioFibraD, y, cOut.hex)}
                    {/* protetor de emenda */}
                    <rect x={xMeio - 14} y={y - 5} width={28} height={10} rx={5} fill="#f1f5f9" stroke="#64748b" />
                    <line x1={xMeio - 9} y1={y} x2={xMeio + 9} y2={y} stroke="#94a3b8" strokeWidth={1.4} />
                    <circle cx={xMeio} cy={y} r={2.6} fill="#f59e0b" stroke="#92400e" strokeWidth={0.6} />
                  </>
                )}
              </g>
            );
          })}

          {/* splitters: uma entrada, várias saídas */}
          {splitters.map((g, gi) => {
            const ini = linhas.findIndex((ln) => ln.k === "sp" && ln.g === g);
            const fim = ini + g.saidas.length - 1;
            const yMeio = (Y(ini) + Y(fim)) / 2;
            const cIn = corFibra(g.inFibra, g.inCabo);
            const hBloco = Math.max(28, (fim - ini) * ROW + 20);
            return (
              <g key={`sp${gi}`}>
                <title>{`Splitter ${g.splitter}`}</title>
                <line x1={xStubE + 20} y1={yMeio} x2={xTuboE} y2={yMeio} stroke="#0f172a" strokeWidth={3} />
                {fibraLado(g.inCabo, g.inFibra, yMeio, "e")}
                {fio(fimFibraE, yMeio, xMeio - 22, yMeio, cIn.hex)}
                {g.saidas.map((sd, k) => {
                  const y = Y(ini + k);
                  const cOut = corFibra(sd.outFibra, sd.outCabo);
                  return (
                    <g key={k}>
                      <title>{`Saída do splitter → ${sd.destino} · ${sd.rotas.join(", ")}`}</title>
                      {fio(xMeio + 22, yMeio, inicioFibraD, y, cOut.hex)}
                      <line x1={xTuboD + 18} y1={y} x2={xStubD} y2={y} stroke="#0f172a" strokeWidth={3} />
                      {fibraLado(sd.outCabo, sd.outFibra, y, "d")}
                    </g>
                  );
                })}
                <rect x={xMeio - 22} y={yMeio - hBloco / 2} width={44} height={hBloco} rx={7} fill="#1e293b" stroke="#0f172a" />
                <text x={xMeio} y={yMeio - 2} fontSize={7} textAnchor="middle" fill="#94a3b8">PLC</text>
                <text x={xMeio} y={yMeio + 9} fontSize={10.5} textAnchor="middle" fontWeight={800} fill="#fff">{g.splitter}</text>
              </g>
            );
          })}

          {/* legenda */}
          <g transform={`translate(12 ${H - 18})`}>
            <rect x={0} y={-5} width={20} height={10} rx={5} fill="#f1f5f9" stroke="#64748b" />
            <circle cx={10} cy={0} r={2.4} fill="#f59e0b" />
            <text x={26} y={3} fontSize={8} fill="#475569">fusão</text>
            <line x1={62} y1={0} x2={86} y2={0} stroke="#0284c7" strokeWidth={2.4} strokeDasharray="5 4" />
            <text x={92} y={3} fontSize={8} fill="#475569">passa direto (sem corte)</text>
            <rect x={210} y={-6} width={20} height={12} rx={3} fill="#1e293b" />
            <text x={236} y={3} fontSize={8} fill="#475569">splitter</text>
            <rect x={282} y={-5} width={16} height={10} rx={5} fill="#16a34a" stroke="#0f172a" strokeWidth={0.6} />
            <text x={304} y={3} fontSize={8} fill="#475569">tubo</text>
          </g>
        </svg>
      </div>

      {/* resumo em texto, com destino de cada ligação */}
      <ul className="text-[11px] text-slate-600 space-y-0.5 px-1">
        {simples.map((l, i) => (
          <li key={i} className="truncate" title={l.rotas.join(", ")}>
            {l.tipo === "termina" ? (
              <><b>{nomeCabo(l.inCabo)} {corFibra(l.inFibra, l.inCabo).rotulo}</b> termina aqui</>
            ) : (
              <>
                <b>{nomeCabo(l.inCabo)} {corFibra(l.inFibra, l.inCabo).rotulo}</b> {l.tipo === "passa" ? "passa direto" : "→ fusão →"}{" "}
                <b>{nomeCabo(l.outCabo)} {corFibra(l.outFibra, l.outCabo).rotulo}</b> <span className="text-slate-400">até {curto(l.destino, 28)}</span>
              </>
            )}
          </li>
        ))}
        {splitters.map((g, i) => (
          <li key={`g${i}`} className="truncate">
            <b>{nomeCabo(g.inCabo)} {corFibra(g.inFibra, g.inCabo).rotulo}</b> → splitter {g.splitter} →{" "}
            {g.saidas.map((s0) => `${nomeCabo(s0.outCabo)} ${corFibra(s0.outFibra, s0.outCabo).rotulo}`).join(", ")}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-slate-400 px-1">
        Montado pelas rotas salvas que passam por esta caixa. Passe o mouse numa ligação para ver as rotas.
      </p>
    </div>
  );
}
