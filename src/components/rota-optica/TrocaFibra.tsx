"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { corFibraPorCapacidade, type RotaOptica } from "@/lib/rotaOptica";
import { atualizarRota } from "@/lib/rotaOptica";
import { paraGravar } from "@/lib/subRotas";
import { salvarCabo, semCodigo, type CaboRede, type UsoFibra } from "@/lib/cabosRede";
import { chaveElemento } from "@/lib/arvorePon";
import { conflitosTroca, trechosDaFibra, trocarFibraNaRota } from "@/lib/trocaFibra";
import { cortar } from "@/lib/textoCompleto";

interface Props {
  /** Todas as rotas montadas */
  rotas: RotaOptica[];
  caboChave: string;
  caboNome: string;
  cabo?: CaboRede;
  /** Fibra que vai ser trocada */
  velha: number;
  capacidade: number;
  porTubo: number;
  uso: Map<number, UsoFibra[]>;
  usuario: string;
  onCancelar: () => void;
  /** Terminou: recarregar as rotas e mostrar o resumo */
  onFeito: (resumo: string, cabo?: CaboRede) => void;
}

const curto = (s: string, n = 26) => cortar(s.split(" - ")[0].split(" / ")[0].trim(), n, s);

/**
 * Trocar a fibra em várias rotas de uma vez: escolhe a fibra nova, os trechos do cabo e as rotas
 * que mudam (as outras ficam na fibra antiga). Grava as rotas escolhidas na hora.
 */
export default function TrocaFibra({ rotas, caboChave, caboNome, cabo, velha, capacidade, porTubo, uso, usuario, onCancelar, onFeito }: Props) {
  const trechos = useMemo(() => trechosDaFibra(rotas, caboChave, velha), [rotas, caboChave, velha]);
  const porId = useMemo(() => new Map(rotas.map((r) => [r.id, r])), [rotas]);
  const [nova, setNova] = useState<number | "">("");
  const [selTrechos, setSelTrechos] = useState<Set<string>>(() => new Set(trechos.map((t) => t.chave)));
  /** Rotas que mudam (as que usam a fibra como parte delas, em algum trecho) */
  const todasDoCabo = useMemo(() => [...new Set(trechos.flatMap((t) => t.rotas))], [trechos]);
  const [selRotas, setSelRotas] = useState<Set<string>>(() => new Set(todasDoCabo));
  const [verHerdadas, setVerHerdadas] = useState(false);
  const [rompida, setRompida] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const rotasNosTrechos = todasDoCabo.filter((id) => trechos.some((t) => selTrechos.has(t.chave) && t.rotas.includes(id)));
  const herdadas = [...new Set(trechos.filter((t) => selTrechos.has(t.chave)).flatMap((t) => t.herdadas))].filter((id) => {
    const r = porId.get(id);
    return r?.pai && selRotas.has(r.pai.rota_id);
  });
  const movidas = rotasNosTrechos.filter((id) => selRotas.has(id));
  const ficam = todasDoCabo.filter((id) => !movidas.includes(id) || trechos.some((t) => !selTrechos.has(t.chave) && t.rotas.includes(id)));
  const conflitos = nova === "" ? [] : conflitosTroca(rotas, caboChave, nova, selTrechos, new Set(movidas));
  const podeRompida = ficam.length === 0 && selTrechos.size === trechos.length;
  const pronto = nova !== "" && movidas.length > 0 && selTrechos.size > 0 && conflitos.length === 0;

  const rotulo = (f: number) => {
    const c = corFibraPorCapacidade(f, capacidade, porTubo);
    return { c, txt: `${c.rotulo} ${c.nome.toLowerCase()}` };
  };
  const vo = rotulo(velha);
  const alternar = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  /** CEOs/CTs nas pontas dos trechos escolhidos (o mapa de emendas delas pode precisar de ajuste) */
  const caixasEmenda = useMemo(() => {
    const nomes = new Set<string>();
    for (const r of rotas) r.elementos.forEach((e, i) => {
      if (!i) return;
      const k = `${chaveElemento(r.elementos[i - 1])}>${chaveElemento(e)}`;
      if (!selTrechos.has(k)) return;
      [r.elementos[i - 1], e].forEach((x) => { if (x.tipo === "ceo" || x.tipo === "ct") nomes.add(x.nome); });
    });
    return [...nomes];
  }, [rotas, selTrechos]);

  async function aplicar() {
    if (!pronto || typeof nova !== "number") return;
    setGravando(true);
    setErro(null);
    let n = 0;
    try {
      for (const id of movidas) {
        const r = porId.get(id);
        if (!r) continue;
        const novo = trocarFibraNaRota(r, caboChave, velha, nova, selTrechos);
        if (!novo) continue;
        await atualizarRota(r.id, paraGravar({ pai: r.pai, tronco: r.tronco }, {
          nome: r.nome, origem: r.origem, elementos: novo.elementos, trechos: novo.trechos,
          calculo_potencia: r.calculo_potencia, obs: r.obs, criado_por: r.criado_por,
        }));
        n++;
      }
      let caboSalvo: CaboRede | undefined;
      if (rompida && podeRompida) {
        const hoje = new Date().toLocaleDateString("pt-BR");
        caboSalvo = await salvarCabo({
          chave: caboChave, nome: caboNome, capacidade: cabo?.capacidade, tipo_id: cabo?.tipo_id, obs: cabo?.obs,
          fibras: [...(cabo?.fibras ?? []).filter((f) => f.numero !== velha), { numero: velha, status: "rompida", descricao: `Trocada pela F${String(nova).padStart(2, "0")} em ${hoje} por ${usuario}` }],
          atualizado_por: usuario,
        });
      }
      const no = rotulo(nova);
      onFeito(
        `F${String(velha).padStart(2, "0")} → ${no.c.rotulo.split(" ")[1]} (${no.c.nome.toLowerCase()}) em ${n} rota${n !== 1 ? "s" : ""}, ${selTrechos.size} trecho${selTrechos.size !== 1 ? "s" : ""}.` +
          (caixasEmenda.length ? ` Confira o mapa de emendas de: ${caixasEmenda.map((x) => curto(x, 30)).join(", ")}.` : ""),
        caboSalvo,
      );
    } catch (e) {
      setErro(`Parou depois de ${n} rota(s): ${e instanceof Error ? e.message : "erro ao gravar"}`);
    } finally {
      setGravando(false);
    }
  }

  const caixa = "rounded-xl border border-slate-200 bg-white p-2";
  const titulo = "mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500";

  return (
    <div className="space-y-2 rounded-2xl border-2 border-indigo-300 bg-indigo-50/60 p-2.5 text-[11px] text-slate-700">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full ring-1 ring-black/25" style={{ background: vo.c.hex }} />
        <p className="text-sm font-bold text-slate-800">Trocar a {vo.txt}</p>
        <span className="ml-auto truncate text-[10px] text-slate-500">{curto(semCodigo(caboNome), 30)}</span>
      </div>

      <div className={caixa}>
        <p className={titulo}>1 · Fibra nova</p>
        <select className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs" value={nova} onChange={(e) => setNova(e.target.value ? +e.target.value : "")}>
          <option value="">Escolha…</option>
          {Array.from({ length: capacidade }, (_, i) => i + 1).filter((f) => f !== velha).map((f) => {
            const u = uso.get(f) ?? [];
            const an = cabo?.fibras.find((x) => x.numero === f);
            return (
              <option key={f} value={f}>
                {rotulo(f).txt}{u.length ? ` · em uso (${u.filter((x) => !x.herdado).map((x) => x.rotaNome).join(", ")})` : an && an.status !== "livre" ? ` · ${an.status}` : " · livre"}
              </option>
            );
          })}
        </select>
        {conflitos.length > 0 && (
          <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-red-700">
            Essa fibra já é usada nesses trechos por {[...new Set(conflitos.map((c) => c.rota.nome))].join(", ")}. Escolha outra ou desmarque o trecho.
          </p>
        )}
      </div>

      <div className={caixa}>
        <p className={titulo}>2 · Em quais trechos do cabo</p>
        <ul className="space-y-0.5">
          {trechos.map((t) => (
            <li key={t.chave}>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={selTrechos.has(t.chave)} onChange={() => setSelTrechos((s) => alternar(s, t.chave))} />
                <span className="truncate">{curto(t.de)} → {curto(t.para)}</span>
                <span className="ml-auto shrink-0 text-[10px] text-slate-400">{t.rotas.length} rota{t.rotas.length !== 1 ? "s" : ""}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className={caixa}>
        <p className={titulo}>3 · Quais rotas passam para a fibra nova</p>
        {rotasNosTrechos.length === 0 ? (
          <p className="text-slate-400">Nenhuma rota nos trechos marcados.</p>
        ) : (
          <ul className="space-y-0.5">
            {rotasNosTrechos.map((id) => (
              <li key={id}>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={selRotas.has(id)} onChange={() => setSelRotas((s) => alternar(s, id))} />
                  <span className="truncate font-medium">{porId.get(id)?.nome}</span>
                  {!selRotas.has(id) && <span className="ml-auto shrink-0 text-[10px] text-amber-700">fica na F{String(velha).padStart(2, "0")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {herdadas.length > 0 && (
          <div className="mt-1">
            <button type="button" onClick={() => setVerHerdadas((v) => !v)} className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-700" aria-expanded={verHerdadas}>
              <span className={`inline-block transition-transform ${verHerdadas ? "rotate-90" : ""}`}>▸</span>
              {herdadas.length} sub-rota{herdadas.length !== 1 ? "s" : ""} vão junto com a rota-mãe
            </button>
            {verHerdadas && (
              <ul className="ml-4 mt-0.5 text-[10px] text-slate-500">
                {herdadas.map((id) => <li key={id}>└ {porId.get(id)?.nome}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <label className={`flex items-start gap-1.5 rounded-lg px-1 ${podeRompida ? "cursor-pointer" : "opacity-50"}`}>
        <input type="checkbox" className="mt-0.5" disabled={!podeRompida} checked={rompida && podeRompida} onChange={(e) => setRompida(e.target.checked)} />
        <span>
          Marcar a F{String(velha).padStart(2, "0")} como <b>rompida</b> neste cabo
          {!podeRompida && <span className="block text-[10px] text-slate-500">Só quando nenhuma rota continua nela.</span>}
        </span>
      </label>

      {nova !== "" && movidas.length > 0 && (
        <p className="rounded-lg bg-white px-2 py-1.5 text-slate-700 ring-1 ring-indigo-200">
          <b>F{String(velha).padStart(2, "0")} → F{String(nova).padStart(2, "0")}</b> em {selTrechos.size} trecho{selTrechos.size !== 1 ? "s" : ""} de {movidas.length} rota{movidas.length !== 1 ? "s" : ""}
          {herdadas.length ? ` (+${herdadas.length} sub-rota${herdadas.length !== 1 ? "s" : ""} junto)` : ""}
          {ficam.length ? `; ${ficam.length} rota${ficam.length !== 1 ? "s" : ""} continua${ficam.length !== 1 ? "m" : ""} na F${String(velha).padStart(2, "0")} em algum trecho` : ""}.
        </p>
      )}
      {erro && <p className="text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={aplicar} disabled={!pronto || gravando} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Trocar nas rotas
        </button>
        <button type="button" onClick={onCancelar} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>
      </div>
    </div>
  );
}
