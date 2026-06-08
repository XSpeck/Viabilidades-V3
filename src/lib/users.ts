import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppUser, UserCargo } from "@/types";

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      nome: data.nome,
      login: data.login,
      nivel: data.nivel,
      cargo: data.cargo ?? (data.nivel === 1 ? "auditor" : "usuario"),
    };
  });
}

function parseFirebaseAuthError(message: string): string {
  if (message.includes("EMAIL_EXISTS")) return "Email já cadastrado.";
  if (message.includes("WEAK_PASSWORD")) return "Senha fraca (mínimo 6 caracteres).";
  if (message.includes("INVALID_EMAIL")) return "Email inválido.";
  if (message.includes("TOO_MANY_ATTEMPTS")) return "Muitas tentativas. Tente mais tarde.";
  return message;
}

export async function createUser(
  email: string,
  password: string,
  nome: string,
  cargo: UserCargo
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(parseFirebaseAuthError(err.error?.message ?? "Erro ao criar usuário"));
  }
  const { localId } = await res.json();
  const nivel = cargo === "usuario" ? 2 : 1;
  await setDoc(doc(db, "users", localId), { nome, login: email, nivel, cargo });
}

export async function updateUser(
  uid: string,
  data: { nome?: string; cargo?: UserCargo }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.nome !== undefined) updates.nome = data.nome;
  if (data.cargo !== undefined) {
    updates.cargo = data.cargo;
    updates.nivel = data.cargo === "usuario" ? 2 : 1;
  }
  await updateDoc(doc(db, "users", uid), updates);
}

export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid));
}
