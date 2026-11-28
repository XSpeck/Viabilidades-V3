"use client";

// =====================
// Desenho do prédio (SVG): céu, rua e chão; cada bloco com fachada, janelas, portaria e garagem.
// O cabo chega da rua no quadro do prédio (DG) e sobe até cada CDOI; da CDOI sai a prumada pelos andares
// que ela atende, com um ramal em cada andar. Com sinal, a luz corre pelo cabo e pela prumada e as janelas
// dos andares atendidos acendem.
// =====================
import { andaresDoBloco, rotuloAndarCurto, type BlocoPredio, type PontoPredio, type PredioRede } from "@/lib/prediosRede";

export interface InfoCdoi {
  nome: string;
  cor: string;
  aceso: boolean;
  pot?: number;
  existe: boolean;
}

interface Props {
  predio: PredioRede;
  info: (o: PontoPredio) => InfoCdoi;
  selecionada?: string | null;
  onSelecionar?: (id: string) => void;
  /** Clicar num andar com uma CDOI escolhida: ela passa a atender até ali */
  onAndar?: (bloco: string, andar: number) => void;
  /** Texto do dBm ("−18,4") */
  dbm: (v?: number) => string;
}

const FH = 24, JAN = 22, POCO = 30, LADO = 30, GAP = 46, ESQ = 92, TOPO = 74;

export default function DesenhoPredio({ predio, info, selecionada, onSelecionar, onAndar, dbm }: Props) {
  const blocos = predio.blocos;
  const aptosDe = (b: BlocoPredio) => Math.max(1, Math.min(b.aptos, 8));
  const largura = (b: BlocoPredio) => LADO + aptosDe(b) * JAN + POCO;
  const xs: number[] = [];
  let x = ESQ;
  for (const b of blocos) { xs.push(x); x += largura(b) + GAP; }
  const maxAndar = Math.max(1, ...blocos.map((b) => b.andares));
  const maxSub = Math.max(0, ...blocos.map((b) => b.subsolos));
  const chao = TOPO + (maxAndar + 1) * FH;
  const W = x + 10;
  const H = chao + maxSub * FH + 56;
  /** Topo do andar a (térreo = 0; subsolos abaixo do chão) */
  const yAndar = (a: number) => (a >= 0 ? chao - (a + 1) * FH : chao + (-a - 1) * FH);
  const meio = (a: number) => yAndar(a) + FH / 2;
  const poco = (bi: number) => xs[bi] + largura(blocos[bi]) - POCO;
  const yDg = chao + 14;
  const xDg = blocos.length ? poco(0) + POCO / 2 : ESQ;

  /** Onde fica cada CDOI (no poço do bloco, no andar dela) */
  const pos = (o: PontoPredio) => {
    const bi = blocos.findIndex((b) => b.id === o.bloco);
    if (bi < 0) return null;
    const mesmos = predio.pontos.filter((p) => p.bloco === o.bloco && p.andar === o.andar);
    const k = mesmos.indexOf(o);
    return { bi, x: poco(bi) + POCO / 2 + (mesmos.length > 1 ? (k - (mesmos.length - 1) / 2) * 9 : 0), y: meio(o.andar) };
  };
  /** Andares que cada bloco tem acesos (a CDOI que atende tem sinal) e a cor de quem atende */
  const atende = (bloco: string, a: number) =>
    predio.pontos.find((o) => o.bloco === bloco && a >= Math.min(o.atende_de, o.atende_ate) && a <= Math.max(o.atende_de, o.atende_ate));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" style={{ minWidth: Math.min(W, 460) }}>
      <defs>
        <linearGradient id="dp-ceu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset=".55" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="dp-fachada" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e2e8f0" />
          <stop offset=".5" stopColor="#f8fafc" />
          <stop offset="1" stopColor="#cbd5e1" />
        </linearGradient>
        <linearGradient id="dp-vidro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#93c5fd" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <radialGradient id="dp-luz">
          <stop offset="0" stopColor="#fef9c3" />
          <stop offset="1" stopColor="#fbbf24" />
        </radialGradient>
        <pattern id="dp-terra" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#a8896b" />
          <circle cx="3" cy="3" r="1" fill="#8b6f52" />
          <circle cx="7.5" cy="7" r=".8" fill="#8b6f52" />
        </pattern>
        <filter id="dp-sombra" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="2" dy="3" stdDeviation="2.5" floodOpacity=".25" />
        </filter>
        <filter id="dp-brilho"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>

      {/* céu, sol, nuvens */}
      <rect width={W} height={chao} fill="url(#dp-ceu)" />
      <circle cx={W - 46} cy={34} r={16} fill="#fde68a" opacity=".9" />
      {[[60, 30], [W * 0.45, 22], [W * 0.7, 44]].map(([cx, cy], k) => (
        <g key={k} opacity=".8" fill="#fff">
          <ellipse cx={cx} cy={cy} rx={20} ry={7}>
            <animate attributeName="cx" values={`${cx};${cx + 14};${cx}`} dur={`${18 + k * 6}s`} repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx + 12} cy={cy - 4} rx={12} ry={6}>
            <animate attributeName="cx" values={`${cx + 12};${cx + 26};${cx + 12}`} dur={`${18 + k * 6}s`} repeatCount="indefinite" />
          </ellipse>
        </g>
      ))}

      {/* chão, calçada e rua */}
      <rect y={chao} width={W} height={H - chao} fill="url(#dp-terra)" />
      <rect y={chao - 2} width={W} height={5} fill="#57534e" />
      <rect y={chao - 8} width={ESQ - 18} height={6} fill="#475569" />
      {[8, 30, 52].map((xx) => <rect key={xx} x={xx} y={chao - 5.5} width={12} height={1.2} fill="#f8fafc" />)}
      <text x={6} y={chao - 13} fontSize={8} fontWeight={800} fill="#334155">RUA</text>
      {/* árvore */}
      <g>
        <rect x={ESQ - 34} y={chao - 30} width={4} height={24} fill="#78350f" />
        <circle cx={ESQ - 32} cy={chao - 36} r={12} fill="#16a34a" />
        <circle cx={ESQ - 38} cy={chao - 30} r={8} fill="#15803d" />
      </g>

      {blocos.map((b, bi) => {
        const x0 = xs[bi];
        const lt = largura(b);
        const yTop = yAndar(b.andares);
        const n = aptosDe(b);
        return (
          <g key={b.id} filter="url(#dp-sombra)">
            {/* platibanda e nome */}
            <rect x={x0 - 4} y={yTop - 8} width={lt + 8} height={8} rx={2} fill="#475569" />
            <rect x={x0 + lt * 0.35} y={yTop - 18} width={lt * 0.3} height={10} rx={2} fill="#64748b" />
            <rect x={x0 + lt / 2 - 34} y={yTop - 36} width={68} height={15} rx={7.5} fill="#0f172a" />
            <text x={x0 + lt / 2} y={yTop - 25.5} fontSize={9} fontWeight={800} textAnchor="middle" fill="#fff">{b.nome}</text>
            {andaresDoBloco(b).map((a) => {
              const y = yAndar(a);
              const quem = atende(b.id, a);
              const iq = quem ? info(quem) : null;
              const luz = !!iq?.aceso;
              const sub = a < 0;
              return (
                <g key={a} className={onAndar ? "cursor-pointer" : undefined} onClick={() => onAndar?.(b.id, a)}>
                  <title>{`${b.nome} · ${a === 0 ? "Térreo" : sub ? `Subsolo ${-a}` : `${a}º andar`}${quem ? ` · atendido pela ${quem.nome}` : " · sem CDOI"}`}</title>
                  <rect x={x0} y={y} width={lt} height={FH} fill={sub ? "#475569" : "url(#dp-fachada)"} stroke="#94a3b8" strokeWidth={0.5} />
                  {/* faixa da CDOI que atende o andar */}
                  {quem && <rect x={x0} y={y} width={3} height={FH} fill={iq!.cor} />}
                  <text x={x0 + LADO / 2} y={y + FH / 2 + 3} fontSize={7.5} fontWeight={700} textAnchor="middle" fill={sub ? "#e2e8f0" : "#64748b"}>{rotuloAndarCurto(a)}</text>
                  {a === 0 ? (
                    <>
                      {/* portaria: porta de vidro e toldo */}
                      <rect x={x0 + LADO} y={y + 3} width={n * JAN - 4} height={4} rx={1} fill="#0f766e" />
                      <rect x={x0 + LADO + 4} y={y + 8} width={14} height={FH - 8} rx={1.5} fill="url(#dp-vidro)" stroke="#334155" strokeWidth={0.8} />
                      <rect x={x0 + LADO + 22} y={y + 9} width={n * JAN - 30} height={FH - 14} rx={1.5} fill={luz ? "url(#dp-luz)" : "url(#dp-vidro)"} opacity={0.9} />
                    </>
                  ) : sub ? (
                    <>
                      <rect x={x0 + LADO} y={y + 6} width={n * JAN - 4} height={FH - 6} fill="#1e293b" />
                      <text x={x0 + LADO + (n * JAN) / 2} y={y + FH / 2 + 5} fontSize={6.5} fontWeight={700} textAnchor="middle" fill="#94a3b8">GARAGEM</text>
                    </>
                  ) : (
                    Array.from({ length: n }, (_, k) => {
                      const wx = x0 + LADO + k * JAN + 3, wy = y + 5, ww = JAN - 6, wh = FH - 10;
                      return (
                        <g key={k}>
                          {luz && <rect x={wx - 2} y={wy - 2} width={ww + 4} height={wh + 4} rx={2} fill="#fbbf24" opacity={0.5} filter="url(#dp-brilho)" />}
                          <rect x={wx} y={wy} width={ww} height={wh} rx={1.2} fill={luz ? "url(#dp-luz)" : "url(#dp-vidro)"} stroke="#334155" strokeWidth={0.6}>
                            {luz && <animate attributeName="opacity" values="1;.78;1" dur={`${2.4 + ((k + a) % 4) * 0.5}s`} repeatCount="indefinite" />}
                          </rect>
                          <line x1={wx + ww / 2} y1={wy} x2={wx + ww / 2} y2={wy + wh} stroke="#334155" strokeWidth={0.5} opacity={0.6} />
                          <rect x={wx - 1} y={wy + wh} width={ww + 2} height={1.6} fill="#94a3b8" />
                        </g>
                      );
                    })
                  )}
                </g>
              );
            })}
            {/* poço técnico (prumada) */}
            <rect x={poco(bi)} y={yTop} width={POCO} height={chao - yTop + b.subsolos * FH} fill="#0f172a" opacity={0.12} />
            <line x1={poco(bi)} y1={yTop} x2={poco(bi)} y2={chao + b.subsolos * FH} stroke="#64748b" strokeWidth={0.6} />
          </g>
        );
      })}

      {/* quadro do prédio (DG) */}
      {blocos.length > 0 && (
        <g>
          <rect x={xDg - 11} y={yDg - 8} width={22} height={16} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2} />
          <text x={xDg} y={yDg + 3} fontSize={7} fontWeight={800} textAnchor="middle" fill="#7dd3fc">DG</text>
        </g>
      )}

      {/* cabo da rua até o DG */}
      {blocos.length > 0 && (() => {
        const alguma = predio.pontos.map(info).find((i) => i.aceso);
        const d = `M0 ${chao - 5} H${ESQ - 12} V${yDg} H${xDg - 11}`;
        return (
          <g>
            <path d={d} fill="none" stroke="#0f172a" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
            <path d={d} fill="none" stroke={alguma ? alguma.cor : "#94a3b8"} strokeWidth={2.4} strokeLinejoin="round" strokeDasharray={alguma ? undefined : "4 3"} />
            {alguma && [0, 1, 2].map((k) => (
              <circle key={k} r={2.4} fill="#fff">
                <animateMotion dur="2.6s" begin={`${k * 0.85}s`} repeatCount="indefinite" path={d} />
              </circle>
            ))}
          </g>
        );
      })()}

      {/* do DG até cada CDOI, e a prumada pelos andares que ela atende */}
      {predio.pontos.map((o) => {
        const p = pos(o);
        if (!p) return null;
        const io = info(o);
        const lw = xs[p.bi] + LADO + aptosDe(blocos[p.bi]) * JAN;
        const de = Math.min(o.atende_de, o.atende_ate), ate = Math.max(o.atende_de, o.atende_ate);
        const subida = `M${xDg} ${yDg - 8} V${yDg - 8} ${p.bi === 0 ? "" : `V${chao + 6} H${p.x}`} V${p.y}`;
        const andares: number[] = [];
        for (let a = de; a <= ate; a++) andares.push(a);
        const sel = selecionada === o.id;
        return (
          <g key={`pr${o.id}`} opacity={selecionada && !sel ? 0.45 : 1}>
            {/* cabo interno do DG até a CDOI */}
            <path d={subida} fill="none" stroke="#0f172a" strokeWidth={3.6} strokeLinejoin="round" />
            <path d={subida} fill="none" stroke={io.cor} strokeWidth={1.6} strokeLinejoin="round" strokeDasharray={io.aceso ? undefined : "3 2"} />
            {io.aceso && (
              <circle r={2} fill="#fff">
                <animateMotion dur="2.2s" repeatCount="indefinite" path={subida} />
              </circle>
            )}
            {/* prumada: sobe/desce pelos andares atendidos */}
            <line x1={p.x} y1={meio(ate)} x2={p.x} y2={meio(de)} stroke={io.cor} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
            {andares.map((a, k) => {
              const ramal = `M${p.x} ${p.y} V${meio(a)} H${lw - 2}`;
              return (
                <g key={a}>
                  <line x1={p.x} y1={meio(a)} x2={lw - 2} y2={meio(a)} stroke={io.cor} strokeWidth={1} strokeDasharray="2 1.6" opacity={0.85} />
                  <rect x={p.x - 2.6} y={meio(a) - 2.6} width={5.2} height={5.2} rx={1.2} fill="#fff" stroke={io.cor} strokeWidth={1.2} />
                  {io.aceso && (
                    <circle r={1.7} fill={io.cor} stroke="#fff" strokeWidth={0.6}>
                      <animateMotion dur={`${1.6 + Math.abs(a - o.andar) * 0.18}s`} begin={`${(k % 5) * 0.3}s`} repeatCount="indefinite" path={ramal} />
                    </circle>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* CDOIs */}
      {predio.pontos.map((o) => {
        const p = pos(o);
        if (!p) return null;
        const io = info(o);
        const sel = selecionada === o.id;
        return (
          <g key={`cd${o.id}`} className={onSelecionar ? "cursor-pointer" : undefined} onClick={(e) => { e.stopPropagation(); onSelecionar?.(o.id); }}>
            <title>{`${io.nome}${io.aceso ? ` · ${dbm(io.pot)} dBm` : " · sem sinal"}`}</title>
            {(io.aceso || sel) && (
              <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={sel ? "#0ea5e9" : io.cor} strokeWidth={2}>
                <animate attributeName="r" values="9;15;9" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".9;0;.9" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <rect x={p.x - 8} y={p.y - 8} width={16} height={16} rx={3.5} fill={io.existe ? "#ea580c" : "#dc2626"} stroke="#fff" strokeWidth={1.5} />
            <rect x={p.x - 4.5} y={p.y - 3} width={9} height={2} rx={0.5} fill="#fff" opacity={0.9} />
            <rect x={p.x - 4.5} y={p.y + 1} width={9} height={2} rx={0.5} fill="#fff" opacity={0.9} />
            {io.aceso && io.pot !== undefined && (
              <g>
                <rect x={p.x + 10} y={p.y - 7} width={36} height={13} rx={6.5} fill={io.cor} />
                <text x={p.x + 28} y={p.y + 2.5} fontSize={7.5} fontWeight={800} textAnchor="middle" fill="#fff">{dbm(io.pot)}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
