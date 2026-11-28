"use client";

// =====================
// Prédio na rede livre: o prédio é um elemento do mapa (o cabo da rua chega nele e as fusões ficam no
// Unifilar dele). Aqui ficam os blocos e andares e as CDOIs de cada andar: cada CDOI é um elemento com um
// cabo interno saindo do prédio até ela. O sinal de cada CDOI vem sozinho, pelas ligações.
// =====================
import { useEffect, useMemo, useState } from "react";
import { Loader2, Network, Plus, Trash2 } from "lucide-react";
import { chaveCabo, comCodigo, excluirCabo, proximoCodigoCabo, salvarCabo, type CaboRede } from "@/lib/cabosRede";
import { excluirCaixa, idCaixa, portasPara, salvarCaixa, type CaixaRede } from "@/lib/caixasRede";
import type { ItemCatalogo } from "@/lib/catalogoRede";
import { confirmar } from "@/lib/dialogo";
import { andaresDoBloco, listarPredios, novoId, rotuloAndar, rotuloAndarCurto, salvarPredio, type BlocoPredio, type PredioRede } from "@/lib/prediosRede";
import { proximoCodigoElemento } from "@/lib/redeLivre";
import { RELACOES_SPLITTER } from "@/lib/catalogoRede";
import { formatDbm } from "@/lib/rotaOptica";
import { COR_NIVEL, nivelPotencia } from "@/lib/analiseRede";
import type { SinalRede } from "@/lib/sinalRede";

interface Props {
  predio: CaixaRede;
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

const vazio = (p: CaixaRede): PredioRede => ({
  id: idCaixa(p.chave), nome: p.nome, blocos: [{ id: novoId(), nome: "Bloco A", andares: 10, subsolos: 0, aptos: 4 }], pontos: [], chaves: [],
});

export default function PredioLivre({ predio, caixas, cabos, catalogo, sinal, usuario, onCaixa, onCaixaFora, onCabo, onCaboFora, onAbrirNoUnifilar }: Props) {
  const [dados, setDados] = useState<PredioRede | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [nova, setNova] = useState({ bloco: "", andar: 0, nome: "", relacao: "1:8", tipoCabo: "" });

  useEffect(() => {
    let vivo = true;
    listarPredios(true)
      .then((l) => { if (vivo) setDados(l.find((x) => x.id === idCaixa(predio.chave)) ?? vazio(predio)); })
      .catch(() => vivo && setDados(vazio(predio)));
    return () => { vivo = false; };
  }, [predio]);

  const cdois = useMemo(() => caixas.filter((c) => c.predio_id === predio.chave), [caixas, predio.chave]);
  const tiposCabo = catalogo.filter((i) => i.categoria === "cabo" && (i.capacidade ?? 0) >= 1);
  if (!dados) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const blocoNovo = nova.bloco || dados.blocos[0]?.id || "";

  async function gravar(p: PredioRede) {
    setGravando(true);
    try {
      setDados(await salvarPredio({ ...p, id: idCaixa(predio.chave), chaves: p.pontos.map((o) => o.chave) }, usuario));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gravar o prédio.");
    } finally {
      setGravando(false);
    }
  }

  function mudarBloco(id: string, m: Partial<BlocoPredio>) {
    setDados((d) => d && { ...d, blocos: d.blocos.map((b) => (b.id === id ? { ...b, ...m } : b)) });
  }

  /** CDOI nova no andar: o elemento, o cabo interno do prédio até ela e o splitter já recebendo a fibra 1 */
  async function adicionarCdoi() {
    if (!dados) return;
    setErro(null);
    const tipo = tiposCabo.find((t) => t.id === nova.tipoCabo) ?? tiposCabo.find((t) => t.capacidade === 1) ?? tiposCabo[0];
    if (!tipo?.capacidade) { setErro("Cadastre um tipo de cabo (Mais ▾ → Cadastros) para o cabo interno."); return; }
    if (!blocoNovo) { setErro("Crie um bloco antes."); return; }
    setGravando(true);
    try {
      const codigo = proximoCodigoElemento(caixas.map((c) => c.codigo));
      const nome = nova.nome.trim() || `CDOI ${rotuloAndarCurto(nova.andar)} ${dados.blocos.find((b) => b.id === blocoNovo)?.nome ?? ""}`.trim();
      const chave = `PT:${codigo}`;
      const cod = proximoCodigoCabo(cabos.map((c) => c.nome));
      const nomeCabo = comCodigo(`${String(tipo.capacidade).padStart(2, "0")} FO · ${predio.nome} → ${nome}`, cod);
      const metros = 10 + Math.abs(nova.andar) * 3;
      const cabo = await salvarCabo({ chave: cod, nome: nomeCabo, capacidade: tipo.capacidade, tipo_id: tipo.id, fibras: [], caminho: [predio.chave, chave], trechos: [{ pontos: [], metros, mesmo_poste: true }], atualizado_por: usuario });
      onCabo(cabo);
      const cx = await salvarCaixa({
        chave, nome, tipo: "cdoi", codigo, lat: predio.lat, lon: predio.lon, predio_id: predio.chave, portas: [],
        splitters: [{ id: "s1", relacao: nova.relacao, entrada: { fibra: { cabo: nomeCabo, fibra: 1 } }, portas: portasPara(nova.relacao, []) }],
        atualizado_por: usuario,
      });
      onCaixa(cx);
      const b = dados.blocos.find((x) => x.id === blocoNovo)!;
      await gravar({ ...dados, pontos: [...dados.pontos, { id: novoId(), chave, nome, bloco: b.id, andar: nova.andar, atende_de: nova.andar, atende_ate: nova.andar }] });
      setNova({ ...nova, nome: "" });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar a CDOI.");
    } finally {
      setGravando(false);
    }
  }

  async function tirarCdoi(chave: string) {
    if (!dados) return;
    const c = caixas.find((x) => x.chave === chave);
    if (!(await confirmar(`Tirar a ${c?.nome ?? "CDOI"} do prédio? Ela, o cabo interno dela e os clientes nas portas somem.`, { ok: "Tirar", perigo: true }))) return;
    setGravando(true);
    try {
      for (const cb of cabos.filter((x) => x.caminho?.includes(chave))) {
        await excluirCabo(cb.id);
        onCaboFora(cb.chave);
      }
      await excluirCaixa(idCaixa(chave));
      onCaixaFora(chave);
      await gravar({ ...dados, pontos: dados.pontos.filter((o) => o.chave !== chave) });
    } finally {
      setGravando(false);
    }
  }

  /** Sinal da CDOI: quem acende e a potência que chega nela */
  const sinalDa = (chave: string) => {
    const cb = cabos.find((x) => x.caminho?.[1] === chave && x.caminho[0] === predio.chave);
    const pon = [...(sinal.caixas.get(chave) ?? [])][0];
    const pot = cb ? sinal.trechos.get(`${chaveCabo(cb.nome)}|1|0`)?.pot : undefined;
    return { pon, pot };
  };

  return (
    <div className="space-y-3 p-3 text-xs text-slate-700">
      {erro && <p className="rounded-lg bg-red-50 px-2 py-1 text-red-700">{erro}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1 font-semibold" placeholder="Nome do prédio" />
        <input value={dados.endereco ?? ""} onChange={(e) => setDados({ ...dados, endereco: e.target.value })} className="min-w-0 flex-1 rounded border px-2 py-1" placeholder="Endereço" />
        <button type="button" disabled={gravando} onClick={() => void gravar(dados)} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60">Gravar</button>
      </div>

      {/* blocos */}
      <div className="space-y-1">
        {dados.blocos.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-1.5">
            <input value={b.nome} onChange={(e) => mudarBloco(b.id, { nome: e.target.value })} className="w-24 rounded border px-1.5 py-1" />
            <label>andares <input type="number" min={0} value={b.andares} onChange={(e) => mudarBloco(b.id, { andares: Math.max(0, +e.target.value) })} className="w-14 rounded border px-1 py-1" /></label>
            <label>subsolos <input type="number" min={0} value={b.subsolos} onChange={(e) => mudarBloco(b.id, { subsolos: Math.max(0, +e.target.value) })} className="w-12 rounded border px-1 py-1" /></label>
            <label>aptos/andar <input type="number" min={0} value={b.aptos} onChange={(e) => mudarBloco(b.id, { aptos: Math.max(0, +e.target.value) })} className="w-12 rounded border px-1 py-1" /></label>
            {dados.blocos.length > 1 && !dados.pontos.some((o) => o.bloco === b.id) && (
              <button type="button" onClick={() => setDados({ ...dados, blocos: dados.blocos.filter((x) => x.id !== b.id) })} className="text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setDados({ ...dados, blocos: [...dados.blocos, { id: novoId(), nome: `Bloco ${String.fromCharCode(65 + dados.blocos.length)}`, andares: 10, subsolos: 0, aptos: 4 }] })} className="flex items-center gap-1 text-indigo-700"><Plus className="h-3.5 w-3.5" /> bloco</button>
      </div>

      {/* desenho: um prédio por bloco, andar por andar; janelas acesas onde a CDOI do andar tem sinal */}
      <style>{`@keyframes fh-pulso { 0% { transform: scale(.85); opacity: .8; } 100% { transform: scale(1.35); opacity: 0; } } .fh-pulso { animation: fh-pulso 2s ease-out infinite; } @media (prefers-reduced-motion: reduce) { .fh-pulso { animation: none; } }`}</style>
      <div className="flex items-end gap-5 overflow-x-auto rounded-2xl bg-gradient-to-b from-sky-100 via-sky-50 to-white p-4 pb-0 ring-1 ring-slate-200">
        {dados.blocos.map((b) => {
          // andares atendidos por uma CDOI com sinal (as janelas acendem)
          const acesos = new Set<number>();
          dados.pontos.filter((o) => o.bloco === b.id && sinalDa(o.chave).pon).forEach((o) => {
            for (let a = Math.min(o.atende_de, o.atende_ate); a <= Math.max(o.atende_de, o.atende_ate); a++) acesos.add(a);
          });
          return (
            <div key={b.id} className="flex min-w-[190px] flex-col items-center">
              <p className="mb-1.5 rounded-full bg-slate-800 px-3 py-0.5 text-[11px] font-bold text-white shadow">{b.nome}</p>
              {/* telhado */}
              <div className="h-0 w-0 border-x-[96px] border-b-[18px] border-x-transparent border-b-slate-600" />
              <div className="flex w-[192px] flex-col-reverse rounded-b-sm border-x-4 border-slate-600 bg-gradient-to-b from-slate-200 to-slate-300 shadow-xl">
                {andaresDoBloco(b).map((a) => {
                  const aqui = dados.pontos.filter((o) => o.bloco === b.id && o.andar === a);
                  const luz = acesos.has(a);
                  return (
                    <div key={a} className={`relative flex min-h-[26px] items-center gap-1 border-t border-slate-400/50 px-1.5 ${a < 0 ? "bg-slate-400/60" : a === 0 ? "bg-slate-100" : ""}`}>
                      <span className="w-6 shrink-0 text-[9px] font-bold text-slate-500">{rotuloAndarCurto(a)}</span>
                      <div className="flex flex-1 gap-1">
                        {a >= 0 && Array.from({ length: Math.min(b.aptos, 6) }, (_, k) => (
                          <span key={k} className={`h-3 flex-1 rounded-[2px] border transition-colors duration-500 ${luz ? "border-amber-400 bg-amber-200 shadow-[0_0_6px_rgba(251,191,36,.8)]" : "border-slate-400 bg-sky-900/30"}`} />
                        ))}
                      </div>
                      {aqui.map((o) => {
                        const sd = sinalDa(o.chave);
                        const existe = cdois.some((c) => c.chave === o.chave);
                        const cor = !existe ? "#dc2626" : sd.pon ? COR_NIVEL[nivelPotencia(sd.pot)] : "#64748b";
                        return (
                          <span key={o.id} className="group absolute -right-2 z-10 flex translate-x-full items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg" style={{ background: cor }} title={sd.pon ? `${sd.pon} · ${formatDbm(sd.pot)}` : "sem sinal"}>
                            {sd.pon && <span className="fh-pulso pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 0 2px ${cor}` }} />}
                            {o.nome}{sd.pot !== undefined ? ` · ${formatDbm(sd.pot)}` : ""}
                            {onAbrirNoUnifilar && existe && <button type="button" onClick={() => onAbrirNoUnifilar(o.chave)} title="Abrir no Unifilar" className="rounded p-0.5 hover:bg-white/20"><Network className="h-3 w-3" /></button>}
                            <button type="button" onClick={() => void tirarCdoi(o.chave)} title="Tirar do prédio" className="rounded p-0.5 hover:bg-white/20"><Trash2 className="h-3 w-3" /></button>
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              {/* chão */}
              <div className="h-2 w-[230px] rounded-t bg-gradient-to-b from-emerald-600 to-emerald-800" />
            </div>
          );
        })}
        <div className="w-40 shrink-0" />
      </div>

      {/* CDOI nova */}
      <div className="space-y-1.5 rounded-xl border border-slate-200 p-2">
        <p className="font-semibold">Colocar CDOI</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={blocoNovo} onChange={(e) => setNova({ ...nova, bloco: e.target.value })} className="rounded border px-1.5 py-1">
            {dados.blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select value={nova.andar} onChange={(e) => setNova({ ...nova, andar: +e.target.value })} className="rounded border px-1.5 py-1">
            {andaresDoBloco(dados.blocos.find((b) => b.id === blocoNovo) ?? dados.blocos[0]).map((a) => <option key={a} value={a}>{rotuloAndar(a)}</option>)}
          </select>
          <input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Nome (automático)" className="w-36 rounded border px-1.5 py-1" />
          <select value={nova.relacao} onChange={(e) => setNova({ ...nova, relacao: e.target.value })} className="rounded border px-1.5 py-1" title="Splitter da CDOI">
            {RELACOES_SPLITTER.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={nova.tipoCabo} onChange={(e) => setNova({ ...nova, tipoCabo: e.target.value })} className="rounded border px-1.5 py-1" title="Cabo interno do prédio até a CDOI">
            <option value="">Cabo interno…</option>
            {tiposCabo.map((t) => <option key={t.id} value={t.id}>{t.nome} · {t.capacidade}F</option>)}
          </select>
          <button type="button" disabled={gravando} onClick={() => void adicionarCdoi()} className="rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white disabled:opacity-60">{gravando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Colocar"}</button>
        </div>
        <p className="text-slate-500">A CDOI ganha um cabo interno saindo do prédio, e o splitter dela já recebe a fibra 1 desse cabo. Falta só fundir, no Unifilar do prédio, a fibra que chega da rua nesse cabo.</p>
        {onAbrirNoUnifilar && <button type="button" onClick={() => onAbrirNoUnifilar(predio.chave)} className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5 font-semibold text-white"><Network className="h-3.5 w-3.5" /> Abrir o prédio no Unifilar</button>}
      </div>
    </div>
  );
}
