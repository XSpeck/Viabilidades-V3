"use client";

import { corFibraPorCapacidade, fibrasPorTubo } from "@/lib/rotaOptica";
import { lerPortaOlt, numeracaoOlt, resumoItem, textoPortaOlt, type ItemCatalogo } from "@/lib/catalogoRede";
import { IconeCabo, IconeElemento } from "./IconesRede";
import { cortar } from "@/lib/textoCompleto";

/** Dados da estação (elementos 1 = OLT e 2 = DIO da rota, e o cabo que sai do DIO) */
export interface DadosEstacao {
  oltNome: string;
  oltEquip: string;
  oltPorta: string;
  oltPot: string;
  dioNome: string;
  dioEquip: string;
  dioPorta: string;
  cordaoNome: string;
  cordaoTipo: string;
  cordaoMetros: string;
  /** Cabo que sai do DIO para a primeira caixa fora da estação (se já existe) */
  saidaCabo?: string;
  saidaTipo?: string;
  saidaFibra?: string;
  destino?: string;
}

interface Props {
  dados: DadosEstacao;
  olts: ItemCatalogo[];
  dios: ItemCatalogo[];
  tiposCabo: ItemCatalogo[];
  onMudar: (p: Partial<DadosEstacao>) => void;
  /** Mostra no mapa o cabo que sai do DIO */
  onVerSaida?: () => void;
  /** Nome da rota que já usa esta porta PON (placa/porta), se alguma */
  ponEmUso?: (placa: number, porta: number) => string | undefined;
  /** Nome da rota que já usa esta porta do DIO, se alguma */
  dioEmUso?: (porta: number) => string | undefined;
}

const pad2 = (v: number) => String(v).padStart(2, "0");
const campo = "w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";
const rot = "block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5";

/** Estação (POP): OLT → cordão → DIO → cabo para fora, desenhada como um rack clicável. */
export default function EstacaoOltDio({ dados, olts, dios, tiposCabo, onMudar, onVerSaida, ponEmUso, dioEmUso }: Props) {
  const olt = olts.find((o) => o.id === dados.oltEquip);
  const dio = dios.find((d) => d.id === dados.dioEquip);
  const tipoSaida = tiposCabo.find((t) => t.id === dados.saidaTipo);
  // Numeração de placas e portas vem do cadastro da OLT (há modelos 0–15 e modelos 1–16)
  const num = numeracaoOlt(olt);
  const listaPlacas = num.placas.slice(0, 16);
  const listaPortas = num.portas.slice(0, 16);
  const placas = listaPlacas.length;
  const portasPlaca = listaPortas.length;
  const portasDio = dio ? Math.min(dio.portas ?? 0, 144) : 0;

  const lida = lerPortaOlt(dados.oltPorta);
  const placa = lida ? lida.placa : null;
  const pon = lida ? lida.porta : null;
  const md = dados.dioPorta.match(/Porta\s*0*(\d+)/i);
  const portaDio = md ? +md[1] : n(dados.saidaFibra) ?? 0;

  const setPon = (pl: number, po: number) => onMudar({ oltPorta: textoPortaOlt(pl, po) });
  /** Portas já usadas por outras rotas (amarelas) e o aviso quando a escolhida é uma delas */
  const placaVista = placa ?? listaPlacas[0] ?? 0;
  const usoPon = (po: number) => ponEmUso?.(placaVista, po);
  const usoDio = (p: number) => dioEmUso?.(p);
  const conflitoPon = placa !== null && pon !== null ? ponEmUso?.(placa, pon) : undefined;
  const conflitoDio = portaDio ? dioEmUso?.(portaDio) : undefined;
  const placasComUso = new Set(ponEmUso ? listaPlacas.filter((pl) => listaPortas.some((po) => ponEmUso(pl, po))) : []);
  const temUso = !!(ponEmUso && placasComUso.size) || !!(dioEmUso && Array.from({ length: portasDio }, (_, k) => k + 1).some((p) => dioEmUso(p)));
  const setDio = (p: number) => onMudar({ dioPorta: `Porta ${pad2(p)}`, saidaFibra: String(p) });

  // ---------- Desenho ----------
  const W = 380;
  const xO = 12, wO = 168, xD = 200, wD = 168;
  const y0 = 34;
  const colsPl = 8;
  const linhasPl = Math.max(1, Math.ceil(placas / colsPl));
  const yPortas = y0 + 26 + linhasPl * 18 + 6;
  const colsPon = 8;
  const linhasPon = Math.max(1, Math.ceil(portasPlaca / colsPon));
  const hO = yPortas - y0 + linhasPon * 19 + 8;
  const colsDio = 12;
  const linhasDio = Math.max(2, Math.ceil(portasDio / colsDio));
  const passoDio = 13;
  const hD = 26 + linhasDio * passoDio + 10;
  const hRack = Math.max(hO, hD);
  const ySaida = y0 + hRack + 26;
  const H = ySaida + 44;

  /** posição da porta PON pelo índice (0 = primeira porta, seja ela 0 ou 1) */
  const posPon = (k: number) => {
    return { x: xO + 10 + (k % colsPon) * 19 + 8, y: yPortas + Math.floor(k / colsPon) * 19 + 7 };
  };
  const posDio = (p: number) => {
    const k = p - 1;
    return { x: xD + 8 + (k % colsDio) * passoDio + 5, y: y0 + 26 + Math.floor(k / colsDio) * passoDio + 5 };
  };
  const idxPon = pon !== null ? listaPortas.indexOf(pon) : -1;
  const a = placa !== null && idxPon >= 0 && listaPlacas.includes(placa) ? posPon(idxPon) : null;
  const b = portaDio && portaDio <= portasDio ? posDio(portaDio) : null;
  const corSaida = portaDio && tipoSaida?.capacidade
    ? corFibraPorCapacidade(portaDio, tipoSaida.capacidade, tipoSaida.fibras_por_tubo ?? fibrasPorTubo(tipoSaida.capacidade))
    : portaDio ? corFibraPorCapacidade(portaDio, Math.max(12, portaDio)) : null;

  // OLT → DIO é sempre por cordão óptico (o do cadastro)
  const cordao = tiposCabo.find((t) => t.capacidade === 1 && /cord/i.test(`${t.nome} ${t.construcao ?? ""}`));
  const sugestoesSaida = tiposCabo.filter((t) => (t.capacidade ?? 0) > 1);
  const caboIgual = sugestoesSaida.find((t) => t.capacidade === portasDio);

  return (
    <div className="rounded-2xl border border-slate-300 bg-gradient-to-b from-slate-50 to-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white">
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
          <path d="M3 21V9l9-6 9 6v12z" fill="#334155" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="8" y="11" width="8" height="10" rx="1" fill="#0f172a" stroke="#94a3b8" />
          <path d="M9.5 13.5h5M9.5 16h5M9.5 18.5h5" stroke="#4ade80" strokeWidth="1.2" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">Estação</p>
          <p className="text-[10px] text-slate-300 leading-tight truncate">OLT → cordão → DIO → cabo para fora</p>
        </div>
        <span className="ml-auto text-[10px] text-slate-300">clique nas portas</span>
      </div>
      {temUso && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-slate-500 bg-slate-800" /> livre</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-600 bg-amber-400" /> em uso por outra rota</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-green-800 bg-green-600" /> esta rota</span>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Rack da estação: OLT, cordão e DIO">
        <defs>
          <linearGradient id="rackOlt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#334155" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="rackDio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#64748b" />
            <stop offset="1" stopColor="#334155" />
          </linearGradient>
        </defs>

        {/* Parede da estação */}
        <rect x={4} y={22} width={W - 8} height={hRack + 30} rx={10} fill="#f1f5f9" stroke="#94a3b8" strokeDasharray="5 4" />
        <text x={12} y={17} fontSize={9} fontWeight={700} fill="#64748b" letterSpacing=".5">ESTAÇÃO / POP</text>

        {/* OLT */}
        <rect x={xO} y={y0} width={wO} height={hO} rx={8} fill="url(#rackOlt)" stroke="#0f172a" />
        <text x={xO + 8} y={y0 + 15} fontSize={10} fontWeight={800} fill="#fff">OLT</text>
        <text x={xO + 32} y={y0 + 15} fontSize={9} fill="#cbd5e1">{curto(dados.oltNome || "OLT", 20)}</text>
        {!olt && (
          <text x={xO + wO / 2} y={y0 + 46} fontSize={9} textAnchor="middle" fill="#fbbf24" fontWeight={700}>
            Escolha a OLT do cadastro
          </text>
        )}
        {listaPlacas.map((pl, k) => {
          const x = xO + 8 + (k % colsPl) * 19.5;
          const y = y0 + 22 + Math.floor(k / colsPl) * 18;
          const ativo = pl === placa;
          return (
            <g key={`pl${pl}`} className="cursor-pointer" onClick={() => setPon(pl, pon !== null && listaPortas.includes(pon) ? pon : listaPortas[0] ?? 0)}>
              <title>{`Placa PL ${pad2(pl)}`}</title>
              <rect x={x} y={y} width={17} height={14} rx={2.5} fill={ativo ? "#4f46e5" : "#1e293b"} stroke={ativo ? "#c7d2fe" : "#475569"} />
              <text x={x + 8.5} y={y + 10} fontSize={7.5} textAnchor="middle" fill={ativo ? "#fff" : "#94a3b8"} fontWeight={700}>{pl}</text>
              {placasComUso.has(pl) && <circle cx={x + 15} cy={y + 2} r={2.6} fill="#fbbf24" stroke="#0f172a" strokeWidth={0.6} />}
            </g>
          );
        })}
        {olt && (
          <text x={xO + 8} y={yPortas - 3} fontSize={7.5} fill="#94a3b8">{placa !== null ? `portas PON da placa ${pad2(placa)}` : "escolha a placa"}</text>
        )}
        {listaPortas.map((po, k) => {
          const { x, y } = posPon(k);
          const ativo = po === pon && placa !== null;
          const uso = usoPon(po);
          return (
            <g key={`po${po}`} className="cursor-pointer" onClick={() => setPon(placaVista, po)}>
              <title>{`PON 0/${placaVista}/${po}${uso ? ` · em uso: ${uso}` : " · livre"}`}</title>
              <rect
                x={x - 7.5} y={y - 6.5} width={15} height={13} rx={2}
                fill={ativo ? (uso ? "#dc2626" : "#16a34a") : uso ? "#fbbf24" : "#0b1220"}
                stroke={ativo ? "#fff" : uso ? "#b45309" : "#334155"}
                strokeWidth={ativo ? 1.4 : 1}
              />
              <text x={x} y={y + 3} fontSize={7} textAnchor="middle" fill={ativo ? "#fff" : uso ? "#451a03" : "#64748b"} fontWeight={700}>{po}</text>
            </g>
          );
        })}

        {/* DIO */}
        <rect x={xD} y={y0} width={wD} height={hD} rx={8} fill="url(#rackDio)" stroke="#1e293b" />
        <text x={xD + 8} y={y0 + 15} fontSize={10} fontWeight={800} fill="#fff">DIO</text>
        <text x={xD + 32} y={y0 + 15} fontSize={9} fill="#e2e8f0">{dio ? `${curto(dados.dioNome || "DIO", 14)} · ${portasDio}p` : ""}</text>
        {!dio && (
          <text x={xD + wD / 2} y={y0 + 46} fontSize={9} textAnchor="middle" fill="#fbbf24" fontWeight={700}>
            Escolha o DIO do cadastro
          </text>
        )}
        {Array.from({ length: portasDio }, (_, k) => {
          const p = k + 1;
          const { x, y } = posDio(p);
          const ativo = p === portaDio;
          const uso = usoDio(p);
          return (
            <g key={`d${p}`} className="cursor-pointer" onClick={() => setDio(p)}>
              <title>{`Porta ${p} do DIO = fibra ${p} do cabo de saída${uso ? ` · em uso: ${uso}` : ""}`}</title>
              <rect
                x={x - 5} y={y - 5} width={10} height={10} rx={1.5}
                fill={ativo ? (uso ? "#dc2626" : "#16a34a") : uso ? "#fbbf24" : "#e2e8f0"}
                stroke={ativo ? "#052e16" : uso ? "#b45309" : "#475569"}
                strokeWidth={0.8}
              />
            </g>
          );
        })}
        {b && (
          <text x={b.x} y={b.y + 15} fontSize={7.5} textAnchor="middle" fill="#fff" fontWeight={700}>{portaDio}</text>
        )}

        {/* Cordão OLT → DIO (amarelo, monomodo) */}
        {a && b && (
          <g>
            <path d={`M${a.x} ${a.y} C ${a.x + 40} ${y0 + hRack + 18}, ${b.x - 40} ${y0 + hRack + 18}, ${b.x} ${b.y}`} fill="none" stroke="#0f172a" strokeWidth={5} strokeLinecap="round" />
            <path d={`M${a.x} ${a.y} C ${a.x + 40} ${y0 + hRack + 18}, ${b.x - 40} ${y0 + hRack + 18}, ${b.x} ${b.y}`} fill="none" stroke="#facc15" strokeWidth={2.8} strokeLinecap="round" />
            <circle cx={a.x} cy={a.y} r={3} fill="#facc15" stroke="#0f172a" />
            <circle cx={b.x} cy={b.y} r={3} fill="#facc15" stroke="#0f172a" />
            <rect x={(xO + wO + xD) / 2 - 34} y={y0 + hRack + 6} width={68} height={14} rx={7} fill="#fef9c3" stroke="#ca8a04" />
            <text x={(xO + wO + xD) / 2} y={y0 + hRack + 16} fontSize={8} textAnchor="middle" fill="#713f12" fontWeight={700}>
              cordão {dados.cordaoMetros ? `${dados.cordaoMetros} m` : "? m"}
            </text>
          </g>
        )}
        {(!a || !b) && (
          <text x={W / 2} y={y0 + hRack + 16} fontSize={8.5} textAnchor="middle" fill="#64748b">
            {!a ? "Clique na placa e na porta PON da OLT" : "Clique na porta do DIO"} para ligar o cordão
          </text>
        )}

        {/* Cabo que sai do DIO para fora da estação */}
        <path d={`M${xD + wD - 14} ${y0 + hD} V${ySaida + 10} H${W - 4}`} fill="none" stroke="#0f172a" strokeWidth={8} strokeLinecap="round" />
        <path d={`M${xD + wD - 14} ${y0 + hD} V${ySaida + 10} H${W - 4}`} fill="none" stroke={corSaida?.hex ?? "#94a3b8"} strokeWidth={3.5} strokeLinecap="round" />
        <text x={14} y={ySaida + 4} fontSize={9} fontWeight={700} fill="#0f172a">
          {dados.saidaCabo ? curto(dados.saidaCabo, 34) : "Cabo de saída (informe abaixo)"}
        </text>
        <text x={14} y={ySaida + 16} fontSize={8} fill="#475569">
          {portaDio ? `porta ${portaDio} do DIO = fibra ${portaDio}${corSaida ? ` (${corSaida.nome.toLowerCase()}${corSaida.tubo ? `, tubo ${corSaida.tubo}` : ""})` : ""}` : "escolha a porta do DIO"}
          {dados.destino ? ` → ${curto(dados.destino, 22)}` : " → primeira caixa fora da estação"}
        </text>
        <text x={W - 8} y={ySaida + 28} fontSize={8} textAnchor="end" fill="#64748b">para fora ➜</text>
      </svg>

      {(conflitoPon || conflitoDio) && (
        <div className="mx-3 mt-1 space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800">
          {conflitoPon && <p>A PON 0/{placa}/{pon} já é da rota <b>{conflitoPon}</b>. Para outra porta, escolha uma livre.</p>}
          {conflitoDio && <p>A porta {portaDio} do DIO já é da rota <b>{conflitoDio}</b>.</p>}
        </div>
      )}

      {/* Campos */}
      <div className="p-3 space-y-2.5 border-t border-slate-200">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rot}><span className="inline-flex items-center gap-1"><IconeElemento tipo="olt" tamanho={12} /> OLT</span></label>
            {olts.length ? (
              <select
                className={campo}
                value={dados.oltEquip}
                onChange={(e) => {
                  const o = olts.find((x) => x.id === e.target.value);
                  onMudar({ oltEquip: e.target.value, ...(o ? { oltNome: o.nome, oltPot: o.potencia_tx !== undefined ? String(o.potencia_tx).replace(".", ",") : dados.oltPot } : {}) });
                }}
              >
                <option value="">— escolha —</option>
                {olts.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            ) : (
              <p className="text-[11px] text-red-600 leading-tight">Nenhuma OLT cadastrada. Cadastre em Cadastros → OLTs.</p>
            )}
          </div>
          <div>
            <label className={rot}>Potência PON (dBm)</label>
            <input className={campo} inputMode="decimal" value={dados.oltPot} onChange={(e) => onMudar({ oltPot: e.target.value })} placeholder="ex.: 5" />
          </div>
          <div>
            <label className={rot}><span className="inline-flex items-center gap-1"><IconeElemento tipo="dio" tamanho={12} /> DIO</span></label>
            {dios.length ? (
              <select
                className={campo}
                value={dados.dioEquip}
                onChange={(e) => {
                  const d = dios.find((x) => x.id === e.target.value);
                  onMudar({ dioEquip: e.target.value, ...(d && /^DIO( \d+)?$/.test(dados.dioNome) ? { dioNome: d.nome } : {}) });
                }}
              >
                <option value="">— escolha —</option>
                {dios.map((d) => <option key={d.id} value={d.id}>{d.nome} · {resumoItem(d)}</option>)}
              </select>
            ) : (
              <p className="text-[11px] text-red-600 leading-tight">Nenhum DIO cadastrado. Cadastre em Cadastros → DIOs.</p>
            )}
          </div>
          <div>
            <label className={rot}>Cordão (m)</label>
            <input className={campo} inputMode="decimal" value={dados.cordaoMetros} onChange={(e) => onMudar({ cordaoMetros: e.target.value })} placeholder="ex.: 3" />
          </div>
        </div>
        {!cordao ? (
          <p className="text-[11px] text-red-600">Nenhum cordão óptico cadastrado. Cadastre em Cadastros → Cabos (construção “Cordão óptico”).</p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">Ligação OLT → DIO:</span>
            <span className="rounded-full border border-amber-500 bg-amber-400 px-2 py-0.5 font-semibold text-amber-950">{cordao.nome}</span>
            {dados.cordaoTipo !== cordao.id && (
              <button type="button" onClick={() => onMudar({ cordaoTipo: cordao.id })} className="text-[10px] font-semibold text-red-600 underline">
                usar o cordão
              </button>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-2 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
            <IconeCabo tamanho={15} /> Cabo que sai do DIO
            <span className="ml-auto font-normal text-slate-500">{dio ? `mesmo tamanho do DIO (${portasDio} fibras)` : "escolha o DIO"}</span>
          </p>
          {dados.destino === undefined ? (
            <p className="text-[11px] text-slate-500">Coloque no mapa a primeira caixa fora da estação; o cabo de saída é configurado aqui.</p>
          ) : (
            <>
              {onVerSaida && (
                <button
                  type="button"
                  onClick={onVerSaida}
                  className="w-full flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-semibold py-1 hover:bg-amber-100"
                >
                  Ver no mapa o cabo até {curto(dados.destino || "a primeira caixa", 24)}
                </button>
              )}
              <input
                className={campo}
                list="cabos-conhecidos"
                value={dados.saidaCabo ?? ""}
                onChange={(e) => onMudar({ saidaCabo: e.target.value })}
                placeholder="Nome do cabo de saída (ex.: 04 - SAÍDA ESTAÇÃO)"
              />
              <div className="flex flex-wrap gap-1">
                {sugestoesSaida.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onMudar({ saidaTipo: t.id })}
                    className={`text-[11px] rounded-full border px-2 py-0.5 ${
                      dados.saidaTipo === t.id
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : t.id === caboIgual?.id
                          ? "bg-indigo-50 border-indigo-400 text-indigo-800"
                          : "bg-white border-slate-300 hover:border-indigo-400"
                    }`}
                    title={`${resumoItem(t)}${t.id === caboIgual?.id ? " · mesmo tamanho do DIO" : ""}`}
                  >
                    {t.nome}{t.id === caboIgual?.id ? " ✓" : ""}
                  </button>
                ))}
              </div>
              {!dados.saidaTipo && <p className="text-[10px] text-red-600">Escolha o tipo do cabo de saída (só cabos do cadastro).</p>}
              {dio && tipoSaida?.capacidade && tipoSaida.capacidade !== portasDio && (
                <p className="text-[10px] text-amber-700">O cabo tem {tipoSaida.capacidade} fibras e o DIO {portasDio} portas.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function curto(t: string, n0: number) {
  return cortar(t, n0);
}

function n(v?: string): number | undefined {
  if (!v) return undefined;
  const x = parseFloat(v.replace(",", "."));
  return isFinite(x) ? x : undefined;
}
