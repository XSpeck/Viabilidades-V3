import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { exigirAdm, respostaDeErro } from "@/lib/servidor/exigirAdm";

export const runtime = "nodejs";

// Desativa ou reativa um usuário: bloqueia o login (Auth) e marca o cadastro. O nome continua no histórico.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const quem = await exigirAdm(request);
    const { uid, ativo } = (await request.json()) as { uid?: string; ativo?: boolean };
    if (!uid || typeof ativo !== "boolean") return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    if (uid === quem && !ativo) return NextResponse.json({ error: "Você não pode desativar a si mesmo." }, { status: 400 });
    await adminAuth.updateUser(uid, { disabled: !ativo });
    if (!ativo) await adminAuth.revokeRefreshTokens(uid);
    await adminDb.collection("users").doc(uid).set({ ativo }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = respostaDeErro(e);
    return NextResponse.json({ error }, { status });
  }
}
