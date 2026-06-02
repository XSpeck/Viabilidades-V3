import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { AppUser } from "@/types";

// Busca dados do usuário no Firestore pelo uid do Firebase Auth
export async function getUserData(uid: string): Promise<AppUser | null> {
  const q = query(collection(db, "users"), where("uid", "==", uid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    uid,
    nome: data.nome,
    login: data.login,
    nivel: data.nivel,
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
