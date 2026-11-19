"use client";

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
  textoBuscaRota,
  type RotaOptica,
  type RotaOpticaInput,
} from "@/lib/rotaOptica";
import RotaDiagrama, { DetalheElemento } from "@/components/rota-optica/RotaDiagrama";
import RotaEditor from "@/components/rota-optica/RotaEditor";
import ArvorePonView from "@/components/rota-optica/ArvorePon";
import { listarCaixas, type CaixaRede } from "@/lib/caixasRede";
import { capacidadesDosCabos, listarCabos, usoDasFibras, type CaboRede } from "@/lib/cabosRede";
import { registrarCapacidadesCabos } from "@/lib/rotaOptica";
import { listarCatalogo, type ItemCatalogo } from "@/lib/catalogoRede";
import CadastroEquipamentos from "@/components/rota-optica/CadastroEquipamentos";
import { Janela, JanelasProvider } from "@/components/rota-optica/Janelas";
import { IconeCabo, IconeElemento } from "@/components/rota-optica/IconesRede";
import { tipoVisual, TIPO_ELEMENTO_LABEL } from "@/lib/rotaOptica";
import { Boxes, FileUp, Loader2, Pencil, Plus, Route, Save, Search, Trash2, X } from "lucide-react";

const RotaMapa = dynamic(() => import("@/components/rota-optica/RotaMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] bg-gray-100 rounded-xl flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  ),
});

type Modo = { tipo: "ver" } | { tipo: "editar"; rota: RotaOptica | null } | { tipo: "importar"; rota: RotaOpticaInput };

export default function RotaOpticaPage() {
  const { user } = useAuth();
  const [rotas, setRotas] = useState<RotaOptica[]>([]);
  const [caixas, setCaixas] = useState<CaixaRede[]>([]);
  const [cabos, setCabos] = useState<CaboRede[]>([]);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>({ tipo: "ver" });
  const [aba, setAba] = useState<"rotas" | "arvore">("rotas");
  /** Janela do cadastro de equipamentos (posição inicial) */
  const [cadastro, setCadastro] = useState<{ x: number; y: number } | null>(null);
  const inputKml = useRef<HTMLInputElement>(null);

  const permitido = canAccess(user ?? null, "rota-optica");

  async function recarregar(selecionar?: string) {
    try {
      const lista = await listarRotas();
      setRotas(lista);
      setSelId((atual) => selecionar ?? (atual && lista.some((r) => r.id === atual) ? atual : lista[0]?.id ?? null));
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
    listarCaixas()
      .then((cx) => { if (ativo) setCaixas(cx); })
      .catch((e) => console.warn("Não foi possível carregar as caixas:", e));
    listarRotas()
      .then((lista) => {
        if (!ativo) return;
        setRotas(lista);
        setSelId(lista[0]?.id ?? null);
      })
      .catch((e) => ativo && setErro(e instanceof Error ? e.message : "Erro ao carregar rotas."))
      .finally(() => ativo && setCarregando(false));
    return () => { ativo = false; };
  }, [permitido]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return rotas;
    return rotas.filter((r) => textoBuscaRota(r).includes(t));
  }, [rotas, busca]);

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

  async function salvarNova(dados: RotaOpticaInput) {
    const id = await criarRota(dados);
    setModo({ tipo: "ver" });
    await recarregar(id);
  }

  async function salvarEdicao(id: string, dados: RotaOpticaInput) {
    await atualizarRota(id, dados);
    setModo({ tipo: "ver" });
    await recarregar(id);
  }

  async function excluir(r: RotaOptica) {
    if (!confirm(`Excluir a rota "${r.nome}"? Isso não pode ser desfeito.`)) return;
    try {
      await excluirRota(r.id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  const selecionada = rotas.find((r) => r.id === selId) ?? null;

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
            <button
              type="button"
              onClick={() => inputKml.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
            >
              <FileUp className="w-4 h-4" /> Importar KML do GeoGrid
            </button>
            <button
              type="button"
              onClick={() => setCadastro({ x: Math.max(8, (window.innerWidth - 800) / 2), y: 72 })}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 font-medium"
            >
              <Boxes className="w-4 h-4" /> Cadastros
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
          inicial={modo.rota}
          usuario={user?.nome ?? ""}
          catalogo={catalogo}
          cabos={cabos}
          nomesCabos={nomesCabos}
          centroPadrao={centroPadrao}
          onCaboSalvo={(c) => setCabos((cs) => [...cs.filter((x) => x.id !== c.id), c])}
          onCancelar={() => setModo({ tipo: "ver" })}
          onSalvar={(d) => (modo.rota ? salvarEdicao(modo.rota.id, d) : salvarNova(d))}
        />
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

      {modo.tipo === "importar" && (
        <PreviaImportacao
          rota={modo.rota}
          onCancelar={() => setModo({ tipo: "ver" })}
          onSalvar={salvarNova}
        />
      )}

      {modo.tipo === "ver" && (
        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {([
            ["rotas", "Rotas"],
            ["arvore", "Árvore por porta PON"],
          ] as const).map(([k, rotulo]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aba === k}
              onClick={() => setAba(k)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
                aba === k ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      {modo.tipo === "ver" && aba === "arvore" && (
        carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <ArvorePonView
            rotas={rotas}
            caixas={caixas}
            cabos={cabos}
            catalogo={catalogo}
            onCaboSalvo={(c) => setCabos((cs) => [...cs.filter((x) => x.id !== c.id), c])}
            usuario={user?.nome ?? ""}
            onCaixaSalva={(c) => setCaixas((cs) => [...cs.filter((x) => x.id !== c.id), c])}
            onAbrirRota={(id) => { setSelId(id); setBusca(""); setAba("rotas"); }}
          />
        )
      )}

      {modo.tipo === "ver" && aba === "rotas" && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
          {/* Lista de rotas */}
          <aside className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar rota, CTO, caixa, cabo…"
                className="w-full pl-8 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {carregando ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : filtradas.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">
                {rotas.length === 0 ? "Nenhuma rota cadastrada ainda." : "Nenhuma rota encontrada."}
              </p>
            ) : (
              <ul className="space-y-1 max-h-[60vh] overflow-auto">
                {filtradas.map((r) => {
                  const res = resumoRota(r.elementos);
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelId(r.id)}
                        className={`w-full text-left rounded-lg px-3 py-2 ${r.id === selId ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"}`}
                      >
                        <span className="block text-sm font-medium text-gray-900 leading-tight">{r.nome}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">
                          {r.elementos.length} elementos · {formatMetros(res.distancia_m)} ·{" "}
                          {r.origem === "geogrid" ? "GeoGrid" : "manual"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Rota selecionada */}
          {selecionada ? (
            <VisualizarRota
              key={selecionada.id}
              rota={selecionada}
              catalogo={catalogo}
              onEditar={() => setModo({ tipo: "editar", rota: selecionada })}
              onExcluir={() => excluir(selecionada)}
            />
          ) : (
            !carregando && (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500 text-sm">
                Importe o KML &quot;Rota da fibra&quot; exportado do GeoGrid ou cadastre uma rota manualmente.
              </div>
            )
          )}
        </div>
      )}
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
  onEditar,
  onExcluir,
}: {
  rota: RotaOptica;
  catalogo?: ItemCatalogo[];
  onEditar?: () => void;
  onExcluir?: () => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [janela, setJanela] = useState<{ x: number; y: number } | null>(null);
  const ultimoClique = useRef({ x: 300, y: 200 });
  const res = resumoRota(rota.elementos);

  function selecionar(i: number) {
    setSel(i);
    setJanela((j) => j ?? { x: ultimoClique.current.x + 30, y: ultimoClique.current.y - 80 });
  }
  const elSel = sel !== null ? rota.elementos[sel] : undefined;

  return (
    <section className="space-y-4 min-w-0" onPointerDownCapture={(e) => { ultimoClique.current = { x: e.clientX, y: e.clientY }; }}>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{rota.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {rota.origem === "geogrid" ? "Importada do GeoGrid" : "Cadastro manual"}
              {rota.criado_por ? ` · por ${rota.criado_por}` : ""}
              {rota.atualizado_em ? ` · atualizada em ${new Date(rota.atualizado_em).toLocaleDateString("pt-BR")}` : ""}
            </p>
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
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            ["Distância total", formatMetros(res.distancia_m)],
            ["Potência na OLT", formatDbm(res.potencia_inicial)],
            ["Potência no fim", formatDbm(res.potencia_final)],
            ["Perda total", res.perda_db !== undefined ? `${res.perda_db.toFixed(2).replace(".", ",")} dB` : "—"],
            ["Caixas de emenda", String(res.emendas)],
            ["Cabos percorridos", String(res.cabos.length)],
          ].map(([k, v]) => (
            <div key={k} className="bg-gray-50 rounded-lg px-3 py-2">
              <dt className="text-[11px] text-gray-500">{k}</dt>
              <dd className="text-base font-bold text-gray-900 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 items-start">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500 px-2 pb-2">
            A cor da linha é a cor real da fibra. Clique num elemento (aqui ou no mapa) para abrir a janela com os detalhes.
          </p>
          <RotaDiagrama elementos={rota.elementos} selecionado={sel} onSelect={selecionar} />
        </div>
        <div className="space-y-4 2xl:sticky 2xl:top-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <RotaMapa elementos={rota.elementos} trechos={rota.trechos} selecionado={sel} onSelect={selecionar} />
          </div>
          {res.cabos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">Cabos desta rota</p>
              <ul className="flex flex-wrap gap-1.5">
                {res.cabos.map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-full pl-1 pr-2.5 py-0.5">
                    <IconeCabo tamanho={16} /> {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

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
