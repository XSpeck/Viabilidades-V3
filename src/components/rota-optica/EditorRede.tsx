"use client";

// =====================
// Mapa da rede livre: onde as coisas estão e por onde o cabo passa.
// Coloca elemento (OLT, DIO, CEO, CT, HUB, CTO, CDOI), desenha cabo de caixa em caixa (passando pelas do meio),
// põe caixa em cima de um cabo, arrasta, apaga. O que liga em quê é no Unifilar; o sinal aparece sozinho.
// =====================
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Cable, Hand, Loader2, MousePointer2, Network, Trash2, Undo2, X } from "lucide-react";
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
import { nomeCurto } from "@/lib/textoCompleto";

type Pt = { lat: number; lon: number };
const TIPOS: TipoElementoRota[] = ["olt", "dio", "ceo", "ct", "hub", "cto", "cdoi"];
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
}

function icone(tipo: TipoElementoRota, ativo: boolean, aceso: boolean) {
  const tam = ativo ? 38 : 30;
  return L.divIcon({
    className: "",
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
    html: `<div style="width:${tam}px;height:${tam}px;${aceso ? "" : "filter:grayscale(1);opacity:.55;"}${ativo ? "filter:drop-shadow(0 0 7px #facc15);" : ""}">${iconeSvg(tipo, tam)}</div>`,
  });
}
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

export default function EditorRede({ caixas, cabos, catalogo, sinal, usuario, onCaixa, onCaixaFora, onCabo, onCaboFora, onAbrirNoUnifilar }: Props) {
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

  const elementos = useMemo(() => caixas.filter((c) => c.tipo && c.lat !== undefined && c.lon !== undefined), [caixas]);
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
    setNovo({ tipo, p, nome: `${tipo === "cdoi" ? "CDOI" : tipo.toUpperCase()} ${n}`, codigo: proximoCodigoElemento(caixas.map((c) => c.codigo)), equip: "", noCabo });
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
      return { c, t, linha, fs };
    }),
  ).filter((x) => x.linha.length >= 2);
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
  const botao = (f: Ferramenta, rotulo: string, ic: React.ReactNode) => (
    <button key={f} type="button" onClick={() => escolher(f)} title={rotulo}
      className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${ferr === f ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
      {ic} {rotulo}
    </button>
  );

  return (
    <div className="relative h-[min(76vh,720px)] overflow-hidden rounded-xl border border-gray-200">
      <MapContainer center={pts[0] ?? [-28.68, -49.37]} zoom={15} scrollWheelZoom={false} doubleClickZoom={false} zoomControl={false}
        className={`h-full w-full z-0 [&_.leaflet-interactive]:outline-none ${ferr !== "navegar" ? "cursor-crosshair [&_.leaflet-grab]:cursor-crosshair" : ""}`}>
        <CamadaBase camada={camada} />
        <ZoomComCtrl />
        <ZoomControl position="bottomright" />
        <Cliques onClicar={clicarMapa} />
        <Enquadrar pts={pts} />
        {linhasCabo.map(({ c, t, linha, fs }) => {
          const ativo = caboSel?.chave === c.chave;
          const cor = fs.length ? corFibra(fs[0], c.nome).hex : "#94a3b8";
          return (
            <Polyline key={`${c.chave}|${t}`} positions={linha}
              pathOptions={{ color: ativo ? "#facc15" : cor, weight: ativo ? 6 : fs.length ? 4 : 3, opacity: fs.length ? 1 : 0.8, dashArray: fs.length ? undefined : "6 6" }}
              eventHandlers={{ click: (ev) => { L.DomEvent.stopPropagation(ev); clicarCabo(c, t, { lat: ev.latlng.lat, lon: ev.latlng.lng }); } }}>
              <Tooltip sticky>{nomeCurto(c.nome, 50)}{fs.length ? ` · ${fs.length} fibra${fs.length > 1 ? "s" : ""} com sinal` : " · sem sinal"}</Tooltip>
            </Polyline>
          );
        })}
        {desenhoLinha.length >= 1 && <Polyline positions={desenhoLinha} pathOptions={{ color: "#f97316", weight: 4, dashArray: "8 6" }} interactive={false} />}
        {desenho?.atual.map((p, k) => <Marker key={`d${k}`} position={[p.lat, p.lon]} icon={iconePonto} interactive={false} />)}
        {elementos.map((e) => (
          <Marker key={e.chave} position={[e.lat!, e.lon!]} icon={icone(e.tipo!, sel?.chave === e.chave, pons(e.chave).length > 0)}
            draggable={ferr === "navegar" && sel?.chave === e.chave}
            eventHandlers={{
              click: (ev) => { L.DomEvent.stopPropagation(ev); clicarElemento(e); },
              dragend: (ev) => { const ll = (ev.target as L.Marker).getLatLng(); void moverElemento(e, { lat: ll.lat, lon: ll.lng }); },
            }}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>{e.nome}</b>{pons(e.chave).length ? ` · ${pons(e.chave).join(", ")}` : " · sem sinal"}
              {ferr === "cabo" ? <><br />clique para o cabo passar aqui</> : null}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* ferramentas */}
      <div className="pointer-events-none absolute left-2 right-2 top-2 z-[500] flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg">
          {botao("navegar", "Navegar", <MousePointer2 className="h-3.5 w-3.5" />)}
          {botao("cabo", "Cabo", <Cable className="h-3.5 w-3.5" />)}
          {TIPOS.map((t) => botao(t, t === "cdoi" ? "CDOI" : t.toUpperCase(), <span className="inline-block h-3.5 w-3.5" dangerouslySetInnerHTML={{ __html: iconeSvg(t, 14) }} />))}
        </div>
        <SeletorCamada valor={camada} onMudar={setCamada} className="pointer-events-auto ml-auto" />
      </div>

      {/* painel */}
      <div className="absolute bottom-2 left-2 z-[500] w-[min(360px,calc(100%-16px))] space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-lg">
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

        {ferr === "navegar" && !sel && <p className="flex items-center gap-1.5 text-slate-500"><Hand className="h-3.5 w-3.5" /> Clique num elemento ou cabo. Cinza tracejado = sem sinal.</p>}

        {ferr === "navegar" && elSel && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-5" dangerouslySetInnerHTML={{ __html: iconeSvg(elSel.tipo ?? "outro", 20) }} />
              <input key={elSel.chave + elSel.nome} defaultValue={elSel.nome} onBlur={(e) => void renomear(elSel, e.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1 font-semibold" />
              <button type="button" onClick={() => setSel(null)}><X className="h-4 w-4" /></button>
            </div>
            <p className="text-slate-500">{TIPO_ELEMENTO_LABEL[elSel.tipo ?? "outro"]} · código {elSel.codigo} · arraste o ícone para mover</p>
            <p>{pons(elSel.chave).length ? <>Sinal de <b>{pons(elSel.chave).join(", ")}</b></> : <span className="text-slate-500">Sem sinal</span>}</p>
            {elSel.tipo === "olt" && <PonsDaOlt olt={elSel} caixas={caixas} cabos={cabos} usuario={usuario} onCaixa={onCaixa} onCabo={onCabo} onErro={setErro} />}
            <div className="flex flex-wrap gap-1.5">
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
