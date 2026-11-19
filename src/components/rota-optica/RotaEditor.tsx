"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp, Crosshair, Loader2, MapPin, Plus, Route, Save, Trash2, Undo2, X } from "lucide-react";
import {
  capacidadeDoCabo,
  comprimentoTracado,
  corFibraPorCapacidade,
  fibrasPorTubo,
  formatMetros,
  TIPO_ELEMENTO_LABEL,
  type ElementoRota,
  type RotaOptica,
  type RotaOpticaInput,
  type TipoElementoRota,
  type TrechoCabo,
} from "@/lib/rotaOptica";
import { chaveCabo, salvarCabo, type CaboRede } from "@/lib/cabosRede";
import { SPLITTERS } from "@/lib/caixasRede";
import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";
import type { ModoMapa, PontoEditor } from "./RotaEditorMapa";

const RotaEditorMapa = dynamic(() => import("./RotaEditorMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

type Ponto = { lat: number; lon: number };

/** Linha do formulário: números ficam como texto até salvar. */
interface Linha {
  nome: string;
  tipo: TipoElementoRota;
  codigo: string;
  cabo_entrada: string;
  fibra_entrada: string;
  cabo_saida: string;
  fibra_saida: string;
  distancia_m: string;
  /** Distância calculada pelo mapa (muda sozinha quando mexe no mapa) */
  dist_auto: boolean;
  potencia_entrada: string;
  potencia_saida: string;
  splitter: string;
  splitter_modelo: string;
  equipamento_id: string;
  porta: string;
  coords: string;
  /** Curvas do cabo (postes) no trecho que chega neste elemento */
  vertices: Ponto[];
  obs: string;
}

const s = (v?: number) => (v === undefined ? "" : String(v).replace(".", ","));
const pad2 = (v: number) => String(v).padStart(2, "0");
const fmtCoord = (p: Ponto) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

function paraLinha(e: ElementoRota, vertices: Ponto[] = []): Linha {
  return {
    nome: e.nome,
    tipo: e.tipo,
    codigo: e.codigo ?? "",
    cabo_entrada: e.cabo_entrada ?? "",
    fibra_entrada: s(e.fibra_entrada),
    cabo_saida: e.cabo_saida ?? "",
    fibra_saida: s(e.fibra_saida),
    distancia_m: s(e.distancia_m),
    dist_auto: e.distancia_m === undefined,
    potencia_entrada: s(e.potencia_entrada),
    potencia_saida: s(e.potencia_saida),
    splitter: e.splitter ?? "",
    splitter_modelo: e.splitter_modelo ?? "",
    equipamento_id: e.equipamento_id ?? "",
    porta: e.porta ?? "",
    coords: e.lat !== undefined && e.lon !== undefined ? `${e.lat}, ${e.lon}` : "",
    vertices,
    obs: e.obs ?? "",
  };
}

const linhaVazia = (tipo: TipoElementoRota = "ceo"): Linha => paraLinha({ nome: "", tipo });

function n(v: string): number | undefined {
  const t = v.trim().replace(",", ".");
  if (!t) return undefined;
  const x = parseFloat(t);
  return isFinite(x) ? x : undefined;
}

function parseCoords(v: string): { lat?: number; lon?: number; erro?: boolean } {
  const t = v.trim();
  if (!t) return {};
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return { erro: true };
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { erro: true };
  return { lat, lon };
}

function posDe(l: Linha): Ponto | null {
  const c = parseCoords(l.coords);
  return c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : null;
}

/** Comprimento pelo mapa do trecho que chega em ls[i] (anterior → curvas → este). */
function distMapa(ls: Linha[], i: number): number | null {
  if (i === 0) return null;
  const a = posDe(ls[i - 1]);
  const b = posDe(ls[i]);
  if (!a || !b) return null;
  return Math.round(comprimentoTracado([a, ...ls[i].vertices, b]));
}

function recalcular(ls: Linha[]): Linha[] {
  return ls.map((l, i) => {
    if (!l.dist_auto) return l;
    const d = distMapa(ls, i);
    return d === null ? l : { ...l, distancia_m: String(d) };
  });
}

interface Props {
  inicial?: RotaOptica | null;
  usuario: string;
  catalogo: ItemCatalogo[];
  cabos: CaboRede[];
  /** Nomes de cabos já usados nas rotas (sugestões) */
  nomesCabos: string[];
  centroPadrao?: [number, number];
  onCaboSalvo: (c: CaboRede) => void;
  onCancelar: () => void;
  onSalvar: (dados: RotaOpticaInput) => Promise<void>;
}

export default function RotaEditor({ inicial, usuario, catalogo, cabos, nomesCabos, centroPadrao, onCaboSalvo, onCancelar, onSalvar }: Props) {
  // Rotas do GeoGrid mantêm o traçado do KML; nas manuais o traçado é o desenhado aqui
  const trechosFixos = useMemo<TrechoCabo[]>(
    () => (inicial?.origem === "geogrid" ? inicial.trechos.filter((t) => t.ate === undefined) : []),
    [inicial]
  );
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial?.elementos.length
      ? inicial.elementos.map((e, i) =>
          paraLinha(e, trechosFixos.length ? [] : inicial.trechos.find((t) => t.ate === i)?.pontos.slice(1, -1) ?? [])
        )
      : [linhaVazia("olt"), linhaVazia("cto")]
  );
  const [sel, setSel] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoMapa>("adicionar");
  const [tipoNovo, setTipoNovo] = useState<TipoElementoRota>("ceo");
  const [tiposCabo, setTiposCabo] = useState<Record<string, string>>(() =>
    Object.fromEntries(cabos.filter((c) => c.tipo_id).map((c) => [c.chave, c.tipo_id!]))
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);

  const tiposDeCabo = catalogo.filter((c) => c.categoria === "cabo");
  const modelosSplitter = catalogo.filter((c) => c.categoria === "splitter");
  const olts = catalogo.filter((c) => c.categoria === "olt");
  const dios = catalogo.filter((c) => c.categoria === "dio");

  useEffect(() => {
    if (sel !== null) cardRefs.current[sel]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  function mudar(fn: (ls: Linha[]) => Linha[]) {
    setLinhas((ls) => recalcular(fn(ls)));
  }

  function alterar(i: number, mudanca: Partial<Linha>) {
    mudar((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));
  }

  /** Cabo/fibra de saída de um elemento = cabo/fibra de chegada do próximo: preenche o outro lado se estiver vazio ou igual. */
  function alterarLigacao(i: number, lado: "entrada" | "saida", campo: "cabo" | "fibra", valor: string) {
    mudar((ls) => {
      const c = ls.map((l) => ({ ...l }));
      const k = `${campo}_${lado}` as "cabo_entrada" | "fibra_entrada" | "cabo_saida" | "fibra_saida";
      const antigo = c[i][k];
      c[i][k] = valor;
      const j = lado === "saida" ? i + 1 : i - 1;
      const ko = `${campo}_${lado === "saida" ? "entrada" : "saida"}` as typeof k;
      if (c[j] && (c[j][ko] === "" || c[j][ko] === antigo)) c[j][ko] = valor;
      return c;
    });
  }

  function mover(i: number, d: -1 | 1) {
    mudar((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      // As curvas do cabo pertencem ao trecho, que mudou: descarta as dos dois
      c[i] = { ...c[i], vertices: [] };
      c[j] = { ...c[j], vertices: [] };
      if (c[j + 1]) c[j + 1] = { ...c[j + 1], vertices: [] };
      return c;
    });
    setSel((s0) => (s0 === i ? i + d : s0));
  }

  function remover(i: number) {
    mudar((ls) => ls.filter((_, j) => j !== i).map((l, j) => (j === i ? { ...l, vertices: [] } : l)));
    setSel(null);
  }

  // ---------- Mapa ----------
  function clicarMapa(lat: number, lon: number) {
    setAviso(null);
    const p = { lat, lon };
    if (modo === "tracar") {
      if (sel === null || sel === 0) return setAviso("Selecione o elemento onde o cabo chega (a partir do 2º) e clique nos postes do caminho.");
      if (!posDe(linhas[sel - 1])) return setAviso(`Posicione antes o elemento ${sel} no mapa.`);
      alterar(sel, { vertices: [...linhas[sel].vertices, p] });
      return;
    }
    if (modo === "posicionar") {
      if (sel === null) return setAviso("Selecione um elemento (no mapa ou na lista) e clique onde ele fica.");
      alterar(sel, { coords: fmtCoord(p) });
      return;
    }
    // adicionar: posiciona o próximo elemento sem local; se todos têm, cria um novo no fim
    const livre = linhas.findIndex((l) => !posDe(l));
    if (livre >= 0) {
      alterar(livre, { coords: fmtCoord(p) });
      setSel(livre);
      return;
    }
    const ant = linhas[linhas.length - 1];
    const nova: Linha = {
      ...linhaVazia(tipoNovo),
      coords: fmtCoord(p),
      cabo_entrada: ant?.cabo_saida ?? "",
      fibra_entrada: ant?.fibra_saida ?? "",
    };
    mudar((ls) => [...ls, nova]);
    setSel(linhas.length);
  }

  const pontosMapa: PontoEditor[] = linhas.map((l) => {
    const p = posDe(l);
    return { nome: l.nome, tipo: l.tipo, lat: p?.lat, lon: p?.lon, vertices: l.vertices };
  });
  const totalMapa = linhas.reduce((t, _, i) => t + (distMapa(linhas, i) ?? 0), 0);
  const totalInformado = linhas.reduce((t, l) => t + (n(l.distancia_m) ?? 0), 0);

  // ---------- Cadastro ----------
  function tipoDoCabo(nomeCabo: string): ItemCatalogo | undefined {
    const id = nomeCabo.trim() ? tiposCabo[chaveCabo(nomeCabo)] : undefined;
    return id ? tiposDeCabo.find((t) => t.id === id) : undefined;
  }

  function infoFibra(nomeCabo: string, fibraTxt: string) {
    const f = n(fibraTxt);
    if (!f) return null;
    const t = tipoDoCabo(nomeCabo);
    const cap = t?.capacidade ?? capacidadeDoCabo(nomeCabo || undefined, f);
    return { c: corFibraPorCapacidade(f, Math.max(cap, f), t?.fibras_por_tubo), excede: !!t?.capacidade && f > t.capacidade };
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome para a rota.");
    if (linhas.length < 2) return setErro("A rota precisa de pelo menos 2 elementos.");
    const elementos: ElementoRota[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l.nome.trim()) {
        setSel(i);
        return setErro(`Elemento ${i + 1}: informe o nome.`);
      }
      const c = parseCoords(l.coords);
      if (c.erro) return setErro(`Elemento ${i + 1}: coordenadas inválidas. Use "-28.6917, -49.3423".`);
      for (const [cabo, fibra] of [[l.cabo_entrada, l.fibra_entrada], [l.cabo_saida, l.fibra_saida]] as const) {
        if (infoFibra(cabo, fibra)?.excede) return setErro(`Elemento ${i + 1}: fibra ${fibra} não existe no cabo "${cabo}" (${tipoDoCabo(cabo)?.nome}).`);
      }
      elementos.push({
        nome: l.nome.trim(),
        tipo: l.tipo,
        codigo: l.codigo.trim() || undefined,
        cabo_entrada: l.cabo_entrada.trim() || undefined,
        fibra_entrada: n(l.fibra_entrada),
        cabo_saida: l.cabo_saida.trim() || undefined,
        fibra_saida: n(l.fibra_saida),
        distancia_m: n(l.distancia_m),
        potencia_entrada: n(l.potencia_entrada),
        potencia_saida: n(l.potencia_saida),
        splitter: l.splitter.trim() || undefined,
        splitter_modelo: l.splitter ? l.splitter_modelo || undefined : undefined,
        equipamento_id: l.tipo === "olt" || l.tipo === "dio" ? l.equipamento_id || undefined : undefined,
        porta: l.porta.trim() || undefined,
        lat: c.lat,
        lon: c.lon,
        obs: l.obs.trim() || undefined,
      });
    }

    // Traçado: rotas do GeoGrid mantêm o do KML; manuais usam o desenhado no mapa
    const trechos: TrechoCabo[] = trechosFixos.length
      ? inicial!.trechos
      : linhas.flatMap((l, i) => {
          const a = i > 0 ? posDe(linhas[i - 1]) : null;
          const b = posDe(l);
          return a && b ? [{ nome: l.cabo_entrada.trim() || `Trecho ${i}`, pontos: [a, ...l.vertices, b], ate: i }] : [];
        });

    setSalvando(true);
    try {
      // Tipo de cabo escolhido aqui vai para o cadastro do cabo (vale para todas as rotas)
      const nomesUsados = new Map<string, string>();
      linhas.forEach((l) => [l.cabo_entrada, l.cabo_saida].forEach((c) => c.trim() && nomesUsados.set(chaveCabo(c), c.trim())));
      for (const [chave, nomeCabo] of nomesUsados) {
        const novo = tiposCabo[chave] ?? "";
        const atual = cabos.find((c) => c.chave === chave);
        if (novo === (atual?.tipo_id ?? "")) continue;
        const t = tiposDeCabo.find((x) => x.id === novo);
        const salvo = await salvarCabo({
          chave,
          nome: atual?.nome ?? nomeCabo,
          capacidade: t?.capacidade ?? atual?.capacidade,
          tipo_id: novo || undefined,
          fibras: atual?.fibras ?? [],
          obs: atual?.obs,
          atualizado_por: usuario,
        });
        onCaboSalvo(salvo);
      }
      await onSalvar({
        nome: nome.trim(),
        origem: inicial?.origem ?? "manual",
        elementos,
        trechos,
        obs: obs.trim() || undefined,
        criado_por: inicial?.criado_por ?? usuario,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";
  const rot = "block text-[11px] text-gray-500 mb-0.5";

  function seletorTipoCabo(nomeCabo: string) {
    if (!tiposDeCabo.length) return null;
    const k = nomeCabo.trim() ? chaveCabo(nomeCabo) : "";
    return (
      <div>
        <label className={rot}>Tipo do cabo</label>
        <select
          className={campo}
          disabled={!k}
          value={k ? tiposCabo[k] ?? "" : ""}
          onChange={(e) => setTiposCabo((t) => ({ ...t, [k]: e.target.value }))}
          title={k ? "Vale para este cabo em todas as rotas" : "Informe o nome do cabo"}
        >
          <option value="">{k ? "— não definido —" : "—"}</option>
          {tiposDeCabo.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>
      </div>
    );
  }

  function campoFibra(i: number, lado: "entrada" | "saida") {
    const l = linhas[i];
    const cabo = lado === "entrada" ? l.cabo_entrada : l.cabo_saida;
    const valor = lado === "entrada" ? l.fibra_entrada : l.fibra_saida;
    const t = tipoDoCabo(cabo);
    const info = infoFibra(cabo, valor);
    return (
      <div>
        <label className={rot}>
          Fibra de {lado === "entrada" ? "chegada" : "saída"}
          {info && (
            <span className={`ml-1 inline-flex items-center gap-1 ${info.excede ? "text-red-600" : "text-gray-600"}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-gray-800 align-middle" style={{ background: info.c.hex }} />
              {info.c.nome.toLowerCase()} · {info.c.rotulo}
            </span>
          )}
        </label>
        {t?.capacidade ? (
          <select className={campo} value={valor} onChange={(e) => alterarLigacao(i, lado, "fibra", e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: Math.max(t.capacidade, n(valor) ?? 0) }, (_, k) => k + 1).map((f) => {
              const c = corFibraPorCapacidade(f, t.capacidade!, t.fibras_por_tubo ?? fibrasPorTubo(t.capacidade!));
              return (
                <option key={f} value={String(f)}>
                  F{pad2(f)} {c.nome.toLowerCase()} · tubo {c.tubo} ({c.corTubo?.nome.toLowerCase()}){f > t.capacidade! ? " ⚠" : ""}
                </option>
              );
            })}
          </select>
        ) : (
          <input className={campo} inputMode="numeric" value={valor} onChange={(e) => alterarLigacao(i, lado, "fibra", e.target.value)} />
        )}
      </div>
    );
  }

  function camposEquipamento(i: number) {
    const l = linhas[i];
    const lista = l.tipo === "olt" ? olts : l.tipo === "dio" ? dios : [];
    if (!lista.length) return null;
    const eq = lista.find((x) => x.id === l.equipamento_id);
    if (l.tipo === "olt") {
      const m = l.porta.match(/PL\s*0*(\d+)\D+0*(\d+)/i);
      const placa = m ? +m[1] : 0;
      const porta = m ? +m[2] : 0;
      const setPorta = (pl: number, po: number) => alterar(i, { porta: pl && po ? `PL ${pad2(pl)} - Porta ${pad2(po)}` : l.porta });
      return (
        <>
          <div className="col-span-2">
            <label className={rot}>OLT cadastrada</label>
            <select
              className={campo}
              value={l.equipamento_id}
              onChange={(e) => {
                const x = lista.find((o) => o.id === e.target.value);
                alterar(i, { equipamento_id: e.target.value, nome: l.nome.trim() ? l.nome : x?.nome ?? "" });
              }}
            >
              <option value="">— não vinculada —</option>
              {lista.map((o) => <option key={o.id} value={o.id}>{o.nome} · {resumoItem(o)}</option>)}
            </select>
          </div>
          {eq?.placas && eq.portas_por_placa ? (
            <>
              <div>
                <label className={rot}>Placa PON</label>
                <select className={campo} value={placa || ""} onChange={(e) => setPorta(+e.target.value, porta || 1)}>
                  <option value="">—</option>
                  {Array.from({ length: eq.placas }, (_, k) => k + 1).map((v) => <option key={v} value={v}>PL {pad2(v)}</option>)}
                </select>
              </div>
              <div>
                <label className={rot}>Porta PON</label>
                <select className={campo} value={porta || ""} onChange={(e) => setPorta(placa || 1, +e.target.value)}>
                  <option value="">—</option>
                  {Array.from({ length: eq.portas_por_placa }, (_, k) => k + 1).map((v) => <option key={v} value={v}>Porta {pad2(v)}</option>)}
                </select>
              </div>
            </>
          ) : null}
        </>
      );
    }
    const m = l.porta.match(/Porta\s*0*(\d+)/i);
    return (
      <>
        <div className="col-span-2">
          <label className={rot}>DIO cadastrado</label>
          <select className={campo} value={l.equipamento_id} onChange={(e) => alterar(i, { equipamento_id: e.target.value })}>
            <option value="">— não vinculado —</option>
            {lista.map((o) => <option key={o.id} value={o.id}>{o.nome} · {resumoItem(o)}</option>)}
          </select>
        </div>
        {eq?.portas ? (
          <div>
            <label className={rot}>Porta do DIO</label>
            <select className={campo} value={m ? +m[1] : ""} onChange={(e) => alterar(i, { porta: e.target.value ? `Porta ${pad2(+e.target.value)}` : "" })}>
              <option value="">—</option>
              {Array.from({ length: eq.portas }, (_, k) => k + 1).map((v) => <option key={v} value={v}>Porta {pad2(v)}</option>)}
            </select>
          </div>
        ) : null}
      </>
    );
  }

  function campoSplitter(i: number) {
    const l = linhas[i];
    const valor = l.splitter_modelo && modelosSplitter.some((m) => m.id === l.splitter_modelo) ? `m:${l.splitter_modelo}` : l.splitter;
    const generico = l.splitter && !SPLITTERS.includes(l.splitter as (typeof SPLITTERS)[number]) && !valor.startsWith("m:");
    return (
      <div>
        <label className={rot}>Splitter</label>
        <select
          className={campo}
          value={valor}
          onChange={(e) => {
            const v = e.target.value;
            const m = v.startsWith("m:") ? modelosSplitter.find((x) => x.id === v.slice(2)) : undefined;
            alterar(i, { splitter: m ? m.relacao ?? "" : v, splitter_modelo: m?.id ?? "" });
          }}
        >
          <option value="">Sem splitter</option>
          {modelosSplitter.length > 0 && (
            <optgroup label="Cadastrados">
              {modelosSplitter.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nome} · {resumoItem(m)}</option>)}
            </optgroup>
          )}
          <optgroup label="Genérico">
            {SPLITTERS.map((x) => <option key={x} value={x}>{x}</option>)}
            {generico && <option value={l.splitter}>{l.splitter}</option>}
          </optgroup>
        </select>
      </div>
    );
  }

  const modos: { k: ModoMapa; rotulo: string; icone: React.ReactNode; dica: string }[] = [
    { k: "adicionar", rotulo: "Adicionar", icone: <Plus className="w-3.5 h-3.5" />, dica: "Clique no mapa: posiciona o próximo elemento sem local ou cria um novo no fim da rota." },
    { k: "posicionar", rotulo: "Reposicionar", icone: <Crosshair className="w-3.5 h-3.5" />, dica: "Clique no mapa para mudar o local do elemento selecionado (ou arraste o marcador)." },
    { k: "tracar", rotulo: "Traçar cabo", icone: <Route className="w-3.5 h-3.5" />, dica: "Clique nos postes do caminho do cabo até o elemento selecionado. Clique numa curva para removê-la." },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
      <datalist id="cabos-conhecidos">
        {nomesCabos.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">{inicial ? "Editar rota" : "Cadastrar rota"}</h2>
        <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={rot}>Nome da rota *</label>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: OLT1_ST PL04 P13 → HUB 0/4/13" />
        </div>
        <div>
          <label className={rot}>Observação</label>
          <input className={campo} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        {/* Mapa (em telas grandes fica do lado e acompanha a rolagem) */}
        <div className="xl:order-2 xl:sticky xl:top-4 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {modos.map((m) => (
              <button
                key={m.k}
                type="button"
                onClick={() => { setModo(m.k); setAviso(null); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border font-medium ${
                  modo === m.k ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                {m.icone} {m.rotulo}
              </button>
            ))}
            {modo === "adicionar" && (
              <select
                value={tipoNovo}
                onChange={(e) => setTipoNovo(e.target.value as TipoElementoRota)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                aria-label="Tipo do elemento novo"
              >
                {Object.entries(TIPO_ELEMENTO_LABEL).map(([k, v]) => <option key={k} value={k}>Novo: {v}</option>)}
              </select>
            )}
            {modo === "tracar" && sel !== null && linhas[sel]?.vertices.length > 0 && (
              <button
                type="button"
                onClick={() => alterar(sel, { vertices: linhas[sel].vertices.slice(0, -1) })}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              >
                <Undo2 className="w-3.5 h-3.5" /> Desfazer curva
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500">
            {modos.find((m) => m.k === modo)?.dica}
            {modo !== "adicionar" && sel !== null ? ` Selecionado: ${sel + 1}. ${linhas[sel]?.nome || "(sem nome)"}.` : ""}
          </p>
          {aviso && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{aviso}</p>}
          {trechosFixos.length > 0 && modo === "tracar" && (
            <p className="text-xs text-gray-500">Esta rota veio do GeoGrid e usa o traçado do KML; o desenho de cabo vale só para rotas cadastradas aqui.</p>
          )}
          <RotaEditorMapa
            pontos={pontosMapa}
            trechosFixos={trechosFixos}
            selecionado={sel}
            modo={modo}
            centroPadrao={centroPadrao}
            onSelect={setSel}
            onClicarMapa={clicarMapa}
            onMoverElemento={(i, lat, lon) => alterar(i, { coords: fmtCoord({ lat, lon }) })}
            onMoverVertice={(i, k, lat, lon) => alterar(i, { vertices: linhas[i].vertices.map((v, j) => (j === k ? { lat, lon } : v)) })}
            onRemoverVertice={(i, k) => alterar(i, { vertices: linhas[i].vertices.filter((_, j) => j !== k) })}
          />
          <p className="text-[11px] text-gray-500">
            Total informado: <b>{formatMetros(totalInformado)}</b>
            {totalMapa > 0 && <> · medido no mapa: <b>{formatMetros(totalMapa)}</b></>}
            {" "}· distância do trecho com o ícone 📍 é calculada pelo mapa (cabo traçado ou linha reta). Some reservas técnicas à mão, se precisar.
          </p>
        </div>

        {/* Elementos */}
        <div className="xl:order-1 space-y-3">
          <p className="text-xs text-gray-500">
            Elementos na ordem em que o sinal passa, da OLT até a ponta. Clique num cartão para selecioná-lo no mapa.
          </p>
          <ol className="space-y-3">
            {linhas.map((l, i) => {
              const dm = distMapa(linhas, i);
              return (
                <li
                  key={i}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  onClick={() => setSel(i)}
                  className={`border rounded-lg p-3 ${i === sel ? "border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/40" : "border-gray-200 bg-gray-50/60"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      Elemento {i + 1}
                      {posDe(l) ? <MapPin className="w-3.5 h-3.5 text-indigo-500" aria-label="Posicionado no mapa" /> : <span className="text-[11px] font-normal text-gray-400">sem local</span>}
                    </span>
                    <span className="flex gap-1">
                      <button type="button" onClick={(e) => { e.stopPropagation(); mover(i, -1); }} disabled={i === 0} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" aria-label="Subir">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); mover(i, 1); }} disabled={i === linhas.length - 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30" aria-label="Descer">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); remover(i); }} className="p-1 rounded hover:bg-red-100 text-red-600" aria-label="Remover elemento">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className={rot}>Nome *</label>
                      <input className={campo} value={l.nome} onChange={(e) => alterar(i, { nome: e.target.value })} placeholder="Ex.: CE 2222 - P. CHAMINE" />
                    </div>
                    <div>
                      <label className={rot}>Tipo</label>
                      <select className={campo} value={l.tipo} onChange={(e) => alterar(i, { tipo: e.target.value as TipoElementoRota })}>
                        {Object.entries(TIPO_ELEMENTO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={rot}>Código (PT…)</label>
                      <input className={campo} value={l.codigo} onChange={(e) => alterar(i, { codigo: e.target.value })} />
                    </div>

                    {camposEquipamento(i)}

                    {i > 0 && (
                      <>
                        <div className="col-span-2 md:col-span-1">
                          <label className={rot}>Cabo de chegada</label>
                          <input className={campo} list="cabos-conhecidos" value={l.cabo_entrada} onChange={(e) => alterarLigacao(i, "entrada", "cabo", e.target.value)} />
                        </div>
                        {seletorTipoCabo(l.cabo_entrada)}
                        {campoFibra(i, "entrada")}
                        <div>
                          <label className={rot}>
                            Distância do anterior (m){l.dist_auto && dm !== null ? " 📍" : ""}
                          </label>
                          <input
                            className={campo}
                            inputMode="decimal"
                            value={l.distancia_m}
                            onChange={(e) => alterar(i, { distancia_m: e.target.value, dist_auto: false })}
                          />
                          {!l.dist_auto && dm !== null && (
                            <button type="button" onClick={() => alterar(i, { dist_auto: true })} className="text-[11px] text-indigo-600 hover:underline">
                              usar mapa ({formatMetros(dm)})
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    <div>
                      <label className={rot}>Potência na chegada (dBm)</label>
                      <input className={campo} inputMode="decimal" value={l.potencia_entrada} onChange={(e) => alterar(i, { potencia_entrada: e.target.value })} />
                    </div>
                    {i < linhas.length - 1 && (
                      <>
                        <div className="col-span-2 md:col-span-1">
                          <label className={rot}>Cabo de saída</label>
                          <input className={campo} list="cabos-conhecidos" value={l.cabo_saida} onChange={(e) => alterarLigacao(i, "saida", "cabo", e.target.value)} />
                        </div>
                        {i === 0 && seletorTipoCabo(l.cabo_saida)}
                        {campoFibra(i, "saida")}
                      </>
                    )}
                    <div>
                      <label className={rot}>Potência na saída (dBm)</label>
                      <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, { potencia_saida: e.target.value })} />
                    </div>
                    {campoSplitter(i)}
                    <div className="col-span-2">
                      <label className={rot}>Porta</label>
                      <input className={campo} value={l.porta} onChange={(e) => alterar(i, { porta: e.target.value })} placeholder="Ex.: PL 04 - Porta 13" />
                    </div>
                    <div className="col-span-2">
                      <label className={rot}>Coordenadas (lat, lon)</label>
                      <input className={campo} value={l.coords} onChange={(e) => alterar(i, { coords: e.target.value })} placeholder="clique no mapa ou -28.69170, -49.34236" />
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <label className={rot}>Observação</label>
                      <input className={campo} value={l.obs} onChange={(e) => alterar(i, { obs: e.target.value })} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() => {
              const ant = linhas[linhas.length - 1];
              mudar((ls) => [...ls, { ...linhaVazia(), cabo_entrada: ant?.cabo_saida ?? "", fibra_entrada: ant?.fibra_saida ?? "" }]);
              setSel(linhas.length);
            }}
            className="flex items-center gap-1.5 text-sm text-indigo-600 font-medium hover:text-indigo-800"
          >
            <Plus className="w-4 h-4" /> Adicionar elemento
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancelar} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar rota
        </button>
      </div>
    </div>
  );
}
