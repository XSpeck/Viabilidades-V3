import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, deleteField } from "firebase/firestore";
import { db } from "./firebase";
import type { AppUser, UserCargo, EquipeUsuario, PapelFinanceiro } from "@/types";

const USERS_CACHE_KEY = "viab_users_v1";
const USERS_CACHE_TTL = 5 * 60 * 1000;

function getUsersCache(): AppUser[] | null {
  try {
    const raw = sessionStorage.getItem(USERS_CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: AppUser[]; ts: number };
    if (Date.now() - ts > USERS_CACHE_TTL) { sessionStorage.removeItem(USERS_CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function setUsersCache(data: AppUser[]): void {
  try { sessionStorage.setItem(USERS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function bustUsersCache(): void {
  try { sessionStorage.removeItem(USERS_CACHE_KEY); } catch {}
}

export async function listUsers(): Promise<AppUser[]> {
  const cached = getUsersCache();
  if (cached) return cached;
  const snap = await getDocs(collection(db, "users"));
  const data = snap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      nome: u.nome,
      login: u.login,
      nivel: u.nivel,
      cargo: u.cargo ?? (u.nivel === 1 ? "auditor" : "usuario"),
      equipe: u.equipe,
      funcao_tecnico: u.funcao_tecnico,
      papel_financeiro: u.papel_financeiro,
    };
  });
  setUsersCache(data);
  return data;
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
  cargo: UserCargo,
  equipe?: EquipeUsuario,
  funcaoTecnico?: string,
  papelFinanceiro?: PapelFinanceiro
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
  const docData: Record<string, unknown> = { nome, login: email, nivel, cargo };
  if (equipe) docData.equipe = equipe;
  if (funcaoTecnico) docData.funcao_tecnico = funcaoTecnico;
  if (papelFinanceiro) docData.papel_financeiro = papelFinanceiro;
  await setDoc(doc(db, "users", localId), docData);
  bustUsersCache();
}

export async function updateUser(
  uid: string,
  data: {
    nome?: string;
    cargo?: UserCargo;
    equipe?: EquipeUsuario | null;
    funcao_tecnico?: string | null;
    papel_financeiro?: PapelFinanceiro | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.nome !== undefined) updates.nome = data.nome;
  if (data.cargo !== undefined) {
    updates.cargo = data.cargo;
    updates.nivel = data.cargo === "usuario" ? 2 : 1;
  }
  if (data.equipe !== undefined) {
    updates.equipe = data.equipe === null ? deleteField() : data.equipe;
  }
  if (data.funcao_tecnico !== undefined) {
    updates.funcao_tecnico = data.funcao_tecnico === null ? deleteField() : data.funcao_tecnico;
  }
  if (data.papel_financeiro !== undefined) {
    updates.papel_financeiro = data.papel_financeiro === null ? deleteField() : data.papel_financeiro;
  }
  await updateDoc(doc(db, "users", uid), updates);
  bustUsersCache();
}

export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid));
  bustUsersCache();
}

export async function changeUserPassword(uid: string, newPassword: string, callerUid: string): Promise<void> {
  const res = await fetch("/api/admin/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, newPassword, callerUid }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Erro ao alterar senha.");
  }
}
