"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { CALCULO_PADRAO, corFibra, perdaSplitter, type RotaOptica } from "@/lib/rotaOptica";
import { chaveElemento, type NoArvore } from "@/lib/arvorePon";
import {
  portasFinais,
  portasPara,
  rotuloSplitters,
  salvarCaixa,
  splittersDaCaixa,
  totalPernas,
  type CaixaRede,
  type PortaCaixa,
  type SplitterCaixa,
  type StatusPorta,
} from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { IconeElementoSvg } from "./IconesRede";
import { chaveCabo } from "@/lib/cabosRede";
import { cortar } from "@/lib/textoCompleto";

/**
 * CTO por dentro: um ou mais splitters (1:8, 1:2 + 1:8, dois 1:8 em dois níveis…), cada um alimentado
 * por uma fibra que chega (de uma rota) ou por uma porta de outro splitter; nas portas finais, os clientes.
 */

interface Props {
  no: NoArvore;
  /** Todas as rotas (as fibras que chegam nesta caixa) */
  rotas: RotaOptica[];
  modelos: ItemCatalogo[];
  usuario: string;
  onSalva: (c: CaixaRede) => void;
  /** Fibras que seguem para a frente (porta Ramal) */
  saidas: { nome: string; cabo?: string; fibra?: number }[];
  /** "CTO" (padrão), "HUB" ou "CDOI" — muda os textos e as cores */
  tipoCaixa?: "CTO" | "HUB" | "CDOI";
  /** Abre direto na edição; Salvar/Cancelar chamam onFechar */
  soEdicao?: boolean;
  onFechar?: () => void;
}

const ROW = 22;
const W = 440;
const TOPO = 34;
const conector = CALCULO_PADRAO.conector_db;

const novoId = () => Math.random().toString(36).slice(2, 8);
const curto = (s: string, n = 22) => {
  const t = s.split(" - ")[0].split(" / ")[0].trim();
  return cortar(t, n, s);
};
const dbm = (v?: number) => (v === undefined || Number.isNaN(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}`);
function nivel(v?: number) {
  if (v === undefined) return "#94a3b8";
  if (v >= -20) return "#16a34a";
  if (v >= -25) return "#65a30d";
  if (v >= -27) return "#d97706";
  return "#dc2626";
}
const textoSaida = (s: { nome: string; cabo?: string; fibra?: number }) => {
  const cabo = (s.cabo ?? "").split(" · ")[0].split(" - ")[0].trim();
  const resto = [cabo, s.fibra ? `F${s.fibra}` : ""].filter(Boolean).join(" ");
  return resto ? `${s.nome} · ${resto}` : s.nome;
};

export default function CaixaCto({ no, rotas, modelos, usuario, onSalva, saidas, tipoCaixa = "CTO", soEdicao, onFechar }: Props) {
  const el = no.elemento;
  const chave = chaveElemento(el);
  const [editando, setEditando] = useState(!!soEdicao);
  const [spls, setSpls] = useState<SplitterCaixa[]>(() =>
    splittersDaCaixa(no.caixa, { splitter: el.splitter, splitter_modelo: el.splitter_modelo, cabo: el.cabo_entrada, fibra: el.fibra_entrada }),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ---------- Fibras que chegam nesta caixa (uma por rota/cor) ----------
  const entradas: { cabo: string; fibra: number; pot?: number; rota: string }[] = [];
  for (const r of rotas) {
    r.elementos.forEach((e, i) => {
      if (i === 0 || chaveElemento(e) !== chave || !e.cabo_entrada || !e.fibra_entrada) return;
      if (entradas.some((x) => chaveCabo(x.cabo) === chaveCabo(e.cabo_entrada!) && x.fibra === e.fibra_entrada)) return;
      entradas.push({ cabo: e.cabo_entrada, fibra: e.fibra_entrada, pot: e.potencia_entrada, rota: r.nome });
    });
  }

  // ---------- Potência e níveis ----------
  const modeloDe = (s: SplitterCaixa) => modelos.find((m) => m.id === s.modelo_id);
  const perda = (s: SplitterCaixa) => perdaSplitter(s.relacao, modeloDe(s)?.perda_db);
  const potEntrada = (s: SplitterCaixa, prof = 0): number | undefined => {
    if (prof > 8) return undefined;
    if (s.entrada.fibra) {
      const f = s.entrada.fibra;
      return entradas.find((x) => chaveCabo(x.cabo) === chaveCabo(f.cabo) && x.fibra === f.fibra)?.pot ?? el.potencia_entrada;
    }
    if (s.entrada.splitter) {
      const pai = spls.find((x) => x.id === s.entrada.splitter!.id);
      const p = pai ? potEntrada(pai, prof + 1) : undefined;
      return p !== undefined && pai ? p - perda(pai) : undefined;
    }
    return undefined;
  };
  const potSaida = (s: SplitterCaixa) => {
    const p = potEntrada(s);
    return p !== undefined ? p - perda(s) : undefined;
  };
  const filhoDa = (s: SplitterCaixa, porta: number) => spls.find((x) => x.entrada.splitter?.id === s.id && x.entrada.splitter.porta === porta);
  const nomeSpl = (s: SplitterCaixa) => `S${spls.indexOf(s) + 1}`;

  // ---------- Layout: raízes à esquerda, níveis para a direita, uma linha por porta final ----------
  const nivelDe = new Map<string, number>();
  const yDe = new Map<string, number>();
  const linhasPorta: { spl: SplitterCaixa; porta: PortaCaixa; y: number }[] = [];
  let linha = 0;
  const posiciona = (s: SplitterCaixa, nv: number, visitados: Set<string>) => {
    if (visitados.has(s.id)) return;
    visitados.add(s.id);
    nivelDe.set(s.id, nv);
    const ys: number[] = [];
    for (const p of portasPara(s.relacao, s.portas)) {
      const f = filhoDa(s, p.numero);
      if (f && !visitados.has(f.id)) {
        posiciona(f, nv + 1, visitados);
        ys.push(yDe.get(f.id)!);
      } else {
        linhasPorta.push({ spl: s, porta: p, y: linha });
        ys.push(linha++);
      }
    }
    yDe.set(s.id, ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : linha++);
  };
  const visit = new Set<string>();
  spls.filter((s) => !s.entrada.splitter || !spls.some((x) => x.id === s.entrada.splitter!.id)).forEach((s) => posiciona(s, 0, visit));
  spls.forEach((s) => posiciona(s, 0, visit)); // sobra (ciclo): entra como raiz
  const maxNv = Math.max(0, ...nivelDe.values());
  const xFinal = W - 168;
  const passo = Math.min(110, (xFinal - 96) / (maxNv + 1));
  const xSpl = (s: SplitterCaixa) => 74 + (nivelDe.get(s.id) ?? 0) * passo;
  const Y = (v: number) => TOPO + v * ROW + ROW / 2;
  const H = TOPO + Math.max(linha, 1) * ROW + 12;

  // ---------- Números ----------
  const finais = portasFinais(spls);
  const clientes = finais.filter((f) => f.porta.status === "cliente").length;
  const ramais = finais.filter((f) => f.porta.status === "ramal").length;
  const potsFinais = finais.map((f) => potSaida(f.spl)).filter((v): v is number => v !== undefined).map((v) => v - conector);
  const pior = potsFinais.length ? Math.min(...potsFinais) : undefined;

  // ---------- Edição ----------
  const modelosSplitter = modelos;
  function mudar(id: string, m: Partial<SplitterCaixa>) {
    setSpls((l) => l.map((s) => (s.id === id ? { ...s, ...m } : s)));
  }
  function trocarModelo(s: SplitterCaixa, modeloId: string) {
    const m = modelosSplitter.find((x) => x.id === modeloId);
    if (!m?.relacao) return;
    mudar(s.id, { modelo_id: m.id, relacao: m.relacao, portas: portasPara(m.relacao, s.portas) });
    // filhos ligados em portas que deixaram de existir perdem a entrada
    const total = totalPernas(m.relacao) ?? 0;
    setSpls((l) => l.map((x) => (x.entrada.splitter?.id === s.id && x.entrada.splitter.porta > total ? { ...x, entrada: {} } : x)));
  }
  function trocarEntrada(s: SplitterCaixa, v: string) {
    if (v.startsWith("f:")) {
      const [cabo, fibra] = v.slice(2).split("|");
      mudar(s.id, { entrada: { fibra: { cabo, fibra: +fibra } } });
    } else if (v.startsWith("s:")) {
      const [id, porta] = v.slice(2).split("|");
      mudar(s.id, { entrada: { splitter: { id, porta: +porta } } });
      // a porta que agora alimenta o splitter deixa de ser cliente/ramal
      setSpls((l) => l.map((x) => (x.id === id ? { ...x, portas: x.portas.map((p) => (p.numero === +porta ? { numero: p.numero, status: "livre" as StatusPorta } : p)) } : x)));
    } else mudar(s.id, { entrada: {} });
  }
  function porta(s: SplitterCaixa, numero: number, m: Partial<PortaCaixa>) {
    mudar(s.id, { portas: portasPara(s.relacao, s.portas).map((p) => (p.numero === numero ? { ...p, ...m } : p)) });
  }
  function addSplitter() {
    const m = modelosSplitter.find((x) => x.relacao === "1:8") ?? modelosSplitter[0];
    if (!m?.relacao) return setErro("Cadastre um splitter primeiro (Cadastros → Splitters).");
    // novo splitter: entra na primeira porta livre de um splitter existente (2º nível), ou numa fibra que chega
    const livre = finais.find((f) => f.porta.status === "livre");
    const fibraLivre = entradas.find((e) => !spls.some((s) => !!s.entrada.fibra && chaveCabo(s.entrada.fibra.cabo) === chaveCabo(e.cabo) && s.entrada.fibra.fibra === e.fibra));
    const entrada = fibraLivre ? { fibra: { cabo: fibraLivre.cabo, fibra: fibraLivre.fibra } } : livre ? { splitter: { id: livre.spl.id, porta: livre.porta.numero } } : {};
    setSpls((l) => [...l, { id: novoId(), relacao: m.relacao!, modelo_id: m.id, entrada, portas: portasPara(m.relacao, []) }]);
  }
  function removerSplitter(s: SplitterCaixa) {
    setSpls((l) => l.filter((x) => x.id !== s.id).map((x) => (x.entrada.splitter?.id === s.id ? { ...x, entrada: {} } : x)));
  }
  async function salvar() {
    for (const s of spls) {
      if (!modelosSplitter.some((m) => m.id === s.modelo_id)) return setErro(`${nomeSpl(s)}: escolha um splitter do cadastro.`);
      if (!s.entrada.fibra && !s.entrada.splitter) return setErro(`${nomeSpl(s)}: escolha de onde vem a fibra.`);
    }
    setSalvando(true);
    setErro(null);
    try {
      const salva = await salvarCaixa({
        chave,
        nome: el.nome,
        splitters: spls,
        regras_emenda: no.caixa?.regras_emenda,
        emendas: no.caixa?.emendas,
        atendimento: no.caixa?.atendimento,
        splitter: spls[0]?.relacao,
        splitter_modelo: spls[0]?.modelo_id,
        portas: spls[0]?.portas ?? [],
        obs: no.caixa?.obs,
        atualizado_por: usuario,
      });
      onSalva(salva);
      setEditando(false);
      onFechar?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }
  function cancelar() {
    setSpls(splittersDaCaixa(no.caixa, { splitter: el.splitter, splitter_modelo: el.splitter_modelo, cabo: el.cabo_entrada, fibra: el.fibra_entrada }));
    setEditando(false);
    setErro(null);
    onFechar?.();
  }

  const campo = "w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px]";
  // cores por tipo: CTO verde · CDOI laranja · HUB amarelo
  const tema =
    tipoCaixa === "CDOI"
      ? { caixa: "border-orange-900/40 bg-[#431407]", grade: "#7c2d12", texto: "#fdba74" }
      : tipoCaixa === "HUB"
        ? { caixa: "border-yellow-900/40 bg-[#422006]", grade: "#713f12", texto: "#fde047" }
        : { caixa: "border-emerald-900/40 bg-[#052e1f]", grade: "#064e3b", texto: "#6ee7b7" };
  const COR_ST: Record<StatusPorta, string> = { livre: "bg-white text-slate-500", cliente: "bg-sky-600 text-white", ramal: "bg-amber-500 text-white" };

  // Só passagem nesta porta: não há o que configurar aqui (splitters, se houver, são da porta que usa); só mostra a fibra atravessando
  if (no.elemento.passagem && !editando) {
    const cEnt = corFibra(el.fibra_entrada, el.cabo_entrada);
    return (
      <div className="p-3 space-y-2.5">
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-slate-800">Só passagem nesta porta</p>
          <p className="mt-0.5 text-[11px] text-slate-600">A fibra atravessa a {tipoCaixa} sem usar splitter (como numa caixa de emenda).</p>
        </div>
        <ul className="space-y-1 text-[11px] text-slate-700">
          <li className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-slate-400">Chega</span>
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: cEnt.hex }} />
            <span className="truncate">F{el.fibra_entrada ?? "?"} {cEnt.nome.toLowerCase()} · {el.cabo_entrada ?? "cabo ?"}</span>
          </li>
          {saidas.map((sd, k) => {
            const c = corFibra(sd.fibra, sd.cabo);
            return (
              <li key={k} className="flex items-center gap-1.5">
                <span className="w-12 shrink-0 text-slate-400">Segue</span>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: c.hex }} />
                <span className="truncate">F{sd.fibra ?? "?"} {c.nome.toLowerCase()} · {sd.cabo ?? "cabo ?"} → {sd.nome}</span>
              </li>
            );
          })}
        </ul>
        {spls.length > 0 && (
          <p className="text-[10px] text-slate-400">Os splitters desta {tipoCaixa} são de outra porta: veja e edite na árvore da porta que usa.</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[11px] text-slate-500">
          {tipoCaixa === "HUB"
            ? "Splitters primários da HUB: um para cada porta PON (fibra que chega)."
            : tipoCaixa === "CDOI"
              ? "Splitter da CDOI e o apartamento / cliente em cada perna."
              : "Splitters de atendimento da CTO e os clientes em cada porta."}
        </p>
        {!editando && (
          <button type="button" onClick={() => setEditando(true)} className="ml-auto shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400">
            ✎ Editar splitters e portas
          </button>
        )}
      </div>

      {no.elemento.passagem && !editando && (
        <p className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
          Nesta porta PON a {tipoCaixa} é <b>só passagem</b>: a fibra atravessa a caixa; os splitters abaixo atendem outra porta ou outra fibra.
        </p>
      )}
      {/* Números */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { r: "Splitters", v: spls.length ? rotuloSplitters(spls) : "—", d: `${spls.length} no total` },
          { r: "Portas", v: String(finais.length), d: "de atendimento" },
          { r: "Clientes", v: `${clientes}/${finais.length}`, d: `${finais.length - clientes - ramais} livres${ramais ? ` · ${ramais} ramal` : ""}` },
          { r: "Pior porta", v: dbm(pior), d: pior !== undefined ? "dBm" : "sem medida", cor: nivel(pior) },
        ].map((t) => (
          <div key={t.r} className="rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] text-slate-500">{t.r}</p>
            <p className="truncate text-sm font-bold" style={{ color: t.cor ?? "#1e293b" }}>{t.v}</p>
            <p className="truncate text-[9.5px] text-slate-400">{t.d}</p>
          </div>
        ))}
      </div>

      {/* Desenho */}
      {spls.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
          Esta {tipoCaixa} ainda não tem splitter. {editando ? "Adicione abaixo." : "Clique em Editar."}
        </div>
      ) : (
        <div className={`overflow-hidden rounded-2xl border shadow-lg ${tema.caixa}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none">
            <defs>
              <pattern id="ctoGrade" width="14" height="14" patternUnits="userSpaceOnUse">
                <path d="M14 0H0V14" fill="none" stroke={tema.grade} strokeWidth=".6" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#ctoGrade)" />
            <text x="8" y="14" fontSize="7.5" fill={tema.texto} fontWeight={800} letterSpacing=".08em">FIBRAS QUE CHEGAM</text>
            <text x={W - 8} y="14" fontSize="7.5" fill={tema.texto} fontWeight={800} textAnchor="end" letterSpacing=".08em">
              {tipoCaixa === "CDOI" ? "APARTAMENTOS / CLIENTES" : "PORTAS DE ATENDIMENTO"}
            </text>

            {/* fibra que entra em cada splitter de 1º nível */}
            {spls.filter((s) => s.entrada.fibra).map((s) => {
              const f = s.entrada.fibra!;
              const c = corFibra(f.fibra, f.cabo);
              const y = Y(yDe.get(s.id) ?? 0);
              const p = potEntrada(s);
              return (
                <g key={`in${s.id}`}>
                  <title>{`${f.cabo} · fibra ${f.fibra}`}</title>
                  <path d={`M0 ${y} H${xSpl(s)}`} stroke="#020617" strokeWidth="6" />
                  <path d={`M0 ${y} H${xSpl(s)}`} stroke={c.hex} strokeWidth="2.4" />
                  <circle r="2" fill="#fff">
                    <animateMotion dur="2s" repeatCount="indefinite" path={`M0 ${y} H${xSpl(s)}`} />
                  </circle>
                  <text x="4" y={y - 6} fontSize="6.8" fill="#d1fae5" fontWeight={700}>{curto(f.cabo, 13)} F{f.fibra}</text>
                  <text x="4" y={y + 11} fontSize="6.5" fill={nivel(p)} fontWeight={700}>{dbm(p)} dBm</text>
                </g>
              );
            })}

            {/* ligações das portas: para outro splitter (2º nível) ou para a porta final */}
            {spls.map((s) => {
              const x0 = xSpl(s) + 30;
              const y0 = Y(yDe.get(s.id) ?? 0);
              return portasPara(s.relacao, s.portas).map((p) => {
                const f = filhoDa(s, p.numero);
                const alvo = f ? { x: xSpl(f), y: Y(yDe.get(f.id) ?? 0) } : { x: xFinal, y: Y(linhasPorta.find((l) => l.spl.id === s.id && l.porta.numero === p.numero)?.y ?? 0) };
                const usada = f || p.status !== "livre";
                return (
                  <path
                    key={`l${s.id}${p.numero}`}
                    d={`M${x0} ${y0} C${x0 + 18} ${y0}, ${alvo.x - 18} ${alvo.y}, ${alvo.x} ${alvo.y}`}
                    fill="none"
                    stroke={f ? "#fbbf24" : usada ? "#34d399" : "#335a4a"}
                    strokeWidth={f ? 2 : usada ? 1.5 : 1}
                    strokeDasharray={usada ? undefined : "3 2"}
                  />
                );
              });
            })}

            {/* splitters */}
            {spls.map((s) => {
              const x = xSpl(s);
              const y = Y(yDe.get(s.id) ?? 0);
              return (
                <g key={`s${s.id}`}>
                  <rect x={x} y={y - 17} width="30" height="34" rx="6" fill="#ecfdf5" stroke="#fff" strokeWidth="1.2" />
                  <text x={x + 15} y={y - 6} fontSize="6.5" fill="#065f46" textAnchor="middle" fontWeight={800}>{nomeSpl(s)}</text>
                  <text x={x + 15} y={y + 4} fontSize="9" fill="#022c22" textAnchor="middle" fontWeight={900}>{s.relacao}</text>
                  <text x={x + 15} y={y + 13} fontSize="6" fill="#047857" textAnchor="middle">−{perda(s).toFixed(1).replace(".", ",")}</text>
                </g>
              );
            })}

            {/* portas finais */}
            {linhasPorta.map(({ spl, porta: p, y: v }) => {
              const y = Y(v);
              const pot = potSaida(spl);
              const potP = pot !== undefined ? pot - conector : undefined;
              const txt = p.status === "cliente" ? p.descricao || "cliente" : p.status === "ramal" ? `→ ${p.descricao || "ramal"}` : "livre";
              return (
                <g key={`p${spl.id}${p.numero}`}>
                  <rect x={xFinal - 1} y={y - 6} width="26" height="12" rx="2.5" fill={p.status === "livre" ? "#1f3d33" : p.status === "cliente" ? "#0284c7" : "#d97706"} stroke="#022c22" />
                  <text x={xFinal + 12} y={y + 2.6} fontSize="6.5" fill="#fff" textAnchor="middle" fontWeight={800}>{nomeSpl(spl)}·{p.numero}</text>
                  {p.status === "cliente" && <IconeElementoSvg tipo="onu" x={xFinal + 34} y={y} tamanho={13} />}
                  <text x={xFinal + (p.status === "cliente" ? 43 : 31)} y={y + 2.8} fontSize="7.5" fill={p.status === "livre" ? "#5e8a78" : "#ecfdf5"} fontWeight={p.status === "livre" ? 400 : 700}>
                    {curto(txt, 18)}
                  </text>
                  <text x={W - 6} y={y + 2.8} fontSize="7" fill={nivel(potP)} textAnchor="end" fontWeight={700}>{dbm(potP)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Fibras que chegam */}
      {!editando && entradas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entradas.map((e) => {
            const c = corFibra(e.fibra, e.cabo);
            const usa = spls.filter((s) => !!s.entrada.fibra && chaveCabo(s.entrada.fibra.cabo) === chaveCabo(e.cabo) && s.entrada.fibra.fibra === e.fibra).map(nomeSpl);
            return (
              <span key={`${e.cabo}${e.fibra}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600" title={e.rota}>
                <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: c.hex }} />
                {curto(e.cabo, 18)} F{e.fibra} → {usa.length ? usa.join(", ") : <b className="text-amber-700">sem splitter</b>}
              </span>
            );
          })}
        </div>
      )}

      {/* Edição */}
      {editando && (
        <div className="space-y-2">
          {spls.map((s) => {
            const usadasPorOutros = new Set(spls.filter((x) => x.id !== s.id && x.entrada.splitter).map((x) => `${x.entrada.splitter!.id}|${x.entrada.splitter!.porta}`));
            const valorEntrada = s.entrada.fibra ? `f:${s.entrada.fibra.cabo}|${s.entrada.fibra.fibra}` : s.entrada.splitter ? `s:${s.entrada.splitter.id}|${s.entrada.splitter.porta}` : "";
            return (
              <div key={s.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="rounded-md bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{nomeSpl(s)}</span>
                  <select className={campo} value={modelosSplitter.some((m) => m.id === s.modelo_id) ? s.modelo_id : ""} onChange={(e) => trocarModelo(s, e.target.value)}>
                    <option value="" disabled>Splitter do cadastro…</option>
                    {modelosSplitter.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <button type="button" onClick={() => removerSplitter(s)} className="text-slate-400 hover:text-red-600" title="Tirar este splitter">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="block text-[10px] font-semibold text-slate-500">Entrada (de onde vem a fibra)</label>
                <select className={`${campo} mb-1.5`} value={valorEntrada} onChange={(e) => trocarEntrada(s, e.target.value)}>
                  <option value="">Escolha…</option>
                  {entradas.length > 0 && (
                    <optgroup label={`Fibra que chega na ${tipoCaixa}`}>
                      {entradas.map((e) => (
                        <option key={`${e.cabo}${e.fibra}`} value={`f:${e.cabo}|${e.fibra}`}>
                          F{e.fibra} {corFibra(e.fibra, e.cabo).nome.toLowerCase()} · {curto(e.cabo, 26)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {spls.filter((x) => x.id !== s.id).map((x) => (
                    <optgroup key={x.id} label={`Porta de ${nomeSpl(x)} (${x.relacao}) — 2º nível`}>
                      {portasPara(x.relacao, x.portas).map((p) => {
                        const k = `${x.id}|${p.numero}`;
                        return (
                          <option key={k} value={`s:${k}`} disabled={usadasPorOutros.has(k)}>
                            {nomeSpl(x)} porta {p.numero}{usadasPorOutros.has(k) ? " (já usada)" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                <div className="grid grid-cols-1 gap-1">
                  {portasPara(s.relacao, s.portas).map((p) => {
                    const f = filhoDa(s, p.numero);
                    return (
                      <div key={p.numero} className="flex items-center gap-1">
                        <span className="w-7 shrink-0 rounded border border-slate-300 bg-white py-0.5 text-center text-[10px] font-bold">{p.numero}</span>
                        {f ? (
                          <span className="text-[10px] font-semibold text-amber-700">→ alimenta {nomeSpl(f)} ({f.relacao})</span>
                        ) : (
                          <>
                            <div className="flex shrink-0 rounded border border-slate-200 bg-slate-50 p-0.5">
                              {/* CDOI: perna livre ou com cliente (não sai ramal de CDOI) */}
                              {(tipoCaixa === "CDOI" ? (["livre", "cliente"] as const) : (["livre", "cliente", "ramal"] as const)).map((st) => (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() => porta(s, p.numero, { status: st, descricao: st === "livre" ? undefined : p.descricao })}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.status === st ? COR_ST[st] : "text-slate-500"}`}
                                >
                                  {st === "livre" ? "Livre" : st === "cliente" ? "Cliente" : "Ramal"}
                                </button>
                              ))}
                            </div>
                            {p.status === "ramal" && saidas.length > 0 ? (
                              <select className={campo} value={p.descricao ?? ""} onChange={(e) => porta(s, p.numero, { descricao: e.target.value })}>
                                <option value="">Fibra que segue…</option>
                                {saidas.map((x) => <option key={textoSaida(x)} value={textoSaida(x)}>{x.fibra ? `F${x.fibra} → ` : ""}{curto(x.nome, 26)}</option>)}
                              </select>
                            ) : (
                              <input
                                className={campo}
                                disabled={p.status === "livre"}
                                value={p.descricao ?? ""}
                                onChange={(e) => porta(s, p.numero, { descricao: e.target.value })}
                                placeholder={p.status === "cliente" ? (tipoCaixa === "CDOI" ? "Apto / cliente (ex.: 302 · João)" : "Cliente / login") : p.status === "ramal" ? "Para onde vai (ex.: CT 12)" : "livre"}
                              />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addSplitter}
            className="flex w-full items-center justify-center gap-1 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <Plus className="h-3.5 w-3.5" /> Splitter (outra fibra que chega, ou 2º nível numa porta livre)
          </button>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancelar} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Cancelar</button>
            <button type="button" disabled={salvando} onClick={salvar} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar {tipoCaixa}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
