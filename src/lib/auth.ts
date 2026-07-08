import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { AppUser } from "@/types";

const _userCache = new Map<string, AppUser>();

export async function getUserData(uid: string): Promise<AppUser | null> {
  if (_userCache.has(uid)) return _userCache.get(uid)!;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const user: AppUser = {
    uid,
    nome: data.nome,
    login: data.login,
    nivel: data.nivel,
    cargo: data.cargo ?? (data.nivel === 1 ? "auditor" : "usuario"),
    equipe: data.equipe,
    funcao_tecnico: data.funcao_tecnico,
  };
  _userCache.set(uid, user);
  return user;
}

export async function signIn(email: string, password: string): Promise<AppUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const userData = await getUserData(cred.user.uid);
  if (!userData) throw new Error("Usuário não encontrado no sistema.");
  return userData;
}

export async function signOut(): Promise<void> {
  _userCache.clear();
  await firebaseSignOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
