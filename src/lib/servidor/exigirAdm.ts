import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

/**
 * Confere o login de quem chamou a rota (token do Firebase no cabeçalho Authorization: Bearer ...)
 * e se é ADM. Devolve o uid ou lança um erro com o status HTTP.
 */
export async function exigirAdm(request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Faça login de novo."), { status: 401 });
  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    throw Object.assign(new Error("Sessão inválida. Faça login de novo."), { status: 401 });
  }
  const perfil = await adminDb.collection("users").doc(uid).get();
  const dados = perfil.data();
  if (!perfil.exists || dados?.cargo !== "adm" || dados?.ativo === false) {
    throw Object.assign(new Error("Só administradores podem fazer isso."), { status: 403 });
  }
  return uid;
}

export function respostaDeErro(e: unknown): { error: string; status: number } {
  const status = typeof e === "object" && e && "status" in e ? Number((e as { status: number }).status) : 500;
  return { error: e instanceof Error ? e.message : "Erro interno.", status: status || 500 };
}

/** Só confere que quem chamou está logado (qualquer cargo). Devolve o uid. */
export async function exigirLogin(request: Request): Promise<string> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("Faça login de novo."), { status: 401 });
  try {
    return (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    throw Object.assign(new Error("Sessão inválida. Faça login de novo."), { status: 401 });
  }
}
