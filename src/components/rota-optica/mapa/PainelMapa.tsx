"use client";

import { useState } from "react";
import { Route as RouteIcon } from "lucide-react";
import {
  COR_NIVEL, COR_OCUPACAO, faixaOcupacao, nivelPotencia, ROTULO_NIVEL,
  type Alerta, type CaboAnalise, type CaixaAnalise, type Gravidade, type Indicadores, type NivelPotencia,
} from "@/lib/analiseRede";
import { formatMetros, TIPO_ELEMENTO_LABEL, corFibra, type RotaOptica } from "@/lib/rotaOptica";
import { semCodigo } from "@/lib/cabosRede";
import { IconeElemento, IconeCabo } from "../IconesRede";
import { cortar } from "@/lib/textoCompleto";

export type AbaPainel = "indicadores" | "alertas" | "detalhe";
/** Onde um alerta aponta (para centralizar o mapa e abrir o detalhe) */
export interface AlvoMapa { tipo: "caixa" | "cabo" | "rota"; chave: string; lat?: number; lon?: number; nome: string }
export interface AlertaMapa extends Alerta { alvo: AlvoMapa }

const COR_GRAV: Record<Gravidade, string> = { critico: "bg-red-600", atencao: "bg-orange-500", cadastro: "bg-sky-600" };
const ROT_GRAV: Record<Gravidade, string> = { critico: "Crítico", atencao: "Atenção", cadastro: "Cadastro" };
const dbm = (v?: number) => (v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} dBm`);
const curto = (s: string, n = 30) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

interface Props {
  aba: AbaPainel;
  onAba: (a: AbaPainel) => void;
  ind: Indicadores;
  alertas: AlertaMapa[];
  detalhe: { caixa?: CaixaAnalise; cabo?: CaboAnalise } | null;
  pons: { chave: string; rotulo: string; cor: string }[];
  soVisivel: boolean;
  onSoVisivel: (v: boolean) => void;
  onIrPara: (alvo: AlvoMapa) => void;
  onAbrirRota: (id: string) => void;
  /** Abre a caixa na aba Unifilar (o que tem dentro dela) */
  onAbrirNoUnifilar?: (chave: string) => void;
}

/** Painel do lado do mapa: indicadores da seleção, alertas e detalhe do que foi clicado */
export default function PainelMapa({ aba, onAba, ind, alertas, detalhe, pons, soVisivel, onSoVisivel, onIrPara, onAbrirRota, onAbrirNoUnifilar }: Props) {
  const totalAlertas = alertas.length;
  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[12px] text-slate-700">
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-medium" role="tablist">
        {([["indicadores", "Indicadores"], ["alertas", `Alertas${totalAlertas ? ` (${totalAlertas})` : ""}`], ["detalhe", "Detalhe"]] as const).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => onAba(k)}
            className={`flex-1 border-b-2 -mb-px px-2 py-2 ${aba === k ? "border-indigo-600 bg-white text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {r}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {aba === "indicadores" && <Indicadores_ ind={ind} soVisivel={soVisivel} onSoVisivel={onSoVisivel} />}
        {aba === "alertas" && <Alertas_ alertas={alertas} onIrPara={onIrPara} />}
        {aba === "detalhe" && <Detalhe_ detalhe={detalhe} pons={pons} onAbrirRota={onAbrirRota} onAbrirNoUnifilar={onAbrirNoUnifilar} />}
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, sub, cor }: { rotulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
      <p className="text-[10px] text-slate-500">{rotulo}</p>
      <p className="truncate text-base font-bold tabular-nums" style={{ color: cor ?? "#0f172a" }}>{valor}</p>
      {sub && <p className="truncate text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Barra({ partes }: { partes: { valor: number; cor: string; titulo: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return <div className="h-2 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
      {partes.filter((p) => p.valor).map((p) => <div key={p.titulo} title={`${p.titulo}: ${p.valor}`} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />)}
    </div>
  );
}

function Indicadores_({ ind, soVisivel, onSoVisivel }: { ind: Indicadores; soVisivel: boolean; onSoVisivel: (v: boolean) => void }) {
  const ocup = ind.portas.clientes + ind.portas.ramais;
  const fOc = faixaOcupacao(ocup, ind.portas.total);
  const niveis = (["otima", "boa", "limite", "abaixo", "sem"] as NivelPotencia[]);
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px]">
        <input type="checkbox" checked={soVisivel} onChange={(e) => onSoVisivel(e.target.checked)} />
        Só o que está na área visível do mapa
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <Cartao rotulo="Cabo" valor={`${ind.km.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`} sub="trechos únicos" />
        <Cartao rotulo="Rotas" valor={String(ind.rotas)} sub={`${ind.pons} PON${ind.pons !== 1 ? "s" : ""}`} />
        <Cartao rotulo="Alertas" valor={String(ind.alertas.critico + ind.alertas.atencao + ind.alertas.cadastro)} sub={`${ind.alertas.critico} críticos`} cor={ind.alertas.critico ? "#dc2626" : undefined} />
      </div>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Portas de atendimento</p>
        <div className="grid grid-cols-3 gap-1.5">
          <Cartao rotulo="Ocupação" valor={ind.portas.total ? `${pct(ocup, ind.portas.total)}%` : "—"} sub={`${ocup} de ${ind.portas.total}`} cor={ind.portas.total ? COR_OCUPACAO[fOc] : undefined} />
          <Cartao rotulo="Clientes" valor={String(ind.portas.clientes)} sub={`${ind.portas.ramais} ramal${ind.portas.ramais !== 1 ? "is" : ""}`} />
          <Cartao rotulo="Livres" valor={String(ind.portas.livres)} sub="portas" />
        </div>
        <div className="mt-1.5">
          <Barra partes={[{ valor: ind.portas.clientes, cor: "#0284c7", titulo: "clientes" }, { valor: ind.portas.ramais, cor: "#f59e0b", titulo: "ramais" }, { valor: ind.portas.livres, cor: "#e2e8f0", titulo: "livres" }]} />
        </div>
      </section>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Potência nas pontas</p>
        <div className="grid grid-cols-2 gap-1.5">
          <Cartao rotulo="Pior ponta" valor={dbm(ind.pior)} sub={ROTULO_NIVEL[nivelPotencia(ind.pior)]} cor={COR_NIVEL[nivelPotencia(ind.pior)]} />
          <Cartao rotulo="Cabos quase cheios" valor={String(ind.cabosCheios)} sub="≥ 85% das fibras" cor={ind.cabosCheios ? "#f97316" : undefined} />
        </div>
        <div className="mt-1.5 space-y-1">
          <Barra partes={niveis.map((n) => ({ valor: ind.niveis[n], cor: COR_NIVEL[n], titulo: ROTULO_NIVEL[n] }))} />
          <ul className="grid grid-cols-2 gap-x-2 text-[10.5px]">
            {niveis.map((n) => (
              <li key={n} className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: COR_NIVEL[n] }} />{ROTULO_NIVEL[n]}<b className="ml-auto tabular-nums">{ind.niveis[n]}</b></li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Caixas por tipo</p>
        <ul className="space-y-0.5">
          {ind.caixasPorTipo.map(([t, n]) => (
            <li key={t} className="flex items-center gap-1.5"><IconeElemento tipo={t} tamanho={16} />{TIPO_ELEMENTO_LABEL[t]}<b className="ml-auto tabular-nums">{n}</b></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Alertas_({ alertas, onIrPara }: { alertas: AlertaMapa[]; onIrPara: (a: AlvoMapa) => void }) {
  if (!alertas.length) return <p className="py-6 text-center text-slate-400">Nenhum alerta na seleção. 👍</p>;
  return (
    <div className="space-y-3">
      {(["critico", "atencao", "cadastro"] as Gravidade[]).map((g) => {
        const l = alertas.filter((a) => a.gravidade === g);
        if (!l.length) return null;
        return (
          <section key={g}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <i className={`inline-block h-2 w-2 rounded-full ${COR_GRAV[g]}`} /> {ROT_GRAV[g]} ({l.length})
            </p>
            <ul className="space-y-1">
              {l.map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => onIrPara(a.alvo)} disabled={a.alvo.lat === undefined && a.alvo.tipo !== "rota"}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:border-indigo-300 hover:bg-indigo-50/50 disabled:cursor-default disabled:hover:bg-white">
                    <p className="truncate text-[11px] font-semibold text-slate-800">{curto(a.alvo.nome, 40)}</p>
                    <p className="text-[10.5px] text-slate-600">{a.texto}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ListaRotas({ rotas, onAbrirRota }: { rotas: RotaOptica[]; onAbrirRota: (id: string) => void }) {
  const [todas, setTodas] = useState(false);
  const principais = rotas.filter((r) => !r.pai);
  const subs = rotas.filter((r) => r.pai);
  const lista = todas ? [...principais, ...subs] : principais.length ? principais : subs;
  return (
    <section>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Rotas que passam aqui ({rotas.length})</p>
      <ul className="space-y-1">
        {lista.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onAbrirRota(r.id)} className="flex w-full items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-left text-[11px] text-indigo-700 hover:bg-indigo-100">
              {r.pai ? <span className="w-3.5 text-center text-indigo-300">└</span> : <RouteIcon className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{r.nome}</span>
            </button>
          </li>
        ))}
      </ul>
      {principais.length > 0 && subs.length > 0 && (
        <button type="button" onClick={() => setTodas((v) => !v)} className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-700" aria-expanded={todas}>
          <span className={`inline-block transition-transform ${todas ? "rotate-90" : ""}`}>▸</span>
          {todas ? "esconder sub-rotas" : `${subs.length} sub-rota${subs.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}

function Detalhe_({ detalhe, pons, onAbrirRota, onAbrirNoUnifilar }: { detalhe: Props["detalhe"]; pons: Props["pons"]; onAbrirRota: (id: string) => void; onAbrirNoUnifilar?: (chave: string) => void }) {
  if (!detalhe?.caixa && !detalhe?.cabo) return <p className="py-6 text-center text-slate-400">Clique numa caixa ou num cabo do mapa.</p>;
  const corPon = (k: string) => pons.find((p) => p.chave === k);
  const chipsPon = (ks: string[]) => (
    <div className="flex flex-wrap gap-1">
      {ks.map((k) => { const p = corPon(k); return <span key={k} className="rounded-full px-1.5 py-px text-[10px] font-semibold text-white" style={{ background: p?.cor ?? "#64748b" }}>{p?.rotulo.replace(/^.*· /, "") ?? k}</span>; })}
    </div>
  );
  const alertasDe = (l: Alerta[]) => l.length > 0 && (
    <ul className="space-y-1">
      {l.map((a, i) => <li key={i} className="flex items-start gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px]"><i className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${COR_GRAV[a.gravidade]}`} />{a.texto}</li>)}
    </ul>
  );
  if (detalhe.caixa) {
    const c = detalhe.caixa;
    const oc = c.ocupacao;
    const usadas = oc ? oc.clientes + oc.ramais : 0;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <IconeElemento tipo={c.tipo} tamanho={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800" title={c.nome}>{c.nome}</p>
            <p className="text-[11px] text-slate-500">{TIPO_ELEMENTO_LABEL[c.tipo]}{c.cdois ? ` · ${c.cdois} CDOIs` : ""} · {formatMetros(c.metrosOlt)} da OLT</p>
          </div>
        </div>
        {chipsPon(c.pons)}
        <div className="grid grid-cols-2 gap-1.5">
          <Cartao rotulo="Ocupação" valor={oc?.total ? `${usadas}/${oc.total}` : "—"} sub={oc?.total ? `${pct(usadas, oc.total)}% · ${oc.livres} livres` : "sem cadastro de portas"} cor={oc?.total ? COR_OCUPACAO[faixaOcupacao(usadas, oc.total)] : undefined} />
          <Cartao rotulo="Pior ponta" valor={dbm(c.potPonta)} sub={ROTULO_NIVEL[nivelPotencia(c.potPonta)]} cor={COR_NIVEL[nivelPotencia(c.potPonta)]} />
        </div>
        {alertasDe(c.alertas)}
        {onAbrirNoUnifilar && (
          <button type="button" onClick={() => onAbrirNoUnifilar(c.chave)} className="w-full rounded-lg bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-900">
            Abrir no Unifilar (o que tem dentro da caixa)
          </button>
        )}
        <ListaRotas rotas={c.rotas} onAbrirRota={onAbrirRota} />
      </div>
    );
  }
  const b = detalhe.cabo!;
  const fOc = faixaOcupacao(b.fibras.length, b.capacidade);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <IconeCabo tamanho={28} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800" title={b.nome}>{semCodigo(b.nome)}</p>
          <p className="text-[11px] text-slate-500">{b.capacidade} fibras · {formatMetros(b.metros)} neste trecho</p>
        </div>
      </div>
      {chipsPon(b.pons)}
      <div>
        <div className="mb-1 flex items-center text-[11px]"><span>Fibras em uso</span><b className="ml-auto" style={{ color: COR_OCUPACAO[fOc] }}>{b.fibras.length} de {b.capacidade}</b></div>
        <div className="flex flex-wrap gap-0.5">
          {Array.from({ length: b.capacidade }, (_, i) => i + 1).map((f) => {
            const usa = b.fibras.includes(f);
            const c = corFibra(f, b.nome);
            return <span key={f} title={`${c.rotulo} ${c.nome.toLowerCase()}${usa ? " · em uso" : " · livre"}`} className="inline-block h-3 w-3 rounded-sm ring-1 ring-black/20" style={{ background: usa ? c.hex : "#f1f5f9" }} />;
          })}
        </div>
      </div>
      {alertasDe(b.alertas)}
      <ListaRotas rotas={b.rotas} onAbrirRota={onAbrirRota} />
      <p className="text-[10px] text-slate-400">Para trocar uma fibra, abra o cabo na Árvore (quadro do cabo → Trocar fibra).</p>
    </div>
  );
}
