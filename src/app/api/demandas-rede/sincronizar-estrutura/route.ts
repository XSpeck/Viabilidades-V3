import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

// Espelha em "demandas_rede" o agendamento de uma visita de estruturação de
// prédio/condomínio confirmado pelo cliente (role "usuario"), que não tem
// permissão de escrita direta nessa coleção (ver firestore.rules). Roda com
// Admin SDK — por isso fica em rota de API em vez de no client Firestore SDK.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as {
      idToken: string;
      viabilizacaoId: string;
      tecnico?: string;
      dataAgendamento: string;
      periodoAgendamento: string;
      predio?: string;
      localizacao?: string;
      urgente?: boolean;
    };
    const { idToken, viabilizacaoId, tecnico, dataAgendamento, periodoAgendamento, predio, localizacao, urgente } = body;

    if (!idToken || !viabilizacaoId || !dataAgendamento || !periodoAgendamento) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    await adminAuth.verifyIdToken(idToken);

    const col = adminDb.collection("demandas_rede");
    const snap = await col.where("viabilizacao_id", "==", viabilizacaoId).limit(1).get();
    const tecnicos = tecnico ? [tecnico] : [];

    if (!snap.empty) {
      await snap.docs[0].ref.update({
        tecnicos,
        data_agendamento: dataAgendamento,
        periodo_agendamento: periodoAgendamento,
        status: "agendada",
      });
    } else {
      await col.add({
        tecnicos,
        tipo: "Estruturação de Rede",
        ...(localizacao ? { local: localizacao } : {}),
        prioridade: urgente ? "alta" : "media",
        descricao: `Estruturação de rede — ${predio ?? "Prédio"}`,
        status: "agendada",
        criado_por: "Sistema",
        data_criacao: new Date().toISOString(),
        data_agendamento: dataAgendamento,
        periodo_agendamento: periodoAgendamento,
        viabilizacao_id: viabilizacaoId,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno." },
      { status: 500 }
    );
  }
}
