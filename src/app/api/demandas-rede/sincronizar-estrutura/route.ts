import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function mirrorDemandaId(viabilizacaoId: string): string {
  return `estrutura_${viabilizacaoId}`;
}

// Espelha em "demandas_rede" o agendamento de uma visita de estruturação de
// prédio/condomínio confirmado pelo cliente (role "usuario"), que não tem
// permissão de escrita direta nessa coleção (ver firestore.rules). Roda com
// Admin SDK — por isso fica em rota de API em vez de no client Firestore SDK.
//
// Recebe só o id da viabilização — todo o conteúdo da demanda é lido do
// próprio documento no servidor, nunca confiado ao corpo da requisição,
// para que um usuário autenticado não possa injetar dados arbitrários.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { idToken, viabilizacaoId } = await request.json() as { idToken: string; viabilizacaoId: string };

    if (!idToken || !viabilizacaoId) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    await adminAuth.verifyIdToken(idToken);

    const viabDoc = await adminDb.collection("viabilizacoes").doc(viabilizacaoId).get();
    const v = viabDoc.data();
    if (!viabDoc.exists || v?.status_predio !== "agendado" || !v.data_visita || !v.periodo_visita) {
      return NextResponse.json({ error: "Viabilização não está agendada." }, { status: 403 });
    }

    const col = adminDb.collection("demandas_rede");
    const detRef = col.doc(mirrorDemandaId(viabilizacaoId));
    const legacySnap = await col.where("viabilizacao_id", "==", viabilizacaoId).limit(1).get();
    const ref = legacySnap.empty ? detRef : legacySnap.docs[0].ref;
    const tecnicos = v.tecnico_responsavel ? [v.tecnico_responsavel] : [];

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        tx.update(ref, {
          tecnicos,
          data_agendamento: v.data_visita,
          periodo_agendamento: v.periodo_visita,
          status: "agendada",
        });
      } else {
        tx.set(ref, {
          tecnicos,
          tipo: "Estruturação de Rede",
          ...(v.plus_code_cliente ? { local: v.plus_code_cliente } : {}),
          prioridade: v.urgente ? "alta" : "media",
          descricao: `Estruturação de rede — ${v.predio_ftta ?? "Prédio"}`,
          status: "agendada",
          criado_por: "Sistema",
          data_criacao: new Date().toISOString(),
          data_agendamento: v.data_visita,
          periodo_agendamento: v.periodo_visita,
          viabilizacao_id: viabilizacaoId,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno." },
      { status: 500 }
    );
  }
}
