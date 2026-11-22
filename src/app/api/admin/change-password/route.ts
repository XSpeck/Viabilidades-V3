import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { exigirAdm, respostaDeErro } from "@/lib/servidor/exigirAdm";

export const runtime = "nodejs";

// Troca a senha de um usuário. Só ADM, conferido pelo token de login (nunca por um id vindo no corpo).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await exigirAdm(request);
    const { uid, newPassword } = (await request.json()) as { uid?: string; newPassword?: string };
    if (!uid || !newPassword) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
    if (newPassword.length < 6) return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres." }, { status: 400 });
    await adminAuth.updateUser(uid, { password: newPassword });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { error, status } = respostaDeErro(e);
    return NextResponse.json({ error }, { status });
  }
}
