"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowDown, ArrowUp, ChevronDown, Loader2, MapPin, Plus, Save, Trash2, X,
} from "lucide-react";
import {
  CALCULO_PADRAO,
  calcularPotencias,
  corFibra,
  capacidadeDoCabo,
  comprimentoTracado,
  distanciaMetros,
  type CalculoPotencia,
  corFibraPorCapacidade,
  fibrasPorTubo,
  formatMetros,
  TIPO_ELEMENTO_LABEL,
  type ElementoRota,
  type RotaOptica,
  type RotaOpticaInput,
  type TipoElementoRota,
  type TrechoCabo,
  reservaTrecho,
} from "@/lib/rotaOptica";
import type { PaiRota } from "@/lib/rotaOptica";
import { atualizarRota, criarRota } from "@/lib/rotaOptica";
import { donoDoElemento, entradaPotencia, paraGravar, portasDaCaixa, subRotasDe } from "@/lib/subRotas";
import EtiquetaCabo from "./EtiquetaCabo";
import PaletaFerramentas from "./editor/PaletaFerramentas";
import CartaoPredio from "./editor/CartaoPredio";
import BarraTopo from "./editor/BarraTopo";
import { comparavel, elementoDaLinha, garantirCodigosCabos } from "./editor/salvar";
import { chaveCabo, codigoDoCabo, comCodigo, normalizar, proximoCodigoCabo, salvarCabo, semCodigo, type CaboRede } from "@/lib/cabosRede";
import { aplicarNaRota, caboComCodigoNovo, rotasComCabo, rotasComCaixa, type MudancaGlobal } from "@/lib/compartilhados";
import { lerPortaOlt, numeracaoOlt, resumoItem, textoPortaOlt, type ItemCatalogo } from "@/lib/catalogoRede";
import type { Ferramenta, PontoEditor, PontoRede } from "./RotaEditorMapa";
import { chaveElemento, portaPonDaRota } from "@/lib/arvorePon";
import { CODIGO_PREDIO, idPredioDoElemento, listarPredios, novoId, salvarPredio, type PredioRede } from "@/lib/prediosRede";
import { IconeCabo, IconeElemento } from "./IconesRede";
import EstacaoOltDio, { type DadosEstacao } from "./EstacaoOltDio";
import { splitterDoCadastro, type CaixaRede } from "@/lib/caixasRede";

const RotaEditorMapa = dynamic(() => import("./RotaEditorMapa"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-slate-100 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  ),
});

import {
  type Ponto,
  type Linha,
  type VinculoPredio,
  s,
  pad2,
  fmtDbm,
  fmtCoord,
  paraLinha,
  linhaVazia,
  n,
  parseCoords,
  posDe,
  distMapa,
  recalcular,
  segmentoMaisPerto,
  verticesDoKml,
  tipoDaFerramenta,
  PALETA,
  PREFIXO,
  curtoNome,
  herdaCabo,
  nomeAuto,
  nivelCor,
} from "./editor/linhas";

interface Props {
  inicial?: RotaOptica | null;
  usuario: string;
  catalogo: ItemCatalogo[];
  cabos: CaboRede[];
  /** Nomes de cabos já usados nas rotas (sugestões) */
  nomesCabos: string[];
  centroPadrao?: [number, number];
  /** Outras rotas salvas: formam a rede mostrada ao fundo e podem ser usadas como ponto de partida */
  rede: RotaOptica[];
  onCaboSalvo: (c: CaboRede) => void;
  onCancelar: () => void;
  onSalvar: (dados: RotaOpticaInput) => Promise<void>;
  /** Grava a rota sem fechar o editor (salvar só um elemento) */
  onSalvarParcial?: (dados: RotaOpticaInput) => Promise<void>;
  /** Todas as rotas montadas (inclui esta): para achar a rota-mãe de uma sub-rota */
  todas?: RotaOptica[];
  /** Cadastro das caixas: o splitter que o Unifilar define trava o campo aqui */
  caixas?: CaixaRede[];
  /** Abre a caixa na aba Unifilar (fecha o editor) */
  onAbrirNoUnifilar?: (chave: string) => void;
}

export default function RotaEditor({ inicial, usuario, catalogo, cabos, nomesCabos, centroPadrao, rede, onCaboSalvo, onCancelar, onSalvar, onSalvarParcial, todas, caixas = [], onAbrirNoUnifilar }: Props) {
  // Todo traçado é editável: o do KML (rotas do GeoGrid) vira postes de cada trecho ao abrir
  const trechosFixos: TrechoCabo[] = [];
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial?.elementos.length
      ? inicial.elementos.map((e, i) =>
          paraLinha(
            e,
            inicial.trechos.some((t) => t.ate !== undefined)
              ? inicial.trechos.find((t) => t.ate === i)?.pontos.slice(1, -1) ?? []
              : verticesDoKml(inicial.elementos, i, inicial.trechos)
          )
        ).map((l) => {
          // splitter salvo só com a relação (ex.: "1:8"): liga ao modelo do cadastro com a mesma relação
          if (!l.splitter || catalogo.some((m) => m.categoria === "splitter" && m.id === l.splitter_modelo)) return l;
          const m = catalogo.find((x) => x.categoria === "splitter" && x.relacao === l.splitter);
          return m ? { ...l, splitter_modelo: m.id } : l;
        })
          .map((l, i) => ({ ...l, orig: i }))
      : []
  );
  const [sel, setSel] = useState<number | null>(null);
  /** Como a rota está gravada agora (muda quando salva só um elemento) */
  const [salvos, setSalvos] = useState<ElementoRota[]>(() => inicial?.elementos ?? []);
  const [trechosSalvos, setTrechosSalvos] = useState<TrechoCabo[]>(() => inicial?.trechos ?? []);
  const [salvandoItem, setSalvandoItem] = useState<number | null>(null);
  /** Sub-rota: de onde sai e quantos elementos (do começo) são o tronco da rota-mãe, travados aqui */
  const [pai, setPai] = useState<PaiRota | undefined>(inicial?.pai);
  const [tronco, setTronco] = useState<number>(inicial?.tronco ?? 0);
  // desfazer pode voltar a uma lista menor que o tronco: aí não há tronco
  const troncoEf = tronco && linhas.length >= tronco ? tronco : 0;
  const paiEf = troncoEf ? pai : inicial?.pai && !inicial.tronco ? inicial.pai : undefined;
  const nomeMae = paiEf ? (todas ?? rede).find((x) => x.id === paiEf.rota_id)?.nome ?? "rota-mãe" : "";
  const travada = (i: number) => i < troncoEf;
  /** Separar: ao salvar, a rota termina na caixa k e o que vem depois vira sub-rota dela */
  const [separar, setSeparar] = useState<{ k: number; nome: string } | null>(null);
  const sepEf = separar && inicial?.id && separar.k >= Math.max(troncoEf, 1) && separar.k < linhas.length - 1 ? separar : null;
  const nomeSubPadrao = () => `${nome.match(/^\d+\/\d+\/\d+/)?.[0] ?? ""} ${linhas[linhas.length - 1]?.nome ?? ""}`.trim();
  const [itemSalvo, setItemSalvo] = useState<number | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(inicial?.elementos.length ? "selecionar" : "estacao");
  const [pendentes, setPendentes] = useState<Ponto[]>([]);
  const [tiposCabo, setTiposCabo] = useState<Record<string, string>>(() =>
    Object.fromEntries(cabos.filter((c) => c.tipo_id).map((c) => [c.chave, c.tipo_id!]))
  );
  // Potência: automática por padrão; rotas do GeoGrid já vêm com a potência calculada lá
  const [calc, setCalc] = useState<CalculoPotencia>(
    () => inicial?.calculo_potencia ?? (inicial?.origem === "geogrid" ? { ...CALCULO_PADRAO, auto: false } : CALCULO_PADRAO)
  );
  const [verCalc, setVerCalc] = useState(false);
  const [verPendencias, setVerPendencias] = useState(false);
  /** Pede ao mapa para enquadrar um trecho (ex.: cabo curto que sai da estação) */
  const [focoTrecho, setFocoTrecho] = useState<{ i: number; vez: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** "Editar em todas as rotas": gravado nas outras rotas junto com esta (ao salvar) */
  const [globais, setGlobais] = useState<MudancaGlobal[]>([]);
  /** Janela "Editar em todas" aberta: de uma caixa ou do cabo que chega numa caixa */
  const [editarTodas, setEditarTodas] = useState<{ tipo: "caixa" | "cabo"; i: number; nome: string; tipoEl: TipoElementoRota; tipoCabo: string } | null>(null);
  /** Caixa compartilhada arrastada no mapa: espera confirmar "mover em todas" */
  const [moverTodas, setMoverTodas] = useState<{ i: number; lat: number; lon: number } | null>(null);
  /** Caixa de várias portas (HUB 0/2/15_0/6/2): de qual porta sai a sub-rota */
  const [escolhaPorta, setEscolhaPorta] = useState<{ nome: string; opcoes: ReturnType<typeof portasDaCaixa> } | null>(null);
  /** Confirmação do "Separar só nesta rota" ("caixa-3", "cabo-3") */
  const [confirmaSeparar, setConfirmaSeparar] = useState<string | null>(null);
  /** Nome da caixa antes de começar a editar (para renomear os cabos ao terminar) */
  const nomeAntes = useRef("");
  /** Cabo sendo renomeado (lápis no quadro do cabo) */
  const [renomear, setRenomear] = useState<{ i: number; antigo: string } | null>(null);
  /** Prédios cadastrados (a ferramenta Prédio leva o cabo até um deles ou cria um novo) */
  const [predios, setPredios] = useState<PredioRede[]>([]);
  /** Rota de uma CDOI montada pelo prédio: quem manda nela é a janela do prédio */
  const predioDono = inicial?.id ? predios.find((p) => p.pontos.some((o) => o.rota_id === inicial.id)) : undefined;
  useEffect(() => {
    let vivo = true;
    listarPredios().then((ps) => vivo && setPredios(ps)).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Linha[][]>([]);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Rede já cadastrada: uma caixa por chave (código PT ou nome) e os cabos de todas as rotas
  const redeInfo = useMemo(() => {
    const vistos = new Map<string, { el: ElementoRota; rota: RotaOptica; i: number }>();
    const cabosRede: { pts: [number, number][]; cor?: string }[] = [];
    for (const r of rede) {
      r.elementos.forEach((e, i) => {
        if (e.lat === undefined || e.lon === undefined) return;
        const k = chaveElemento(e);
        if (!vistos.has(k)) vistos.set(k, { el: e, rota: r, i });
      });
      if (r.trechos.length) {
        r.trechos.forEach((t) => cabosRede.push({ pts: t.pontos.map((p) => [p.lat, p.lon] as [number, number]), cor: t.cor }));
      } else {
        const pts = r.elementos.filter((e) => e.lat !== undefined && e.lon !== undefined).map((e) => [e.lat!, e.lon!] as [number, number]);
        if (pts.length > 1) cabosRede.push({ pts });
      }
    }
    return { itens: [...vistos.values()], cabos: cabosRede };
  }, [rede]);
  /** Porta PON de uma OLT (mesma regra da árvore): "olt2_dc|6|0" */
  const chavePon = (oltNome: string, porta: string) =>
    portaPonDaRota({ elementos: [{ nome: oltNome, tipo: "olt", porta }] } as unknown as RotaOptica).chave;
  const portaDoDio = (porta?: string) => { const m = porta?.match(/Porta\s*0*(\d+)/i); return m ? +m[1] : 0; };

  /**
   * Estações da rede (OLT + DIO no começo de uma rota principal) e as portas PON já usadas.
   * Sub-rotas ficam de fora: elas herdam a porta da rota-mãe.
   */
  const estacoesRede = useMemo(() => {
    type DioEst = { chave: string; dio: ElementoRota; rota: RotaOptica; portas: string[] };
    const m = new Map<string, { chave: string; olt: ElementoRota; rota: RotaOptica; portas: string[]; dios: Map<string, DioEst> }>();
    for (const r of rede) {
      if (r.pai) continue;
      const [o, d] = r.elementos;
      if (o?.tipo !== "olt" || o.lat === undefined) continue;
      const k = chaveElemento(o);
      const e = m.get(k) ?? { chave: k, olt: o, rota: r, portas: [], dios: new Map<string, DioEst>() };
      const pon = portaPonDaRota(r).rotulo.match(/PON\s+(\S+)/)?.[1];
      if (pon) e.portas.push(pon);
      if (d?.tipo === "dio") {
        const kd = chaveElemento(d);
        const x = e.dios.get(kd) ?? { chave: kd, dio: d, rota: r, portas: [] };
        if (pon) x.portas.push(pon);
        e.dios.set(kd, x);
      }
      m.set(k, e);
    }
    const ord = (l: string[]) => [...new Set(l)].sort((a0, b0) => a0.localeCompare(b0, "pt-BR", { numeric: true }));
    return [...m.values()].map((e) => ({
      ...e,
      portas: ord(e.portas),
      dios: [...e.dios.values()].map((x) => ({ ...x, portas: ord(x.portas) })).sort((a0, b0) => a0.dio.nome.localeCompare(b0.dio.nome, "pt-BR", { numeric: true })),
    }));
  }, [rede]);
  /** Rota principal que já usa cada porta PON / cada porta de DIO */
  const usoPortas = useMemo(() => {
    const pon = new Map<string, string>();
    const dio = new Map<string, string>();
    for (const r of rede) {
      if (r.pai) continue;
      const [o, d] = r.elementos;
      if (o?.tipo === "olt" && o.porta) pon.set(chavePon(o.nome, o.porta), r.nome);
      if (d?.tipo === "dio" && portaDoDio(d.porta)) dio.set(`${chaveElemento(d)}|${portaDoDio(d.porta)}`, r.nome);
    }
    return { pon, dio };
  }, [rede]);

  /** Próximo código numérico livre (considera a rede toda e esta rota). Séries de 6 dígitos a partir de 100001. */
  function proximoCodigo(ls: Linha[], extra = 0): string {
    const usados = [
      ...rede.flatMap((r) => r.elementos.map((e) => e.codigo ?? "")),
      ...ls.map((l) => l.codigo),
    ].filter((c) => /^\d+$/.test(c.trim())).map((c) => parseInt(c, 10));
    return String(Math.max(100000, ...usados) + 1 + extra);
  }

  const chaveLinha = (l: Linha) => chaveElemento({ nome: l.nome, codigo: l.codigo.trim() || undefined, tipo: l.tipo });
  const chavesNaRota = new Set(linhas.map(chaveLinha));
  // CDOIs de um mesmo prédio viram um marcador só (o prédio), na posição da primeira CDOI
  const predioDaChave = new Map<string, PredioRede>();
  predios.forEach((p) => {
    p.chaves.forEach((k) => predioDaChave.set(k, p));
    predioDaChave.set(chaveElemento({ nome: p.nome, tipo: "predio", codigo: `${CODIGO_PREDIO}${p.id}` }), p);
  });
  const pontosRede: PontoRede[] = [];
  /** Para cada marcador da rede: o item (caixa) que ele representa */
  const itemDoPonto: number[] = [];
  const prediosNoMapa = new Set<string>();
  redeInfo.itens.forEach(({ el }, k) => {
    const pr = predioDaChave.get(chaveElemento(el));
    if (pr) {
      if (prediosNoMapa.has(pr.id)) return;
      prediosNoMapa.add(pr.id);
      pontosRede.push({
        nome: `${pr.nome} · ${pr.pontos.length} CDOI${pr.pontos.length !== 1 ? "s" : ""}`,
        tipo: "predio",
        lat: el.lat!,
        lon: el.lon!,
        naRota: pr.chaves.some((c) => chavesNaRota.has(c)),
      });
      itemDoPonto.push(k);
      return;
    }
    pontosRede.push({ nome: el.nome, tipo: el.tipo, lat: el.lat!, lon: el.lon!, naRota: chavesNaRota.has(chaveElemento(el)) });
    itemDoPonto.push(k);
  });
  /** Clique num marcador da rede: no prédio com a ferramenta Prédio, o cabo chega nele */
  function clicarRede(k: number) {
    const p = pontosRede[k];
    if (p?.tipo === "predio" && ferramenta === "predio") return clicarMapa(p.lat, p.lon);
    usarDaRede(itemDoPonto[k], p?.tipo === "predio" ? p.nome.split(" · ")[0] : undefined);
  }

  const tiposDeCabo = catalogo.filter((c) => c.categoria === "cabo");
  /** Nomes das caixas da rede (para o nome automático não repetir) */
  const nomesRede = rede.flatMap((r) => r.elementos.map((e) => e.nome));
  const modelosSplitter = catalogo.filter((c) => c.categoria === "splitter");
  const olts = catalogo.filter((c) => c.categoria === "olt");
  const dios = catalogo.filter((c) => c.categoria === "dio");

  useEffect(() => {
    if (sel !== null) itemRefs.current[sel]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel]);

  // ---------- Alterações (com histórico para desfazer) ----------
  function mudar(fn: (ls: Linha[]) => Linha[]) {
    setHistorico((h) => [...h.slice(-49), linhas]);
    setLinhas((ls) => recalcular(fn(ls), calc));
  }
  function alterar(i: number, mudanca: Partial<Linha>) {
    mudar((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));
  }

  /**
   * Caixa renomeada: os nomes automáticos dos cabos acompanham ("… · CEO 1 → HUB 1" vira "… → HUB 0/3/10").
   * Roda quando o nome termina de ser editado (ao sair do campo), não a cada letra.
   */
  function renomearCabos(nomeVelho: string, nomeNovo: string) {
    const velho = curtoNome(nomeVelho);
    const novo = curtoNome(nomeNovo);
    if (!velho || !novo || velho === novo) return;
    const esc = velho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const troca = (c: string) => c.replace(`· ${velho} →`, `· ${novo} →`).replace(new RegExp(`→ ${esc}(?=( \\(mesmo poste\\))?( \\[CB-\\d{6}\\])?$)`), `→ ${novo}`).replace(new RegExp(`^Cordão ${esc} →`), `Cordão ${novo} →`);
    setTiposCabo((tc) => {
      const c = { ...tc };
      linhas.forEach((l) => {
        const nv = troca(l.cabo_entrada);
        if (nv !== l.cabo_entrada && tc[chaveCabo(l.cabo_entrada)]) c[chaveCabo(nv)] = tc[chaveCabo(l.cabo_entrada)];
      });
      return c;
    });
    mudar((ls) => ls.map((l) => {
      const nv = troca(l.cabo_entrada);
      return nv !== l.cabo_entrada ? { ...l, cabo_entrada: nv } : l;
    }));
  }
  function desfazer() {
    if (pendentes.length) return setPendentes((p) => p.slice(0, -1));
    const ant = historico[historico.length - 1];
    if (ant) {
      setHistorico((h) => h.slice(0, -1));
      setLinhas(ant);
      setSel((s0) => (s0 !== null && s0 < ant.length ? s0 : null));
    }
  }

  // Atalhos: Esc = Selecionar; Ctrl+Z = desfazer (fora dos campos)
  const desfazerRef = useRef(desfazer);
  useEffect(() => { desfazerRef.current = desfazer; });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const campoAtivo = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if (e.key === "Escape") { setFerramenta("selecionar"); setAviso(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !campoAtivo) { e.preventDefault(); desfazerRef.current(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  function mover(i: number, d: -1 | 1) {
    if (travada(i) || travada(i + d)) return setAviso("O tronco é da rota-mãe: mexa nele lá.");
    mudar((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      // Os postes pertencem ao trecho, que mudou: descarta os dos trechos afetados
      [i, j, Math.max(i, j) + 1].forEach((k) => { if (c[k]) c[k] = { ...c[k], vertices: [] }; });
      return c;
    });
    setSel((s0) => (s0 === i ? i + d : s0));
  }

  function remover(i: number) {
    if (travada(i)) return setAviso("O tronco é da rota-mãe: mexa nele lá.");
    mudar((ls) => {
      const c = [...ls];
      const tirado = c[i];
      const prox = c[i + 1];
      // O cabo passa direto: postes do trecho removido + local da caixa removida viram postes do próximo trecho
      if (prox) {
        const p = posDe(tirado);
        c[i + 1] = { ...prox, vertices: i === 0 ? [] : [...tirado.vertices, ...(p ? [p] : []), ...prox.vertices], dist_auto: true };
      }
      c.splice(i, 1);
      return c;
    });
    setSel(null);
  }

  // ---------- Mapa ----------
  /** Posição de cada CDOI da rede (para achar o prédio perto do clique) */
  function posCdoiRede(chaveCdoi: string): Ponto | null {
    for (const r of rede) for (const e of r.elementos) if (e.lat !== undefined && e.lon !== undefined && chaveElemento(e) === chaveCdoi) return { lat: e.lat, lon: e.lon };
    return null;
  }
  /** Prédios perto de um ponto (até 200 m), do mais perto ao mais longe */
  function prediosPerto(p: Ponto) {
    return predios
      .map((pr) => {
        const chavesPr = [...pr.chaves, chaveElemento({ nome: pr.nome, tipo: "predio", codigo: `${CODIGO_PREDIO}${pr.id}` })];
        const ds = chavesPr.map(posCdoiRede).filter((x): x is Ponto => !!x).map((x) => distanciaMetros(p, x));
        return { pr, d: ds.length ? Math.min(...ds) : Infinity };
      })
      .filter((x) => x.d <= 200)
      .sort((a, b) => a.d - b.d);
  }
  function vinculoPerto(p: Ponto): VinculoPredio {
    const perto = prediosPerto(p)[0];
    if (perto && perto.d <= 60) return { id: perto.pr.id, nome: perto.pr.nome, bloco: perto.pr.blocos[0]?.id ?? "", andar: 0 };
    return { id: "", nome: "", bloco: "Bloco A", andar: 0 };
  }

  /** HUB logo antes desta CTO no mesmo poste (para o transporte voltar por ela) */
  function hubAntes(i: number): number | null {
    for (let j = i - 1; j >= 0; j--) {
      if (linhas[j].tipo === "hub") return linhas[i].mesmoPoste || j === i - 1 ? j : null;
      if (!linhas[j + 1]?.mesmoPoste) return null;
    }
    return null;
  }

  /** Link curto entre caixas no mesmo poste: menor cabo do cadastro com mais de uma fibra (leva o link e a volta) */
  function tipoLinkPoste() {
    return [...tiposDeCabo].filter((t) => (t.capacidade ?? 0) >= 2).sort((a, b) => (a.capacidade ?? 0) - (b.capacidade ?? 0))[0];
  }

  /** ＋ CTO no mesmo poste: entra logo depois da HUB, no mesmo ponto, ligada por cabo curto (3 m, sem reserva) */
  function ctoNoMesmoPoste(i: number) {
    const hub = linhas[i];
    const p = posDe(hub);
    const nomeCto = nomeAuto("cto", linhas, nomesRede);
    const t = tipoLinkPoste();
    const nomeCabo = `${t ? t.nome : "Cabo"} · ${curtoNome(hub.nome)} → ${nomeCto} (mesmo poste)`;
    if (t) setTiposCabo((tc) => ({ ...tc, [chaveCabo(nomeCabo)]: t.id }));
    const nova: Linha = {
      ...linhaVazia("cto"),
      nome: nomeCto,
      codigo: proximoCodigo(linhas),
      coords: p ? fmtCoord({ lat: p.lat + 0.00001, lon: p.lon + 0.00001 }) : "",
      vertices: [],
      dist_auto: false,
      distancia_m: "3",
      mesmoPoste: true,
      cabo_entrada: nomeCabo,
      fibra_entrada: "1",
    };
    mudar((ls) => {
      const c = [...ls];
      c.splice(i + 1, 0, nova);
      return c;
    });
    setSel(i + 1);
    setAviso(`${nomeCto} criada no mesmo poste da ${curtoNome(hub.nome)}, ligada por ${nomeCabo.split(" · ")[0]} (3 m, sem reserva). Escolha o splitter dela.`);
  }

  /** ↩ Voltar para a HUB: a fibra de uma porta da CTO volta pelo mesmo cabo, em outra fibra, e atravessa a HUB */
  function voltarParaHub(i: number) {
    const h = hubAntes(i);
    if (h === null) return;
    const hub = linhas[h];
    const cto = linhas[i];
    const cabo = cto.cabo_entrada;
    const usadas = new Set(linhas.filter((l) => l.cabo_entrada && chaveCabo(l.cabo_entrada) === chaveCabo(cabo)).map((l) => n(l.fibra_entrada)));
    let f = 2;
    while (usadas.has(f)) f++;
    const volta: Linha = {
      ...hub,
      vertices: [],
      dist_auto: false,
      distancia_m: cto.distancia_m || "3",
      mesmoPoste: true,
      passagem: true,
      splitter: "",
      splitter_modelo: "",
      cabo_entrada: cabo,
      fibra_entrada: String(f),
      potencia_entrada: "",
      potencia_saida: "",
    };
    mudar((ls) => {
      const c = [...ls];
      c.splice(i + 1, 0, volta);
      return c;
    });
    setSel(i + 1);
    setAviso(`Transporte: a fibra F${f} volta da ${curtoNome(cto.nome)} para a ${curtoNome(hub.nome)} (passagem). Agora coloque as próximas caixas (ex.: a CT).`);
  }

  /** Vínculo do elemento Prédio: o escolhido aqui ou o já gravado (código PREDIO-<id>) */
  function vinculoDe(l: Linha): VinculoPredio | undefined {
    if (l.predio) return l.predio;
    const id = idPredioDoElemento({ tipo: l.tipo, codigo: l.codigo });
    return id ? { id, nome: predios.find((x) => x.id === id)?.nome ?? l.nome, bloco: "", andar: 0 } : undefined;
  }

  /** Cartão do elemento Prédio: só qual prédio (o cabo chega nele; CDOIs, fibras e splitters ficam na janela do prédio) */
  function campoPredio(i: number) {
    const l = linhas[i];
    const pos = posDe(l);
    return (
      <CartaoPredio
        vinculo={vinculoDe(l) ?? { id: "", nome: "", bloco: "", andar: 0 }}
        opcoes={pos ? prediosPerto(pos) : predios.map((pr) => ({ pr, d: Infinity }))}
        predios={predios}
        onMudar={(nv, renomearJa) => {
          const novoNome = nv.nome.trim() || "Prédio";
          alterar(i, { predio: nv, nome: novoNome });
          if (renomearJa && novoNome !== l.nome) renomearCabos(l.nome, novoNome);
        }}
        onNomeFoco={() => { nomeAntes.current = l.nome; }}
        onNomeSair={() => renomearCabos(nomeAntes.current, l.nome)}
      />
    );
  }

  /** Prédios dos elementos Prédio: cria os novos (para ter o id) e devolve o vínculo de cada linha */
  async function prepararPredios(ls: Linha[]): Promise<Linha[]> {
    const novos = new Map<string, string>();
    const out: Linha[] = [];
    for (const l of ls) {
      if (l.tipo !== "predio") { out.push(l); continue; }
      const v = vinculoDe(l);
      let id = v?.id ?? "";
      let nomeP = v?.nome.trim() || l.nome.trim();
      if (!id) {
        const k = nomeP.toUpperCase();
        id = novos.get(k) ?? "";
        if (!id) {
          const pr = await salvarPredio(
            { id: "", nome: nomeP, blocos: [{ id: novoId(), nome: "Bloco A", andares: 10, subsolos: 0, aptos: 4 }], pontos: [], chaves: [] },
            usuario
          );
          id = pr.id;
          novos.set(k, id);
        }
      } else {
        nomeP = predios.find((x) => x.id === id)?.nome ?? nomeP;
      }
      out.push({ ...l, nome: nomeP, codigo: `${CODIGO_PREDIO}${id}`, splitter: "", splitter_modelo: "", fibra_entrada: "", passagem: false });
    }
    return out;
  }

  function clicarMapa(lat: number, lon: number) {
    setAviso(null);
    const p = { lat, lon };
    if (ferramenta === "poste") {
      if (!linhas.some((l) => posDe(l))) return setAviso("Coloque primeiro a OLT (ou o ponto de partida) no mapa.");
      setPendentes((ps) => [...ps, p]);
      return;
    }
    if (ferramenta === "selecionar") {
      if (sel !== null && !posDe(linhas[sel])) alterar(sel, { coords: fmtCoord(p) });
      return;
    }
    if ((ferramenta === "estacao" || ferramenta === "olt") && !olts.length) {
      return setAviso("Cadastre a OLT primeiro (Cadastros → OLTs). Só equipamentos cadastrados são aceitos.");
    }
    if (ferramenta === "estacao") {
      if (linhas.length) return setAviso("A estação é o começo da rota. Para mudar a OLT ou o DIO, use o cartão Estação ao lado.");
      montarEstacao(p);
      return;
    }
    const tipo: TipoElementoRota = ferramenta;
    // Ferramenta Prédio: o cabo chega no prédio mais perto (até 60 m) ou num prédio novo
    const vp = ferramenta === "predio" ? vinculoPerto(p) : null;
    const extraPredio: Partial<Linha> = vp ? { predio: vp, nome: vp.nome || "Prédio", codigo: "", fibra_entrada: "" } : {};
    // Com um elemento do meio selecionado, o novo entra logo depois dele
    if (sel !== null && sel < linhas.length - 1 && tipo !== "olt") {
      const prox = linhas[sel + 1];
      const ref = linhas[sel];
      const nomeNovo = nomeAuto(tipo, linhas, nomesRede);
      const extra = tipo === "dio" && ref.tipo === "olt" ? dioDepoisDaOlt(ref, nomeNovo, prox) : {};
      mudar((ls) => {
        const c = [...ls];
        c.splice(sel + 1, 0, {
          ...linhaVazia(tipo),
          nome: nomeNovo,
          codigo: proximoCodigo(ls),
          coords: fmtCoord(p),
          vertices: pendentes,
          dist_auto: true,
          cabo_entrada: prox.cabo_entrada,
          fibra_entrada: prox.fibra_entrada,
          ...extra,
          ...extraPredio,
        });
        return c;
      });
      setPendentes([]);
      setSel(sel + 1);
      return;
    }
    // Colocar um elemento: entra no fim, ligado ao anterior pelo mesmo cabo/fibra, com os postes marcados
    const novoIndice = linhas.length;
    const ultimo = linhas[linhas.length - 1];
    const extraDio = tipo === "dio" && ultimo?.tipo === "olt" ? dioDepoisDaOlt(ultimo, nomeAuto("dio", linhas, nomesRede)) : {};
    const olt = tipo === "olt" && olts.length === 1 ? olts[0] : undefined;
    mudar((ls) => {
      const ant = ls[ls.length - 1];
      const nova: Linha = {
        ...linhaVazia(tipo),
        nome: olt?.nome ?? nomeAuto(tipo, ls, nomesRede),
        // OLT é a raiz e é reconhecida pelo nome; os demais ganham código único
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        coords: fmtCoord(p),
        vertices: ls.length ? pendentes : [],
        dist_auto: true,
        // Depois do DIO sai o cabo da estação: a fibra é a porta do DIO
        cabo_entrada: herdaCabo(ant) ? ant.cabo_entrada : "",
        fibra_entrada: ant?.tipo === "dio" ? ant.porta.match(/Porta\s*0*(\d+)/i)?.[1] ?? "" : herdaCabo(ant) ? ant.fibra_entrada : "",
        equipamento_id: olt?.id ?? "",
        potencia_saida: olt?.potencia_tx !== undefined ? s(olt.potencia_tx) : "",
        ...extraDio,
        ...extraPredio,
      };
      return [...ls, nova];
    });
    setPendentes([]);
    setSel(novoIndice);
    // Depois da OLT, o normal é seguir com caixas de emenda
    // Depois da OLT normalmente vem o DIO; depois do DIO, a caixa de emenda
    if (tipo === "olt") setFerramenta("dio");
    else if (tipo === "dio") setFerramenta("ceo");
  }

  /**
   * DIO colocado logo depois da OLT: chega por um cordão (3 m, fibra 1); a porta do DIO é a fibra do cabo
   * que já sai para fora (porta N = fibra N) e o DIO sugerido é o do mesmo tamanho desse cabo.
   */
  function dioDepoisDaOlt(olt: Linha, nomeDio: string, saida?: Linha): Partial<Linha> {
    const cordao = tiposDeCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
    const fibra = saida ? n(saida.fibra_entrada) : undefined;
    const cap = saida ? tipoDoCabo(saida.cabo_entrada)?.capacidade : undefined;
    const dio =
      (cap ? dios.find((d) => d.portas === cap) : undefined) ??
      [...dios].filter((d) => (d.portas ?? 0) >= (fibra ?? 1)).sort((a, b) => (a.portas ?? 0) - (b.portas ?? 0))[0] ??
      (dios.length === 1 ? dios[0] : undefined);
    const nomeCordao = `Cordão ${olt.nome.split(" / ")[0]} → ${dio?.nome ?? nomeDio}`;
    if (cordao) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: cordao.id }));
    return {
      nome: dio?.nome ?? nomeDio,
      cabo_entrada: nomeCordao,
      fibra_entrada: "1",
      distancia_m: "3",
      dist_auto: false,
      vertices: [],
      equipamento_id: dio?.id ?? "",
      porta: fibra ? `Porta ${pad2(fibra)}` : "",
    };
  }

  /** Cria OLT + DIO no mesmo local, ligados por um cordão */
  function montarEstacao(p: Ponto) {
    const olt = olts.length === 1 ? olts[0] : undefined;
    const dio = dios.length === 1 ? dios[0] : undefined;
    const cordao = tiposDeCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
    const nomeOlt = olt?.nome ?? "OLT";
    const nomeDio = "DIO 01";
    const nomeCordao = `Cordão ${nomeOlt} → ${nomeDio}`;
    if (cordao) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: cordao.id }));
    mudar(() => [
      {
        ...linhaVazia("olt"),
        nome: nomeOlt,
        coords: fmtCoord(p),
        equipamento_id: olt?.id ?? "",
        potencia_saida: olt?.potencia_tx !== undefined ? s(olt.potencia_tx) : "",
      },
      {
        ...linhaVazia("dio"),
        nome: nomeDio,
        codigo: proximoCodigo([]),
        coords: fmtCoord(p),
        equipamento_id: dio?.id ?? "",
        cabo_entrada: nomeCordao,
        fibra_entrada: "1",
        distancia_m: "3",
        dist_auto: false,
      },
    ]);
    setSel(null);
    setFerramenta("ceo");
    setAviso("Estação criada! Escolha a porta PON e a porta do DIO no cartão ao lado e clique onde fica a primeira caixa fora da estação.");
  }

  /** Mudanças vindas do cartão Estação (elementos 1 = OLT, 2 = DIO e 3 = primeira caixa fora) */
  function aplicarEstacao(p0: Partial<DadosEstacao>) {
    // OLT e DIO usados por outras rotas: nome e equipamento só mudam "em todas" (o resto segue livre)
    const p = { ...p0 };
    const travouOlt = outrasComCaixa(0).length > 0 && (p.oltNome !== undefined || p.oltEquip !== undefined);
    const travouDio = outrasComCaixa(1).length > 0 && (p.dioNome !== undefined || p.dioEquip !== undefined);
    if (travouOlt) { delete p.oltNome; delete p.oltEquip; }
    if (travouDio) { delete p.dioNome; delete p.dioEquip; }
    if (travouOlt || travouDio) setAviso(`${travouOlt ? "A OLT" : "O DIO"} desta estação é compartilhad${travouOlt ? "a" : "o"} com outras rotas: use "Editar em todas" abaixo do cartão.`);
    if (!Object.keys(p).length) return;
    // Tipo do cabo de saída: mesma regra do painel do elemento (cabo compartilhado com outro trecho vira cabo novo)
    const tSaida = p.saidaTipo ? tiposDeCabo.find((t) => t.id === p.saidaTipo) : undefined;
    if (tSaida && linhas[2] && Object.keys(p).length === 1) return usarTipoCabo(2, tSaida);
    const l1 = linhas[1];
    const l2 = linhas[2];
    const nomeCordao = l1?.cabo_entrada.trim() || `Cordão ${p.oltNome ?? linhas[0]?.nome ?? "OLT"} → ${p.dioNome ?? l1?.nome ?? "DIO"}`;
    const nomeSaida = p.saidaCabo ?? (l2?.cabo_entrada.trim() || `Saída ${p.dioNome ?? l1?.nome ?? "DIO"}`);
    if (p.cordaoTipo !== undefined) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: p.cordaoTipo! }));
    if (p.saidaTipo !== undefined && l2) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeSaida)]: p.saidaTipo! }));
    // OLT ou DIO trocados: o nome automático do cordão e do cabo de saída acompanha
    const renomearDepois: [string, string][] = [];
    if (p.oltNome !== undefined && linhas[0] && p.oltNome !== linhas[0].nome) renomearDepois.push([linhas[0].nome, p.oltNome]);
    if (p.dioNome !== undefined && l1 && p.dioNome !== l1.nome) renomearDepois.push([l1.nome, p.dioNome]);
    mudar((ls) => {
      const c = ls.map((x) => ({ ...x }));
      if (!c[0] || !c[1]) return ls;
      if (p.oltNome !== undefined) c[0].nome = p.oltNome;
      if (p.oltEquip !== undefined) c[0].equipamento_id = p.oltEquip;
      if (p.oltPorta !== undefined) c[0].porta = p.oltPorta;
      if (p.oltPot !== undefined) c[0].potencia_saida = p.oltPot;
      if (p.dioNome !== undefined) c[1].nome = p.dioNome;
      if (p.dioEquip !== undefined) c[1].equipamento_id = p.dioEquip;
      if (p.dioPorta !== undefined) c[1].porta = p.dioPorta;
      if (p.cordaoMetros !== undefined) { c[1].distancia_m = p.cordaoMetros; c[1].dist_auto = false; }
      if (p.cordaoTipo !== undefined) { c[1].cabo_entrada = nomeCordao; c[1].fibra_entrada = "1"; }
      if (c[2]) {
        if (p.saidaCabo !== undefined) c[2].cabo_entrada = p.saidaCabo;
        if (p.saidaTipo !== undefined) c[2].cabo_entrada = nomeSaida;
        if (p.saidaFibra !== undefined) c[2].fibra_entrada = p.saidaFibra;
      }
      return c;
    });
    renomearDepois.forEach(([a0, b0]) => renomearCabos(a0, b0));
    // Rota nova: o nome segue a porta escolhida ("0/6/2 OLT2_DC"), como as outras da rede
    const lp = p.oltPorta !== undefined ? lerPortaOlt(p.oltPorta) : null;
    if (lp && !inicial?.id && (!nome.trim() || /^\d+\/\d+\/\d+(\s|$)/.test(nome.trim()))) {
      setNome(`0/${lp.placa}/${lp.porta} ${p.oltNome ?? linhas[0]?.nome ?? ""}`.trim());
    }
  }

  /**
   * Outra porta PON numa estação que já existe: rota NOVA (não sub-rota) com a mesma OLT e o
   * mesmo DIO (mesmo código), portas em branco para escolher no cartão Estação.
   */
  function montarNaEstacao(est: (typeof estacoesRede)[number], dioEscolhido: (typeof estacoesRede)[number]["dios"][number] | null) {
    const copia = (e: ElementoRota): Linha => ({ ...paraLinha(e), porta: "", dist_auto: false, cabo_saida: "", fibra_saida: "", potencia_entrada: "" });
    const olt: Linha = { ...copia(est.olt), potencia_saida: s(est.olt.potencia_saida) };
    let dio: Linha;
    let rotaBase: RotaOptica = est.rota;
    if (dioEscolhido) {
      dio = { ...copia(dioEscolhido.dio), potencia_saida: "" };
      rotaBase = dioEscolhido.rota;
    } else {
      // DIO novo na mesma estação: nome próprio ("DIO 02"), código novo, mesmo local; o modelo se escolhe no cartão
      const usados = new Set(est.dios.map((x) => x.dio.nome.trim().toUpperCase()));
      let k = est.dios.length + 1;
      while (usados.has(`DIO ${pad2(k)}`)) k++;
      const nomeDio = `DIO ${pad2(k)}`;
      const nomeCordao = `Cordão ${curtoNome(est.olt.nome)} → ${nomeDio}`;
      const cordao = tiposDeCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
      if (cordao) setTiposCabo((t) => ({ ...t, [chaveCabo(nomeCordao)]: cordao.id }));
      dio = {
        ...linhaVazia("dio"),
        nome: nomeDio,
        codigo: proximoCodigo([]),
        coords: olt.coords,
        equipamento_id: dios.length === 1 ? dios[0].id : "",
        cabo_entrada: nomeCordao,
        fibra_entrada: "1",
        distancia_m: "3",
        dist_auto: false,
      };
    }
    mudar(() => [olt, dio]);
    if (rotaBase.calculo_potencia) setCalc(rotaBase.calculo_potencia);
    setPai(undefined);
    setTronco(0);
    setSel(null); // nada selecionado: a próxima caixa entra no fim (depois do DIO)
    setFerramenta("ceo");
    setAviso(dioEscolhido
      ? `Estação ${est.olt.nome} com o ${dioEscolhido.dio.nome}. Escolha a porta PON e a porta do DIO no cartão (as amarelas já estão em uso) e clique na primeira caixa fora da estação.`
      : `Estação ${est.olt.nome} com um DIO novo (${dio.nome}). Dê o nome do DIO, escolha o modelo, a porta PON e a porta do DIO no cartão.`);
  }

  /** Rota vazia: copia o caminho da rota r da OLT até a caixa i e vira sub-rota da dona dela (tronco travado) */
  function comecarSubRota(r: RotaOptica, i: number) {
    const manual = r.origem !== "geogrid";
    const novas = r.elementos.slice(0, i + 1).map((x, j) => ({
      ...paraLinha(x, manual ? r.trechos.find((t) => t.ate === j)?.pontos.slice(1, -1) ?? [] : []),
      dist_auto: false,
    }));
    mudar(() => novas);
    if (r.calculo_potencia) setCalc(r.calculo_potencia);
    const dona = donoDoElemento(r, i, todas ?? rede);
    setPai({ rota_id: dona.id, chave: chaveElemento(r.elementos[i]) });
    setTronco(i + 1);
    setSel(i);
    setFerramenta("ceo");
    setEscolhaPorta(null);
    setAviso(`Sub-rota de "${dona.nome}" (${portaPonDaRota(dona).rotulo}), saindo de ${r.elementos[i].nome}. O tronco fica travado; coloque as próximas caixas.`);
  }

  /** Clique numa caixa da rede existente */
  function usarDaRede(k: number, predioNome?: string) {
    const it = redeInfo.itens[k];
    if (!it) return;
    // Rota vazia e clique num prédio: o prédio se monta na janela dele; um cabo novo começa pela caixa de origem
    if (predioNome && !linhas.length) {
      setAviso(`Para mexer no ${predioNome}, abra-o na Árvore. Para levar outro cabo até ele, comece pela caixa de onde o cabo sai (ex.: a HUB) e use a ferramenta Prédio.`);
      return;
    }
    const e = it.el;
    const ja = linhas.findIndex((l) => chaveLinha(l) === chaveElemento(e));
    if (ja >= 0) { setSel(ja); return; }
    if (ferramenta === "poste") { clicarMapa(e.lat!, e.lon!); return; }
    if (!linhas.length && (e.tipo === "olt" || e.tipo === "dio")) {
      // OLT ou DIO: outra porta da estação (sub-rota daqui travaria a porta da rota-mãe)
      const k = chaveElemento(e);
      const est = estacoesRede.find((x) => x.chave === k || x.dios.some((d) => d.chave === k));
      if (est) {
        const d = est.dios.find((x) => x.chave === k) ?? (est.dios.length === 1 ? est.dios[0] : null);
        if (d || e.tipo === "dio") { montarNaEstacao(est, d); return; }
        setAviso(`A ${est.olt.nome} tem ${est.dios.length} DIOs: escolha no painel ao lado em qual DIO a nova porta entra (ou DIO novo).`);
        return;
      }
    }
    if (!linhas.length) {
      // Rota vazia: vira um ramo (sub-rota). Numa caixa com splitters de várias portas, pergunta de qual porta sai.
      const opcoes = portasDaCaixa(todas ?? rede, chaveElemento(e));
      if (opcoes.length > 1) { setEscolhaPorta({ nome: e.nome, opcoes }); return; }
      const o = opcoes[0];
      comecarSubRota(o ? o.rota : it.rota, o ? o.i : it.i);
      return;
    }
    // Rota em andamento: usa a caixa existente (mesmo nome/código/local/splitter), ligada pelo mesmo cabo do trecho anterior
    const ant = linhas[linhas.length - 1];
    const base: ElementoRota = { ...e, cabo_entrada: undefined, fibra_entrada: undefined, cabo_saida: undefined, fibra_saida: undefined, distancia_m: undefined, potencia_entrada: undefined, potencia_saida: undefined };
    const novoIndice = linhas.length;
    // Essas duas caixas já são ligadas por um cabo noutra rota: segue nele (e pelo mesmo traçado)
    const dioAnt = ant?.tipo === "dio" ? portaDoDio(ant.porta) : 0;
    // O cabo que já liga as duas caixas manda (ex.: da CEO sai um 4FO até a HUB, outro cabo do que chega na CEO)
    const viaCabo = caboEntre(chaveLinha(ant), chaveElemento(e));
    const herda = herdaCabo(ant) && (!viaCabo || chaveCabo(viaCabo.cabo) === chaveCabo(ant.cabo_entrada));
    const caboNovo = herda ? ant.cabo_entrada : viaCabo?.cabo ?? "";
    // depois do DIO, a fibra do cabo é a porta do DIO; num cabo que já existe, a próxima fibra livre dele
    const fibraNova = herda ? ant.fibra_entrada : dioAnt ? String(dioAnt) : viaCabo ? String(fibraLivre(viaCabo.cabo) ?? "") : "";
    mudar((ls) => [...ls, {
      ...paraLinha(base),
      vertices: pendentes.length ? pendentes : viaCabo?.vertices ?? [],
      mesmoPoste: !pendentes.length && !!viaCabo?.mesmoPoste,
      dist_auto: true,
      cabo_entrada: caboNovo,
      fibra_entrada: fibraNova,
    }]);
    setPendentes([]);
    setSel(novoIndice);
    if (viaCabo && !herda) setAviso(`${e.nome}: seguindo pelo cabo que já liga as duas caixas (${curtoNome(viaCabo.cabo)}). Confira a fibra no painel.`);
  }

  // ---------- Caixas e cabos compartilhados (uma informação, um dono) ----------
  /** Outras rotas que também têm esta caixa como dela */
  const outrasComCaixa = (i: number) => (travada(i) || !linhas[i] ? [] : rotasComCaixa(chaveLinha(linhas[i]), rede));
  /** Outras rotas por onde passa o cabo que chega nesta caixa */
  const outrasComCabo = (i: number) => (i < 1 || travada(i) || !linhas[i]?.cabo_entrada.trim() ? [] : rotasComCabo(linhas[i].cabo_entrada, rede));
  const listaRotas = (rs: RotaOptica[]) => {
    const nomes = [...new Set(rs.map((r) => r.nome))];
    return `${nomes.slice(0, 3).join(", ")}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ""}`;
  };

  /** Grava nas outras rotas o que foi mudado com "Editar em todas" */
  async function gravarGlobais() {
    if (!globais.length) return;
    for (const r of rede) {
      const novo = aplicarNaRota(r, globais);
      if (!novo) continue;
      await atualizarRota(r.id, paraGravar({ pai: r.pai, tronco: r.tronco }, {
        nome: r.nome, origem: r.origem, elementos: novo.elementos, trechos: novo.trechos,
        calculo_potencia: r.calculo_potencia, obs: r.obs, criado_por: r.criado_por,
      }));
    }
    setGlobais([]);
  }

  function abrirEditarTodas(tipo: "caixa" | "cabo", i: number) {
    const l = linhas[i];
    if (tipo === "cabo" && !codigoDoCabo(l.cabo_entrada)) {
      return setAviso("Este cabo ainda não tem código: salve a rota uma vez e depois edite em todas.");
    }
    setEditarTodas({ tipo, i, nome: tipo === "caixa" ? l.nome : semCodigo(l.cabo_entrada), tipoEl: l.tipo, tipoCabo: tiposCabo[chaveCabo(l.cabo_entrada)] ?? "" });
  }

  function aplicarEditarTodas() {
    if (!editarTodas) return;
    const { tipo, i } = editarTodas;
    const l = linhas[i];
    const novoNome = editarTodas.nome.trim();
    if (!novoNome) return;
    if (tipo === "caixa") {
      const chave = chaveLinha(l);
      const tipoEl = editarTodas.tipoEl !== l.tipo ? editarTodas.tipoEl : undefined;
      mudar((ls) => ls.map((x) => (chaveLinha(x) === chave ? { ...x, nome: novoNome, ...(tipoEl ? { tipo: tipoEl } : {}) } : x)));
      if (novoNome !== l.nome) renomearCabos(l.nome, novoNome);
      setGlobais((g) => [...g, { tipo: "caixa", chave, nomeVelho: l.nome, ...(novoNome !== l.nome ? { nome: novoNome } : {}), ...(tipoEl ? { tipoEl } : {}) }]);
    } else {
      const cod = codigoDoCabo(l.cabo_entrada)!;
      const v = comCodigo(novoNome, cod);
      mudar((ls) => ls.map((x) => (codigoDoCabo(x.cabo_entrada) === cod ? { ...x, cabo_entrada: v } : x)));
      // o tipo é do cabo (cadastro de cabos, pelo código): vale para todas as rotas ao salvar
      if (editarTodas.tipoCabo) setTiposCabo((t) => ({ ...t, [cod]: editarTodas.tipoCabo }));
      setGlobais((g) => [...g, { tipo: "cabo", codigo: cod, nome: novoNome }]);
    }
    setEditarTodas(null);
    setAviso("Mudança feita aqui; as outras rotas recebem quando você salvar esta.");
  }

  /** Separar só nesta rota: a caixa ganha código novo e deixa de ser a mesma das outras rotas */
  function separarCaixa(i: number) {
    const cod = proximoCodigo(linhas);
    alterar(i, { codigo: cod });
    setConfirmaSeparar(null);
    setAviso(`${linhas[i].nome}: agora é uma caixa só desta rota (código ${cod}). Pode mudar nome, tipo e local à vontade.`);
  }

  /** Separar só nesta rota: o cabo ganha código novo (nesta rota inteira) e fica com o tipo atual */
  function separarCabo(i: number) {
    const l = linhas[i];
    const codAntigo = codigoDoCabo(l.cabo_entrada);
    const todosNomes = [...rede.flatMap((r) => r.elementos.map((e) => e.cabo_entrada ?? "")), ...linhas.map((x) => x.cabo_entrada)];
    const codNovo = proximoCodigoCabo(todosNomes);
    const nomeNovo = caboComCodigoNovo(l.cabo_entrada, codNovo);
    const tipoAtual = tiposCabo[chaveCabo(l.cabo_entrada)];
    if (tipoAtual) setTiposCabo((t) => ({ ...t, [codNovo]: tipoAtual }));
    mudar((ls) => ls.map((x, j) => ((codAntigo ? codigoDoCabo(x.cabo_entrada) === codAntigo : j === i) ? { ...x, cabo_entrada: nomeNovo } : x)));
    setConfirmaSeparar(null);
    setAviso(`Cabo separado: nesta rota ele agora é o ${codNovo}. Pode trocar nome e tipo sem mexer nas outras rotas.`);
  }

  /** Menor fibra deste cabo que nenhuma rota (nem esta) usa, dentro da capacidade dele */
  function fibraLivre(cabo: string): number | undefined {
    const k = chaveCabo(cabo);
    const usadas = new Set<number>();
    for (const r of rede) r.elementos.forEach((x) => { if (x.cabo_entrada && x.fibra_entrada && chaveCabo(x.cabo_entrada) === k) usadas.add(x.fibra_entrada); });
    linhas.forEach((x) => { const f = n(x.fibra_entrada); if (x.cabo_entrada.trim() && f && chaveCabo(x.cabo_entrada) === k) usadas.add(f); });
    const cap = tipoDoCabo(cabo)?.capacidade ?? Math.max(12, ...usadas);
    for (let f = 1; f <= cap; f++) if (!usadas.has(f)) return f;
    return undefined;
  }

  /** Cabo (e postes) que já liga a caixa a → b em alguma rota da rede */
  function caboEntre(a: string, b: string): { cabo: string; vertices: Ponto[]; mesmoPoste: boolean } | null {
    for (const r of rede) {
      for (let j = 1; j < r.elementos.length; j++) {
        const el = r.elementos[j];
        if (!el.cabo_entrada?.trim() || chaveElemento(r.elementos[j - 1]) !== a || chaveElemento(el) !== b) continue;
        const t = r.origem !== "geogrid" ? r.trechos.find((x) => x.ate === j) : undefined;
        return { cabo: el.cabo_entrada.trim(), vertices: t ? t.pontos.slice(1, -1) : [], mesmoPoste: !!el.mesmo_poste };
      }
    }
    return null;
  }

  /**
   * Cabos que já saem da caixa anterior (nas outras rotas salvas), com as fibras em uso.
   * Ex.: da HUB já sai "06 FO ASO · HUB → CDOI Ed Majestoso" com a F1: a próxima CDOI pode seguir nele na F2.
   */
  function cabosSaindoDe(i: number) {
    const ant = linhas[i - 1];
    if (!ant || i < 1) return [];
    const k = chaveLinha(ant);
    const mapa = new Map<string, { nome: string; usadas: Set<number> }>();
    for (const r of rede) {
      r.elementos.forEach((e, j) => {
        if (chaveElemento(e) !== k) return;
        const prox = r.elementos[j + 1];
        if (!prox?.cabo_entrada?.trim()) return;
        const kc = chaveCabo(prox.cabo_entrada);
        const m = mapa.get(kc) ?? { nome: prox.cabo_entrada.trim(), usadas: new Set<number>() };
        if (prox.fibra_entrada) m.usadas.add(prox.fibra_entrada);
        mapa.set(kc, m);
      });
    }
    return [...mapa.entries()].map(([chave, m]) => {
      const cap = tipoDoCabo(m.nome)?.capacidade ?? 12;
      let livre: number | undefined;
      for (let f = 1; f <= cap; f++) if (!m.usadas.has(f)) { livre = f; break; }
      return { chave, nome: m.nome, usadas: [...m.usadas].sort((a, b) => a - b), livre, cap };
    });
  }

  /** Segue num cabo que já sai da caixa anterior, na próxima fibra livre */
  function continuarCabo(i: number, nome: string, fibra?: number) {
    alterar(i, { cabo_entrada: nome, fibra_entrada: fibra ? String(fibra) : "" });
  }

  /** Escolhe um tipo de cabo do cadastro para o trecho que chega em i */
  function usarTipoCabo(i: number, t: ItemCatalogo) {
    const l = linhas[i];
    const ant = linhas[i - 1];
    const atual = l.cabo_entrada.trim();
    const kAtual = atual ? chaveCabo(atual) : "";
    // O tipo vale pelo nome do cabo. Se outro trecho usa esse mesmo nome com outro tipo (ex.: o 72 que chega no HUB),
    // trocar aqui mudaria os dois: então este trecho vira um cabo novo, com nome próprio.
    const compartilhado = !!kAtual && linhas.some((x, j) => j !== i && j > 0 && x.cabo_entrada.trim() && chaveCabo(x.cabo_entrada) === kAtual);
    const trocouTipo = tiposCabo[kAtual] !== t.id;
    const separar = compartilhado && trocouTipo;
    // nome criado pelo editor ("72 FO ASO · DIO → CEO 1"): ao trocar o tipo, o nome acompanha
    const nomeAutomatico = tiposDeCabo.some((c) => atual.startsWith(`${c.nome} · `));
    const nomeCabo =
      atual && !separar && !(nomeAutomatico && (trocouTipo || !atual.startsWith(`${t.nome} · `))) ? atual : `${t.nome} · ${curtoNome(ant?.nome ?? "")} → ${curtoNome(l.nome)}`;
    setTiposCabo((tc) => ({ ...tc, [chaveCabo(nomeCabo)]: t.id }));
    const fibraOk = (f: string) => {
      const v = n(f);
      return t.capacidade === 1 || !v || (t.capacidade && v > t.capacidade) ? "1" : f;
    };
    mudar((ls) =>
      ls.map((x, j) => {
        if (j === i) return { ...x, cabo_entrada: nomeCabo, fibra_entrada: fibraOk(x.fibra_entrada) };
        // os trechos seguintes que continuam no mesmo cabo (passando por CEO/CT, sem splitter no meio) seguem junto
        if (
          nomeCabo !== atual &&
          j > i &&
          ls.slice(i + 1, j + 1).every((y) => chaveCabo(y.cabo_entrada) === kAtual) &&
          ls.slice(i, j).every((y) => herdaCabo(y))
        ) {
          return { ...x, cabo_entrada: nomeCabo, fibra_entrada: fibraOk(x.fibra_entrada) };
        }
        return x;
      }),
    );
  }

  /** Distância (graus², plano local) do ponto ao segmento a–b, para achar o trecho clicado */
  function dist2(a: Ponto, b: Ponto, p: Ponto) {
    const k = Math.cos((p.lat * Math.PI) / 180);
    const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
  }

  /** Insere um elemento (tipo da ferramenta) no meio do trecho que chega em i, no ponto clicado */
  function inserirElemento(iHint: number, lat: number, lon: number, tipoForcado?: TipoElementoRota) {
    if (ferramenta === "estacao") return clicarMapa(lat, lon);
    const tipo = tipoForcado ?? tipoDaFerramenta(ferramenta) ?? "ceo";
    const p = { lat, lon };
    let i = iHint;
    if (i < 1) {
      // Descobre o trecho mais perto do ponto (rotas do GeoGrid: linha entre as caixas)
      let melhor = Infinity;
      for (let k = 1; k < linhas.length; k++) {
        const a = posDe(linhas[k - 1]);
        const b = posDe(linhas[k]);
        if (!a || !b) continue;
        const pts = [a, ...linhas[k].vertices, b];
        for (let j = 0; j < pts.length - 1; j++) {
          const d = dist2(pts[j], pts[j + 1], p);
          if (d < melhor) { melhor = d; i = k; }
        }
      }
    }
    if (i < 1) return clicarMapa(lat, lon);
    const cur = linhas[i];
    const a = posDe(linhas[i - 1]);
    const b = posDe(cur);
    const pts = a && b ? [a, ...cur.vertices, b] : [];
    const j = pts.length ? segmentoMaisPerto(pts, p) : 0;
    const antes = cur.vertices.slice(0, j);
    const depois = cur.vertices.slice(j);
    // Distância digitada (ex.: GeoGrid com reserva): divide na proporção do mapa
    let distNovo = "";
    let distCur = cur.distancia_m;
    const autoDist = cur.dist_auto || !n(cur.distancia_m);
    if (!autoDist && a && b) {
      const dA = comprimentoTracado([a, ...antes, p]);
      const dB = comprimentoTracado([p, ...depois, b]);
      const total = n(cur.distancia_m)!;
      const parte = Math.round((total * dA) / (dA + dB || 1));
      distNovo = String(parte);
      distCur = String(Math.max(0, Math.round(total - parte)));
    }
    mudar((ls) => {
      const c = [...ls];
      const nova: Linha = {
        ...linhaVazia(tipo),
        nome: nomeAuto(tipo, ls, nomesRede),
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        coords: fmtCoord(p),
        vertices: antes,
        dist_auto: autoDist,
        distancia_m: distNovo,
        // O mesmo cabo/fibra passa pela caixa nova
        cabo_entrada: cur.cabo_entrada,
        fibra_entrada: cur.fibra_entrada,
      };
      c[i] = { ...cur, vertices: depois, dist_auto: autoDist, distancia_m: autoDist ? cur.distancia_m : distCur };
      c.splice(i, 0, nova);
      return c;
    });
    setSel(i);
    setAviso(null);
  }

  /** Insere um elemento sem local antes de i (pela lista); o próximo clique no mapa posiciona */
  function inserirNaLista(i: number) {
    if (travada(i)) return setAviso("O tronco é da rota-mãe: insira caixas nele lá.");
    const tipo: TipoElementoRota = tipoDaFerramenta(ferramenta) ?? "ceo";
    const cur = linhas[i];
    mudar((ls) => {
      const c = [...ls];
      c.splice(i, 0, {
        ...linhaVazia(tipo),
        nome: nomeAuto(tipo, ls, nomesRede),
        codigo: tipo === "olt" ? "" : proximoCodigo(ls),
        dist_auto: true,
        cabo_entrada: cur?.cabo_entrada ?? "",
        fibra_entrada: cur?.fibra_entrada ?? "",
      });
      // O trecho seguinte agora sai da caixa nova: os postes antigos ficam com ele
      return c;
    });
    setSel(i);
    setFerramenta("selecionar");
    setAviso(`Clique no mapa onde fica o novo ${PREFIXO[tipo]} (entre ${linhas[i - 1]?.nome ?? "o início"} e ${cur?.nome ?? "o fim"}).`);
  }

  function inserirCurva(i: number, lat: number, lon: number) {
    const a = posDe(linhas[i - 1]);
    const b = posDe(linhas[i]);
    if (!a || !b) return;
    const pts = [a, ...linhas[i].vertices, b];
    const j = segmentoMaisPerto(pts, { lat, lon });
    const v = [...linhas[i].vertices];
    v.splice(j, 0, { lat, lon });
    alterar(i, { vertices: v });
    setSel(i);
  }

  // Só equipamentos do cadastro: o que faltar vira pendência e impede salvar
  /** Porta PON desta rota (pela OLT do elemento 1) */
  const ponDestaRota = linhas[0] ? portaPonDaRota({ elementos: [{ nome: linhas[0].nome, tipo: linhas[0].tipo, porta: linhas[0].porta }] } as unknown as RotaOptica).chave : "";
  const pendencias: { i: number; msg: string }[] = [];
  if (linhas.length && linhas[0].tipo !== "olt") pendencias.push({ i: 0, msg: "A rota precisa começar numa OLT" });
  linhas.forEach((l, i) => {
    if (i < troncoEf) return; // tronco: pendências são da rota-mãe
    const nome = l.nome || `elemento ${i + 1}`;
    if (l.tipo === "olt" && !olts.some((o) => o.id === l.equipamento_id)) pendencias.push({ i, msg: `${nome}: escolha a OLT do cadastro` });
    if (l.tipo === "olt" && i === 0 && !lerPortaOlt(l.porta)) pendencias.push({ i, msg: `${nome}: escolha a placa e a porta PON` });
    if (l.tipo === "dio" && !dios.some((d) => d.id === l.equipamento_id)) pendencias.push({ i, msg: `${nome}: escolha o DIO do cadastro` });
    // fibra já usada por OUTRA porta PON no mesmo cabo (mesma porta pode dividir a fibra no tronco)
    // (o cordão OLT → DIO não entra: cada porta PON tem o seu, mesmo com o mesmo nome)
    const cordaoDaEstacao = l.tipo === "dio" && linhas[i - 1]?.tipo === "olt";
    if (i > 0 && !cordaoDaEstacao && l.cabo_entrada.trim() && n(l.fibra_entrada)) {
      const conflito = usoOutraPorta(l.cabo_entrada, n(l.fibra_entrada)!);
      if (conflito) pendencias.push({ i, msg: `${nome}: a fibra F${l.fibra_entrada} do cabo "${curtoNome(l.cabo_entrada)}" já é usada pela ${conflito.pon} (rota ${conflito.rota})` });
    }
    if (l.tipo === "hub" && !l.passagem && !l.splitter) pendencias.push({ i, msg: `${nome}: escolha o splitter primário da HUB (ou marque "Só passa")` });
    // duas HUBs dividindo a mesma fibra: só vale com meia porta (a sub-rota sai pela outra perna do 1:2 da primeira)
    if (l.tipo === "hub" && !l.passagem && l.splitter) {
      let j = i - 1;
      while (j >= 0 && !(linhas[j].tipo === "hub" && !linhas[j].passagem && linhas[j].splitter)) j--;
      if (j >= 0) {
        const pelaMeiaPorta = !!linhas[j].meiaPorta && !!paiEf?.meia_porta && j === troncoEf - 1;
        if (!pelaMeiaPorta) {
          pendencias.push({
            i,
            msg: `${nome}: a ${linhas[j].nome} já divide esta fibra com splitter. Marque "Só passa" numa delas, ou use meia porta (1:2 na primeira e esta rota saindo pela meia porta).`,
          });
        }
      }
    }
    if (l.tipo === "cto" && !l.passagem && !l.splitter) pendencias.push({ i, msg: `${nome}: escolha o splitter da CTO (ou marque "Só passa")` });
    if (l.tipo === "predio") {
      const v = vinculoDe(l);
      if (!v?.id && !(v?.nome ?? "").trim()) pendencias.push({ i, msg: `${nome}: dê o nome do prédio` });
      if (i !== linhas.length - 1) pendencias.push({ i, msg: `${nome}: o prédio é a ponta do cabo, tem que ser o último elemento` });
    }
    if (i > 0) {
      if (!l.cabo_entrada.trim()) pendencias.push({ i, msg: `${nome}: informe o cabo que chega` });
      else if (!tipoDoCabo(l.cabo_entrada)) pendencias.push({ i, msg: `${nome}: o cabo "${l.cabo_entrada}" precisa de um tipo do cadastro` });
      // CDOI de prédio: a fibra de cada CDOI é escolhida na janela do prédio
      // prédio: só o cabo chega; a fibra de cada CDOI é escolhida na janela do prédio
      const cdoiDePredio = l.tipo === "predio";
      if (!n(l.fibra_entrada) && !cdoiDePredio) pendencias.push({ i, msg: `${nome}: escolha a fibra` });
    }
    if (l.splitter && !modelosSplitter.some((m) => m.id === l.splitter_modelo)) pendencias.push({ i, msg: `${nome}: splitter ${l.splitter} não é do cadastro` });
  });
  const pendentesDe = new Set(pendencias.map((p) => p.i));

  const temEstacao = linhas[0]?.tipo === "olt" && linhas[1]?.tipo === "dio";
  const estacao: DadosEstacao | null = temEstacao
    ? {
        oltNome: linhas[0].nome,
        oltEquip: linhas[0].equipamento_id,
        oltPorta: linhas[0].porta,
        oltPot: linhas[0].potencia_saida,
        dioNome: linhas[1].nome,
        dioEquip: linhas[1].equipamento_id,
        dioPorta: linhas[1].porta,
        cordaoNome: linhas[1].cabo_entrada,
        cordaoTipo: linhas[1].cabo_entrada.trim() ? tiposCabo[chaveCabo(linhas[1].cabo_entrada)] ?? "" : "",
        cordaoMetros: linhas[1].distancia_m,
        saidaCabo: linhas[2]?.cabo_entrada,
        saidaTipo: linhas[2]?.cabo_entrada.trim() ? tiposCabo[chaveCabo(linhas[2].cabo_entrada)] ?? "" : linhas[2] ? "" : undefined,
        saidaFibra: linhas[2]?.fibra_entrada,
        destino: linhas[2] ? linhas[2].nome : undefined,
      }
    : null;
  /** Cartão Estação: qual rota já usa cada porta (PON da OLT e porta do DIO) */
  const ponEmUso = (placa: number, porta: number) => (temEstacao ? usoPortas.pon.get(chavePon(linhas[0].nome, textoPortaOlt(placa, porta))) : undefined);
  const dioEmUso = (porta: number) => (temEstacao ? usoPortas.dio.get(`${chaveLinha(linhas[1])}|${porta}`) : undefined);

  /** Metragem desde a OLT em cada elemento (soma dos trechos, já com as reservas) — é a que o OTDR mostra */
  const acumulado = linhas.reduce<number[]>((acc, l, i) => [...acc, (acc[i - 1] ?? 0) + (i > 0 ? n(l.distancia_m) ?? 0 : 0)], []);

  const pontosMapa: PontoEditor[] = linhas.map((l) => {
    const p = posDe(l);
    const emPredio = false;
    const f = n(l.fibra_entrada);
    const info = f ? infoFibra(l.cabo_entrada, l.fibra_entrada) : null;
    const d = n(l.distancia_m);
    return {
      nome: emPredio ? `${l.nome} · ${l.predio?.nome || predioDaChave.get(chaveLinha(l))?.nome || "prédio"}` : l.nome,
      tipo: emPredio ? "predio" : l.tipo,
      lat: p?.lat,
      lon: p?.lon,
      vertices: l.vertices,
      cor: info?.c.hex,
      rotulo: `${l.cabo_entrada.split(" - ")[0] || "cabo ?"}${info ? ` · ${info.c.rotulo}` : ""}${d !== undefined ? ` · ${formatMetros(d)}` : ""}`,
    };
  });

  // ---------- Potência ----------
  const tx = linhas[0] ? n(linhas[0].potencia_saida) ?? n(linhas[0].potencia_entrada) : undefined;
  const pots =
    calc.auto && tx !== undefined
      ? calcularPotencias(
          linhas.map((l, i) =>
            entradaPotencia(
              {
                nome: l.nome,
                tipo: l.tipo,
                distancia_m: n(l.distancia_m),
                splitter: l.splitter || undefined,
                splitter_modelo: l.splitter_modelo || undefined,
                passagem: l.passagem,
                meia_porta: l.tipo === "hub" && !!l.meiaPorta,
                via_meia_porta: !!paiEf?.meia_porta && i === troncoEf - 1,
              },
              (id) => modelosSplitter.find((m) => m.id === id)?.perda_db
            )
          ),
          tx,
          calc
        )
      : null;
  const potDe = (i: number) => (pots ? pots[i]?.saida : n(linhas[i].potencia_saida) ?? n(linhas[i].potencia_entrada));
  const potFinal = linhas.length ? potDe(linhas.length - 1) : undefined;
  const totalDist = linhas.reduce((t, l) => t + (n(l.distancia_m) ?? 0), 0);

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

  /** Todo cabo da rota ganha o código fixo (CB-000123); veja editor/salvar.ts */
  function garantirCodigos() {
    return garantirCodigosCabos(linhas, { rede, salvos, cabos, tiposCabo });
  }

  /** Erro que impede gravar a linha i (null = ok) */
  function erroDaLinha(ls: Linha[], i: number): string | null {
    const l = ls[i];
    if (!l.nome.trim()) return `Elemento ${i + 1} está sem nome.`;
    if (parseCoords(l.coords).erro) return `Elemento ${i + 1}: coordenadas inválidas. Use "-28.6917, -49.3423".`;
    if (infoFibra(linhas[i].cabo_entrada, l.fibra_entrada)?.excede) return `Elemento ${i + 1}: a fibra ${l.fibra_entrada} não existe no cabo "${l.cabo_entrada}".`;
    return null;
  }

  function montarElemento(ls: Linha[], i: number): ElementoRota {
    return elementoDaLinha(ls, i, { pots, viaMeiaPorta: !!paiEf?.meia_porta, troncoEf });
  }

  /** Tipo de cabo escolhido aqui vai para o cadastro do cabo (vale para todas as rotas) */
  async function gravarCabos(ls: Linha[], tc: Record<string, string>) {
    const nomesUsados = new Map<string, string>();
    ls.forEach((l) => l.cabo_entrada.trim() && nomesUsados.set(chaveCabo(l.cabo_entrada), l.cabo_entrada.trim()));
    for (const [chave, nomeCabo] of nomesUsados) {
      const novo = tc[chave] ?? "";
      // cadastro antigo (pelo nome) passa para o código
      const atual = cabos.find((c) => c.chave === chave) ?? cabos.find((c) => c.chave === normalizar(semCodigo(nomeCabo)));
      if (novo === (atual?.tipo_id ?? "") && (!atual || atual.chave === chave)) continue;
      const t = tiposDeCabo.find((x) => x.id === novo);
      const salvo = await salvarCabo({
        chave,
        nome: atual?.chave === chave ? atual.nome : nomeCabo,
        capacidade: t?.capacidade ?? atual?.capacidade,
        tipo_id: novo || undefined,
        fibras: atual?.fibras ?? [],
        obs: atual?.obs,
        atualizado_por: usuario,
      });
      onCaboSalvo(salvo);
    }
  }

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Dê um nome para a rota (campo no topo).");
    if (linhas.length < 2) return setErro("A rota precisa de pelo menos 2 elementos: a OLT e o ponto final.");
    if (pendencias.length) {
      setVerPendencias(true);
      setSel(pendencias[0].i);
      return setErro(`Há ${pendencias.length} pendência${pendencias.length > 1 ? "s" : ""}: só são aceitos equipamentos e cabos do cadastro.`);
    }
    const g0 = garantirCodigos();
    const tc = g0.tc;
    // cordão da estação: o nome acompanha a porta PON, a OLT e o DIO de agora ("Cordão 0/6/2 OLT2_DC → DIO 05")
    const lsCordao = g0.ls.map((l, i) => {
      const ant = g0.ls[i - 1];
      if (l.tipo !== "dio" || ant?.tipo !== "olt" || !/^Cordão /i.test(l.cabo_entrada)) return l;
      // cada porta PON tem o seu cordão físico: a PON entra no nome ("Cordão 0/6/2 OLT2_DC → DIO 05")
      const lp = lerPortaOlt(ant.porta);
      const nomeC = `Cordão ${lp ? `0/${lp.placa}/${lp.porta} ` : ""}${ant.nome.split(" / ")[0]} → ${l.nome}`;
      if (nomeC === l.cabo_entrada) return l;
      const t0 = tc[chaveCabo(l.cabo_entrada)];
      if (t0 && !tc[chaveCabo(nomeC)]) tc[chaveCabo(nomeC)] = t0;
      return { ...l, cabo_entrada: nomeC };
    });
    let ls: Linha[];
    try {
      ls = await prepararPredios(lsCordao);
    } catch (e) {
      return setErro(/permission/i.test(String(e)) ? "Sem permissão para criar o prédio." : "Não foi possível criar o prédio.");
    }
    const elementos: ElementoRota[] = [];
    for (let i = 0; i < ls.length; i++) {
      const e = erroDaLinha(ls, i);
      if (e) {
        setSel(i);
        return setErro(e);
      }
      elementos.push(montarElemento(ls, i));
    }

    // Traçado: rotas do GeoGrid mantêm o do KML; manuais usam o desenhado no mapa
    const trechos: TrechoCabo[] = ls.flatMap((l, i) => {
      const a = i > 0 ? posDe(ls[i - 1]) : null;
      const b = posDe(l);
      const cor = infoFibra(linhas[i].cabo_entrada, l.fibra_entrada)?.c.hex;
      return a && b ? [{ nome: l.cabo_entrada.trim() || `Trecho ${i}`, pontos: [a, ...l.vertices, b], ate: i, ...(cor ? { cor } : {}) }] : [];
    });

    // Separar: esta rota termina na caixa k; o resto vira sub-rota (e as sub-rotas que saíam do resto passam para ela)
    let elementosGravar = elementos;
    let trechosGravar = trechos;
    const passarParaNova: RotaOptica[] = [];
    if (sepEf && inicial?.id) {
      const k = sepEf.k;
      const ficam = new Set(elementos.slice(0, k + 1).map(chaveElemento));
      const vao = new Set(elementos.slice(k + 1).map(chaveElemento));
      passarParaNova.push(...subRotasDe(inicial.id, todas ?? []).filter((x) => vao.has(x.pai!.chave) && !ficam.has(x.pai!.chave)));
      elementosGravar = elementos.slice(0, k + 1).map((e, j) => (j === k ? { ...e, cabo_saida: undefined, fibra_saida: undefined } : e));
      trechosGravar = trechos.filter((t) => (t.ate ?? 0) <= k);
    }

    if (inicial?.id && todas) {
      const perdidas = subRotasDe(inicial.id, todas).filter(
        (x) => !passarParaNova.includes(x) && !elementosGravar.some((e) => chaveElemento(e) === x.pai!.chave)
      );
      if (perdidas.length) {
        return setErro(
          `${perdidas.length > 1 ? "As sub-rotas" : "A sub-rota"} ${perdidas.map((x) => `"${x.nome}"`).join(", ")} sai${perdidas.length > 1 ? "em" : ""} de uma caixa que foi tirada desta rota. Volte a caixa ou exclua a sub-rota antes.`
        );
      }
    }

    setSalvando(true);
    try {
      await gravarCabos(ls.slice(Math.max(0, troncoEf - 1)), tc);
      if (sepEf && inicial?.id) {
        const k = sepEf.k;
        const idNova = await criarRota(paraGravar({ pai: { rota_id: inicial.id, chave: chaveElemento(elementos[k]) }, tronco: k + 1 }, {
          nome: sepEf.nome.trim() || nomeSubPadrao(),
          origem: "manual",
          elementos,
          trechos,
          calculo_potencia: calc,
          criado_por: usuario,
        }));
        for (const x of passarParaNova) {
          await atualizarRota(x.id, paraGravar({ pai: { ...x.pai!, rota_id: idNova }, tronco: x.tronco }, {
            nome: x.nome, origem: x.origem, elementos: x.elementos, trechos: x.trechos,
            calculo_potencia: x.calculo_potencia, obs: x.obs, criado_por: x.criado_por,
          }));
        }
      }
      await gravarGlobais();
      await onSalvar(paraGravar({ pai: paiEf, tronco: troncoEf || undefined }, {
        nome: nome.trim(),
        origem: inicial?.origem ?? "manual",
        elementos: elementosGravar,
        trechos: trechosGravar,
        calculo_potencia: calc,
        obs: obs.trim() || undefined,
        criado_por: inicial?.criado_por ?? usuario,
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // ---------- Salvar só um elemento ----------
  /** Os vizinhos no editor são os mesmos da rota gravada (dá para gravar só este elemento) */
  function vizinhosIguais(i: number): boolean {
    const o = linhas[i].orig;
    if (o === undefined) return false;
    const antOk = i === 0 ? o === 0 : linhas[i - 1].orig === o - 1;
    const proxOk = i === linhas.length - 1 ? o === salvos.length - 1 : linhas[i + 1].orig === o + 1;
    return antOk && proxOk;
  }

  /** O elemento mudou desde a última gravação */
  function mudouDesdeSalvo(i: number): boolean {
    const l = linhas[i];
    if (!inicial?.id || l.orig === undefined || !salvos[l.orig]) return false;
    if (comparavel(montarElemento(linhas, i)) !== comparavel(salvos[l.orig])) return true;
    const t = trechosSalvos.find((x) => x.ate === l.orig);
    return !!t && JSON.stringify(t.pontos.slice(1, -1)) !== JSON.stringify(l.vertices);
  }

  async function salvarElemento(i: number) {
    const o = linhas[i].orig;
    if (!onSalvarParcial || o === undefined || !salvos[o]) return;
    setErro(null);
    const e0 = erroDaLinha(linhas, i);
    if (e0) return setErro(e0);
    const { ls, tc } = garantirCodigos();
    const el = montarElemento(ls, i);
    const novos = salvos.map((e) => ({ ...e }));
    // continua ligado aos vizinhos como estão gravados
    const proxS = novos[o + 1];
    el.cabo_saida = proxS?.cabo_entrada;
    el.fibra_saida = proxS?.fibra_entrada;
    novos[o] = el;
    if (o > 0) novos[o - 1] = { ...novos[o - 1], cabo_saida: el.cabo_entrada, fibra_saida: el.fibra_entrada };
    // potência da rota gravada recalculada (um splitter trocado muda tudo dali para frente)
    const txS = novos[0]?.potencia_saida ?? novos[0]?.potencia_entrada;
    if (calc.auto && txS !== undefined) {
      const ps = calcularPotencias(
        novos.map((e) => entradaPotencia(e, (id) => modelosSplitter.find((m) => m.id === id)?.perda_db)),
        txS,
        calc
      );
      ps.forEach((p, k) => { novos[k] = { ...novos[k], potencia_entrada: p.entrada, potencia_saida: p.saida }; });
    }
    // traçado: o trecho que chega neste elemento e o começo do próximo
    let trs = trechosSalvos.map((t) => ({ ...t, pontos: [...t.pontos] }));
    const pos = posDe(ls[i]);
    if (pos && trs.some((t) => t.ate !== undefined)) {
      const ant = o > 0 && novos[o - 1].lat !== undefined && novos[o - 1].lon !== undefined ? { lat: novos[o - 1].lat!, lon: novos[o - 1].lon! } : null;
      trs = trs.filter((t) => t.ate !== o);
      if (ant) {
        const cor = infoFibra(linhas[i].cabo_entrada, ls[i].fibra_entrada)?.c.hex;
        trs.push({ nome: el.cabo_entrada || `Trecho ${o}`, pontos: [ant, ...ls[i].vertices, pos], ate: o, ...(cor ? { cor } : {}) });
      }
      trs = trs.map((t) => (t.ate === o + 1 && t.pontos.length ? { ...t, pontos: [pos, ...t.pontos.slice(1)] } : t));
      trs.sort((a, b) => (a.ate ?? 0) - (b.ate ?? 0));
    }
    setSalvandoItem(i);
    try {
      await gravarCabos([ls[i]], tc);
      await gravarGlobais();
      await onSalvarParcial(paraGravar({ pai: paiEf, tronco: troncoEf || undefined }, {
        nome: inicial?.nome ?? nome.trim(),
        origem: inicial?.origem ?? "manual",
        elementos: novos,
        trechos: trs,
        calculo_potencia: calc,
        obs: inicial?.obs,
        criado_por: inicial?.criado_por ?? usuario,
      }));
      setSalvos(novos);
      setTrechosSalvos(trs);
      // o cabo ganhou código: todos os trechos dele no editor passam a usar o mesmo nome
      const kVelho = linhas[i].cabo_entrada.trim() ? chaveCabo(linhas[i].cabo_entrada) : "";
      if (kVelho && ls[i].cabo_entrada !== linhas[i].cabo_entrada) {
        const nomeNovo = ls[i].cabo_entrada;
        setTiposCabo(tc);
        setLinhas((lls) => lls.map((x) => (x.cabo_entrada.trim() && chaveCabo(x.cabo_entrada) === kVelho ? { ...x, cabo_entrada: nomeNovo } : x)));
      }
      setItemSalvo(i);
      setTimeout(() => setItemSalvo((v) => (v === i ? null : v)), 2500);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar o elemento.");
    } finally {
      setSalvandoItem(null);
    }
  }

  /** Faixa no topo do painel do elemento: salvar só ele */
  function barraSalvarItem(i: number) {
    if (!onSalvarParcial || !inicial?.id || travada(i)) return null;
    if (itemSalvo === i && !mudouDesdeSalvo(i)) {
      return <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">✓ Elemento salvo</p>;
    }
    if (!mudouDesdeSalvo(i)) return null;
    const pend = pendencias.filter((p) => p.i === i);
    const erroL = erroDaLinha(linhas, i);
    const bloqueio = pend.length ? pend[0].msg : erroL ? erroL : !vizinhosIguais(i) ? "a sequência da rota mudou: use Salvar rota" : null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 text-xs text-amber-800">
          {bloqueio ? <>Alterado · <span className="text-amber-700">{bloqueio}</span></> : "Este elemento foi alterado"}
        </span>
        <button
          type="button"
          disabled={!!bloqueio || salvandoItem !== null || salvando}
          onClick={() => salvarElemento(i)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
          title="Grava só a alteração deste elemento (o resto da rota continua como está gravado)"
        >
          {salvandoItem === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar só este
        </button>
      </div>
    );
  }

  // ---------- Campos do painel ----------
  const campo = "w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";
  const rot = "block text-[11px] font-medium text-slate-500 mb-0.5";

  /** Outra porta PON que já usa esta fibra deste cabo */
  function usoOutraPorta(cabo: string, fibra: number): { pon: string; rota: string } | null {
    const k = chaveCabo(cabo);
    for (const r of rede) {
      const p = portaPonDaRota(r);
      if (p.chave === ponDestaRota) continue;
      if (r.elementos.some((e) => e.cabo_entrada && e.fibra_entrada === fibra && chaveCabo(e.cabo_entrada) === k)) return { pon: p.rotulo, rota: r.nome };
    }
    return null;
  }

  function campoFibra(i: number) {
    const l = linhas[i];
    const t = tipoDoCabo(l.cabo_entrada);
    const info = infoFibra(l.cabo_entrada, l.fibra_entrada);
    // fibras deste cabo já usadas nas outras rotas (e para onde vão)
    const kc = l.cabo_entrada.trim() ? chaveCabo(l.cabo_entrada) : "";
    const emUso = new Map<number, string>();
    if (kc) {
      for (const r of rede) {
        r.elementos.forEach((e) => {
          if (e.fibra_entrada && e.cabo_entrada && chaveCabo(e.cabo_entrada) === kc && !emUso.has(e.fibra_entrada)) emUso.set(e.fibra_entrada, e.nome);
        });
      }
    }
    return (
      <div>
        <label className={rot}>Fibra</label>
        <div className="relative">
          {info && (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-slate-800 pointer-events-none" style={{ background: info.c.hex }} />
          )}
          <select className={`${campo} ${info ? "pl-7" : ""} ${info?.excede ? "border-red-400" : ""}`} value={l.fibra_entrada} onChange={(e) => alterar(i, { fibra_entrada: e.target.value })}>
            <option value="">—</option>
            {Array.from({ length: Math.max(t?.capacidade ?? 144, n(l.fibra_entrada) ?? 0) }, (_, k) => k + 1).map((f) => {
              const uso = emUso.get(f);
              const sufixo = uso ? ` · em uso → ${uso.split(" - ")[0].split(" / ")[0].slice(0, 22)}` : "";
              if (!t?.capacidade) return <option key={f} value={String(f)}>F{pad2(f)} {corFibraPorCapacidade(f, 12).nome.toLowerCase()}{sufixo}</option>;
              const c = corFibraPorCapacidade(f, t.capacidade, t.fibras_por_tubo ?? fibrasPorTubo(t.capacidade));
              return <option key={f} value={String(f)}>F{pad2(f)} {c.nome.toLowerCase()} · T{c.tubo}{f > t.capacidade ? " ⚠" : ""}{sufixo}</option>;
            })}
          </select>
        </div>
      </div>
    );
  }

  function camposEquipamento(i: number) {
    const l = linhas[i];
    const lista = l.tipo === "olt" ? olts : l.tipo === "dio" ? dios : [];
    if (l.tipo !== "olt" && l.tipo !== "dio") return null;
    if (!lista.length) {
      return (
        <p className="col-span-2 text-[11px] text-red-600">
          Nenhuma {l.tipo === "olt" ? "OLT" : "DIO"} cadastrada. Cadastre em Cadastros → {l.tipo === "olt" ? "OLTs" : "DIOs"}.
        </p>
      );
    }
    const eq = lista.find((x) => x.id === l.equipamento_id);
    if (l.tipo === "olt") {
      const lida = lerPortaOlt(l.porta);
      const num = numeracaoOlt(eq);
      const setPorta = (pl: number, po: number) => alterar(i, { porta: textoPortaOlt(pl, po) });
      return (
        <>
          <div className="col-span-2">
            <label className={rot}>OLT do cadastro</label>
            <select
              className={campo}
              value={l.equipamento_id}
              onChange={(e) => {
                const x = lista.find((o) => o.id === e.target.value);
                alterar(i, {
                  equipamento_id: e.target.value,
                  nome: x && (!l.nome.trim() || /^OLT( \d+)?$/.test(l.nome)) ? x.nome : l.nome,
                  potencia_saida: x?.potencia_tx !== undefined ? s(x.potencia_tx) : l.potencia_saida,
                });
              }}
            >
              <option value="">— escolha a OLT —</option>
              {lista.map((o) => <option key={o.id} value={o.id}>{o.nome} · {resumoItem(o)}</option>)}
            </select>
          </div>
          {num.placas.length && num.portas.length ? (
            <>
              <div>
                <label className={rot}>Placa PON</label>
                <select className={campo} value={lida ? lida.placa : ""} onChange={(e) => setPorta(+e.target.value, lida?.porta ?? num.portas[0])}>
                  <option value="">—</option>
                  {num.placas.map((v) => <option key={v} value={v}>PL {pad2(v)}</option>)}
                </select>
              </div>
              <div>
                <label className={rot}>Porta PON</label>
                <select className={campo} value={lida ? lida.porta : ""} onChange={(e) => setPorta(lida?.placa ?? num.placas[0], +e.target.value)}>
                  <option value="">—</option>
                  {num.portas.map((v) => <option key={v} value={v}>Porta {pad2(v)}</option>)}
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
          <label className={rot}>DIO do cadastro</label>
          <select className={campo} value={l.equipamento_id} onChange={(e) => alterar(i, { equipamento_id: e.target.value })}>
            <option value="">— escolha o DIO —</option>
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
    const naoCadastrado = !!l.splitter && !valor.startsWith("m:");
    // HUB/CTO: nesta rota usa o splitter (obrigatório) ou só passa (a fibra atravessa a caixa)
    const ehHub = l.tipo === "hub" || l.tipo === "cto";
    const exige = ehHub && !l.passagem;
    const opcoes = l.tipo === "hub"
      ? ([[false, "Usa o splitter desta porta"], [true, "Só passa (HUB de outra porta)"]] as const)
      : ([[false, "Atende aqui (usa o splitter)"], [true, "Só passa (segue para frente)"]] as const);
    const escolhaHub = ehHub && (
      <div className="col-span-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        {opcoes.map(([v, r0]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => alterar(i, v ? { passagem: true, splitter: "", splitter_modelo: "" } : { passagem: false })}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${l.passagem === v ? "bg-white text-indigo-700 shadow" : "text-slate-500"}`}
          >
            {r0}
          </button>
        ))}
      </div>
    );
    if (ehHub && l.passagem) {
      return (
        <>
          {escolhaHub}
          <p className="col-span-2 text-[10px] text-slate-500">Nesta rota a fibra só atravessa a {l.tipo === "hub" ? "HUB" : "CTO"}, sem dividir. O cabo e a fibra seguem como numa CEO.</p>
        </>
      );
    }
    // O cadastro da caixa (Unifilar) manda no splitter: aqui só mostra
    const cad = caixas.find((c) => c.chave === chaveLinha(l));
    const doCad = ["hub", "cto", "cdoi"].includes(l.tipo) ? splitterDoCadastro(cad, l.cabo_entrada || undefined, +l.fibra_entrada || undefined) : null;
    if (doCad) {
      const difere = l.splitter !== doCad.relacao;
      return (
        <>
        {escolhaHub}
        <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-900">
          <p><b>Splitter {doCad.relacao}</b> · definido no Unifilar (o que tem dentro da caixa se muda lá).</p>
          {difere && (
            <p className="mt-0.5 text-amber-800">
              Esta rota está com {l.splitter || "nenhum"}.{" "}
              <button type="button" className="font-semibold underline" onClick={() => alterar(i, { splitter: doCad.relacao, splitter_modelo: doCad.modelo_id ?? "" })}>Usar o {doCad.relacao}</button>
            </p>
          )}
          {onAbrirNoUnifilar && (
            <button type="button" className="mt-1 font-semibold text-emerald-800 underline" onClick={() => onAbrirNoUnifilar(chaveLinha(l))}>Abrir no Unifilar</button>
          )}
        </div>
        </>
      );
    }
    return (
      <>
      {escolhaHub}
      <div>
        <label className={rot}>{exige && l.tipo === "hub" ? "Splitter primário" : "Splitter"}</label>
        <select
          className={campo}
          value={valor}
          onChange={(e) => {
            const v = e.target.value;
            const m = v.startsWith("m:") ? modelosSplitter.find((x) => x.id === v.slice(2)) : undefined;
            alterar(i, { splitter: m ? m.relacao ?? "" : v, splitter_modelo: m?.id ?? "" });
          }}
        >
          {exige ? <option value="" disabled>{l.tipo === "hub" ? "Escolha o splitter primário…" : "Escolha o splitter…"}</option> : <option value="">Sem splitter</option>}
          {modelosSplitter.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nome} · {resumoItem(m)}</option>)}
          {naoCadastrado && <option value={l.splitter}>{l.splitter} (não cadastrado)</option>}
        </select>
        {naoCadastrado && <p className="text-[10px] text-red-600 mt-0.5">Troque por um splitter do cadastro.</p>}
        {exige && !l.splitter && <p className="text-[10px] text-red-600 mt-0.5">{l.tipo === "hub" ? "Escolha o splitter primário (ou marque Só passa)." : "Escolha o splitter da CTO (ou marque Só passa)."}</p>}
        {!modelosSplitter.length && <p className="text-[10px] text-slate-500 mt-0.5">Nenhum splitter cadastrado (Cadastros → Splitters).</p>}
      </div>
      </>
    );
  }

  /** Painel do elemento selecionado (abre dentro da lista) */
  /** ✂ Separar: a rota termina nesta caixa e o resto vira sub-rota */
  function botaoSeparar(i: number) {
    return (
      <>
        {inicial?.id && i >= Math.max(troncoEf, 1) && i < linhas.length - 1 && (
          <button
            type="button"
            onClick={() => setSeparar(sepEf?.k === i ? null : { k: i, nome: separar?.nome || nomeSubPadrao() })}
            className={`w-full rounded-lg border-2 border-dashed py-1.5 text-[11px] font-semibold ${sepEf?.k === i ? "border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100" : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}
            title="A rota termina nesta caixa e as caixas seguintes viram uma sub-rota que sai daqui"
          >
            {sepEf?.k === i ? "Não separar" : "✂ Separar daqui: o que vem depois vira sub-rota"}
          </button>
        )}
      </>
    );
  }

  /** Selo da caixa compartilhada: em que rotas ela está e as duas saídas */
  function seloCaixa(i: number) {
    const outras = outrasComCaixa(i);
    if (!outras.length) return null;
    const l = linhas[i];
    return (
      <SeloCompartilhado
        titulo={`${TIPO_ELEMENTO_LABEL[l.tipo] ?? "Caixa"} compartilhada`}
        texto={<>Também está em <b>{listaRotas(outras)}</b>. Nome, tipo e local valem para todas.</>}
        onEditar={() => abrirEditarTodas("caixa", i)}
        onSeparar={l.tipo === "olt" ? undefined : () => setConfirmaSeparar(`caixa-${i}`)}
        confirmando={confirmaSeparar === `caixa-${i}`}
        textoConfirma="Vira uma caixa só desta rota, com código novo. As outras rotas continuam com a atual."
        onConfirmar={() => separarCaixa(i)}
        onCancelar={() => setConfirmaSeparar(null)}
      />
    );
  }

  /** Selo do cabo compartilhado */
  function seloCabo(i: number) {
    const outras = outrasComCabo(i);
    if (!outras.length) return null;
    return (
      <div className="mb-2">
        <SeloCompartilhado
          titulo="Cabo compartilhado"
          texto={<>Também passa em <b>{listaRotas(outras)}</b>. Nome e tipo valem para todas; a fibra é desta rota.</>}
          onEditar={() => abrirEditarTodas("cabo", i)}
          onSeparar={() => setConfirmaSeparar(`cabo-${i}`)}
          confirmando={confirmaSeparar === `cabo-${i}`}
          textoConfirma="Nesta rota vira outro cabo, com código novo (ex.: o cabo aqui é outro de verdade)."
          onConfirmar={() => separarCabo(i)}
          onCancelar={() => setConfirmaSeparar(null)}
        />
      </div>
    );
  }

  function painelTronco(i: number) {
    const l = linhas[i];
    const ancora = i === troncoEf - 1;
    return (
      <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
        <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-600">
          🔒 Tronco da rota <b>{nomeMae}</b>. Para mudar esta caixa, edite a rota-mãe: a mudança vale para esta sub-rota também.
        </p>
        {ancora && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5 space-y-1.5">
            <p className="text-[11px] font-semibold text-indigo-900">Esta sub-rota sai daqui</p>
            {l.tipo === "hub" && l.meiaPorta ? (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1">
                {([[false, "Pelo primário desta HUB"], [true, "Pela meia porta (outra perna do 1:2)"]] as const).map(([v, rot0]) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setPai((p) => (p ? { ...p, meia_porta: v || undefined } : p))}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${!!paiEf?.meia_porta === v ? "bg-indigo-600 text-white shadow" : "text-slate-500 hover:bg-slate-50"}`}
                  >
                    {rot0}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-500">{l.passagem ? "Nesta porta a fibra só passa por aqui (passagem) e segue." : l.tipo === "hub" ? "Sai por uma porta do primário desta HUB." : "Segue a partir desta caixa."}</p>
            )}
            {paiEf?.meia_porta && <p className="text-[10px] text-slate-500">A fibra sai pela outra perna do 1:2 (só a perda do 1:2) e segue até a HUB da outra metade da porta.</p>}
          </div>
        )}
      </div>
    );
  }

  function painel(i: number) {
    if (travada(i)) return painelTronco(i);
    const l = linhas[i];
    const dm = distMapa(linhas, i);
    const kCabo = l.cabo_entrada.trim() ? chaveCabo(l.cabo_entrada) : "";
    // CDOI de prédio: aqui só o prédio e o cabo que chega (o resto fica na janela do prédio)
    const soPredio = l.tipo === "predio";
    /** Caixa também usada em outra rota: nome e tipo só mudam "em todas" (ou separando) */
    const caixaTravada = outrasComCaixa(i).length > 0;
    const caboTravado = outrasComCabo(i).length > 0;
    return (
      <div className="mt-2 space-y-3" onClick={(e) => e.stopPropagation()}>
        {barraSalvarItem(i)}
        {seloCaixa(i)}
        {l.tipo === "hub" && botaoSeparar(i)}
        {l.tipo === "predio" && campoPredio(i)}
        {!soPredio && <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={rot}>{l.tipo === "cdoi" ? "Nome da CDOI" : "Nome"}</label>
            <input
              className={`${campo} ${!l.nome.trim() ? "border-red-400" : ""} ${caixaTravada ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""}`}
              value={l.nome}
              readOnly={caixaTravada}
              title={caixaTravada ? "Caixa compartilhada: use Editar em todas" : undefined}
              onFocus={() => { nomeAntes.current = l.nome; }}
              onChange={(e) => alterar(i, { nome: e.target.value })}
              onBlur={() => renomearCabos(nomeAntes.current, l.nome)}
              placeholder="Ex.: CE 2222 - P. CHAMINE"
            />
          </div>
          <div>
            <label className={rot}>Tipo{caixaTravada ? " 🔒" : ""}</label>
            <select className={`${campo} ${caixaTravada ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""}`} disabled={caixaTravada} value={l.tipo} onChange={(e) => alterar(i, { tipo: e.target.value as TipoElementoRota })}>
              {Object.entries(TIPO_ELEMENTO_LABEL).filter(([k]) => k !== "predio").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={rot}>Código 🔒</label>
            <div className="flex gap-1">
              <input
                className={`${campo} cursor-not-allowed bg-slate-50 font-mono text-slate-600`}
                value={l.codigo}
                readOnly
                placeholder="sem código"
                title="Código fixo da caixa: identifica o elemento em todas as rotas e não pode ser alterado"
              />
              {!l.codigo.trim() && (
                <button
                  type="button"
                  onClick={() => alterar(i, { codigo: proximoCodigo(linhas) })}
                  className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  title="Gerar código numérico único"
                >
                  Gerar
                </button>
              )}
            </div>
            {l.codigo.trim() && linhas.some((x, j) => j !== i && x.codigo.trim() === l.codigo.trim() && !(x.nome === l.nome && x.tipo === l.tipo)) && (
              <p className="text-[10px] text-red-600 mt-0.5">Código repetido nesta rota</p>
            )}
          </div>
          {camposEquipamento(i)}
          {l.tipo === "hub" && !l.passagem && (
            <label className="col-span-2 flex cursor-pointer items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-1.5 text-[11px] text-violet-900">
              <input type="checkbox" className="mt-0.5" checked={!!l.meiaPorta} onChange={(e) => alterar(i, { meiaPorta: e.target.checked })} />
              <span>
                <b>Meia porta</b>: tem um 1:2 antes do primário. Uma perna alimenta o primário desta HUB e a outra segue até a HUB da outra metade da porta.
              </span>
            </label>
          )}
          {l.tipo === "hub" && !l.passagem && (
            <button
              type="button"
              onClick={() => ctoNoMesmoPoste(i)}
              className="col-span-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              title="Cria uma CTO logo depois desta HUB, no mesmo poste, ligada por um cabo curto sem reserva"
            >
              ＋ CTO no mesmo poste
            </button>
          )}
          {l.tipo === "cto" && hubAntes(i) !== null && (
            <button
              type="button"
              onClick={() => voltarParaHub(i)}
              className="col-span-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 py-1.5 text-[11px] font-semibold text-indigo-800 hover:bg-indigo-100"
              title="Uma porta desta CTO volta pelo mesmo cabo, em outra fibra, até a HUB (passagem) e segue para outra rota (ex.: alimentar uma CT)"
            >
              ↩ Voltar para a HUB (transporte em outra fibra)
            </button>
          )}
          {i === 0 && (
            <div className="col-span-2">
              <label className={rot}>Potência da porta PON (dBm)</label>
              <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, { potencia_saida: e.target.value })} placeholder="ex.: 5" />
            </div>
          )}
        </div>}

        {i > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 mb-1.5">
              <IconeCabo tamanho={16} /> Cabo que chega aqui
              <span className="ml-auto font-normal text-amber-700">em amarelo no mapa</span>
            </p>
            {seloCabo(i)}
            {(() => {
              const existentes = cabosSaindoDe(i);
              if (!existentes.length) return null;
              return (
                <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-1.5">
                  <p className="text-[10px] font-semibold text-emerald-800 mb-1">
                    Seguir num cabo que já sai de {linhas[i - 1]?.nome.split(" - ")[0].split(" / ")[0]} (usa a próxima fibra livre):
                  </p>
                  <div className="flex flex-col gap-1">
                    {existentes.map((c) => {
                      const ativo = kCabo === c.chave;
                      const cor = c.livre ? infoFibra(c.nome, String(c.livre))?.c ?? null : null;
                      return (
                        <button
                          key={c.chave}
                          type="button"
                          disabled={!c.livre && !ativo}
                          onClick={() => !ativo && continuarCabo(i, c.nome, c.livre)}
                          title={`Fibras em uso: ${c.usadas.map((f) => `F${f}`).join(", ") || "nenhuma"}`}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[11px] ${ativo ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-300 bg-white text-slate-700 hover:border-emerald-500"} disabled:opacity-50`}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
                          <span className={`shrink-0 text-[10px] ${ativo ? "text-emerald-100" : "text-slate-500"}`}>
                            em uso {c.usadas.map((f) => `F${f}`).join(" ")}
                          </span>
                          {ativo ? (
                            <span className="shrink-0 text-[10px] font-bold">✓ neste cabo</span>
                          ) : c.livre ? (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">
                              <span className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: cor?.hex }} />
                              F{c.livre} (troque abaixo)
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] text-red-600">cheio</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {tiposDeCabo.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-slate-500 mb-1">{cabosSaindoDe(i).length ? "Ou um cabo novo do cadastro:" : "Cabo do cadastro:"}</p>
                <div className="flex flex-wrap gap-1">
                  {tiposDeCabo.map((t) => {
                    const ativo = !!kCabo && tiposCabo[kCabo] === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => (caboTravado && !ativo
                          ? setAviso("Cabo compartilhado: para trocar o tipo use Editar em todas, ou Separar só nesta rota.")
                          : usarTipoCabo(i, t))}
                        className={`text-[11px] rounded-full border px-2 py-0.5 ${ativo ? "bg-indigo-600 border-indigo-600 text-white" : caboTravado ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-slate-300 bg-white text-slate-700 hover:border-indigo-400"}`}
                        title={resumoItem(t)}
                      >
                        {t.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {/* Nome do cabo: criado sozinho ao escolher o cabo; o lápis permite renomear */}
              {(l.cabo_entrada.trim() || renomear?.i === i) && (
                <div className="col-span-2 flex items-center gap-1 text-[10px] text-slate-500">
                  {renomear?.i === i ? (
                    <input
                      autoFocus
                      className={campo}
                      list="cabos-conhecidos"
                      value={l.cabo_entrada.replace(/ \[CB-\d{6}\]$/, "")}
                      onChange={(e) => {
                        const cod = codigoDoCabo(l.cabo_entrada);
                        if (!cod) return alterar(i, { cabo_entrada: e.target.value });
                        // cabo com código: o nome muda em todos os trechos dele, o código fica
                        const v = `${e.target.value} [${cod}]`;
                        mudar((ls) => ls.map((x) => (codigoDoCabo(x.cabo_entrada) === cod ? { ...x, cabo_entrada: v } : x)));
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      onBlur={() => {
                        const cod = codigoDoCabo(l.cabo_entrada);
                        if (cod) {
                          const v = comCodigo(l.cabo_entrada, cod);
                          mudar((ls) => ls.map((x) => (codigoDoCabo(x.cabo_entrada) === cod ? { ...x, cabo_entrada: v } : x)));
                          setRenomear(null);
                          return;
                        }
                        // o tipo do cabo vai junto para o nome novo
                        const tipoAntigo = tiposCabo[chaveCabo(renomear.antigo)];
                        if (tipoAntigo && l.cabo_entrada.trim()) setTiposCabo((t) => ({ ...t, [chaveCabo(l.cabo_entrada)]: t[chaveCabo(l.cabo_entrada)] ?? tipoAntigo }));
                        setRenomear(null);
                      }}
                      placeholder="Nome do cabo"
                    />
                  ) : (
                    <>
                      <span className="min-w-0 truncate">Cabo: <span className="font-medium text-slate-700">{semCodigo(l.cabo_entrada)}</span></span>
                      {codigoDoCabo(l.cabo_entrada) ? (
                        <EtiquetaCabo codigo={codigoDoCabo(l.cabo_entrada)!} />
                      ) : !/^Cordão /i.test(l.cabo_entrada) && (
                        <span className="shrink-0 rounded border border-dashed border-slate-300 px-1 text-[10px] text-slate-400" title="O código do cabo é gerado ao salvar a rota">código ao salvar</span>
                      )}
                      {caboTravado ? (
                        <span className="shrink-0 px-1 text-slate-400" title="Cabo compartilhado: use Editar em todas">🔒</span>
                      ) : (
                        <button type="button" onClick={() => setRenomear({ i, antigo: l.cabo_entrada })} className="shrink-0 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title="Renomear o cabo">
                          ✎
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {l.tipo === "predio" ? (
                <p className="col-span-2 rounded-lg bg-sky-50 px-2 py-1.5 text-[10px] text-sky-800">
                  O cabo entra inteiro no prédio: a fibra de cada CDOI você escolhe na janela do prédio.
                </p>
              ) : (
                campoFibra(i)
              )}
              <div>
                <label className={rot}>Distância (m){l.dist_auto && dm !== null ? " · pelo mapa" : ""}</label>
                <input className={campo} inputMode="decimal" value={l.distancia_m} onChange={(e) => alterar(i, { distancia_m: e.target.value, dist_auto: false })} />
                {l.mesmoPoste ? (
                  <p className="text-[10px] text-slate-500">link no mesmo poste · sem reserva</p>
                ) : dm !== null && (
                  <p className="text-[10px] text-slate-500">
                    traçado {formatMetros(dm)} + reserva {reservaTrecho(linhas[i - 1]?.tipo, l.tipo, calc)} m
                  </p>
                )}
                {!l.dist_auto && !l.mesmoPoste && dm !== null && (
                  <button type="button" onClick={() => alterar(i, { dist_auto: true })} className="text-[11px] text-indigo-600 hover:underline">
                    usar o mapa ({formatMetros(dm + reservaTrecho(linhas[i - 1]?.tipo, l.tipo, calc))})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {l.tipo !== "olt" && l.tipo !== "onu" && !soPredio && <div className="grid grid-cols-2 gap-2">{campoSplitter(i)}</div>}

        <details className="group">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 list-none">
            <ChevronDown className="w-3.5 h-3.5 transition group-open:rotate-180" /> Mais detalhes
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="col-span-2">
              <label className={rot}>Coordenadas (lat, lon)</label>
              <input className={campo} value={l.coords} onChange={(e) => alterar(i, { coords: e.target.value })} placeholder="clique no mapa ou -28.69170, -49.34236" />
            </div>
            {/* Porta em texto: só aparece em caixa que já veio com ela (importação do GeoGrid); OLT e DIO usam a estação */}
            {l.tipo !== "olt" && l.tipo !== "dio" && l.porta.trim() !== "" && (
              <div className="col-span-2">
                <label className={rot}>Porta (veio da importação)</label>
                <input className={campo} value={l.porta} onChange={(e) => alterar(i, { porta: e.target.value })} />
              </div>
            )}
            {!pots && i > 0 && (
              <>
                <div>
                  <label className={rot}>Potência chegada</label>
                  <input className={campo} inputMode="decimal" value={l.potencia_entrada} onChange={(e) => alterar(i, { potencia_entrada: e.target.value })} />
                </div>
                <div>
                  <label className={rot}>Potência saída</label>
                  <input className={campo} inputMode="decimal" value={l.potencia_saida} onChange={(e) => alterar(i, { potencia_saida: e.target.value })} />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className={rot}>Observação</label>
              <input className={campo} value={l.obs} onChange={(e) => alterar(i, { obs: e.target.value })} />
            </div>
          </div>
        </details>
        {pots && pots[i] && i > 0 && <p className="text-[10px] text-slate-500 leading-tight">Potência: −{pots[i].detalhe}</p>}
        {l.tipo !== "hub" && botaoSeparar(i)}
      </div>
    );
  }

  const nomeFerramenta =
    ferramenta === "selecionar" ? "" : ferramenta === "poste" ? "poste" : ferramenta === "estacao" ? "estação" : PALETA.find((p) => p.t === ferramenta)?.rot ?? "";
  const depoisDe = tipoDaFerramenta(ferramenta) && sel !== null && sel < linhas.length - 1 ? linhas[sel] : null;
  const dica =
    ferramenta === "estacao"
      ? estacoesRede.length
        ? "Clique no mapa onde fica a estação nova, ou na estação que já existe para usar outra porta PON."
        : "Clique no mapa onde fica a estação: entram a OLT, o DIO e o cordão entre eles."
      : depoisDe
        ? `O novo ${nomeFerramenta} entra logo depois de "${depoisDe.nome}" (selecionado).`
        : ferramenta === "selecionar"
      ? sel !== null && !posDe(linhas[sel])
        ? `Clique no mapa onde fica "${linhas[sel].nome || `elemento ${sel + 1}`}".`
        : sel !== null && sel > 0
          ? "Cabo selecionado (amarelo): clique nele de novo para criar um poste · arraste postes e caixas para ajustar"
          : "Clique num cabo para editar · arraste os ícones para mover · escolha um tipo acima para adicionar"
      : ferramenta === "poste"
        ? "Clique nos postes do caminho. Depois escolha o tipo da próxima caixa e clique onde ela fica."
        : linhas.length === 0
          ? pontosRede.length
            ? `Clique numa caixa da rede (ícones claros) para continuar a partir dela, ou no mapa para colocar a ${nomeFerramenta}.`
            : `Clique no mapa onde fica a ${nomeFerramenta}. Ela é o início da rota.`
          : `Clique no mapa para colocar ${nomeFerramenta} no fim, em cima de um cabo para inserir no meio, ou num ícone para o mesmo local${pendentes.length ? ` (o cabo passa pelos ${pendentes.length} poste${pendentes.length > 1 ? "s" : ""} marcados)` : ""}. Esc para parar.`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <datalist id="cabos-conhecidos">
        {nomesCabos.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Barra do topo */}
      <BarraTopo
        nome={nome}
        onNome={setNome}
        rotaNova={!inicial}
        nomeComErro={!!erro && !nome.trim()}
        elementos={linhas.length}
        distancia={totalDist}
        potFinal={potFinal}
        pendencias={pendencias.length}
        onPendencias={() => setVerPendencias((v) => !v)}
        verCalc={verCalc}
        onCalc={() => setVerCalc((v) => !v)}
        podeDesfazer={pendentes.length > 0 || historico.length > 0}
        onDesfazer={desfazer}
        onCancelar={onCancelar}
        onSalvar={salvar}
        salvando={salvando}
      />

      {erro && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} aria-label="Fechar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:h-[calc(100vh-190px)] lg:min-h-[560px]">
        {/* Mapa com a paleta */}
        <div className="relative h-[60vh] min-h-[420px] lg:h-full">
          <RotaEditorMapa
            pontos={pontosMapa}
            trechosFixos={trechosFixos}
            selecionado={sel}
            ferramenta={ferramenta}
            pendentes={pendentes}
            centroPadrao={centroPadrao}
            onSelect={(i) => setSel(i)}
            onClicarMapa={clicarMapa}
            onMoverElemento={(i, lat, lon) => (
              travada(i) ? setAviso("O tronco é da rota-mãe: mexa nele lá.")
              : outrasComCaixa(i).length ? setMoverTodas({ i, lat, lon })
              : alterar(i, { coords: fmtCoord({ lat, lon }) })
            )}
            onMoverVertice={(i, k, lat, lon) => (travada(i) ? setAviso("O tronco é da rota-mãe: mexa nele lá.") : alterar(i, { vertices: linhas[i].vertices.map((v, j) => (j === k ? { lat, lon } : v)) }))}
            onRemoverVertice={(i, k) => (travada(i) ? setAviso("O tronco é da rota-mãe: mexa nele lá.") : alterar(i, { vertices: linhas[i].vertices.filter((_, j) => j !== k) }))}
            onInserirCurva={(i, lat, lon) => (travada(i) ? setAviso("O tronco é da rota-mãe: mexa nele lá.") : inserirCurva(i, lat, lon))}
            onInserirElemento={(i, lat, lon) => (travada(i) ? setAviso("O tronco é da rota-mãe: insira caixas nele lá.") : inserirElemento(i, lat, lon))}
            focoTrecho={focoTrecho}
            onRemoverPendente={(k) => setPendentes((ps) => ps.filter((_, j) => j !== k))}
            rede={pontosRede}
            redeCabos={redeInfo.cabos}
            onClicarRede={clicarRede}
          />

          {/* Paleta de ferramentas */}
          <PaletaFerramentas ferramenta={ferramenta} temElementos={linhas.length > 0} onEscolher={(f) => { setFerramenta(f); setAviso(null); }} />

          {/* Dica do que o clique faz */}
          <div className="absolute bottom-14 sm:bottom-6 left-1/2 -translate-x-1/2 z-[500] max-w-[90%] flex flex-col items-center gap-1.5 pointer-events-none">
            {aviso && <p className="pointer-events-auto rounded-xl bg-amber-500 text-white text-xs font-medium px-3 py-1.5 shadow">{aviso}</p>}
            {pendentes.length > 0 && (
              <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs px-3 py-1.5 shadow">
                <b>{pendentes.length}</b> poste{pendentes.length > 1 ? "s" : ""} marcado{pendentes.length > 1 ? "s" : ""}
                <button type="button" onClick={() => setPendentes((p) => p.slice(0, -1))} className="underline">desfazer</button>
                <button type="button" onClick={() => setPendentes([])} className="underline">limpar</button>
              </div>
            )}
            <p className="rounded-xl bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow text-center pointer-events-auto">
              {dica}
              {depoisDe && (
                <button type="button" onClick={() => setSel(null)} className="ml-2 underline font-semibold text-amber-300">
                  colocar no fim
                </button>
              )}
            </p>
          </div>

        </div>

        {/* Lista da rota */}
        <aside className="border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col min-h-0 bg-white">
          {verPendencias && linhas.length > 0 && (
            <div className="p-3 border-b border-slate-200 bg-amber-50/60">
              <p className="text-xs font-semibold text-slate-800 mb-1.5">
                {pendencias.length ? "Falta resolver para salvar (só equipamentos e cabos do cadastro):" : "Tudo certo para salvar."}
              </p>
              <ul className="space-y-1 max-h-40 overflow-auto">
                {pendencias.map((p, k) => (
                  <li key={k}>
                    <button type="button" onClick={() => setSel(p.i)} className="w-full text-left text-[11px] text-amber-900 hover:underline">
                      • {p.msg}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {verCalc && (
            <div className="p-3 border-b border-slate-200 bg-indigo-50/50 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input type="checkbox" checked={calc.auto} onChange={(e) => setCalc((c) => ({ ...c, auto: e.target.checked }))} />
                Calcular a potência automaticamente
              </label>
              {calc.auto && (
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["atenuacao_db_km", "Fibra dB/km"],
                    ["emenda_db", "Fusão dB"],
                    ["conector_db", "Conector dB"],
                  ] as const).map(([k, r]) => (
                    <div key={k}>
                      <label className={rot}>{r}</label>
                      <input
                        className={campo}
                        inputMode="decimal"
                        defaultValue={String(calc[k]).replace(".", ",")}
                        onChange={(e) => { const v = n(e.target.value); if (v !== undefined) setCalc((c) => ({ ...c, [k]: v })); }}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {([
                  ["reserva_caixa_m", "Reserva CTO/CEO/CT/HUB (m por lado)", 15],
                  ["reserva_cdoi_m", "Reserva CDOI (m)", 2],
                ] as const).map(([k, r0, padrao]) => (
                  <div key={k}>
                    <label className={rot}>{r0}</label>
                    <input
                      className={campo}
                      inputMode="decimal"
                      defaultValue={String(calc[k] ?? padrao).replace(".", ",")}
                      onChange={(e) => {
                        const v = n(e.target.value);
                        if (v === undefined) return;
                        const novo = { ...calc, [k]: v };
                        setCalc(novo);
                        setLinhas((ls) => recalcular(ls, novo));
                      }}
                    />
                  </div>
                ))}
                <p className="col-span-2 text-[10px] text-slate-500">
                  A metragem de cada trecho soma o traçado e as reservas: caixa no meio fica com 2 × {calc.reserva_caixa_m ?? 15} m, a ponta só com {calc.reserva_caixa_m ?? 15} m. É o que o OTDR mede.
                </p>
              </div>
              {calc.auto && tx === undefined && linhas.length > 0 && (
                <p className="text-xs text-amber-700">Informe a potência da porta PON no elemento 1 (OLT).</p>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto p-3">
            {linhas.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 text-slate-500">
                <IconeElemento tipo="olt" tamanho={44} />
                <p className="mt-3 font-semibold text-slate-800">Comece pela estação</p>
                <button
                  type="button"
                  onClick={() => { setFerramenta("estacao"); setAviso(null); }}
                  className="mt-2 flex items-center gap-2 rounded-xl bg-slate-900 text-white text-sm font-semibold px-4 py-2 shadow hover:bg-slate-800"
                >
                  <IconeElemento tipo="olt" tamanho={20} /> Montar estação (OLT + DIO)
                </button>
                <p className="mt-1 text-[11px] text-slate-500">depois clique no mapa onde ela fica</p>
                {estacoesRede.length > 0 && (
                  <div className="mt-4 w-full max-w-[310px] text-left">
                    <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">ou outra porta numa estação que já existe</p>
                    <ul className="space-y-2">
                      {estacoesRede.map((est) => (
                        <li key={est.chave} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-3 py-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200"><IconeElemento tipo="olt" tamanho={20} /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-800">{est.olt.nome}</span>
                              <span className="block truncate text-[10px] text-slate-500">PON em uso: {est.portas.join(", ") || "nenhuma"}</span>
                            </span>
                          </div>
                          <p className="px-3 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Em qual DIO?</p>
                          <div className="space-y-1 p-2 pt-1">
                            {est.dios.map((d) => (
                              <button
                                key={d.chave}
                                type="button"
                                onClick={() => montarNaEstacao(est, d)}
                                className="group flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50"
                              >
                                <IconeElemento tipo="dio" tamanho={18} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-slate-800">{d.dio.nome}{d.dio.codigo ? <span className="ml-1 font-mono text-[10px] font-normal text-slate-400">#{d.dio.codigo}</span> : null}</span>
                                  <span className="mt-0.5 flex flex-wrap gap-1">
                                    {d.portas.map((pt) => (
                                      <span key={pt} className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-800">PON {pt}</span>
                                    ))}
                                  </span>
                                </span>
                                <span className="shrink-0 rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white opacity-90 group-hover:opacity-100">+ porta</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => montarNaEstacao(est, null)}
                              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              <Plus className="h-3.5 w-3.5" /> DIO novo nesta estação
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pontosRede.length > 0 && (
                  <p className="mt-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 max-w-[280px]">
                    <b>Ramo de uma rota existente?</b> Clique na caixa da rede (ícones claros no mapa) de onde ele sai: o caminho desde a OLT é
                    copiado e você só continua.
                  </p>
                )}
                <ol className="mt-2 text-xs text-left space-y-1.5 max-w-[260px]">
                  <li><b>1.</b> Monte a <b>estação</b> (OLT + DIO) clicando no mapa e escolha as portas no cartão.</li>
                  <li><b>2.</b> Use <b>Poste</b> para marcar o caminho do cabo (opcional).</li>
                  <li><b>3.</b> Escolha <b>CEO, HUB, CTO…</b> e clique onde cada caixa fica. Clicando em cima de um cabo, ela entra no meio.</li>
                  <li><b>4.</b> Clique num item da lista para informar cabo, fibra e splitter.</li>
                </ol>
              </div>
            ) : (
              <>
              {estacao && (
                <div className={`mb-3 ${sel === 0 || sel === 1 ? "ring-2 ring-indigo-300 rounded-2xl" : ""}`}>
                  <EstacaoOltDio
                    dados={estacao}
                    ponEmUso={ponEmUso}
                    dioEmUso={dioEmUso}
                    oltTravada={outrasComCaixa(0).length > 0}
                    dioTravado={outrasComCaixa(1).length > 0}
                    olts={olts}
                    dios={dios}
                    tiposCabo={tiposDeCabo}
                    onMudar={troncoEf >= 2 ? () => setAviso("A estação é do tronco: edite na rota-mãe.") : aplicarEstacao}
                    onVerSaida={linhas[2] ? () => { setSel(2); setFerramenta("selecionar"); setFocoTrecho((f) => ({ i: 2, vez: (f?.vez ?? 0) + 1 })); } : undefined}
                  />
                  {troncoEf < 2 && (outrasComCaixa(0).length > 0 || outrasComCaixa(1).length > 0) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-900">
                      <span>🔒 Estação compartilhada com <b>{listaRotas([...outrasComCaixa(0), ...outrasComCaixa(1)])}</b>: OLT e DIO só mudam em todas.</span>
                      <span className="ml-auto flex gap-1">
                        {outrasComCaixa(0).length > 0 && <button type="button" onClick={() => abrirEditarTodas("caixa", 0)} className="rounded-md bg-sky-600 px-2 py-0.5 font-semibold text-white hover:bg-sky-700">✎ OLT</button>}
                        {outrasComCaixa(1).length > 0 && <button type="button" onClick={() => abrirEditarTodas("caixa", 1)} className="rounded-md bg-sky-600 px-2 py-0.5 font-semibold text-white hover:bg-sky-700">✎ DIO</button>}
                      </span>
                    </div>
                  )}
                  {linhas.length > 2 && <p className="mt-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Fora da estação</p>}
                </div>
              )}
              {sepEf && (
                <div className="mb-2 space-y-1.5 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900">
                  <p>
                    ✂ Ao salvar, esta rota termina em <b>{linhas[sepEf.k]?.nome}</b> e {linhas.length - 1 - sepEf.k === 1 ? "a caixa seguinte vira" : `as ${linhas.length - 1 - sepEf.k} caixas seguintes viram`} uma sub-rota que sai dali.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs"
                      value={sepEf.nome}
                      onChange={(e) => setSeparar({ ...sepEf, nome: e.target.value })}
                      placeholder="Nome da sub-rota"
                    />
                    <button type="button" onClick={() => setSeparar(null)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                      desfazer
                    </button>
                  </div>
                </div>
              )}
              {predioDono && (
                <p className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  Esta é a rota de uma CDOI do prédio <b>{predioDono.nome}</b>. Fibra, splitter, andar e nome são definidos na janela do prédio (Árvore → clique no prédio → Editar):
                  mudanças feitas aqui voltam ao que está no prédio quando ele for salvo.
                </p>
              )}
              {paiEf && (
                <p className="mb-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-900">
                  <b>Sub-rota</b> de <b>{nomeMae}</b>
                  {troncoEf ? <>, saindo de <b>{linhas[troncoEf - 1]?.nome}</b>{paiEf.meia_porta ? " pela meia porta" : ""}. Os {troncoEf} primeiros elementos são o tronco (🔒).</> : ". A caixa de onde ela saía não existe mais na rota-mãe."}
                </p>
              )}
              <ol>
                {linhas.map((l, i) => {
                  if (estacao && i < 2) return null;
                  const ativo = i === sel;
                  const info = i > 0 ? infoFibra(l.cabo_entrada, l.fibra_entrada) : null;
                  const pot = potDe(i);
                  const res = i > 0 ? reservaTrecho(linhas[i - 1].tipo, l.tipo, calc) : 0;
                  const emenda = i > 0 && linhas[i + 1] && l.cabo_entrada.trim() && linhas[i + 1].cabo_entrada.trim() && chaveCabo(l.cabo_entrada) !== chaveCabo(linhas[i + 1].cabo_entrada);
                  return (
                    <li key={i} ref={(el) => { itemRefs.current[i] = el; }}>
                      {/* Trecho de cabo que chega */}
                      {i > 0 && (
                        <div className="group/trecho relative flex items-stretch gap-2 pl-[22px]">
                          <button
                            type="button"
                            onClick={() => inserirNaLista(i)}
                            className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/trecho:opacity-100 focus:opacity-100 rounded-full border border-indigo-300 bg-white text-indigo-700 text-[10px] font-semibold px-2 py-0.5 shadow-sm hover:bg-indigo-50"
                            title="Inserir um elemento entre estes dois"
                          >
                            + inserir aqui
                          </button>
                          <span className="w-[6px] rounded-full border-2 border-slate-800 my-0.5" style={{ background: info?.c.hex ?? "#cbd5e1", minHeight: 26 }} />
                          <p className="text-[10.5px] text-slate-500 py-1 leading-tight truncate">
                            {l.cabo_entrada ? <span className="text-slate-700 font-medium">{l.cabo_entrada.split(" - ")[0]}</span> : <span className="text-amber-600">cabo não informado</span>}
                            {info ? ` · ${info.c.rotulo} ${info.c.nome.toLowerCase()}` : ""}
                            {l.distancia_m ? ` · ${formatMetros(n(l.distancia_m) ?? 0)}${l.dist_auto && res ? ` (c/ ${res} m reserva)` : ""}` : ""}
                            {l.vertices.length ? ` · ${l.vertices.length} poste${l.vertices.length > 1 ? "s" : ""}` : ""}
                          </p>
                        </div>
                      )}
                      <div
                        onClick={() => setSel(ativo ? null : i)}
                        className={`group rounded-xl border px-2.5 py-2 cursor-pointer transition ${
                          ativo ? "border-indigo-400 ring-2 ring-indigo-100 bg-white shadow-sm" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${ativo ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                            {i + 1}
                          </span>
                          <span className="relative">
                            <IconeElemento tipo={l.tipo} tamanho={26} />
                            {pendentesDe.has(i) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" title="Tem pendência" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold leading-tight truncate ${l.nome.trim() ? "text-slate-900" : "text-red-500"}`}>{travada(i) ? "🔒 " : sepEf && i > sepEf.k ? "✂ " : ""}{l.nome || "sem nome"}</p>
                            <p className="text-[10.5px] text-slate-500 truncate flex items-center gap-1">
                              {TIPO_ELEMENTO_LABEL[l.tipo].split(" (")[0]}
                              {i > 0 && <span className="rounded bg-slate-100 px-1 tabular-nums text-slate-600" title="Metragem desde a OLT (para o OTDR)">{formatMetros(acumulado[i])}</span>}
                              {l.splitter ? ` · ${l.splitter}` : ""}
                              {(l.tipo === "hub" || l.tipo === "cto") && l.passagem && <span className="rounded bg-slate-200 px-1 text-slate-600">passagem</span>}
                              {l.tipo === "hub" && l.meiaPorta && !l.passagem && <span className="rounded bg-violet-100 px-1 text-violet-700">½ porta</span>}
                              {!posDe(l) && <span className="text-amber-600 flex items-center gap-0.5"><MapPin className="w-3 h-3" />sem local</span>}
                              {emenda && <span className="rounded bg-amber-100 text-amber-800 px-1">emenda</span>}
                            </p>
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums ${nivelCor(pot)}`}>{pot !== undefined ? fmtDbm(pot).replace(" dBm", "") : ""}</span>
                          <span className={`flex ${travada(i) ? "hidden" : ativo ? "" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button type="button" onClick={() => remover(i)} className="p-1 rounded hover:bg-red-100 text-red-600" aria-label="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                          </span>
                        </div>
                        {ativo && painel(i)}
                      </div>
                    </li>
                  );
                })}
              </ol>
              </>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50/60">
            <button
              type="button"
              onClick={() => {
                const tipo: TipoElementoRota = tipoDaFerramenta(ferramenta) ?? (linhas.length ? "ceo" : "olt");
                const ant = linhas[linhas.length - 1];
                mudar((ls) => [...ls, { ...linhaVazia(tipo), nome: nomeAuto(tipo, ls, nomesRede), codigo: tipo === "olt" ? "" : proximoCodigo(ls), dist_auto: true, cabo_entrada: herdaCabo(ant) ? ant.cabo_entrada : "", fibra_entrada: herdaCabo(ant) ? ant.fibra_entrada : "" }]);
                setSel(linhas.length);
                setFerramenta("selecionar");
              }}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 rounded-lg border border-dashed border-indigo-300 py-1.5 hover:bg-indigo-50"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar elemento sem o mapa
            </button>
            <input className={campo} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação da rota (opcional)" />
          </div>
        </aside>
      </div>

      {/* Editar em todas as rotas */}
      {editarTodas && (() => {
        const { tipo, i } = editarTodas;
        const l = linhas[i];
        const afetadas = tipo === "caixa" ? outrasComCaixa(i) : outrasComCabo(i);
        const mostraTipo = tipo === "caixa" && l.tipo !== "olt" && l.tipo !== "dio";
        return (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setEditarTodas(null)}>
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 bg-sky-700 px-4 py-3 text-white">
                {tipo === "caixa" ? <IconeElemento tipo={l.tipo} tamanho={22} /> : <IconeCabo tamanho={22} />}
                <div className="min-w-0">
                  <p className="text-sm font-bold">Editar em todas as rotas</p>
                  <p className="truncate text-[11px] text-sky-100">{tipo === "caixa" ? l.nome : semCodigo(l.cabo_entrada)}{l.codigo && tipo === "caixa" ? ` · código ${l.codigo}` : ""}{tipo === "cabo" ? ` · ${codigoDoCabo(l.cabo_entrada)}` : ""}</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <label className={rot}>{tipo === "caixa" ? "Nome da caixa" : "Nome do cabo"}</label>
                  <input
                    autoFocus
                    className={campo}
                    value={editarTodas.nome}
                    onChange={(e) => setEditarTodas({ ...editarTodas, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") aplicarEditarTodas(); }}
                  />
                  {tipo === "cabo" && <p className="mt-0.5 text-[10px] text-slate-500">O código {codigoDoCabo(l.cabo_entrada)} continua o mesmo: é ele que diz que o cabo é o mesmo.</p>}
                </div>
                {mostraTipo && (
                  <div>
                    <label className={rot}>Tipo</label>
                    <select className={campo} value={editarTodas.tipoEl} onChange={(e) => setEditarTodas({ ...editarTodas, tipoEl: e.target.value as TipoElementoRota })}>
                      {Object.entries(TIPO_ELEMENTO_LABEL).filter(([k]) => k !== "predio" && k !== "olt").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                )}
                {tipo === "cabo" && (
                  <div>
                    <label className={rot}>Tipo do cabo</label>
                    <select className={campo} value={editarTodas.tipoCabo} onChange={(e) => setEditarTodas({ ...editarTodas, tipoCabo: e.target.value })}>
                      <option value="">— escolha —</option>
                      {tiposDeCabo.map((t) => <option key={t.id} value={t.id}>{t.nome} · {resumoItem(t)}</option>)}
                    </select>
                  </div>
                )}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Muda também em {afetadas.length} rota{afetadas.length !== 1 ? "s" : ""}</p>
                  <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-slate-700">
                    {[...new Map(afetadas.map((r) => [r.id, r])).values()].map((r) => (
                      <li key={r.id} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{r.nome}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-[11px] text-slate-500">A mudança aparece aqui na hora; as outras rotas são gravadas quando você salvar esta.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={aplicarEditarTodas} disabled={!editarTodas.nome.trim()} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                    Aplicar em todas
                  </button>
                  <button type="button" onClick={() => setEditarTodas(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Caixa com splitters de várias portas: de qual porta sai a sub-rota */}
      {escolhaPorta && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setEscolhaPorta(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
              <IconeElemento tipo="hub" tamanho={22} />
              <div className="min-w-0">
                <p className="text-sm font-bold">De qual porta sai esta sub-rota?</p>
                <p className="truncate text-[11px] text-slate-300">{escolhaPorta.nome} tem splitter de {escolhaPorta.opcoes.length} portas PON</p>
              </div>
            </div>
            <ul className="space-y-1.5 p-3">
              {escolhaPorta.opcoes.map((o) => {
                const el = o.rota.elementos[o.i];
                const c = corFibra(el.fibra_entrada, el.cabo_entrada);
                return (
                  <li key={o.dona.id}>
                    <button type="button" onClick={() => comecarSubRota(o.rota, o.i)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-indigo-400 hover:bg-indigo-50">
                      <IconeElemento tipo="olt" tamanho={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800">{portaPonDaRota(o.dona).rotulo}</span>
                        <span className="block truncate text-[11px] text-slate-500">rota {o.dona.nome}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-600">
                          {el.fibra_entrada ? <><span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/25" style={{ background: c.hex }} />chega na {c.rotulo} {c.nome.toLowerCase()}</> : "fibra não informada"}
                          {el.splitter && <span className="ml-1 rounded bg-slate-900 px-1 text-[10px] font-bold text-white">{el.splitter}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white">Sair daqui</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 px-3 py-2 text-right">
              <button type="button" onClick={() => setEscolhaPorta(null)} className="rounded-lg border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Caixa compartilhada arrastada no mapa */}
      {moverTodas && linhas[moverTodas.i] && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <IconeElemento tipo={linhas[moverTodas.i].tipo} tamanho={20} /> Mover {linhas[moverTodas.i].nome}?
            </p>
            <p className="mt-1.5 text-xs text-slate-600">
              Esta caixa também está em <b>{listaRotas(outrasComCaixa(moverTodas.i))}</b>. É a mesma caixa no poste: o local muda em todas as rotas.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const { i, lat, lon } = moverTodas;
                  const l = linhas[i];
                  alterar(i, { coords: fmtCoord({ lat, lon }) });
                  setGlobais((g) => [...g, { tipo: "caixa", chave: chaveLinha(l), nomeVelho: l.nome, lat, lon }]);
                  setMoverTodas(null);
                  setAviso("Local mudado aqui; as outras rotas recebem quando você salvar esta.");
                }}
                className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Mover em todas
              </button>
              <button
                type="button"
                onClick={() => { setMoverTodas(null); setLinhas((ls) => [...ls]); }}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Não mover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Selo de caixa/cabo usado em mais de uma rota: o que é e as duas saídas (todas ou separar) */
function SeloCompartilhado({ titulo, texto, onEditar, onSeparar, confirmando, textoConfirma, onConfirmar, onCancelar }: {
  titulo: string;
  texto: React.ReactNode;
  onEditar: () => void;
  onSeparar?: () => void;
  confirmando: boolean;
  textoConfirma: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-2.5 text-[11px] text-sky-950">
      <p className="flex items-start gap-1.5">
        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[9px] text-white">🔒</span>
        <span><b>{titulo}.</b> {texto}</span>
      </p>
      {confirmando ? (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <p>{textoConfirma}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={onConfirmar} className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700">Separar</button>
            <button type="button" onClick={onCancelar} className="rounded-md px-2 py-1 text-amber-800 underline">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className={`mt-2 grid gap-1.5 ${onSeparar ? "grid-cols-2" : "grid-cols-1"}`}>
          <button type="button" onClick={onEditar} className="rounded-lg bg-sky-600 px-2 py-1.5 font-semibold text-white shadow-sm hover:bg-sky-700">✎ Editar em todas</button>
          {onSeparar && (
            <button type="button" onClick={onSeparar} className="rounded-lg border border-sky-300 bg-white px-2 py-1.5 font-semibold text-sky-800 hover:bg-sky-50">✂ Separar só nesta rota</button>
          )}
        </div>
      )}
    </div>
  );
}
