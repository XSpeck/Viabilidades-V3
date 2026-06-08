import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { AppUser } from "@/types";

// Busca dados do usuário pelo document ID = uid (leitura direta, sem query)
export async function getUserData(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid,
    nome: data.nome,
    login: data.login,
    nivel: data.nivel,
    cargo: data.cargo ?? (data.nivel === 1 ? "auditor" : "usuario"),
  };
}

export async function signIn(email: string, password: string): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userData = await getUserData(cred.user.uid);
  if (!userData) throw new Error("Usuário não encontrado no sistema.");
  return userData;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
