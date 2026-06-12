import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type TipoNotificacao =
  | "nova_viabilizacao"
  | "aprovado"
  | "rejeitado"
  | "utp"
  | "contestacao"
  | "proposta_enviada"
  | "aguardando_confirmacao"
  | "agendado"
  | "instalado";

// Enfileira um evento e dispara o processamento imediatamente
export async function enqueueNotificacao(
  viabilizacao_id: string,
  tipo: TipoNotificacao
): Promise<void> {
  try {
    await addDoc(collection(db, "bot_notificacoes"), {
      viabilizacao_id,
      tipo,
      processado: false,
      criado_em: serverTimestamp(),
    });
    // Dispara o bot-tick sem aguardar (fire-and-forget)
    fetch("/api/bot-tick").catch(() => {});
  } catch (err) {
    console.error("[bot] Falha ao enfileirar notificação:", viabilizacao_id, tipo, err);
  }
}
