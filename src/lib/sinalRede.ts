// =====================
// Rede livre: o sinal é calculado, nunca gravado.
// A rede é física (elementos em caixas_rede, cabos com caminho em cabos_rede) e as ligações ficam dentro de cada
// caixa (Unifilar). Daqui sai, a partir de cada porta PON: por onde a luz passa, a potência em cada ponto, as
// "rotas" (um caminho da PON até cada caixa onde a luz termina) e os conflitos (duas PONs se encontrando, laço,
// luz subindo um splitter pela perna).
// =====================
import { chaveCabo, type CaboRede } from "./cabosRede";
import { portasPara, type CaixaRede, type LadoCabo, type PontaFibra, type SplitterCaixa } from "./caixasRede";
import {
  calcularPotencias,
  CALCULO_PADRAO,
  comprimentoTracado,
  perdaSplitter,
  reservaTrecho,
  type CalculoPotencia,
  type ElementoRota,
  type EntradaPotencia,
  type RotaOptica,
  type TipoElementoRota,
  type TrechoCabo,
} from "./rotaOptica";

export interface OpcoesSinal {
  calculo?: CalculoPotencia;
  /** Potência de saída das portas PON de uma OLT (dBm); sem ela, 5 dBm */
  txDe?: (olt: CaixaRede) => number | undefined;
  /** Perda do modelo de splitter cadastrado */
  perdaModelo?: (id?: string) => number | undefined;
}

/** Um ponto dentro de uma caixa */
export type PontoRede =
  | { k: "fibra"; cabo: string; fibra: number; lado: LadoCabo }
  | { k: "entrada"; spl: string }
  | { k: "porta"; spl: string; porta: number }
  | { k: "pon"; porta: string }
  | { k: "adaptador"; n: number };

export function idPontoRede(p: PontoRede): string {
  switch (p.k) {
    case "fibra": return `f:${chaveCabo(p.cabo)}|${p.fibra}|${p.lado}`;
    case "entrada": return `e:${p.spl}`;
    case "porta": return `p:${p.spl}|${p.porta}`;
    case "pon": return `o:${p.porta}`;
    case "adaptador": return `a:${p.n}`;
  }
}

/** Quem acende um ponto: a porta PON e a potência ali */
export interface SinalPonto {
  /** Chave da PON: "<chave da OLT>|<porta>" */
  pon: string;
  /** "OLT1 · PON 0/3/2" */
  rotulo: string;
  pot?: number;
}

export interface ConflitoSinal {
  tipo: "duas_pons" | "laco" | "contramao";
  caixa: string;
  /** Onde: ponto na caixa ou trecho de cabo */
  onde: string;
  pons: string[];
  texto: string;
}

export interface SinalRede {
  /** Um caminho por caixa onde a luz termina (formato das rotas de antes) */
  rotas: RotaOptica[];
  /** `${caixa}#${idPontoRede}` → quem acende */
  pontos: Map<string, SinalPonto>;
  /** `${chaveCabo}|${fibra}|${trecho}` → quem acende o trecho do cabo */
  trechos: Map<string, SinalPonto>;
  /** Caixas com sinal → as PONs que chegam nela */
  caixas: Map<string, Set<string>>;
  conflitos: ConflitoSinal[];
}

type Aresta = { a: PontoRede; b: PontoRede; tipo: "fusao" | "entrada" | "perna" | "nivel2" | "cordao" | "dio"; so?: "a>b" };

interface Passo {
  caixa: CaixaRede;
  cabo?: CaboRede;
  fibra?: number;
  /** Trecho do cabo que chega nesta caixa (índice no caminho do cabo) */
  trecho?: number;
  /** Splitters atravessados nesta caixa até a saída */
  splitters: SplitterCaixa[];
  passagem: boolean;
  /** Pontos desta caixa por onde a luz passou (para a potência) */
  pontosEntrada: string[];
  pontosSaida: string[];
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** Rótulo da PON: "OLT1 · PON 0/3/2" */
export function rotuloPon(olt: CaixaRede, porta: string): string {
  return `${olt.nome} · PON ${porta}`;
}

export function calcularSinal(elementos: CaixaRede[], cabos: CaboRede[], op: OpcoesSinal = {}): SinalRede {
  const calc = op.calculo ?? CALCULO_PADRAO;
  const elDe = new Map(elementos.map((e) => [e.chave, e]));
  const caboDe = new Map<string, CaboRede>();
  for (const c of cabos) if (c.caminho && c.caminho.length >= 2) caboDe.set(chaveCabo(c.nome), c);

  /** Lado da fibra nesta caixa (na ponta do cabo, o único que existe) */
  const ladoEm = (chave: string, p: PontaFibra): LadoCabo | undefined => {
    const c = caboDe.get(chaveCabo(p.cabo));
    if (!c?.caminho) return undefined;
    const i = c.caminho.indexOf(chave);
    if (i < 0) return undefined;
    if (i === 0) return "seg";
    if (i === c.caminho.length - 1) return "ant";
    return p.lado_cabo ?? "ant";
  };
  const fib = (chave: string, p: PontaFibra): PontoRede | null => {
    const lado = ladoEm(chave, p);
    return lado ? { k: "fibra", cabo: chaveCabo(p.cabo), fibra: p.fibra, lado } : null;
  };

  // ligações de cada caixa
  const arestasDe = new Map<string, Aresta[]>();
  for (const x of elementos) {
    const ar: Aresta[] = [];
    const add = (a: PontoRede | null, b: PontoRede | null, tipo: Aresta["tipo"], so?: "a>b") => { if (a && b) ar.push({ a, b, tipo, so }); };
    const avulsas = new Set<string>();
    for (const m of x.emendas ?? []) {
      const a = fib(x.chave, m.de), b = fib(x.chave, m.para);
      add(a, b, "fusao");
      if (a) avulsas.add(idPontoRede(a));
      if (b) avulsas.add(idPontoRede(b));
    }
    for (const g of x.regras_emenda ?? []) {
      const ca = caboDe.get(chaveCabo(g.de)), cb = caboDe.get(chaveCabo(g.para));
      const n = Math.min(ca?.capacidade ?? 12, cb?.capacidade ?? 12);
      for (let f = 1; f <= n; f++) {
        const a = fib(x.chave, { cabo: g.de, fibra: f }), b = fib(x.chave, { cabo: g.para, fibra: f });
        if (!a || !b || avulsas.has(idPontoRede(a)) || avulsas.has(idPontoRede(b))) continue;
        add(a, b, "fusao");
      }
    }
    for (const s of x.splitters ?? []) {
      if (s.entrada.fibra) add(fib(x.chave, s.entrada.fibra), { k: "entrada", spl: s.id }, "entrada", "a>b");
      if (s.entrada.splitter) add({ k: "porta", spl: s.entrada.splitter.id, porta: s.entrada.splitter.porta }, { k: "entrada", spl: s.id }, "nivel2", "a>b");
      for (const p of s.portas) if (p.saida) add({ k: "porta", spl: s.id, porta: p.numero }, fib(x.chave, p.saida), "perna", "a>b");
    }
    for (const c of x.cordoes ?? []) add({ k: "pon", porta: c.porta }, fib(x.chave, c.para), "cordao", "a>b");
    for (const a of x.adaptadores ?? []) {
      if (a.de) add(fib(x.chave, a.de), { k: "adaptador", n: a.n }, "dio");
      if (a.para) add({ k: "adaptador", n: a.n }, fib(x.chave, a.para), "dio");
    }
    arestasDe.set(x.chave, ar);
  }

  const pontos = new Map<string, SinalPonto>();
  const trechos = new Map<string, SinalPonto>();
  const caixasCom = new Map<string, Set<string>>();
  const conflitos: ConflitoSinal[] = [];
  const rotas: RotaOptica[] = [];
  const rotasVistas = new Set<string>();
  /** Quem já passou em cada nó (trecho de cabo ou splitter): para achar duas PONs e laço */
  const dono = new Map<string, string>();

  const conflito = (c: ConflitoSinal) => {
    if (!conflitos.some((x) => x.tipo === c.tipo && x.caixa === c.caixa && x.onde === c.onde)) conflitos.push(c);
  };

  for (const olt of elementos.filter((e) => e.tipo === "olt" && e.cordoes?.length)) {
    const tx = op.txDe?.(olt) ?? 5;
    for (const cordao of olt.cordoes!) {
      const pon = `${olt.chave}|${cordao.porta}`;
      const rotulo = rotuloPon(olt, cordao.porta);
      const visto = new Set<string>();
      /** A luz chega no ponto `p` da caixa `x`, com o caminho até aqui */
      const andar = (x: CaixaRede, entrada: PontoRede, trilha: Passo[]) => {
        const ar = arestasDe.get(x.chave) ?? [];
        const passo = trilha[trilha.length - 1];
        caixasCom.set(x.chave, (caixasCom.get(x.chave) ?? new Set()).add(rotulo));
        /** Saídas: fibra pela qual a luz deixa a caixa e os splitters atravessados até ela */
        const saidas: { q: PontoRede & { k: "fibra" }; spls: SplitterCaixa[]; pts: string[] }[] = [];
        const finais: { spls: SplitterCaixa[]; pts: string[] }[] = [];
        const spDe = (id: string) => (x.splitters ?? []).find((s) => s.id === id);

        const percorrer = (p: PontoRede, spls: SplitterCaixa[], pts: string[], vindoDe?: string) => {
          const id = idPontoRede(p);
          if (pts.includes(id)) return;
          const aqui = [...pts, id];
          if (p.k === "entrada") {
            const s = spDe(p.spl);
            if (!s) return;
            const nk = `${x.chave}|spl|${s.id}`;
            const outro = dono.get(nk);
            if (outro && outro !== pon) {
              conflito({ tipo: "duas_pons", caixa: x.chave, onde: `splitter ${s.relacao}`, pons: [outro, pon], texto: `No splitter ${s.relacao} da ${x.nome} chegariam duas PONs.` });
              return;
            }
            dono.set(nk, pon);
            const comS = [...spls, s];
            let algumaSai = false;
            for (const pt of portasPara(s.relacao, s.portas)) {
              const pp: PontoRede = { k: "porta", spl: s.id, porta: pt.numero };
              const sai = ar.filter((e) => idPontoRede(e.a) === idPontoRede(pp));
              if (!sai.length) continue;
              algumaSai = true;
              for (const e of sai) percorrer(e.b, comS, [...aqui, idPontoRede(pp)], idPontoRede(pp));
            }
            // porta livre ou com cliente: a luz termina aqui
            if (!algumaSai || portasPara(s.relacao, s.portas).some((pt) => !ar.some((e) => idPontoRede(e.a) === idPontoRede({ k: "porta", spl: s.id, porta: pt.numero })))) {
              finais.push({ spls: comS, pts: aqui });
            }
            return;
          }
          if (p.k === "fibra" && vindoDe !== undefined) {
            // chegou numa fibra pela ligação: é por ela que a luz sai da caixa
            saidas.push({ q: p, spls, pts: aqui });
            return;
          }
          // fibra que chegou (ou porta PON): segue pelas ligações
          const ligadas = ar.filter((e) => idPontoRede(e.a) === id || (!e.so && idPontoRede(e.b) === id));
          const contra = ar.filter((e) => e.so && e.tipo === "perna" && idPontoRede(e.b) === id);
          if (contra.length && !ligadas.length) {
            conflito({ tipo: "contramao", caixa: x.chave, onde: id, pons: [pon], texto: `Na ${x.nome}, a luz da ${rotulo} entraria no splitter pela perna.` });
            return;
          }
          for (const e of ligadas) {
            const outro = idPontoRede(e.a) === id ? e.b : e.a;
            if (outro.k === "adaptador") {
              const prox = ar.filter((z) => z !== e && (idPontoRede(z.a) === idPontoRede(outro) || idPontoRede(z.b) === idPontoRede(outro)));
              for (const z of prox) {
                const q = idPontoRede(z.a) === idPontoRede(outro) ? z.b : z.a;
                percorrer(q, spls, [...aqui, idPontoRede(outro)], id);
              }
              continue;
            }
            percorrer(outro, spls, aqui, id);
          }
          if (!ligadas.length && p.k === "fibra") {
            // nada ligado nela: se o cabo continua depois desta caixa, a fibra passa direto
            const c = caboDe.get(p.cabo)!;
            const i = c.caminho!.indexOf(x.chave);
            const meio = i > 0 && i < c.caminho!.length - 1;
            if (meio) saidas.push({ q: { ...p, lado: p.lado === "ant" ? "seg" : "ant" }, spls, pts: aqui });
            else finais.push({ spls, pts: aqui });
          }
        };
        percorrer(entrada, [], []);

        const passagem = saidas.length === 1 && !saidas[0].spls.length && finais.length === 0
          && entrada.k === "fibra" && saidas[0].q.cabo === entrada.cabo && saidas[0].q.fibra === entrada.fibra;

        // a luz termina nesta caixa (porta livre/cliente, fibra sem nada): um caminho até aqui
        const vistosFim = new Set<string>();
        for (const f of finais) {
          const k = f.spls.map((s) => s.id).join(">");
          if (vistosFim.has(k)) continue;
          vistosFim.add(k);
          emitir([...trilha.slice(0, -1), { ...passo, splitters: f.spls, passagem: false, pontosSaida: f.pts }]);
        }
        if (!saidas.length && !finais.length) emitir(trilha);

        for (const s of saidas) {
          const c = caboDe.get(s.q.cabo)!;
          const i = c.caminho!.indexOf(x.chave);
          const j = s.q.lado === "seg" ? i + 1 : i - 1;
          const t = s.q.lado === "seg" ? i : i - 1;
          const y = elDe.get(c.caminho![j]);
          if (!y) continue;
          const nk = `${chaveCabo(c.nome)}|${s.q.fibra}|${t}`;
          const outro = dono.get(nk);
          if (outro && outro !== pon) {
            conflito({ tipo: "duas_pons", caixa: x.chave, onde: nk, pons: [outro, pon], texto: `Na fibra ${s.q.fibra} do cabo ${c.nome} chegariam duas PONs.` });
            continue;
          }
          if (visto.has(nk)) {
            conflito({ tipo: "laco", caixa: x.chave, onde: nk, pons: [pon], texto: `A luz da ${rotulo} volta para a fibra ${s.q.fibra} do cabo ${c.nome} (laço).` });
            continue;
          }
          visto.add(nk);
          dono.set(nk, pon);
          const aqui: Passo = { ...passo, splitters: s.spls, passagem, pontosSaida: s.pts };
          const chega: PontoRede = { k: "fibra", cabo: chaveCabo(c.nome), fibra: s.q.fibra, lado: s.q.lado === "seg" ? "ant" : "seg" };
          const prox: Passo = { caixa: y, cabo: c, fibra: s.q.fibra, trecho: t, splitters: [], passagem: false, pontosEntrada: [idPontoRede(chega)], pontosSaida: [] };
          andar(y, chega, [...trilha.slice(0, -1), aqui, prox]);
        }
      };

      /** Monta o caminho (rota) até a última caixa da trilha e espalha a potência pelos pontos */
      const emitir = (trilha: Passo[]) => {
        const ultimo = trilha[trilha.length - 1];
        const id = `${pon}>${ultimo.caixa.chave}>${ultimo.splitters.map((s) => s.id).join(">")}`;
        if (rotasVistas.has(id)) return;
        rotasVistas.add(id);
        const elementos: ElementoRota[] = [];
        const entradas: EntradaPotencia[] = [];
        const tracos: TrechoCabo[] = [];
        trilha.forEach((ps, k) => {
          const x = ps.caixa;
          const tipo = (x.tipo ?? "outro") as TipoElementoRota;
          const rel = ps.splitters.map((s) => s.relacao).join(" + ");
          const perda = ps.splitters.reduce((a, s) => a + perdaSplitter(s.relacao, op.perdaModelo?.(s.modelo_id)), 0);
          let distancia: number | undefined;
          if (k > 0 && ps.cabo && ps.trecho !== undefined) {
            const tr = ps.cabo.trechos?.[ps.trecho];
            const linha = tracadoDoTrecho(ps.cabo, ps.trecho, elDe);
            const metros = tr?.metros ?? comprimentoTracado(linha);
            distancia = Math.round(metros + (tr?.mesmo_poste ? 0 : reservaTrecho(trilha[k - 1].caixa.tipo, tipo, calc)));
            if (linha.length >= 2) tracos.push({ nome: ps.cabo.nome, pontos: linha, ate: k });
          }
          const prox = trilha[k + 1];
          elementos.push({
            nome: x.nome, tipo, ...(x.codigo ? { codigo: x.codigo } : {}),
            ...(x.lat !== undefined && x.lon !== undefined ? { lat: x.lat, lon: x.lon } : {}),
            ...(k === 0 ? { porta: cordao.porta, equipamento_id: x.equipamento_id } : {}),
            ...(ps.cabo && k > 0 ? { cabo_entrada: ps.cabo.nome, fibra_entrada: ps.fibra } : {}),
            ...(prox?.cabo ? { cabo_saida: prox.cabo.nome, fibra_saida: prox.fibra } : {}),
            ...(rel ? { splitter: rel } : {}),
            ...(ps.passagem ? { passagem: true } : {}),
            ...(distancia !== undefined ? { distancia_m: distancia } : {}),
          });
          entradas.push({ tipo, distancia_m: distancia, ...(rel ? { splitter: rel, perda_splitter: perda } : {}) });
        });
        const ps = calcularPotencias(entradas, tx, calc);
        elementos.forEach((e, k) => { e.potencia_entrada = ps[k].entrada; e.potencia_saida = ps[k].saida; });
        trilha.forEach((p, k) => {
          for (const q of p.pontosEntrada) pontos.set(`${p.caixa.chave}#${q}`, { pon, rotulo, pot: ps[k].entrada });
          for (const q of p.pontosSaida) {
            if (p.pontosEntrada.includes(q)) continue;
            // entrada do splitter: antes dele; porta, adaptador e fibra que sai: depois
            pontos.set(`${p.caixa.chave}#${q}`, { pon, rotulo, pot: q.startsWith("e:") ? ps[k].entrada : ps[k].saida });
          }
          if (k > 0 && p.cabo && p.trecho !== undefined) trechos.set(`${chaveCabo(p.cabo.nome)}|${p.fibra}|${p.trecho}`, { pon, rotulo, pot: ps[k].entrada });
        });
        rotas.push({ id, nome: `${rotulo} → ${ultimo.caixa.nome}`, origem: "manual", elementos, trechos: tracos, calculo_potencia: calc });
      };

      const inicio: PontoRede = { k: "pon", porta: cordao.porta };
      andar(olt, inicio, [{ caixa: olt, splitters: [], passagem: false, pontosEntrada: [idPontoRede(inicio)], pontosSaida: [] }]);
    }
  }
  return { rotas, pontos, trechos, caixas: caixasCom, conflitos };
}

/** Traçado completo de um trecho do cabo: a caixa de antes, as curvas e a caixa de depois */
export function tracadoDoTrecho(c: CaboRede, t: number, elDe: Map<string, CaixaRede>): { lat: number; lon: number }[] {
  const a = elDe.get(c.caminho?.[t] ?? ""), b = elDe.get(c.caminho?.[t + 1] ?? "");
  const pos = (e?: CaixaRede) => (e && e.lat !== undefined && e.lon !== undefined ? [{ lat: e.lat, lon: e.lon }] : []);
  return [...pos(a), ...(c.trechos?.[t]?.pontos ?? []), ...pos(b)];
}

/** Nome do elemento para busca (sem acento, maiúsculo) */
export function nomeBusca(e: Pick<CaixaRede, "nome">): string {
  return normal(e.nome);
}
