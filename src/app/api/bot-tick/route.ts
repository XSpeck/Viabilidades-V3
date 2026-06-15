import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { processarNotificacao, type TipoNotificacao } from "@/lib/bot";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_request: Request): Promise<NextResponse> {
  const snap = await adminDb
    .collection("bot_notificacoes")
    .where("processado", "==", false)
    .orderBy("criado_em", "asc")
    .limit(20)
    .get();

  if (snap.empty) return NextResponse.json({ ok: true, processado: 0 });

  let processado = 0;
  for (const notifDoc of snap.docs) {
    const { viabilizacao_id, tipo } = notifDoc.data() as {
      viabilizacao_id: string;
      tipo: TipoNotificacao;
    };
    try {
      const viabDoc = await adminDb.collection("viabilizacoes").doc(viabilizacao_id).get();
      if (viabDoc.exists) {
        await processarNotificacao(tipo, { id: viabDoc.id, ...viabDoc.data() });
      }
      await notifDoc.ref.update({ processado: true });
      processado++;
    } catch (err) {
      console.error(`[bot-tick] Erro ao processar ${notifDoc.id}:`, err);
    }
  }

  // Limpeza oportunista: remove notificações já processadas com mais de 24h
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const velhos = await adminDb
      .collection("bot_notificacoes")
      .where("processado", "==", true)
      .where("criado_em", "<", cutoff)
      .limit(100)
      .get();

    if (!velhos.empty) {
      const batch = adminDb.batch();
      velhos.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    // limpeza é best-effort, não afeta o resultado principal
  }

  return NextResponse.json({ ok: true, processado });
}
