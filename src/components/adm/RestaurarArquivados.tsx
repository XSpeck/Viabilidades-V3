"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { arquivadosNoDia, desarquivarResultado, statusAntesDeArquivar } from "@/lib/firestore";
import { listUsers } from "@/lib/users";
import { formatDateTime } from "@/lib/pluscode";
import { dataDoResultado, DIAS_RESULTADO_NA_LISTA } from "@/lib/statusViabilizacao";
import type { AppUser, Viabilizacao } from "@/types";
import { Botao, BotaoConfirmar, campo, MsgErro } from "@/components/comum/ui";

const ROTULO: Record<string, string> = { aprovado: "Aprovado", utp: "UTP", rejeitado: "Sem viabilidade" };
const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/**
 * Desfaz um arquivamento em massa: lista os pedidos de um atendente arquivados num dia e
 * devolve para a lista os escolhidos (com o status que tinham, pelos próprios dados).
 */
export default function RestaurarArquivados() {
  const [usuarios, setUsuarios] = useState<AppUser[]>([]);
  const [uid, setUid] = useState("");
  const [dia, setDia] = useState(hoje);
  const [lista, setLista] = useState<Viabilizacao[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");

  useEffect(() => {
    listUsers().then((u) => setUsuarios(u.filter((x) => x.cargo === "usuario" || x.cargo === "adm").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))).catch(() => {});
  }, []);

  const usuario = usuarios.find((u) => u.uid === uid);
  const recente = (v: Viabilizacao) => { const d = dataDoResultado(v); return !!d && Date.now() - Date.parse(d) <= DIAS_RESULTADO_NA_LISTA * 86400000; };

  async function buscar() {
    if (!usuario) return;
    setOcupado(true); setErro(""); setFeito("");
    try {
      const l = await arquivadosNoDia(usuario.nome, usuario.uid, dia);
      setLista(l);
      // já marca os que têm resultado recente e status conhecido
      setMarcados(new Set(l.filter((v) => recente(v) && statusAntesDeArquivar(v)).map((v) => v.id)));
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao buscar."); }
    finally { setOcupado(false); }
  }

  async function restaurar() {
    const escolhidos = (lista ?? []).filter((v) => marcados.has(v.id));
    setOcupado(true); setErro("");
    let n = 0;
    try {
      for (const v of escolhidos) { await desarquivarResultado(v); n++; }
      setFeito(`${n} pedido(s) voltaram para a lista de ${usuario?.nome}.`);
      setLista((l) => (l ?? []).filter((v) => !marcados.has(v.id)));
      setMarcados(new Set());
    } catch (e) { setErro(`Parou em ${n} de ${escolhidos.length}: ${e instanceof Error ? e.message : "erro"}`); }
    finally { setOcupado(false); }
  }

  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = useMemo(() => marcados.size, [marcados]);

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm lg:col-span-2">
      <div className="flex items-center gap-3 border-b bg-gray-50 px-5 py-4">
        <ArchiveRestore className="h-5 w-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Desfazer arquivamento</h3>
          <p className="text-xs text-gray-500">Volta para o Meus Resultados pedidos que um atendente arquivou num dia</p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-2">
          <select value={uid} onChange={(e) => { setUid(e.target.value); setLista(null); }} className={`${campo()} max-w-xs`} aria-label="Atendente">
            <option value="">Escolha o atendente…</option>
            {usuarios.map((u) => <option key={u.uid} value={u.uid}>{u.nome}</option>)}
          </select>
          <input type="date" value={dia} onChange={(e) => { setDia(e.target.value); setLista(null); }} className={`${campo()} w-auto`} aria-label="Dia do arquivamento" />
          <Botao ocupado={ocupado && !lista} disabled={!uid} onClick={buscar}>Buscar</Botao>
        </div>
        <MsgErro erro={erro} />
        {feito && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{feito}</p>}

        {lista && (lista.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum pedido arquivado nesse dia.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">{lista.length} arquivado(s) no dia · já marcados os com resultado dos últimos {DIAS_RESULTADO_NA_LISTA} dias</p>
            <ul className="max-h-80 divide-y overflow-auto rounded-lg border">
              {lista.map((v) => {
                const st = statusAntesDeArquivar(v);
                return (
                  <li key={v.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${!st ? "opacity-50" : ""}`}>
                    <input type="checkbox" checked={marcados.has(v.id)} disabled={!st} onChange={() => alternar(v.id)} className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate"><strong className="font-medium">{v.nome_cliente ?? v.predio_ftta ?? "Cliente"}</strong> · {v.tipo_instalacao === "FTTH" ? "Casa" : v.tipo_instalacao}</span>
                    <span className="hidden text-xs text-gray-500 sm:inline">resultado {formatDateTime(dataDoResultado(v))}</span>
                    <span className="text-xs text-gray-500">arquivado {formatDateTime(v.data_finalizacao).slice(-5)}</span>
                    <span className="w-28 shrink-0 text-right text-xs font-medium text-gray-700">{st ? ROTULO[st] : "não volta"}</span>
                  </li>
                );
              })}
            </ul>
            <BotaoConfirmar
              rotulo={<><ArchiveRestore className="h-3.5 w-3.5" /> Restaurar {total} selecionado(s)</>}
              pergunta={`Voltar ${total} pedido(s) para a lista de ${usuario?.nome}?`}
              confirmar="Restaurar"
              tipo="primario"
              ocupado={ocupado}
              onConfirmar={restaurar}
            />
            {ocupado && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Restaurando…</p>}
          </>
        ))}
      </div>
    </div>
  );
}
