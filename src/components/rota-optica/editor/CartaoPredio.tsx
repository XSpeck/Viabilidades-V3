"use client";

import type { PredioRede } from "@/lib/prediosRede";
import { IconeElemento } from "../IconesRede";
import type { VinculoPredio } from "./linhas";

const campo = "w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";

/**
 * Cartão do elemento Prédio no editor: só qual prédio recebe o cabo (um existente perto ou um novo).
 * CDOIs, fibras e splitters ficam na janela do prédio.
 */
export default function CartaoPredio({
  vinculo,
  opcoes,
  predios,
  onMudar,
  onNomeFoco,
  onNomeSair,
}: {
  vinculo: VinculoPredio;
  /** Prédios perto do ponto (com a distância), do mais perto ao mais longe */
  opcoes: { pr: PredioRede; d: number }[];
  predios: PredioRede[];
  /** renomearJa: troca de prédio (o nome dos cabos acompanha na hora) */
  onMudar: (v: VinculoPredio, renomearJa: boolean) => void;
  onNomeFoco: () => void;
  onNomeSair: () => void;
}) {
  const v = vinculo;
  return (
    <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-2.5 space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
        <IconeElemento tipo="predio" tamanho={18} /> Prédio
      </p>
      <select
        className={campo}
        value={v.id || "__novo"}
        onChange={(e) => {
          const id = e.target.value === "__novo" ? "" : e.target.value;
          const np = predios.find((x) => x.id === id);
          onMudar({ ...v, id, nome: np?.nome ?? "" }, true);
        }}
      >
        {opcoes.map(({ pr: x, d }) => (
          <option key={x.id} value={x.id}>{x.nome}{Number.isFinite(d) ? ` · ${Math.round(d)} m` : ""}</option>
        ))}
        {v.id && !opcoes.some((o) => o.pr.id === v.id) && <option value={v.id}>{v.nome}</option>}
        <option value="__novo">+ Prédio novo…</option>
      </select>
      {!v.id && (
        <input
          className={`${campo} ${!v.nome.trim() ? "border-red-400" : ""}`}
          value={v.nome}
          onFocus={onNomeFoco}
          onChange={(e) => onMudar({ ...v, nome: e.target.value }, false)}
          onBlur={onNomeSair}
          placeholder="Nome do prédio (ex.: Ed Majestoso)"
        />
      )}
      <p className="text-[10px] text-slate-500">
        Aqui só o <b>cabo</b> chega ao prédio. Blocos, andares, CDOIs, fibras e splitters você monta na janela do prédio (Unifilar → prédio → Editar no prédio): cada CDOI vira uma sub-rota sozinha.
      </p>
    </div>
  );
}
