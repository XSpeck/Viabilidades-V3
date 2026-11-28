"use client";
import { avisar, confirmar } from "@/lib/dialogo";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import {
  atualizarRota,
  criarRota,
  excluirRota,
  formatDbm,
  formatMetros,
  listarRotas,
  parseGeoGridKml,
  resumoRota,
  type RotaOptica,
  type RotaOpticaInput,
} from "@/lib/rotaOptica";
import RotaDiagrama, { DetalheElemento } from "@/components/rota-optica/RotaDiagrama";
import RotaEditor from "@/components/rota-optica/RotaEditor";
import UnifilarRede from "@/components/rota-optica/UnifilarRede";
import { listarCaixas, type CaixaRede } from "@/lib/caixasRede";
import { capacidadesDosCabos, codigoDoCabo, listarCabos, semCodigo, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import EtiquetaCabo from "@/components/rota-optica/EtiquetaCabo";
import { registrarCapacidadesCabos } from "@/lib/rotaOptica";
import { listarCatalogo, type ItemCatalogo } from "@/lib/catalogoRede";
import { listarPredios, salvarPredio } from "@/lib/prediosRede";
import { montarRotas, subRotasDe } from "@/lib/subRotas";
import { listarClientes, type ClienteRede } from "@/lib/clientesRede";
import ClientesRede from "@/components/rota-optica/ClientesRede";
import LimpezaRede from "@/components/rota-optica/LimpezaRede";
import SimuladorRompimento from "@/components/rota-optica/SimuladorRompimento";
import CadastroEquipamentos from "@/components/rota-optica/CadastroEquipamentos";
import { Janela, JanelasProvider } from "@/components/rota-optica/Janelas";
import { IconeCabo, IconeElemento } from "@/components/rota-optica/IconesRede";
import { tipoVisual, TIPO_ELEMENTO_LABEL } from "@/lib/rotaOptica";
import { Boxes, Cable, FileUp, HelpCircle, Loader2, Map as MapIcon, Pencil, Plus, Route, Save, Trash2, Users, X, Zap } from "lucide-react";
import ComoFunciona from "@/components/rota-optica/ComoFunciona";
import PredioVertical from "@/components/rota-optica/PredioVertical";
import { chaveElemento } from "@/lib/arvorePon";
import { idPredioDoElemento } from "@/lib/prediosRede";

/** Para que serve cada aba (uma frase) */
const FRASE_VISTA = {
  mapa: "A rede inteira para análise. Para mudar posição ou cabo, abra a rota e clique em Editar.",
  unifilar: "O que tem dentro de cada caixa: splitters, emendas, clientes nas portas e o DIO. É aqui que se muda.",
} as const;

const RotaMapa = dynamic(() => import("@/components/rota-optica/RotaMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

const MapaRede = dynamic(() => import("@/components/rota-optica/MapaRede"), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

type Modo = { tipo: "ver" } | { tipo: "editar"; rota: RotaOptica | null } | { tipo: "importar"; rota: RotaOpticaInput };

export default function RotaOpticaPage() {
  const { user } = useAuth();
  /** Rotas como estão no banco (sub-rotas só com o trecho delas) */
  const [rotasCruas, setRotas] = useState<RotaOptica[]>([]);
  const [caixas, setCaixas] = useState<CaixaRede[]>([]);
  const [cabos, setCabos] = useState<CaboRede[]>([]);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>({ tipo: "ver" });
  /** Rotas abertas em janelas (posição inicial) */
  const [rotasAbertas, setRotasAbertas] = useState<{ id: string; x: number; y: number }[]>([]);
  /** Janela do cadastro de equipamentos (posição inicial) */
  const [cadastro, setCadastro] = useState<{ x: number; y: number } | null>(null);
  /** Janela de limpeza (resíduos de rotas apagadas) */
  const [limpeza, setLimpeza] = useState<{ x: number; y: number } | null>(null);
  /** Janela do cadastro de clientes */
  const [janelaClientes, setJanelaClientes] = useState<{ x: number; y: number } | null>(null);
  const [clientes, setClientes] = useState<ClienteRede[]>([]);
  /** Janela do simulador de rompimento (OTDR) */
  const [rompimento, setRompimento] = useState<{ x: number; y: number } | null>(null);
  /** Tela principal: árvore das portas PON ou mapa da rede */
  // a aba escolhida continua ao atualizar a página
  const [vista, setVistaEstado] = useState<"mapa" | "unifilar">(() => {
    try {
      const v = typeof window !== "undefined" ? window.localStorage.getItem("rota_optica_vista") : null;
      return v === "mapa" ? "mapa" : "unifilar";
    } catch { return "unifilar"; }
  });
  const setVista = (v: "mapa" | "unifilar") => {
    setVistaEstado(v);
    try { window.localStorage.setItem("rota_optica_vista", v); } catch { /* sem guardar */ }
  };
  /** Caixa que a aba Unifilar abre (vindo de outra tela); n muda a cada pedido */
  const [uniInicial, setUniInicial] = useState<{ chave: string | string[]; n: number } | null>(null);
  /** Muda para o editor reabrir do zero (depois de uma troca de fibra gravada) */
  const [versaoEditor, setVersaoEditor] = useState(0);
  /** Janela do prédio aberta pelo Unifilar (fibra de cada CDOI) */
  const [predioAberto, setPredioAberto] = useState<{ chave: string; nome: string; predioId?: string; x: number; y: number } | null>(null);
  /** Janela "Como funciona" */
  const [ajuda, setAjuda] = useState<{ x: number; y: number } | null>(null);
  const inputKml = useRef<HTMLInputElement>(null);
  // Sub-rotas montadas com o tronco da rota-mãe: todas as telas usam o caminho completo
  const rotas = useMemo(
    () => montarRotas(rotasCruas, (id) => (id ? catalogo.find((c) => c.id === id)?.perda_db : undefined)),
    [rotasCruas, catalogo]
  );

  const permitido = canAccess(user ?? null, "rota-optica");

  async function recarregar() {
    try {
      const lista = await listarRotas();
      setRotas(lista);
      setRotasAbertas((rs) => rs.filter((x) => lista.some((r) => r.id === x.id)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar rotas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!permitido) return;
    let ativo = true;
    // Caixas são opcionais: se falhar (ex.: regra ainda não publicada), a árvore aparece sem os diagramas.
    listarCatalogo()
      .then((it) => { if (ativo) setCatalogo(it); })
      .catch((e) => console.warn("Não foi possível carregar o cadastro de equipamentos:", e));
    listarCabos()
      .then((cb) => { if (ativo) setCabos(cb); })
      .catch((e) => console.warn("Não foi possível carregar os cabos:", e));
    listarClientes()
      .then((cl) => { if (ativo) setClientes(cl); })
      .catch((e) => console.warn("Não foi possível carregar os clientes (publique a regra clientes_rede):", e));
    listarCaixas()
      .then((cx) => { if (ativo) setCaixas(cx); })
      .catch((e) => console.warn("Não foi possível carregar as caixas:", e));
    listarRotas()
      .then((lista) => { if (ativo) setRotas(lista); })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Erro ao carregar rotas."))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [permitido]);

  // Capacidade de cada cabo (cadastrada ou estimada) define tubos e cores das fibras em todas as telas
  const capacidades = useMemo(() => capacidadesDosCabos(cabos, usoDasFibras(rotas)), [cabos, rotas]);
  // Tipo de cabo cadastrado pode ter tubos fora do padrão (ex.: 96 fibras em tubos de 8)
  const tubos = useMemo(() => {
    const m = new Map<string, number>();
    cabos.forEach((c) => {
      const t = catalogo.find((i) => i.id === c.tipo_id);
      if (t?.fibras_por_tubo) m.set(c.chave, t.fibras_por_tubo);
    });
    return m;
  }, [cabos, catalogo]);
  registrarCapacidadesCabos(capacidades, tubos);

  const nomesCabos = useMemo(() => {
    const m = new Map<string, string>();
    usoDasFibras(rotas).forEach((v, k) => m.set(k, v.nome));
    rotas.forEach((r) => r.elementos.forEach((e) => e.cabo_saida && m.set(e.cabo_saida.toUpperCase(), e.cabo_saida)));
    cabos.forEach((c) => m.set(c.chave, c.nome));
    return [...new Set(m.values())].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [rotas, cabos]);

  // Mapa de rota nova abre perto da rede já cadastrada
  const pontoRede = rotas.flatMap((r) => r.elementos).find((e) => e.lat !== undefined && e.lon !== undefined);
  const centroPadrao: [number, number] | undefined = pontoRede ? [pontoRede.lat!, pontoRede.lon!] : undefined;

  if (!permitido) {
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito a administradores.</div>;
  }

  async function lerKml(file: File) {
    setErro(null);
    try {
      const texto = await file.text();
      const { elementos, trechos, nomeSugerido } = parseGeoGridKml(texto);
      setModo({
        tipo: "importar",
        rota: { nome: nomeSugerido, origem: "geogrid", elementos, trechos, criado_por: user?.nome },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o KML.");
    }
  }

  /** Abre a rota numa janela grande, centralizada no topo (ou traz para frente) */
  function abrirRota(id: string) {
    setRotasAbertas((rs) =>
      rs.some((x) => x.id === id)
        ? [...rs.filter((x) => x.id !== id), rs.find((x) => x.id === id)!]
        : [...rs, { id, x: Math.max(8, (window.innerWidth - 980) / 2) + (rs.length % 4) * 24, y: 48 + (rs.length % 4) * 24 }]
    );
  }

  /** Troca de fibra feita de dentro do editor: grava rotas, então o editor reabre com a rota gravada */
  async function editorRegravado() {
    const id = modo.tipo === "editar" ? modo.rota?.id : undefined;
    const lista = await listarRotas();
    setRotas(lista);
    const montadas = montarRotas(lista, (x) => (x ? catalogo.find((c) => c.id === x)?.perda_db : undefined));
    if (id) setModo({ tipo: "editar", rota: montadas.find((r) => r.id === id) ?? null });
    setVersaoEditor((v) => v + 1);
  }

  /** Abre a janela do prédio (onde se escolhe a fibra de cada CDOI) */
  function editarPredio(chave: string) {
    const el = rotas.flatMap((r) => r.elementos).find((e) => chaveElemento(e) === chave);
    if (!el) return;
    setPredioAberto({ chave, nome: el.nome, predioId: idPredioDoElemento(el) ?? undefined, x: Math.max(8, (window.innerWidth - 640) / 2), y: 60 });
  }

  /** Leva a caixa para a aba Unifilar (onde se muda o que tem dentro dela) */
  function abrirNoUnifilar(chave: string | string[]) {
    setModo({ tipo: "ver" });
    setUniInicial((u) => ({ chave, n: (u?.n ?? 0) + 1 }));
    setVista("unifilar");
  }

  async function salvarNova(dados: RotaOpticaInput) {
    const id = await criarRota(dados);
    setModo({ tipo: "ver" });
    await recarregar();
    abrirRota(id);
  }

  async function salvarEdicao(id: string, dados: RotaOpticaInput) {
    await atualizarRota(id, dados);
    setModo({ tipo: "ver" });
    await recarregar();
    abrirRota(id);
  }

  async function excluir(r: RotaOptica) {
    const filhas = subRotasDe(r.id, rotas);
    if (filhas.length) {
      const lista = filhas.map((x) => `• ${x.nome}`).join("\n");
      void avisar(`A rota "${r.nome}" tem ${filhas.length} sub-rota${filhas.length > 1 ? "s" : ""} saindo dela:\n\n${lista}\n\nExclua as sub-rotas antes.`);
      return;
    }
    // rota de CDOI montada por um prédio: a CDOI continua no prédio, só que sem fibra (só no desenho)
    const prediosAgora = await listarPredios(true).catch(() => []);
    const doPredio = prediosAgora.find((p) => p.pontos.some((o) => o.rota_id === r.id));
    const cdoi = doPredio?.pontos.find((o) => o.rota_id === r.id);
    const aviso = doPredio && cdoi ? `\n\nA ${cdoi.nome} continua no prédio ${doPredio.nome}, sem fibra (só no desenho).` : "";
    if (!(await confirmar(`Excluir a rota "${r.nome}"? Isso não pode ser desfeito.${aviso}`, { titulo: "Excluir rota", ok: "Excluir" }))) return;
    try {
      await excluirRota(r.id);
      if (doPredio && cdoi) {
        await salvarPredio(
          { ...doPredio, pontos: doPredio.pontos.map((o) => (o.id === cdoi.id ? { ...o, rota_id: undefined, fibra: undefined, chave: "" } : o)) },
          user?.nome ?? ""
        );
      }
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  return (
    <JanelasProvider>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Route className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rota Óptica</h1>
            <p className="text-gray-500 text-sm mt-0.5">Caminho da fibra da OLT até a ponta: cabos, fibras, emendas e potência</p>
          </div>
        </div>
        {modo.tipo === "ver" && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputKml}
              type="file"
              accept=".kml,application/vnd.google-earth.kml+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) lerKml(f);
                e.target.value = "";
              }}
            />
            <details className="relative">
              <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                <Boxes className="w-4 h-4" /> Mais ▾
              </summary>
              <div className="absolute right-0 z-[60] mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl">
                <button
                  type="button"
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setCadastro({ x: Math.max(8, (window.innerWidth - 800) / 2), y: 72 }); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <Boxes className="w-4 h-4 text-slate-600" /> Cadastros (equipamentos)
                </button>
                <button
                  type="button"
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setJanelaClientes({ x: Math.max(8, (window.innerWidth - 560) / 2), y: 72 }); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <Users className="w-4 h-4 text-emerald-600" /> Clientes
                </button>
                <button
                  type="button"
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; inputKml.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <FileUp className="w-4 h-4 text-indigo-600" /> Importar KML do GeoGrid
                </button>
                <button
                  type="button"
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setLimpeza({ x: Math.max(8, (window.innerWidth - 520) / 2), y: 72 }); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <Trash2 className="w-4 h-4 text-slate-600" /> Limpeza (sem rota)
                </button>
              </div>
            </details>
            <button
              type="button"
              disabled={!rotas.length}
              onClick={() => setRompimento({ x: Math.max(8, (window.innerWidth - 1000) / 2), y: 12 })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-medium disabled:opacity-50"
              title="Onde está o rompimento medido pelo OTDR e o que fica sem sinal"
            >
              <Zap className="w-4 h-4" /> Simular rompimento
            </button>
            <button
              type="button"
              onClick={() => { setModo({ tipo: "editar", rota: null }); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 font-medium"
            >
              <Plus className="w-4 h-4" /> Nova rota (mapa / manual)
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      {modo.tipo === "editar" && (
        <RotaEditor
          key={`${modo.rota?.id ?? "nova"}-${versaoEditor}`}
          inicial={modo.rota}
          usuario={user?.nome ?? ""}
          catalogo={catalogo}
          cabos={cabos}
          nomesCabos={nomesCabos}
          centroPadrao={centroPadrao}
          rede={rotas.filter((r) => r.id !== modo.rota?.id)}
          todas={rotas}
          onCaboSalvo={(c) => setCabos((cs) => [...cs.filter((x) => x.id !== c.id), c])}
          onCancelar={() => setModo({ tipo: "ver" })}
          onSalvar={(d) => (modo.rota ? salvarEdicao(modo.rota.id, d) : salvarNova(d))}
          onSalvarParcial={modo.rota ? async (d) => { await atualizarRota(modo.rota!.id, d); await recarregar(); } : undefined}
          caixas={caixas}
          onRotasRegravadas={editorRegravado}
          onCaixaSalva={(c) => setCaixas((cs) => [...cs.filter((x) => x.id !== c.id), c])}
          onEditarPredio={async (k) => { if (await confirmar("Sair do editor da rota e abrir a janela do prédio? O que não foi salvo aqui se perde.", { ok: "Abrir o prédio" })) { setModo({ tipo: "ver" }); editarPredio(k); } }}
          onAbrirNoUnifilar={async (k) => { if (await confirmar("Sair do editor da rota e abrir a caixa no Unifilar? O que não foi salvo aqui se perde.", { ok: "Abrir no Unifilar" })) abrirNoUnifilar(k); }}
        />
      )}

      {predioAberto && (
        <Janela
          inicial={predioAberto}
          largura={Math.min(640, typeof window !== "undefined" ? window.innerWidth - 16 : 640)}
          titulo={predioAberto.nome}
          subtitulo="Prédio · fibra de cada CDOI, blocos e andares"
          icone={<IconeElemento tipo="predio" tamanho={22} />}
          corBarra="bg-slate-700"
          onFechar={() => setPredioAberto(null)}
        >
          <PredioVertical
            key={predioAberto.chave}
            chave={predioAberto.chave}
            nome={predioAberto.nome}
            predioId={predioAberto.predioId}
            rotas={rotas}
            caixas={caixas}
            usuario={user?.nome ?? ""}
            onAbrirRota={abrirRota}
            onRotasMudaram={recarregar}
            modelosSplitter={catalogo.filter((m) => m.categoria === "splitter")}
            onAbrirCdoi={(k) => abrirNoUnifilar(k)}
            onCaixaSalva={(c) => setCaixas((cs) => [...cs.filter((x) => x.id !== c.id), c])}
          />
        </Janela>
      )}

      {ajuda && (
        <Janela
          inicial={ajuda}
          largura={Math.min(820, typeof window !== "undefined" ? window.innerWidth - 16 : 820)}
          titulo="Como funciona"
          subtitulo="Para que serve cada tela e onde se muda cada coisa"
          icone={<HelpCircle className="w-5 h-5" />}
          corBarra="bg-slate-800"
          onFechar={() => setAjuda(null)}
        >
          <ComoFunciona />
        </Janela>
      )}

      {cadastro && (
        <Janela
          inicial={cadastro}
          largura={800}
          titulo="Cadastro de equipamentos"
          subtitulo="Tipos de cabo, splitter, DIO e OLT"
          icone={<Boxes className="w-5 h-5" />}
          corBarra="bg-indigo-900"
          onFechar={() => setCadastro(null)}
        >
          <CadastroEquipamentos itens={catalogo} usuario={user?.nome ?? ""} onMudou={setCatalogo} onFechar={() => setCadastro(null)} />
        </Janela>
      )}

      {rompimento && (
        <Janela
          inicial={rompimento}
          largura={Math.min(1000, typeof window !== "undefined" ? window.innerWidth - 16 : 1000)}
          titulo="Simulador OTDR"
          subtitulo="Onde rompeu, o que fica sem sinal e a certificação da rota"
          icone={<Zap className="w-5 h-5 text-yellow-300" />}
          corBarra="bg-red-900"
          onFechar={() => setRompimento(null)}
        >
          <SimuladorRompimento rotas={rotas} caixas={caixas} onAbrirRota={abrirRota} usuario={user?.nome ?? ""} />
        </Janela>
      )}

      {janelaClientes && (
        <Janela
          inicial={janelaClientes}
          largura={560}
          titulo="Clientes"
          subtitulo="Cadastro e ligação na perna da CTO / CDOI"
          icone={<Users className="w-5 h-5" />}
          corBarra="bg-emerald-800"
          onFechar={() => setJanelaClientes(null)}
        >
          <ClientesRede rotas={rotas} caixas={caixas} clientes={clientes} usuario={user?.nome ?? ""} onClientes={setClientes} onCaixas={setCaixas} />
        </Janela>
      )}

      {limpeza && (
        <Janela
          inicial={limpeza}
          largura={520}
          titulo="Limpeza"
          subtitulo="Sub-rotas a converter e prédios, caixas e cabos que nenhuma rota usa"
          icone={<Trash2 className="w-5 h-5" />}
          corBarra="bg-slate-800"
          onFechar={() => setLimpeza(null)}
        >
          <LimpezaRede
            rotas={rotas}
            caixas={caixas}
            cabos={cabos}
            usuario={user?.nome ?? ""}
            onCaixas={setCaixas}
            onCabos={setCabos}
            onPredios={recarregar}
            onRotas={recarregar}
          />
        </Janela>
      )}

      {modo.tipo === "importar" && (
        <PreviaImportacao
          rota={modo.rota}
          onCancelar={() => setModo({ tipo: "ver" })}
          onSalvar={salvarNova}
        />
      )}

      {modo.tipo === "ver" && (
        carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist">
            {([["mapa", "Mapa da rede", MapIcon], ["unifilar", "Unifilar", Cable]] as const).map(([k, rot, Ic]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={vista === k}
                onClick={() => setVista(k)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${vista === k ? "bg-white text-indigo-700 shadow" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Ic className="h-4 w-4" /> {rot}
              </button>
            ))}
          </div>
          <p className="min-w-0 flex-1 text-xs text-slate-500">{FRASE_VISTA[vista]}</p>
          <button
            type="button"
            onClick={() => setAjuda({ x: Math.max(8, (window.innerWidth - 820) / 2), y: 72 })}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <HelpCircle className="h-4 w-4" /> Como funciona
          </button>
          </div>
          {vista === "unifilar" ? (
            <UnifilarRede
              key={uniInicial?.n ?? 0}
              inicial={uniInicial?.chave}
              onEditarPredio={editarPredio}
              clientes={clientes}
              rotas={rotas}
              caixas={caixas}
              catalogo={catalogo}
              usuario={user?.nome ?? ""}
              onCaixaSalva={(c) => setCaixas((cs) => [...cs.filter((x) => x.id !== c.id), c])}
              onAbrirRota={abrirRota}
              onRotasMudaram={recarregar}
            />
          ) : (
            <MapaRede rotas={rotas} caixas={caixas} onAbrirRota={abrirRota} onAbrirNoUnifilar={abrirNoUnifilar} />
          )}
          </div>
        )
      )}

      {rotasAbertas.map((j) => {
        const r = rotas.find((x) => x.id === j.id);
        if (!r) return null;
        const res = resumoRota(r.elementos);
        return (
          <Janela
            key={j.id}
            inicial={{ x: j.x, y: j.y }}
            largura={Math.min(980, typeof window !== "undefined" ? window.innerWidth - 16 : 980)}
            titulo={r.nome}
            subtitulo={`${r.origem === "geogrid" ? "GeoGrid" : "Manual"} · ${r.elementos.length} elementos · ${formatMetros(res.distancia_m)}`}
            icone={<Route className="w-5 h-5" />}
            corBarra="bg-indigo-900"
            onFechar={() => setRotasAbertas((rs) => rs.filter((x) => x.id !== j.id))}
          >
            <div className="p-3 bg-slate-50">
              <VisualizarRota
                rota={r}
                catalogo={catalogo}
                emJanela
                origemTexto={
                  r.pai
                    ? `Sub-rota de ${rotas.find((x) => x.id === r.pai!.rota_id)?.nome ?? "rota-mãe"}, saindo de ${r.tronco ? r.elementos[r.tronco - 1]?.nome : "?"}`
                    : rotas.some((x) => x.pai?.rota_id === r.id)
                      ? `Rota tronco · ${rotas.filter((x) => x.pai?.rota_id === r.id).length} sub-rota(s) saindo dela`
                      : undefined
                }
                onEditar={() => { setRotasAbertas((rs) => rs.filter((x) => x.id !== j.id)); setModo({ tipo: "editar", rota: r }); }}
                onExcluir={() => excluir(r)}
              />
            </div>
          </Janela>
        );
      })}
    </div>
    </JanelasProvider>
  );
}

// =====================
// Prévia antes de salvar o KML importado
// =====================
function PreviaImportacao({
  rota,
  onCancelar,
  onSalvar,
}: {
  rota: RotaOpticaInput;
  onCancelar: () => void;
  onSalvar: (r: RotaOpticaInput) => Promise<void>;
}) {
  const [nome, setNome] = useState(rota.nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) return setErro("Dê um nome para a rota.");
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ ...rota, nome: nome.trim() });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
        <p className="text-sm text-gray-700">
          KML lido: <b>{rota.elementos.length}</b> elementos e <b>{rota.trechos.length}</b> trechos de cabo. Confira abaixo e salve.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            aria-label="Nome da rota"
          />
          <div className="flex gap-2">
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
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
      <VisualizarRota rota={{ ...rota, id: "previa", nome }} />
    </div>
  );
}

// =====================
// Visualização: resumo, diagrama, detalhe e mapa
// =====================
function VisualizarRota({
  rota,
  catalogo = [],
  emJanela,
  origemTexto,
  onEditar,
  onExcluir,
}: {
  rota: RotaOptica;
  catalogo?: ItemCatalogo[];
  /** Dentro de uma janela: sem o nome repetido */
  emJanela?: boolean;
  /** "Sub-rota de …" / "Rota tronco · …" */
  origemTexto?: string;
  onEditar?: () => void;
  onExcluir?: () => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [janela, setJanela] = useState<{ x: number; y: number } | null>(null);
  /** CDOIs que estão em prédios (no mapa aparecem como prédio) */
  const [chavesPredio, setChavesPredio] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setChavesPredio(new Set(ps.flatMap((p) => p.chaves)))).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const ultimoClique = useRef({ x: 300, y: 200 });
  const res = resumoRota(rota.elementos);

  function selecionar(i: number) {
    setSel(i);
    setJanela((j) => j ?? { x: ultimoClique.current.x + 30, y: ultimoClique.current.y - 80 });
  }
  const elSel = sel !== null ? rota.elementos[sel] : undefined;

  return (
    <section className="@container space-y-4 min-w-0" onPointerDownCapture={(e) => { ultimoClique.current = { x: e.clientX, y: e.clientY }; }}>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            {!emJanela && <h2 className="text-lg font-bold text-gray-900 leading-tight">{rota.nome}</h2>}
            <p className="text-xs text-gray-500 mt-0.5">
              {rota.origem === "geogrid" ? "Importada do GeoGrid" : "Cadastro manual"}
              {rota.criado_por ? ` · por ${rota.criado_por}` : ""}
              {rota.atualizado_em ? ` · atualizada em ${new Date(rota.atualizado_em).toLocaleDateString("pt-BR")}` : ""}
            </p>
            {origemTexto && <p className="mt-1 inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">{origemTexto}</p>}
            {rota.obs && <p className="text-sm text-gray-600 mt-1">{rota.obs}</p>}
          </div>
          {(onEditar || onExcluir) && (
            <div className="flex gap-1">
              {onEditar && (
                <button type="button" onClick={onEditar} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
              {onExcluir && (
                <button type="button" onClick={onExcluir} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
            </div>
          )}
        </div>
        {/* Números da rota numa linha só */}
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-gray-600">
          <span><b className="text-gray-900 tabular-nums">{formatMetros(res.distancia_m)}</b></span>
          <span className="text-gray-300">·</span>
          <span className="tabular-nums">
            <b className="text-gray-900">{formatDbm(res.potencia_inicial)}</b> → <b className="text-gray-900">{formatDbm(res.potencia_final)}</b>
            {res.perda_db !== undefined && <span className="text-gray-500"> (perda {res.perda_db.toFixed(2).replace(".", ",")} dB)</span>}
          </span>
          {res.emendas > 0 && (
            <>
              <span className="text-gray-300">·</span>
              <span>{res.emendas} emenda{res.emendas > 1 ? "s" : ""}</span>
            </>
          )}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <RotaMapa elementos={rota.elementos} trechos={rota.trechos} selecionado={sel} onSelect={selecionar} chavesPredio={chavesPredio} />
      </div>

      {res.cabos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">Cabos ({res.cabos.length})</p>
          <ul className="divide-y divide-gray-100">
            {res.cabos.map((c) => {
              const cod = codigoDoCabo(c);
              return (
                <li key={c} className="flex min-w-0 items-center gap-2 py-1 text-xs text-gray-700">
                  {cod ? <EtiquetaCabo codigo={cod} /> : <IconeCabo tamanho={16} />}
                  <span className="min-w-0 truncate">{semCodigo(c)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Lista escrita: recolhida (a árvore e o mapa já mostram o caminho) */}
      <details className="group bg-white rounded-xl border border-gray-200 px-3 py-2">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-gray-500">
          Rota escrita (elemento por elemento)
          <span className="ml-auto text-gray-400 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-2">
          <RotaDiagrama elementos={rota.elementos} selecionado={sel} onSelect={selecionar} />
        </div>
      </details>

      {janela && elSel && sel !== null && (
        <Janela
          inicial={janela}
          titulo={elSel.nome}
          subtitulo={`${TIPO_ELEMENTO_LABEL[tipoVisual(elSel)]} · elemento ${sel + 1} de ${rota.elementos.length}`}
          icone={<IconeElemento tipo={tipoVisual(elSel)} tamanho={22} />}
          onFechar={() => { setJanela(null); setSel(null); }}
        >
          <div className="p-3">
            <DetalheElemento elementos={rota.elementos} indice={sel} catalogo={catalogo} />
          </div>
        </Janela>
      )}
    </section>
  );
}
