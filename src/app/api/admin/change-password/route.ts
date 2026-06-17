import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { uid, newPassword, callerUid } = await request.json() as {
      uid: string;
      newPassword: string;
      callerUid: string;
    };

    if (!uid || !newPassword || !callerUid) {
      return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres." }, { status: 400 });
    }

    // Verificar se o chamador é admin (nivel === 1)
    const callerDoc = await adminDb.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data()?.nivel !== 1) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    await adminAuth.updateUser(uid, { password: newPassword });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno." },
      { status: 500 }
    );
  }
}
