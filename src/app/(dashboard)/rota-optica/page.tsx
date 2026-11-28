"use client";
import { avisar, confirmar } from "@/lib/dialogo";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { canAccess } from "@/lib/access";
import {
  formatDbm,
  formatMetros,
  resumoRota,
  type RotaOptica,
} from "@/lib/rotaOptica";
import RotaDiagrama, { DetalheElemento } from "@/components/rota-optica/RotaDiagrama";
import UnifilarRede from "@/components/rota-optica/UnifilarRede";
import { listarCaixas, type CaixaRede } from "@/lib/caixasRede";
import { capacidadesDosCabos, codigoDoCabo, listarCabos, semCodigo, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import EtiquetaCabo from "@/components/rota-optica/EtiquetaCabo";
import { registrarCapacidadesCabos } from "@/lib/rotaOptica";
import { listarCatalogo, type ItemCatalogo } from "@/lib/catalogoRede";
import { listarPredios } from "@/lib/prediosRede";
import { listarClientes, type ClienteRede } from "@/lib/clientesRede";
import ClientesRede from "@/components/rota-optica/ClientesRede";
import { apagarRedeDesenhada, contarRedeDesenhada } from "@/lib/redeLivre";
import { calcularSinal } from "@/lib/sinalRede";
import SimuladorRompimento from "@/components/rota-optica/SimuladorRompimento";
import CadastroEquipamentos from "@/components/rota-optica/CadastroEquipamentos";
import { Janela, JanelasProvider } from "@/components/rota-optica/Janelas";
import { IconeCabo, IconeElemento } from "@/components/rota-optica/IconesRede";
import { tipoVisual, TIPO_ELEMENTO_LABEL } from "@/lib/rotaOptica";
import { Boxes, Cable, HelpCircle, Loader2, Map as MapIcon, Pencil, Route, Trash2, Users, X, Zap } from "lucide-react";
import ComoFunciona from "@/components/rota-optica/ComoFunciona";
import PredioLivre from "@/components/rota-optica/PredioLivre";

/** Para que serve cada aba (uma frase) */
const FRASE_VISTA = {
  mapa: "Onde as coisas estão e por onde o cabo passa: coloque elementos e desenhe cabos. O sinal aparece sozinho.",
  unifilar: "O que liga em quê dentro de cada caixa: splitters, emendas, DIO e clientes nas portas.",
} as const;

function CarregandoMapa({ h }: { h: string }) {
  return (
    <div className={`${h} bg-gray-100 rounded-xl flex items-center justify-center`}>
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
}
const RotaMapa = dynamic(() => import("@/components/rota-optica/RotaMapa"), { ssr: false, loading: () => <CarregandoMapa h="h-[420px]" /> });
const EditorRede = dynamic(() => import("@/components/rota-optica/EditorRede"), { ssr: false, loading: () => <CarregandoMapa h="h-[520px]" /> });
const MapaRede = dynamic(() => import("@/components/rota-optica/MapaRede"), { ssr: false, loading: () => <CarregandoMapa h="h-[520px]" /> });

type Modo = { tipo: "ver" };

export default function RotaOpticaPage() {
  const { user } = useAuth();
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
  /** Aba Mapa da rede: desenhar (editar) ou ver a análise (temas, alertas) */
  const [mapaModo, setMapaModo] = useState<"editar" | "analise">("editar");
  /** Janela do prédio (blocos, andares e CDOIs) */
  const [predioAberto, setPredioAberto] = useState<{ chave: string; x: number; y: number } | null>(null);
  const abrirPredio = (chave: string) => setPredioAberto({ chave, x: Math.max(8, (window.innerWidth - 720) / 2), y: 60 });
  /** Janela "Como funciona" */
  const [ajuda, setAjuda] = useState<{ x: number; y: number } | null>(null);
  /** Rede livre: o sinal sai das portas PON e segue as ligações das caixas (nada disso é gravado) */
  const sinal = useMemo(
    () => calcularSinal(caixas, cabos, {
      txDe: (o) => catalogo.find((c) => c.id === o.equipamento_id)?.potencia_tx,
      perdaModelo: (id) => (id ? catalogo.find((c) => c.id === id)?.perda_db : undefined),
    }),
    [caixas, cabos, catalogo],
  );
  /** Os caminhos da luz (de cada PON até cada caixa onde ela termina): o que as telas de análise leem */
  const rotas = sinal.rotas;

  const permitido = canAccess(user ?? null, "rota-optica");

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
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Erro ao carregar a rede."))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [permitido]);

  // Capacidade de cada cabo (cadastrada ou estimada) define tubos e cores das fibras em todas as telas
  const capacidades = useMemo(() => capacidadesDosCabos(cabos, usoDasFibras(rotas)), [cabos, rotas]);
  // Tipo de cabo cadastrado pode ter tubos fora do padrão (ex.: 96 fibras em tubos de 8)
  const [tubos, construcoes] = useMemo(() => {
    const m = new Map<string, number>(), k = new Map<string, string>();
    cabos.forEach((c) => {
      const t = catalogo.find((i) => i.id === c.tipo_id);
      if (t?.fibras_por_tubo) m.set(c.chave, t.fibras_por_tubo);
      // flat e cordão têm cor própria no cabo inteiro
      if (t?.construcao) k.set(c.chave, t.construcao);
    });
    return [m, k] as const;
  }, [cabos, catalogo]);
  registrarCapacidadesCabos(capacidades, tubos, construcoes);

  if (!permitido) {
    return <div className="text-center py-20 text-red-500">🚫 Acesso restrito a administradores.</div>;
  }

  /** Abre a rota numa janela grande, centralizada no topo (ou traz para frente) */
  function abrirRota(id: string) {
    setRotasAbertas((rs) =>
      rs.some((x) => x.id === id)
        ? [...rs.filter((x) => x.id !== id), rs.find((x) => x.id === id)!]
        : [...rs, { id, x: Math.max(8, (window.innerWidth - 980) / 2) + (rs.length % 4) * 24, y: 48 + (rs.length % 4) * 24 }]
    );
  }

  /** Leva a caixa para a aba Unifilar (onde se muda o que tem dentro dela) */
  function abrirNoUnifilar(chave: string | string[]) {
    setModo({ tipo: "ver" });
    setUniInicial((u) => ({ chave, n: (u?.n ?? 0) + 1 }));
    setVista("unifilar");
  }

  /** Apaga o que está desenhado (elementos, cabos, prédios) para redesenhar na rede livre; as rotas antigas ficam */
  async function comecarRedeNova() {
    try {
      const n = await contarRedeDesenhada();
      const ok1 = await confirmar(
        `Isto apaga tudo o que está desenhado: ${n.caixas_rede} caixa(s), ${n.cabos_rede} cabo(s) e ${n.predios_rede} prédio(s), com splitters, emendas e clientes nas portas. As rotas antigas ficam guardadas, mas o sistema não as usa mais. Não tem volta.`,
        { titulo: "Começar rede nova", ok: "Continuar", perigo: true },
      );
      if (!ok1) return;
      const ok2 = await confirmar("Última confirmação: apagar a rede desenhada agora?", { titulo: "Começar rede nova", ok: "Apagar tudo", perigo: true });
      if (!ok2) return;
      const total = await apagarRedeDesenhada();
      await avisar(`Pronto: ${total} registro(s) apagado(s). A página vai recarregar.`, { titulo: "Rede nova" });
      window.location.reload();
    } catch (e) {
      await avisar(e instanceof Error ? e.message : "Não foi possível apagar.", { titulo: "Começar rede nova" });
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
                  onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; void comecarRedeNova(); }}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" /> Começar rede nova
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
          </div>
        )}
      </div>

      {erro && (
        <div className="flex items-start justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      {predioAberto && caixas.some((c) => c.chave === predioAberto.chave) && (
        <Janela
          inicial={predioAberto}
          largura={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 16 : 720)}
          titulo={caixas.find((c) => c.chave === predioAberto.chave)!.nome}
          subtitulo="Blocos, andares e as CDOIs de cada andar"
          icone={<Boxes className="w-5 h-5" />}
          corBarra="bg-sky-900"
          onFechar={() => setPredioAberto(null)}
        >
          <PredioLivre
            key={predioAberto.chave}
            predio={caixas.find((c) => c.chave === predioAberto.chave)!}
            caixas={caixas}
            cabos={cabos}
            catalogo={catalogo}
            sinal={sinal}
            usuario={user?.nome ?? ""}
            onCaixa={(c) => setCaixas((l) => [...l.filter((x) => x.chave !== c.chave), c])}
            onCaixaFora={(k) => setCaixas((l) => l.filter((x) => x.chave !== k))}
            onCabo={(c) => setCabos((l) => [...l.filter((x) => x.chave !== c.chave), c])}
            onCaboFora={(k) => setCabos((l) => l.filter((x) => x.chave !== k))}
            onAbrirNoUnifilar={(k) => { setPredioAberto(null); abrirNoUnifilar(k); }}
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
          <ClientesRede rotas={rotas} caixas={caixas} clientes={clientes} usuario={user?.nome ?? ""} onClientes={setClientes} onCaixas={setCaixas} onAbrirNoUnifilar={(k) => { setJanelaClientes(null); abrirNoUnifilar(k); }} />
        </Janela>
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
              clientes={clientes}
              onEditarPredio={abrirPredio}
              cabos={cabos}
              caixas={caixas}
              catalogo={catalogo}
              usuario={user?.nome ?? ""}
              onCaixaSalva={(c) => setCaixas((cs) => [...cs.filter((x) => x.id !== c.id), c])}
            />
          ) : (
            <div className="space-y-2">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs">
                {([["editar", "Editar rede"], ["analise", "Análise"]] as const).map(([k, r]) => (
                  <button key={k} type="button" onClick={() => setMapaModo(k)}
                    className={`rounded-md px-2.5 py-1 font-semibold ${mapaModo === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{r}</button>
                ))}
              </div>
              {mapaModo === "analise" ? (
                <MapaRede rotas={rotas} caixas={caixas} onAbrirRota={abrirRota} onAbrirNoUnifilar={abrirNoUnifilar} />
              ) : (
              <EditorRede
                caixas={caixas}
                cabos={cabos}
                catalogo={catalogo}
                sinal={sinal}
                usuario={user?.nome ?? ""}
                onCaixa={(c) => setCaixas((l) => [...l.filter((x) => x.chave !== c.chave), c])}
                onCaixaFora={(k) => setCaixas((l) => l.filter((x) => x.chave !== k))}
                onCabo={(c) => setCabos((l) => [...l.filter((x) => x.chave !== c.chave), c])}
                onCaboFora={(k) => setCabos((l) => l.filter((x) => x.chave !== k))}
                onAbrirNoUnifilar={abrirNoUnifilar}
                onAbrirPredio={abrirPredio}
              />
              )}
            </div>
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
            subtitulo={`${r.elementos.length} elementos · ${formatMetros(res.distancia_m)}`}
            icone={<Route className="w-5 h-5" />}
            corBarra="bg-indigo-900"
            onFechar={() => setRotasAbertas((rs) => rs.filter((x) => x.id !== j.id))}
          >
            <div className="p-3 bg-slate-50">
              <VisualizarRota
                rota={r}
                catalogo={catalogo}
                emJanela
                origemTexto="Caminho da luz, calculado pelas ligações das caixas"
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
