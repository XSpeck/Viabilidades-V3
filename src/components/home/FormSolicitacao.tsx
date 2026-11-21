"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Building2, CheckCircle, Home, Loader2, MapPin, Send, Users } from "lucide-react";
import { createViabilizacao, pedidosAbertosNoLocal, posicaoNaFila } from "@/lib/firestore";
import { findPredioEstruturado, findPredioSemViab, prediosPerto, RAIO_MATCH, RAIO_SUGESTAO, type MatchPredio, type MatchPredioSemViab, type PredioPerto } from "@/lib/predios";
import { formatarTelefone, plusCodeCurto, type LocalInterpretado } from "@/lib/localizacao";
import { formatDateTime } from "@/lib/pluscode";
import type { AppUser, TipoInstalacao, Viabilizacao } from "@/types";

export interface PedidoEnviado {
  id: string;
  tipo: TipoInstalacao;
  cliente: string;
  posicao: number | null;
}

const TIPOS: { tipo: TipoInstalacao; titulo: string; desc: string; icone: typeof Home }[] = [
  { tipo: "FTTH", titulo: "Casa", desc: "FTTH", icone: Home },
  { tipo: "Prédio", titulo: "Prédio", desc: "FTTA ou UTP", icone: Building2 },
  { tipo: "Condomínio", titulo: "Condomínio", desc: "De casas", icone: Users },
];

const STATUS_ABERTO: Record<string, string> = { pendente: "na fila", em_auditoria: "em auditoria", em_revisao: "em revisão" };

type Erros = Partial<Record<"tipo" | "nome" | "predio" | "apto", string>>;

const campo = (erro?: string) =>
  `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${erro ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-gray-300 focus:ring-indigo-400"}`;

function Erro({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

/** Passos 2 e 3: tipo de instalação e dados do cliente, na mesma tela */
export default function FormSolicitacao({
  local,
  user,
  onEnviado,
}: {
  local: LocalInterpretado;
  user: AppUser;
  onEnviado: (p: PedidoEnviado) => void;
}) {
  const [tipo, setTipo] = useState<TipoInstalacao | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [predio, setPredio] = useState("");
  const [apto, setApto] = useState("");
  const [bloco, setBloco] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [obs, setObs] = useState("");
  const [erros, setErros] = useState<Erros>({});

  /** Resultado da busca de prédio, marcado com a chave (tipo|nome|local) que o gerou */
  const [busca, setBusca] = useState<{ chave: string; est: MatchPredio | null; sem: MatchPredioSemViab | null } | null>(null);
  const [abertos, setAbertos] = useState<Viabilizacao[]>([]);
  /** Prédios cadastrados perto do ponto (tipo|local que gerou a lista) */
  const [perto, setPerto] = useState<{ chave: string; lista: PredioPerto[] } | null>(null);

  /** Passo "tem certeza?" quando há pedido aberto no local ou prédio recusado; vale só para a chave em que foi aberto */
  const [confirmandoChave, setConfirmandoChave] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  /** Trava contra clique duplo: o estado do React só muda no próximo render */
  const travado = useRef(false);

  const ehPredio = tipo !== null && tipo !== "FTTH";
  const chave = `${tipo}|${predio.trim()}|${local.plusCode}`;
  // Resposta antiga (de outro nome ou local) não vale: só a da chave atual aparece
  const atual = ehPredio && busca?.chave === chave ? busca : null;
  const matchPredio = atual?.est ?? null;
  const matchSemViab = atual?.sem ?? null;
  const buscando = ehPredio && !atual;
  const confirmando = confirmandoChave === chave;
  const setConfirmando = (v: boolean) => setConfirmandoChave(v ? chave : null);
  const tipoPredio = tipo === "Condomínio" ? "Condomínio" : "Prédio";
  const chavePerto = `${tipoPredio}|${local.plusCode}`;
  const listaPerto = ehPredio && perto?.chave === chavePerto ? perto.lista : [];

  // Pedido em aberto no mesmo local (novo ou antigo, gravado com Plus Code curto)
  useEffect(() => {
    let vivo = true;
    pedidosAbertosNoLocal([local.plusCode, plusCodeCurto(local.plusCode)])
      .then((l) => { if (vivo) setAbertos(l); })
      .catch(() => { if (vivo) setAbertos([]); });
    return () => { vivo = false; };
  }, [local.plusCode]);

  // Prédio já estruturado ou já recusado: só a resposta da busca mais recente vale
  useEffect(() => {
    if (!ehPredio) return;
    let vivo = true;
    const t = setTimeout(() => {
      const n = predio.trim() || undefined;
      const raio = RAIO_MATCH[tipo === "Condomínio" ? "Condomínio" : "Prédio"];
      Promise.all([findPredioEstruturado(local.plusCode, n, raio), findPredioSemViab(local.plusCode, n, raio)])
        .then(([est, sem]) => { if (vivo) setBusca({ chave, est, sem }); })
        .catch(() => { if (vivo) setBusca({ chave, est: null, sem: null }); });
    }, predio ? 500 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [ehPredio, predio, local.plusCode, chave, tipo]);

  // Sugestões "perto daqui": não dependem do nome digitado
  useEffect(() => {
    if (!ehPredio) return;
    let vivo = true;
    prediosPerto(local.plusCode, RAIO_SUGESTAO[tipoPredio])
      .then((lista) => { if (vivo) setPerto({ chave: chavePerto, lista }); })
      .catch(() => { if (vivo) setPerto({ chave: chavePerto, lista: [] }); });
    return () => { vivo = false; };
  }, [ehPredio, local.plusCode, tipoPredio, chavePerto]);

  function validar(): boolean {
    const e: Erros = {};
    if (!tipo) e.tipo = "Escolha o tipo de instalação.";
    if (!nome.trim()) e.nome = "Informe o nome do cliente.";
    if (ehPredio && !predio.trim()) e.predio = tipo === "Prédio" ? "Informe o nome do prédio." : "Informe o nome do condomínio.";
    if (ehPredio && !apto.trim()) e.apto = tipo === "Prédio" ? "Informe o apto." : "Informe a casa.";
    setErros(e);
    const primeiro = Object.keys(e)[0];
    if (primeiro) document.getElementById(`sol-${primeiro}`)?.focus();
    return !primeiro;
  }

  async function enviar(confirmado: boolean) {
    if (travado.current) return;
    setErroEnvio("");
    if (!validar() || !tipo) return;
    if (!confirmado && (abertos.length > 0 || matchSemViab)) { setConfirmando(true); return; }

    travado.current = true;
    setEnviando(true);
    try {
      const notas = [
        obs.trim(),
        motivo.trim() && (matchSemViab ? `O que mudou desde a recusa: ${motivo.trim()}` : motivo.trim()),
      ].filter(Boolean);
      const id = await createViabilizacao({
        usuario: user.nome,
        usuario_id: user.uid,
        nome_cliente: nome.trim(),
        telefone_cliente: telefone.trim() || undefined,
        plus_code_cliente: local.plusCode,
        tipo_instalacao: tipo,
        urgente,
        equipe: user.equipe,
        status: "pendente",
        predio_ftta: ehPredio ? predio.trim() : undefined,
        andar_predio: ehPredio ? apto.trim() : undefined,
        bloco_predio: ehPredio ? bloco.trim() || undefined : undefined,
        obs_usuario: notas.length ? notas.join("\n\n") : undefined,
        predio_estruturado: ehPredio ? matchPredio?.predio.predio_ftta : undefined,
      });
      const posicao = await posicaoNaFila(id).catch(() => null);
      onEnviado({ id, tipo, cliente: nome.trim(), posicao });
    } catch (err) {
      console.error("Erro ao criar viabilização:", err);
      setErroEnvio(err instanceof Error ? err.message : String(err));
      travado.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Passo 2 — tipo */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">2</span>
          Tipo de instalação
        </h3>
        <div id="sol-tipo" tabIndex={-1} className="grid grid-cols-3 gap-2 focus:outline-none">
          {TIPOS.map(({ tipo: t, titulo, desc, icone: Icone }) => {
            const ativo = tipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setTipo(t); setErros((e) => ({ ...e, tipo: undefined })); }}
                aria-pressed={ativo}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-center transition-colors ${
                  ativo ? "border-indigo-600 bg-indigo-50" : erros.tipo ? "border-red-300 bg-white hover:bg-gray-50" : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50"}`}
              >
                <Icone className={`h-6 w-6 ${ativo ? "text-indigo-600" : "text-gray-400"}`} />
                <span className={`text-sm font-semibold ${ativo ? "text-indigo-900" : "text-gray-800"}`}>{titulo}</span>
                <span className="text-[11px] text-gray-500">{desc}</span>
              </button>
            );
          })}
        </div>
        <Erro msg={erros.tipo} />
      </section>

      {/* Passo 3 — dados */}
      {tipo && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">3</span>
            Dados do cliente
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sol-nome" className="mb-1 block text-xs font-medium text-gray-600">Nome do cliente *</label>
              <input id="sol-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErros((x) => ({ ...x, nome: undefined })); }} className={campo(erros.nome)} autoComplete="off" />
              <Erro msg={erros.nome} />
            </div>
            <div>
              <label htmlFor="sol-telefone" className="mb-1 block text-xs font-medium text-gray-600">Telefone</label>
              <input id="sol-telefone" inputMode="tel" value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))} placeholder="(48) 99999-9999" className={campo()} autoComplete="off" />
            </div>
          </div>

          {ehPredio && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2">
                <label htmlFor="sol-predio" className="mb-1 block text-xs font-medium text-gray-600">{tipo === "Prédio" ? "Nome do prédio *" : "Nome do condomínio *"}</label>
                <input id="sol-predio" value={predio} onChange={(e) => { setPredio(e.target.value); setErros((x) => ({ ...x, predio: undefined })); }} className={campo(erros.predio)} autoComplete="off" />
                <Erro msg={erros.predio} />
              </div>
              <div>
                <label htmlFor="sol-apto" className="mb-1 block text-xs font-medium text-gray-600">{tipo === "Prédio" ? "Apto *" : "Casa *"}</label>
                <input id="sol-apto" value={apto} onChange={(e) => { setApto(e.target.value); setErros((x) => ({ ...x, apto: undefined })); }} className={campo(erros.apto)} autoComplete="off" />
                <Erro msg={erros.apto} />
              </div>
              <div>
                <label htmlFor="sol-bloco" className="mb-1 block text-xs font-medium text-gray-600">{tipo === "Prédio" ? "Bloco" : "Quadra"}</label>
                <input id="sol-bloco" value={bloco} onChange={(e) => setBloco(e.target.value)} className={campo()} autoComplete="off" />
              </div>
            </div>
          )}

          {listaPerto.length > 0 && !matchPredio && !matchSemViab && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-indigo-900">
                <MapPin className="h-3.5 w-3.5" /> Já cadastrados perto daqui. É algum destes?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {listaPerto.map((p) => (
                  <button
                    key={`${p.situacao}-${p.nome}`}
                    type="button"
                    onClick={() => { setPredio(p.nome); setErros((x) => ({ ...x, predio: undefined })); }}
                    title={p.motivo ? `Sem viabilidade: ${p.motivo}` : "Prédio já atendido"}
                    className={`flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs hover:shadow-sm ${
                      p.situacao === "atendido" ? "border-emerald-300 text-emerald-800 hover:bg-emerald-50" : "border-red-300 text-red-800 hover:bg-red-50"}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.situacao === "atendido" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="font-medium">{p.nome}</span>
                    <span className="text-gray-500">{Math.round(p.distancia)} m</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">
                <span className="mr-2 inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> atendido</span>
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> sem viabilidade</span>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="sol-obs" className="mb-1 block text-xs font-medium text-gray-600">Observação para o auditor</label>
            <textarea id="sol-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ponto de referência, horário para contato…" className={`${campo()} resize-none`} />
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="h-4 w-4 accent-red-600" />
            Cliente presencial <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">urgente</span>
          </label>

          {/* Avisos do local */}
          {buscando && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> Verificando se o prédio já existe no sistema…
            </div>
          )}
          {!buscando && matchPredio && (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">Prédio já estruturado: {matchPredio.predio.predio_ftta}</p>
                <p className="text-emerald-700">
                  {[
                    matchPredio.porProximidade && `${Math.round(matchPredio.distancia)} m daqui`,
                    matchPredio.porNome && "nome parecido",
                    matchPredio.predio.data_auditoria && `estruturado em ${new Date(matchPredio.predio.data_auditoria).toLocaleDateString("pt-BR")}`,
                  ].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-0.5">O pedido vai marcado como “prédio pronto” para a auditoria.</p>
              </div>
            </div>
          )}
          {!buscando && matchSemViab && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-semibold">Já avaliado como sem viabilidade: {matchSemViab.predio.predio_ftta}</p>
                {matchSemViab.predio.motivo_rejeicao && <p>Motivo: {matchSemViab.predio.motivo_rejeicao}</p>}
                <p className="text-red-700">
                  {[
                    matchSemViab.porProximidade && `${Math.round(matchSemViab.distancia)} m daqui`,
                    matchSemViab.porNome && "nome parecido",
                    matchSemViab.predio.data_auditoria && `avaliado em ${new Date(matchSemViab.predio.data_auditoria).toLocaleDateString("pt-BR")}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          )}
          {abertos.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Já existe pedido em aberto neste local</p>
                <ul className="mt-0.5 space-y-0.5">
                  {abertos.slice(0, 3).map((v) => (
                    <li key={v.id}>
                      <strong>{v.nome_cliente || "Cliente"}</strong> · {v.tipo_instalacao} · {STATUS_ABERTO[v.status] ?? v.status} · por {v.usuario}
                      {v.data_solicitacao && ` em ${formatDateTime(v.data_solicitacao)}`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {erroEnvio && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível enviar: {erroEnvio}</p>
          )}

          {confirmando ? (
            <div className="space-y-2 rounded-lg border border-orange-300 bg-orange-50 p-3">
              <p className="text-sm font-semibold text-orange-800">Enviar mesmo assim?</p>
              <p className="text-xs text-orange-700">
                {matchSemViab ? "Este prédio já foi recusado. Se algo mudou, conte ao auditor:" : "Se for um pedido diferente do que já está aberto, explique ao auditor:"}
              </p>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={matchSemViab ? "Ex.: passamos cabo novo pela rua X…" : "Ex.: outro apartamento, cliente diferente…"}
                className="w-full resize-none rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmando(false)} className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => enviar(true)}
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, enviar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => enviar(false)}
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviando ? "Enviando…" : "Enviar para a fila"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
