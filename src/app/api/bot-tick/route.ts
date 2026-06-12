import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { processarNotificacao, type TipoNotificacao } from "@/lib/bot";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  // Vercel Cron injeta automaticamente: Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ ok: true, processado });
}
