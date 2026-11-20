"use client";

import { resumoItem, type ItemCatalogo } from "@/lib/catalogoRede";
import { corFibra, formatDbm, formatMetros, TIPO_ELEMENTO_LABEL, tipoVisual, type ElementoRota } from "@/lib/rotaOptica";
import { chaveCabo } from "@/lib/cabosRede";
import { IconeCabo, IconeElemento } from "./IconesRede";

interface Props {
  elementos: ElementoRota[];
  selecionado: number | null;
  onSelect: (i: number) => void;
}

function Forma({ e, ativo }: { e: ElementoRota; ativo: boolean }) {
  return (
    <span className={`flex rounded-full ${ativo ? "ring-4 ring-amber-300 bg-amber-50" : ""}`}>
      <IconeElemento tipo={tipoVisual(e)} tamanho={30} />
    </span>
  );
}

function TF(fibra?: number, cabo?: string) {
  return corFibra(fibra, cabo).rotulo;
}

/** Diagrama vertical da rota: elementos em ordem, ligados pela cor real da fibra. */
export default function RotaDiagrama({ elementos, selecionado, onSelect }: Props) {
  const acumulados = elementos.reduce<number[]>((acc, e, i) => {
    acc.push((i > 0 ? acc[i - 1] : 0) + (e.distancia_m ?? 0));
    return acc;
  }, []);
  return (
    <ol className="relative">
      {elementos.map((e, i) => {
        const acumulado = acumulados[i];
        const prox = elementos[i + 1];
        const fibraLig = prox?.fibra_entrada ?? e.fibra_saida;
        const caboLig = prox?.cabo_entrada ?? e.cabo_saida;
        const cor = corFibra(fibraLig, caboLig);
        const ativo = i === selecionado;
        return (
          <li key={i} className="relative">
            <button
              type="button"
              onClick={() => onSelect(i)}
              className={`w-full text-left flex gap-3 items-start rounded-lg px-2 py-2 transition ${
                ativo ? "bg-indigo-50" : "hover:bg-gray-50"
              }`}
            >
              <span className="w-8 flex justify-center pt-0.5 shrink-0">
                <Forma e={e} ativo={ativo} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm leading-tight ${ativo ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}>
                  {i + 1}. {e.nome}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {TIPO_ELEMENTO_LABEL[tipoVisual(e)]}
                  {e.codigo ? ` · ${e.codigo}` : ""}
                  {e.splitter ? ` · splitter ${e.splitter}` : ""}
                  {i > 0 ? ` · ${formatMetros(acumulado)} da OLT` : ""}
                </span>
              </span>
              <span className="text-xs text-gray-600 tabular-nums shrink-0 pt-0.5">
                {formatDbm(e.potencia_saida ?? e.potencia_entrada)}
              </span>
            </button>

            {prox && (
              <div className="flex gap-3 items-stretch pl-2">
                <span className="w-8 flex justify-center shrink-0">
                  <span
                    className="w-[8px] min-h-[38px] rounded-full border-2 border-slate-900"
                    style={{ background: cor.hex }}
                    title={`Fibra ${fibraLig ?? "?"} (${cor.nome})`}
                  />
                </span>
                <span className="text-[11px] text-gray-500 py-1.5 leading-tight flex items-start gap-1.5">
                  {caboLig && <IconeCabo tamanho={15} className="shrink-0 mt-px" />}
                  <span>
                  {caboLig ? <b className="text-gray-700 font-medium">{caboLig}</b> : "Cabo não informado"}
                  {fibraLig ? ` · fibra ${fibraLig} ${cor.nome.toLowerCase()} (${TF(fibraLig, caboLig)})` : ""}
                  {prox.distancia_m !== undefined ? ` · ${formatMetros(prox.distancia_m)}` : ""}
                  </span>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DetalheElemento({ elementos, indice, catalogo = [] }: { elementos: ElementoRota[]; indice: number; catalogo?: ItemCatalogo[] }) {
  const e = elementos[indice];
  if (!e) return null;
  const equipamento = catalogo.find((c) => c.id === e.equipamento_id);
  const modeloSpl = catalogo.find((c) => c.id === e.splitter_modelo);
  const anterior = elementos[indice - 1];
  const acumulado = elementos.slice(0, indice + 1).reduce((s, x) => s + (x.distancia_m ?? 0), 0);
  const pot0 = elementos[0]?.potencia_entrada ?? elementos[0]?.potencia_saida;
  const potAqui = e.potencia_saida ?? e.potencia_entrada;
  const perda = pot0 !== undefined && potAqui !== undefined && indice > 0 ? pot0 - potAqui : undefined;
  const trocaCabo =
    e.cabo_entrada && e.cabo_saida && (chaveCabo(e.cabo_entrada) !== chaveCabo(e.cabo_saida) || e.fibra_entrada !== e.fibra_saida);
  const restantes = elementos.length - 1 - indice;

  const linhaFibra = (cabo?: string, fibra?: number) => {
    if (!cabo && !fibra) return "—";
    const c = corFibra(fibra, cabo);
    return (
      <span className="inline-flex items-center gap-1.5">
        {fibra ? <span className="inline-block w-5 h-2 rounded-full border border-gray-900" style={{ background: c.hex }} /> : null}
        <span>
          {cabo ?? "cabo ?"}
          {fibra ? ` · fibra ${fibra} (${c.nome.toLowerCase()}, ${TF(fibra, cabo)})` : ""}
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-bold text-gray-900 leading-tight">{e.nome}</p>
        <p className="text-sm text-gray-500">
          {TIPO_ELEMENTO_LABEL[tipoVisual(e)]}
          {e.codigo ? ` · ${e.codigo}` : ""} · elemento {indice + 1} de {elementos.length}
        </p>
      </div>

      <dl className="grid grid-cols-2 border-t border-gray-200 text-sm">
        <div className="py-2 border-b border-gray-200 pr-2">
          <dt className="text-xs text-gray-500">Distância da OLT</dt>
          <dd className="text-lg font-bold">{formatMetros(acumulado)}</dd>
        </div>
        <div className="py-2 border-b border-gray-200">
          <dt className="text-xs text-gray-500">Potência aqui</dt>
          <dd className="text-lg font-bold">{formatDbm(potAqui)}</dd>
        </div>
        <div className="py-2 border-b border-gray-200 pr-2">
          <dt className="text-xs text-gray-500">Trecho desde o anterior</dt>
          <dd className="text-lg font-bold">{e.distancia_m !== undefined ? formatMetros(e.distancia_m) : "—"}</dd>
        </div>
        <div className="py-2 border-b border-gray-200">
          <dt className="text-xs text-gray-500">Perda desde a OLT</dt>
          <dd className="text-lg font-bold">{perda !== undefined ? `${perda.toFixed(2).replace(".", ",")} dB` : "—"}</dd>
        </div>
      </dl>

      <div className="text-sm space-y-1.5 text-gray-700">
        {anterior && (
          <p>
            <span className="text-gray-500">Vem de:</span> {anterior.nome}
          </p>
        )}
        <p>
          <span className="text-gray-500">Chega por:</span> {linhaFibra(e.cabo_entrada, e.fibra_entrada)}
        </p>
        <p>
          <span className="text-gray-500">Sai por:</span> {linhaFibra(e.cabo_saida, e.fibra_saida)}
        </p>
        {trocaCabo && (
          <p className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <b>Emenda:</b> {e.cabo_entrada} {TF(e.fibra_entrada, e.cabo_entrada)} ↔ {e.cabo_saida} {TF(e.fibra_saida, e.cabo_saida)}
          </p>
        )}
        {e.porta && (
          <p>
            <span className="text-gray-500">Porta:</span> {e.porta}
          </p>
        )}
        {e.splitter && (
          <p>
            <span className="text-gray-500">Splitter:</span> {modeloSpl ? `${modeloSpl.nome} · ${resumoItem(modeloSpl)}` : e.splitter}
          </p>
        )}
        {equipamento && (
          <p>
            <span className="text-gray-500">Equipamento:</span> {equipamento.nome} · {resumoItem(equipamento)}
          </p>
        )}
        {e.potencia_entrada !== undefined && e.potencia_saida !== undefined && e.potencia_entrada !== e.potencia_saida && (
          <p>
            <span className="text-gray-500">Potência:</span> {formatDbm(e.potencia_entrada)} na chegada →{" "}
            {formatDbm(e.potencia_saida)} na saída
          </p>
        )}
        {e.lat !== undefined && e.lon !== undefined && (
          <p>
            <a
              href={`https://maps.google.com/?q=${e.lat},${e.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              📍 Abrir no Google Maps
            </a>
          </p>
        )}
        {e.obs && <p className="text-gray-600 italic">{e.obs}</p>}
        {indice > 0 && (
          <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Se o trecho que chega aqui romper, {restantes === 0 ? (
              <>este ponto fica sem sinal.</>
            ) : (
              <>
                este ponto e os <b>{restantes}</b> seguinte{restantes > 1 ? "s" : ""} da rota ficam sem sinal.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
