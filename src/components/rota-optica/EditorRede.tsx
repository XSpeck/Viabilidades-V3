"use client";

// =====================
// Mapa da rede livre: onde as coisas estão e por onde o cabo passa.
// Coloca elemento (OLT, DIO, CEO, CT, HUB, CTO, CDOI), desenha cabo de caixa em caixa (passando pelas do meio),
// põe caixa em cima de um cabo, arrasta, apaga. O que liga em quê é no Unifilar; o sinal aparece sozinho.
// =====================
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Activity, AlertTriangle, Cable, Hand, Loader2, MousePointer2, Network, Tags, Trash2, Undo2, X, Zap } from "lucide-react";
import ZoomComCtrl from "./ZoomComCtrl";
import { CamadaBase, SeletorCamada, useCamada } from "./CamadasMapa";
import { iconeSvg } from "./IconesRede";
import { chaveCabo, comCodigo, excluirCabo, proximoCodigoCabo, salvarCabo, type CaboRede } from "@/lib/cabosRede";
import { excluirCaixa, idCaixa, salvarCaixa, type CaixaRede } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { confirmar } from "@/lib/dialogo";
import { caboComCaixaMovida, caixaSemCabo, cortarTrechoNaCaixa, metrosDoTrecho, proximoCodigoElemento } from "@/lib/redeLivre";
import { corFibra, formatDbm, formatMetros, TIPO_ELEMENTO_LABEL, type TipoElementoRota } from "@/lib/rotaOptica";
import { tracadoDoTrecho, type SinalRede } from "@/lib/sinalRede";
import { dbmCurto, nomeCurto } from "@/lib/textoCompleto";
import { COR_NIVEL, nivelPotencia } from "@/lib/analiseRede";

type Pt = { lat: number; lon: number };
const TIPOS: TipoElementoRota[] = ["olt", "dio", "ceo", "ct", "hub", "cto", "cdoi", "predio"];
type Ferramenta = "navegar" | "cabo" | TipoElementoRota;

interface Props {
  caixas: CaixaRede[];
  cabos: CaboRede[];
  catalogo: ItemCatalogo[];
  sinal: SinalRede;
  usuario: string;
  onCaixa: (c: CaixaRede) => void;
  onCaixaFora: (chave: string) => void;
  onCabo: (c: CaboRede) => void;
  onCaboFora: (chave: string) => void;
  onAbrirNoUnifilar?: (chave: string) => void;
  /** Prédio: blocos, andares e as CDOIs de cada andar */
  onAbrirPredio?: (chave: string) => void;
}

/** Ícone do elemento: com sinal, um pulso na cor da potência e o selo de dBm; sem sinal, apagado */
function icone(tipo: TipoElementoRota, ativo: boolean, aceso: boolean, pot?: number, nome?: string) {
  const tam = ativo ? 40 : 32;
  const cor = aceso ? COR_NIVEL[nivelPotencia(pot)] : "#94a3b8";
  const selo = aceso && pot !== undefined
    ? `<span style="position:absolute;left:50%;top:-14px;transform:translateX(-50%);white-space:nowrap;padding:1px 5px;border-radius:9999px;background:${cor};color:#fff;font:700 9px/13px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.35)">${dbmCurto(pot)}</span>`
    : "";
  const rotulo = nome
    ? `<span style="position:absolute;left:50%;top:${tam + 2}px;transform:translateX(-50%);white-space:nowrap;padding:1px 6px;border-radius:6px;background:rgba(15,23,42,.82);color:#f8fafc;font:600 10px/14px system-ui,sans-serif">${nome.replace(/</g, "&lt;")}</span>`
    : "";
  const pulso = aceso ? `<span class="fh-pulso" style="position:absolute;inset:-6px;border-radius:9999px;border:3px solid ${cor}"></span>` : "";
  const brilho = ativo ? "filter:drop-shadow(0 0 8px #facc15) drop-shadow(0 0 2px #facc15);" : aceso ? "filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));" : "filter:grayscale(1) drop-shadow(0 1px 1px rgba(0,0,0,.25));opacity:.6;";
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="position:relative;width:${tam}px;height:${tam}px">${pulso}<div style="position:relative;width:${tam}px;height:${tam}px;${brilho}transition:transform .15s">${iconeSvg(tipo, tam)}</div>${selo}${rotulo}</div>`,
  });
}

/** Animações do mapa (luz correndo no cabo, pulso das caixas acesas, painel entrando) */
const ESTILO_ANIMACAO = `
@keyframes fh-fluxo { to { stroke-dashoffset: -30; } }
.fh-fluxo { stroke-dasharray: 3 12; animation: fh-fluxo 1.2s linear infinite; }
@keyframes fh-pulso { 0% { transform: scale(.7); opacity: .75; } 100% { transform: scale(1.7); opacity: 0; } }
.fh-pulso { animation: fh-pulso 2s ease-out infinite; }
@keyframes fh-entra { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.fh-entra { animation: fh-entra .2s ease-out; }
@media (prefers-reduced-motion: reduce) { .fh-fluxo, .fh-pulso { animation: none; } }
`;
const iconePonto = L.divIcon({ className: "", iconSize: [10, 10], iconAnchor: [5, 5], html: `<div style="width:10px;height:10px;border-radius:9999px;background:#fff;border:2px solid #f97316"></div>` });

function Cliques({ onClicar }: { onClicar: (p: Pt) => void }) {
  useMapEvents({ click: (e) => onClicar({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}
function Enquadrar({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || !pts.length) return;
    feito.current = true;
    if (pts.length === 1) map.setView(pts[0], 17);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [map, pts]);
  return null;
}

export default function EditorRede({ caixas, cabos, catalogo, sinal, usuario, onCaixa, onCaixaFora, onCabo, onCaboFora, onAbrirNoUnifilar, onAbrirPredio }: Props) {
  const [camada, setCamada] = useCamada();
  const [ferr, setFerr] = useState<Ferramenta>("navegar");
  const [sel, setSel] = useState<{ k: "el" | "cabo"; chave: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  /** Elemento novo esperando nome (e, se em cima de um cabo, qual trecho ele parte) */
  const [novo, setNovo] = useState<{ tipo: TipoElementoRota; p: Pt; nome: string; codigo: string; equip: string; noCabo?: { chave: string; t: number } } | null>(null);
  /** Cabo sendo desenhado: caixas por onde passa, as curvas de cada trecho e as do trecho atual */
  const [desenho, setDesenho] = useState<{ caminho: string[]; trechos: Pt[][]; atual: Pt[] } | null>(null);
  const [tipoCabo, setTipoCabo] = useState("");
  /** Mostrar o nome de cada elemento embaixo do ícone */
  const [nomes, setNomes] = useState(false);

  const elementos = useMemo(() => caixas.filter((c) => c.tipo && c.lat !== undefined && c.lon !== undefined && !c.predio_id), [caixas]);
  const elDe = useMemo(() => new Map(caixas.map((c) => [c.chave, c])), [caixas]);
  const tiposCabo = useMemo(() => catalogo.filter((i) => i.categoria === "cabo" && (i.capacidade ?? 0) > 1), [catalogo]);
  const desenhados = useMemo(() => cabos.filter((c) => c.caminho && c.caminho.length >= 2), [cabos]);
  const pts = useMemo<[number, number][]>(() => elementos.map((e) => [e.lat!, e.lon!]), [elementos]);
  const elSel = sel?.k === "el" ? elDe.get(sel.chave) : undefined;
  const caboSel = sel?.k === "cabo" ? cabos.find((c) => c.chave === sel.chave) : undefined;

  /** Fibras acesas num trecho do cabo */
  const acesas = (c: CaboRede, t: number) => {
    const out: number[] = [];
    for (let f = 1; f <= (c.capacidade ?? 12); f++) if (sinal.trechos.has(`${chaveCabo(c.nome)}|${f}|${t}`)) out.push(f);
    return out;
  };

  function escolher(f: Ferramenta) {
    setFerr(f);
    setNovo(null);
    setDesenho(f === "cabo" ? { caminho: [], trechos: [], atual: [] } : null);
    setErro(null);
  }

  function novoElemento(tipo: TipoElementoRota, p: Pt, noCabo?: { chave: string; t: number }) {
    const n = caixas.filter((c) => c.tipo === tipo).length + 1;
    setNovo({ tipo, p, nome: `${tipo === "cdoi" ? "CDOI" : tipo === "predio" ? "Ed." : tipo.toUpperCase()} ${n}`, codigo: proximoCodigoElemento(caixas.map((c) => c.codigo)), equip: "", noCabo });
  }

  function clicarMapa(p: Pt) {
    setErro(null);
    if (ferr === "cabo") {
      if (!desenho?.caminho.length) { setErro("Comece o cabo clicando numa caixa."); return; }
      setDesenho({ ...desenho, atual: [...desenho.atual, p] });
      return;
    }
    if (ferr !== "navegar") { novoElemento(ferr, p); return; }
    setSel(null);
  }

  function clicarElemento(e: CaixaRede) {
    setErro(null);
    if (ferr === "cabo" && desenho) {
      if (desenho.caminho.at(-1) === e.chave) return;
      if (desenho.caminho.includes(e.chave)) { setErro("O cabo já passa por essa caixa."); return; }
      if (!desenho.caminho.length) { setDesenho({ caminho: [e.chave], trechos: [], atual: [] }); return; }
      setDesenho({ caminho: [...desenho.caminho, e.chave], trechos: [...desenho.trechos, desenho.atual], atual: [] });
      return;
    }
    setSel({ k: "el", chave: e.chave });
  }

  function clicarCabo(c: CaboRede, t: number, p: Pt) {
    setErro(null);
    if (TIPOS.includes(ferr as TipoElementoRota)) { novoElemento(ferr as TipoElementoRota, p, { chave: c.chave, t }); return; }
    if (ferr === "navegar") setSel({ k: "cabo", chave: c.chave });
  }

  async function gravarNovo() {
    if (!novo || !novo.nome.trim()) return;
    if (caixas.some((c) => c.codigo === novo.codigo.trim())) { setErro(`Já existe um elemento com o código ${novo.codigo}.`); return; }
    setGravando(true);
    try {
      const codigo = novo.codigo.trim();
      const cx = await salvarCaixa({
        chave: `PT:${codigo.toUpperCase()}`, nome: novo.nome.trim(), tipo: novo.tipo, codigo, lat: novo.p.lat, lon: novo.p.lon,
        ...(novo.equip ? { equipamento_id: novo.equip } : {}), portas: [], atualizado_por: usuario,
      });
      onCaixa(cx);
      if (novo.noCabo) {
        const c = cabos.find((x) => x.chave === novo.noCabo!.chave);
        if (c) {
          const m = new Map(elDe); m.set(cx.chave, cx);
          onCabo(await salvarCabo({ ...cortarTrechoNaCaixa(c, novo.noCabo.t, { ...cx, lat: novo.p.lat, lon: novo.p.lon }, m), atualizado_por: usuario }));
        }
      }
      setNovo(null);
      setSel({ k: "el", chave: cx.chave });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar.");
    } finally {
      setGravando(false);
    }
  }

  async function concluirCabo() {
    if (!desenho || desenho.caminho.length < 2) return;
    const tipo = tiposCabo.find((t) => t.id === tipoCabo);
    if (!tipo) { setErro("Escolha o tipo de cabo."); return; }
    setGravando(true);
    try {
      const a = elDe.get(desenho.caminho[0])!, b = elDe.get(desenho.caminho.at(-1)!)!;
      const codigo = proximoCodigoCabo(cabos.map((c) => c.nome));
      const nome = comCodigo(`${String(tipo.capacidade).padStart(2, "0")} FO · ${nomeCurto(a.nome, 30)} → ${nomeCurto(b.nome, 30)}`, codigo);
      const pos = (k: string) => { const e = elDe.get(k); return e?.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : undefined; };
      const trechos = desenho.trechos.map((pontos, t) => ({ pontos, metros: metrosDoTrecho(pos(desenho.caminho[t]), pontos, pos(desenho.caminho[t + 1])) }));
      const c = await salvarCabo({ chave: codigo, nome, capacidade: tipo.capacidade, tipo_id: tipo.id, fibras: [], caminho: desenho.caminho, trechos, atualizado_por: usuario });
      onCabo(c);
      setDesenho({ caminho: [], trechos: [], atual: [] });
      setSel({ k: "cabo", chave: c.chave });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar o cabo.");
    } finally {
      setGravando(false);
    }
  }

  async function moverElemento(e: CaixaRede, p: Pt) {
    try {
      const cx = await salvarCaixa({ ...e, lat: p.lat, lon: p.lon, atualizado_por: usuario });
      onCaixa(cx);
      const m = new Map(elDe); m.set(cx.chave, cx);
      for (const c of desenhados) {
        const n = caboComCaixaMovida(c, cx.chave, m);
        if (n) onCabo(await salvarCabo({ ...n, atualizado_por: usuario }));
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mover.");
    }
  }

  async function apagarElemento(e: CaixaRede) {
    const usado = desenhados.filter((c) => c.caminho!.includes(e.chave));
    if (usado.length) { setErro(`Antes, apague ou mude os cabos que passam por ela: ${usado.map((c) => nomeCurto(c.nome, 30)).join(", ")}.`); return; }
    if (!(await confirmar(`Apagar ${e.nome}? Splitters, emendas e clientes dela somem junto.`, { ok: "Apagar", perigo: true }))) return;
    await excluirCaixa(idCaixa(e.chave));
    onCaixaFora(e.chave);
    setSel(null);
  }

  async function apagarCabo(c: CaboRede) {
    if (!(await confirmar(`Apagar o cabo ${nomeCurto(c.nome, 40)}? O que estiver ligado nele, nas caixas por onde passa, é desligado.`, { ok: "Apagar", perigo: true }))) return;
    setGravando(true);
    try {
      for (const k of c.caminho ?? []) {
        const cx = elDe.get(k);
        const limpo = cx ? caixaSemCabo(cx, chaveCabo(c.nome)) : null;
        if (limpo) onCaixa(await salvarCaixa({ ...limpo, atualizado_por: usuario }));
      }
      await excluirCabo(c.id);
      onCaboFora(c.chave);
      setSel(null);
    } finally {
      setGravando(false);
    }
  }

  async function renomear(e: CaixaRede, nome: string) {
    if (!nome.trim() || nome.trim() === e.nome) return;
    onCaixa(await salvarCaixa({ ...e, nome: nome.trim(), atualizado_por: usuario }));
  }

  async function trocarTipoCabo(c: CaboRede, id: string) {
    const t = tiposCabo.find((x) => x.id === id);
    if (!t?.capacidade) return;
    const usada = Math.max(0, ...(c.caminho ?? []).slice(1).flatMap((_, k) => acesas(c, k)));
    if (usada > t.capacidade) { setErro(`A fibra ${usada} está em uso: o cabo não pode ter menos de ${usada} fibras.`); return; }
    const nome = c.nome.replace(/^\d+\s*FO/, `${String(t.capacidade).padStart(2, "0")} FO`);
    onCabo(await salvarCabo({ ...c, nome, capacidade: t.capacidade, tipo_id: t.id, atualizado_por: usuario }));
  }

  // ---------- desenho ----------
  const linhasCabo = desenhados.flatMap((c) =>
    c.caminho!.slice(1).map((_, t) => {
      const linha = tracadoDoTrecho(c, t, elDe).map((p) => [p.lat, p.lon] as [number, number]);
      const fs = acesas(c, t);
      // a luz anda do começo para o fim do cabo, a não ser que ela entre na caixa de antes por este trecho
      const k = chaveCabo(c.nome);
      const volta = fs.some((f) => sinal.entradas.has(`${c.caminho![t]}#f:${k}|${f}|seg`));
      return { c, t, linha: volta ? [...linha].reverse() : linha, fs };
    }),
  ).filter((x) => x.linha.length >= 2 && !x.c.caminho!.some((k) => elDe.get(k)?.predio_id));
  const desenhoLinha: [number, number][] = desenho?.caminho.length
    ? [
        ...desenho.caminho.flatMap((k, i) => {
          const e = elDe.get(k);
          return [...(i > 0 ? desenho.trechos[i - 1].map((p) => [p.lat, p.lon] as [number, number]) : []), ...(e ? [[e.lat!, e.lon!] as [number, number]] : [])];
        }),
        ...desenho.atual.map((p) => [p.lat, p.lon] as [number, number]),
      ]
    : [];

  const pons = (chave: string) => [...(sinal.caixas.get(chave) ?? [])];
  /** dBm que chega em cada elemento (o melhor, se chega por mais de um caminho) */
  const potDe = new Map<string, number>();
  for (const r of sinal.rotas) r.elementos.forEach((e, k) => {
    const v = k === 0 ? e.potencia_saida : e.potencia_entrada;
    const ch = e.codigo ? `PT:${e.codigo.toUpperCase()}` : "";
    if (ch && v !== undefined && (potDe.get(ch) ?? -99) < v) potDe.set(ch, v);
  });
  const km = desenhados.reduce((a, c) => a + (c.trechos ?? []).reduce((b, t) => b + (t.mesmo_poste ? 0 : t.metros ?? 0), 0), 0) / 1000;
  const totalPons = new Set(sinal.rotas.map((r) => r.id.split(">")[0])).size;
  const botao = (f: Ferramenta, rotulo: string, ic: React.ReactNode) => (
    <button key={f} type="button" onClick={() => escolher(f)} title={rotulo}
      className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all duration-150 ${ferr === f ? "bg-gradient-to-b from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-500/30 ring-1 ring-indigo-400" : "text-slate-700 hover:-translate-y-px hover:bg-white hover:shadow"}`}>
      {ic} {rotulo}
    </button>
  );

  return (
    <div className="relative isolate h-[min(76vh,720px)] overflow-hidden rounded-xl border border-gray-200">
      <MapContainer center={pts[0] ?? [-28.68, -49.37]} zoom={15} scrollWheelZoom={false} doubleClickZoom={false} zoomControl={false}
        className={`h-full w-full z-0 [&_.leaflet-interactive]:outline-none ${ferr !== "navegar" ? "cursor-crosshair [&_.leaflet-grab]:cursor-crosshair" : ""}`}>
        <CamadaBase camada={camada} />
        <ZoomComCtrl />
        <ZoomControl position="bottomright" />
        <Cliques onClicar={clicarMapa} />
        <Enquadrar pts={pts} />
        {linhasCabo.map(({ c, t, linha, fs }) => {
          const ativo = caboSel?.chave === c.chave;
          const aceso = fs.length > 0;
          const cor = aceso ? corFibra(fs[0], c.nome).hex : "#94a3b8";
          const grosso = Math.min(3, (c.capacidade ?? 12) / 24);
          return (
            <Fragment key={`${c.chave}|${t}`}>
              {(aceso || ativo) && <Polyline positions={linha} interactive={false} pathOptions={{ color: ativo ? "#facc15" : cor, weight: 14 + grosso * 2, opacity: ativo ? 0.45 : 0.18, lineCap: "round", lineJoin: "round" }} />}
              <Polyline positions={linha} interactive={false} pathOptions={{ color: "#0f172a", weight: (aceso ? 7 : 5) + grosso, opacity: aceso ? 0.55 : 0.25, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={linha}
                pathOptions={{ color: ativo ? "#facc15" : cor, weight: (aceso ? 4.5 : 3) + grosso, opacity: aceso ? 1 : 0.9, dashArray: aceso ? undefined : "7 7", lineCap: "round", lineJoin: "round" }}
                eventHandlers={{ click: (ev) => { L.DomEvent.stopPropagation(ev); clicarCabo(c, t, { lat: ev.latlng.lat, lon: ev.latlng.lng }); } }}>
                <Tooltip sticky>
                  <b>{nomeCurto(c.nome, 50)}</b>
                  <br />
                  {aceso ? `${fs.length} fibra${fs.length > 1 ? "s" : ""} com sinal · ${formatDbm(sinal.trechos.get(`${chaveCabo(c.nome)}|${fs[0]}|${t}`)?.pot)}` : "sem sinal"}
                  {c.trechos?.[t]?.metros ? ` · ${formatMetros(c.trechos[t].metros!)}` : ""}
                </Tooltip>
              </Polyline>
              {/* várias fibras acesas no trecho: listras com a cor de cada uma (as mesmas do Unifilar) */}
              {!ativo && fs.length > 1 && fs.slice(0, 6).map((f, k, l) => k === 0 ? null : (
                <Polyline key={`f${f}`} positions={linha} interactive={false}
                  pathOptions={{ color: corFibra(f, c.nome).hex, weight: 4.5 + grosso, lineCap: "butt", dashArray: `14 ${14 * (l.length - 1)}`, dashOffset: `${-14 * k}` }} />
              ))}
              {aceso && <Polyline positions={linha} interactive={false} className="fh-fluxo" pathOptions={{ color: "#ffffff", weight: 2.5, opacity: 0.95, lineCap: "round" }} />}
            </Fragment>
          );
        })}
        {desenhoLinha.length >= 1 && <Polyline positions={desenhoLinha} className="fh-fluxo" pathOptions={{ color: "#f97316", weight: 4 }} interactive={false} />}
        {desenho?.atual.map((p, k) => <Marker key={`d${k}`} position={[p.lat, p.lon]} icon={iconePonto} interactive={false} />)}
        {elementos.map((e) => (
          <Marker key={e.chave} position={[e.lat!, e.lon!]} icon={icone(e.tipo!, sel?.chave === e.chave, pons(e.chave).length > 0, potDe.get(e.chave), nomes || sel?.chave === e.chave ? nomeCurto(e.nome, 22) : undefined)}
            draggable={ferr === "navegar" && sel?.chave === e.chave}
            eventHandlers={{
              click: (ev) => { L.DomEvent.stopPropagation(ev); clicarElemento(e); },
              dragend: (ev) => { const ll = (ev.target as L.Marker).getLatLng(); void moverElemento(e, { lat: ll.lat, lon: ll.lng }); },
            }}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>{e.nome}</b> · {TIPO_ELEMENTO_LABEL[e.tipo!]}
              <br />
              {pons(e.chave).length ? `${pons(e.chave).join(", ")} · ${formatDbm(potDe.get(e.chave))}` : "sem sinal"}
              {ferr === "cabo" ? <><br />clique para o cabo passar aqui</> : null}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      <style>{ESTILO_ANIMACAO}</style>
      {/* ferramentas */}
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-[500] flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-white/60 bg-slate-100/80 p-1 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 backdrop-blur-md">
          {botao("navegar", "Navegar", <MousePointer2 className="h-3.5 w-3.5" />)}
          {botao("cabo", "Cabo", <Cable className="h-3.5 w-3.5" />)}
          <span className="mx-1 h-5 w-px bg-slate-300" />
          {TIPOS.map((t) => botao(t, t === "cdoi" ? "CDOI" : t === "predio" ? "Prédio" : t.toUpperCase(), <span className="inline-block h-4 w-4" dangerouslySetInnerHTML={{ __html: iconeSvg(t, 16) }} />))}
          <span className="mx-1 h-5 w-px bg-slate-300" />
          <button type="button" onClick={() => setNomes((v) => !v)} title="Nomes no mapa"
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${nomes ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-white hover:shadow"}`}>
            <Tags className="h-3.5 w-3.5" /> Nomes
          </button>
        </div>
        <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
          <SeletorCamada valor={camada} onMudar={setCamada} />
          <div className="flex flex-wrap justify-end gap-1.5 text-[11px] font-semibold">
            <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-slate-700 shadow ring-1 ring-slate-900/5 backdrop-blur"><Zap className="h-3 w-3 text-amber-500" /> {totalPons} PON{totalPons !== 1 ? "s" : ""}</span>
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-slate-700 shadow ring-1 ring-slate-900/5 backdrop-blur">{elementos.length} elementos</span>
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-slate-700 shadow ring-1 ring-slate-900/5 backdrop-blur">{desenhados.length} cabos · {km.toFixed(2).replace(".", ",")} km</span>
            {sinal.conflitos.length > 0 && <span className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-white shadow" title={sinal.conflitos.map((c) => c.texto).join("\n")}><AlertTriangle className="h-3 w-3" /> {sinal.conflitos.length} conflito{sinal.conflitos.length > 1 ? "s" : ""}</span>}
          </div>
        </div>
      </div>

      {/* painel */}
      <div key={`${ferr}|${sel?.chave ?? ""}|${novo ? "n" : ""}`} className="fh-entra absolute bottom-3 left-3 z-[500] w-[min(370px,calc(100%-24px))] space-y-2 rounded-2xl border border-white/70 bg-white/90 p-3.5 text-xs text-slate-700 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 backdrop-blur-md">
        {erro && <p className="rounded-lg bg-red-50 px-2 py-1 text-red-700">{erro}</p>}
        {ferr !== "navegar" && ferr !== "cabo" && !novo && <p>Clique no mapa para colocar a {TIPO_ELEMENTO_LABEL[ferr]}, ou em cima de um cabo para ele passar por ela.</p>}

        {novo && (
          <div className="space-y-1.5">
            <p className="font-semibold">Nova {TIPO_ELEMENTO_LABEL[novo.tipo]}{novo.noCabo ? " (em cima do cabo)" : ""}</p>
            <input className="w-full rounded border px-2 py-1" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome" autoFocus />
            <input className="w-full rounded border px-2 py-1" value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} placeholder="Código" />
            {(novo.tipo === "olt" || novo.tipo === "dio") && (
              <select className="w-full rounded border px-2 py-1" value={novo.equip} onChange={(e) => setNovo({ ...novo, equip: e.target.value })}>
                <option value="">Equipamento do cadastro…</option>
                {catalogo.filter((i) => i.categoria === novo.tipo).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
              </select>
            )}
            <div className="flex gap-1.5">
              <button type="button" disabled={gravando} onClick={() => void gravarNovo()} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60">{gravando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Gravar"}</button>
              <button type="button" onClick={() => setNovo(null)} className="rounded-lg border px-3 py-1.5">Cancelar</button>
            </div>
          </div>
        )}

        {ferr === "cabo" && desenho && (
          <div className="space-y-1.5">
            <p className="font-semibold">Desenhar cabo</p>
            <p>
              {!desenho.caminho.length ? "Clique na caixa de onde o cabo sai." : <>Saindo de <b>{elDe.get(desenho.caminho[0])?.nome}</b>{desenho.caminho.length > 1 ? <> · passa por {desenho.caminho.slice(1).map((k) => elDe.get(k)?.nome).join(" → ")}</> : null}. Clique no mapa para as curvas e na próxima caixa.</>}
            </p>
            {desenho.caminho.length >= 2 && (
              <select className="w-full rounded border px-2 py-1" value={tipoCabo} onChange={(e) => setTipoCabo(e.target.value)}>
                <option value="">Tipo de cabo…</option>
                {tiposCabo.map((t) => <option key={t.id} value={t.id}>{t.nome} · {t.capacidade}F</option>)}
              </select>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={desenho.caminho.length < 2 || !!desenho.atual.length || gravando} onClick={() => void concluirCabo()} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50" title={desenho.atual.length ? "Termine numa caixa" : undefined}>Gravar cabo</button>
              <button type="button" disabled={!desenho.atual.length && desenho.caminho.length < 1} onClick={() => setDesenho(desenho.atual.length ? { ...desenho, atual: desenho.atual.slice(0, -1) } : desenho.caminho.length > 1 ? { caminho: desenho.caminho.slice(0, -1), trechos: desenho.trechos.slice(0, -1), atual: desenho.trechos.at(-1) ?? [] } : { caminho: [], trechos: [], atual: [] })} className="flex items-center gap-1 rounded-lg border px-2 py-1.5"><Undo2 className="h-3.5 w-3.5" /> Desfazer</button>
              <button type="button" onClick={() => escolher("navegar")} className="rounded-lg border px-2 py-1.5">Cancelar</button>
            </div>
          </div>
        )}

        {ferr === "navegar" && !sel && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-slate-600"><Hand className="h-3.5 w-3.5" /> Clique num elemento ou cabo para ver e mudar.</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-5 rounded-full bg-emerald-600" /> com sinal (a luz corre no sentido dela)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" /> sem sinal</span>
              {(["otima", "boa", "limite", "abaixo"] as const).map((n) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_NIVEL[n] }} />{n === "otima" ? "ótima" : n === "boa" ? "boa" : n === "limite" ? "no limite" : "abaixo"}</span>)}
            </div>
          </div>
        )}

        {ferr === "navegar" && elSel && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5" dangerouslySetInnerHTML={{ __html: iconeSvg(elSel.tipo ?? "outro", 20) }} />
              <input key={elSel.chave + elSel.nome} defaultValue={elSel.nome} onBlur={(e) => void renomear(elSel, e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 font-semibold" />
              <button type="button" onClick={() => setSel(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-slate-500">{TIPO_ELEMENTO_LABEL[elSel.tipo ?? "outro"]} · código {elSel.codigo} · arraste o ícone para mover</p>
            {pons(elSel.chave).length ? (
              <div className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-white shadow-inner" style={{ background: `linear-gradient(135deg, ${COR_NIVEL[nivelPotencia(potDe.get(elSel.chave))]}, #0f172a)` }}>
                <Activity className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-semibold">{pons(elSel.chave).join(", ")}</span>
                <span className="text-sm font-bold tabular-nums">{formatDbm(potDe.get(elSel.chave))}</span>
              </div>
            ) : <p className="rounded-xl bg-slate-100 px-2.5 py-2 text-slate-500">Sem sinal: ligue uma fibra até aqui no Unifilar.</p>}
            {elSel.tipo === "olt" && <PonsDaOlt olt={elSel} caixas={caixas} cabos={cabos} usuario={usuario} onCaixa={onCaixa} onCabo={onCabo} onErro={setErro} />}
            <div className="flex flex-wrap gap-1.5">
              {elSel.tipo === "predio" && onAbrirPredio && <button type="button" onClick={() => onAbrirPredio(elSel.chave)} className="flex items-center gap-1 rounded-lg bg-sky-700 px-2 py-1.5 font-semibold text-white">Abrir prédio</button>}
              {onAbrirNoUnifilar && <button type="button" onClick={() => onAbrirNoUnifilar(elSel.chave)} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 font-semibold text-white"><Network className="h-3.5 w-3.5" /> Abrir no Unifilar</button>}
              <button type="button" onClick={() => void apagarElemento(elSel)} className="flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /> Apagar</button>
            </div>
          </div>
        )}

        {ferr === "navegar" && caboSel && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Cable className="h-4 w-4" />
              <b className="min-w-0 flex-1 truncate">{caboSel.nome}</b>
              <button type="button" onClick={() => setSel(null)}><X className="h-4 w-4" /></button>
            </div>
            <select className="w-full rounded border px-2 py-1" value={caboSel.tipo_id ?? ""} onChange={(e) => void trocarTipoCabo(caboSel, e.target.value)}>
              <option value="">Tipo de cabo…</option>
              {tiposCabo.map((t) => <option key={t.id} value={t.id}>{t.nome} · {t.capacidade}F</option>)}
            </select>
            <ul className="space-y-0.5">
              {caboSel.caminho!.slice(1).map((k, t) => {
                const fs = acesas(caboSel, t);
                return (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate">{nomeCurto(elDe.get(caboSel.caminho![t])?.nome ?? "?", 16)} → {nomeCurto(elDe.get(k)?.nome ?? "?", 16)}</span>
                    <span className="text-slate-500">{formatMetros(caboSel.trechos?.[t]?.metros ?? 0)}</span>
                    {fs.slice(0, 6).map((f) => <span key={f} className="inline-block h-2.5 w-2.5 rounded-full border border-black/20" style={{ background: corFibra(f, caboSel.nome).hex }} title={`F${f} · ${formatDbm(sinal.trechos.get(`${chaveCabo(caboSel.nome)}|${f}|${t}`)?.pot)}`} />)}
                  </li>
                );
              })}
            </ul>
            <button type="button" disabled={gravando} onClick={() => void apagarCabo(caboSel)} className="flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /> Apagar cabo</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** OLT: as portas PON e o cordão de cada uma até um adaptador do DIO */
function PonsDaOlt({ olt, caixas, cabos, usuario, onCaixa, onCabo, onErro }: {
  olt: CaixaRede; caixas: CaixaRede[]; cabos: CaboRede[]; usuario: string;
  onCaixa: (c: CaixaRede) => void; onCabo: (c: CaboRede) => void; onErro: (e: string | null) => void;
}) {
  const dios = caixas.filter((c) => c.tipo === "dio");
  const [porta, setPorta] = useState("0/1/1");
  const [dio, setDio] = useState(dios[0]?.chave ?? "");
  const [n, setN] = useState("1");
  const [gravando, setGravando] = useState(false);

  async function adicionar() {
    onErro(null);
    const d = caixas.find((c) => c.chave === dio);
    const num = parseInt(n, 10);
    if (!/^\d+\/\d+\/\d+$/.test(porta.trim())) { onErro("Porta PON no formato 0/1/1."); return; }
    if (!d || !num) { onErro("Escolha o DIO e o adaptador."); return; }
    if (olt.cordoes?.some((c) => c.porta === porta.trim())) { onErro(`A PON ${porta} já tem cordão.`); return; }
    if (d.adaptadores?.some((a) => a.n === num && a.de)) { onErro(`O adaptador ${num} do ${d.nome} já está em uso.`); return; }
    setGravando(true);
    try {
      const codigo = proximoCodigoCabo(cabos.map((c) => c.nome));
      const nome = comCodigo(`Cordão ${porta.trim()} ${nomeCurto(olt.nome, 20)} → ${nomeCurto(d.nome, 20)}`, codigo);
      const cordao = await salvarCabo({ chave: codigo, nome, capacidade: 1, fibras: [], caminho: [olt.chave, d.chave], trechos: [{ pontos: [], metros: 3, mesmo_poste: true }], atualizado_por: usuario });
      onCabo(cordao);
      onCaixa(await salvarCaixa({ ...olt, cordoes: [...(olt.cordoes ?? []), { porta: porta.trim(), para: { cabo: nome, fibra: 1 } }], atualizado_por: usuario }));
      // o adaptador N entrega a fibra N do cabo que sai do DIO (quando só há um)
      const saem = cabos.filter((c) => c.caminho?.includes(d.chave) && (c.capacidade ?? 0) > 1);
      const para = saem.length === 1 ? { cabo: saem[0].nome, fibra: num } : undefined;
      const outros = (d.adaptadores ?? []).filter((a) => a.n !== num);
      onCaixa(await salvarCaixa({ ...d, adaptadores: [...outros, { n: num, de: { cabo: nome, fibra: 1 }, ...(para ? { para } : {}) }], atualizado_por: usuario }));
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível ligar a PON.");
    } finally {
      setGravando(false);
    }
  }

  return (
    <div className="space-y-1 rounded-lg border border-slate-200 p-2">
      <p className="font-semibold">Portas PON</p>
      {(olt.cordoes ?? []).map((c) => <p key={c.porta} className="text-slate-600">PON {c.porta} → {nomeCurto(c.para.cabo.replace(/^Cordão \S+ /, ""), 40)}</p>)}
      <div className="flex flex-wrap items-center gap-1">
        <input value={porta} onChange={(e) => setPorta(e.target.value)} className="w-16 rounded border px-1.5 py-1" title="Porta PON (placa/porta)" />
        <span>→</span>
        <select value={dio} onChange={(e) => setDio(e.target.value)} className="min-w-0 flex-1 rounded border px-1.5 py-1">
          <option value="">DIO…</option>
          {dios.map((d) => <option key={d.chave} value={d.chave}>{d.nome}</option>)}
        </select>
        <input value={n} onChange={(e) => setN(e.target.value)} className="w-12 rounded border px-1.5 py-1" title="Adaptador do DIO" inputMode="numeric" />
        <button type="button" disabled={gravando} onClick={() => void adicionar()} className="rounded-lg bg-indigo-600 px-2 py-1 font-semibold text-white disabled:opacity-60">Ligar PON</button>
      </div>
    </div>
  );
}
