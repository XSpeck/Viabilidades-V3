// =====================
// Avisos e confirmações no estilo do site (no lugar do alert/confirm do navegador).
// Qualquer tela chama `avisar(...)` ou `await confirmar(...)`; o <DialogoHost/> do layout mostra.
// =====================

export interface PedidoDialogo {
  id: number;
  tipo: "aviso" | "confirmar";
  mensagem: string;
  titulo?: string;
  /** Texto do botão principal */
  ok?: string;
  cancelar?: string;
  /** Ação que apaga ou não tem volta: botão vermelho */
  perigo?: boolean;
  responder: (sim: boolean) => void;
}

export interface OpcoesDialogo {
  titulo?: string;
  ok?: string;
  cancelar?: string;
  perigo?: boolean;
}

type Ouvinte = (fila: PedidoDialogo[]) => void;
let fila: PedidoDialogo[] = [];
let seq = 0;
const ouvintes = new Set<Ouvinte>();
const avisarOuvintes = () => ouvintes.forEach((o) => o(fila));

export function ouvirDialogos(o: Ouvinte): () => void {
  ouvintes.add(o);
  o(fila);
  return () => { ouvintes.delete(o); };
}

function pedir(tipo: PedidoDialogo["tipo"], mensagem: string, op: OpcoesDialogo = {}): Promise<boolean> {
  // sem a tela montada (teste, servidor): cai no do navegador, se houver
  if (!ouvintes.size) {
    if (typeof window === "undefined") return Promise.resolve(tipo === "aviso");
    if (tipo === "aviso") { window.alert(mensagem); return Promise.resolve(true); }
    return Promise.resolve(window.confirm(mensagem));
  }
  return new Promise((res) => {
    const id = ++seq;
    fila = [...fila, { id, tipo, mensagem, ...op, responder: (sim) => { fila = fila.filter((p) => p.id !== id); avisarOuvintes(); res(sim); } }];
    avisarOuvintes();
  });
}

/** Aviso com um botão OK */
export function avisar(mensagem: string, op?: OpcoesDialogo): Promise<void> {
  return pedir("aviso", mensagem, op).then(() => undefined);
}

/** Pergunta Sim/Não; devolve true se a pessoa confirmou */
export function confirmar(mensagem: string, op?: OpcoesDialogo): Promise<boolean> {
  // excluir/apagar: botão vermelho por padrão
  const perigo = op?.perigo ?? /\b(excluir|apagar|tirar|desfeito)\b/i.test(mensagem);
  return pedir("confirmar", mensagem, { ...op, perigo });
}
