import { db } from "./firebase";
import type { EquipeUsuario } from "./tipos";

// Cache login (email) → equipe para evitar leituras repetidas no Firestore
const cache = new Map<string, EquipeUsuario | null>();

export async function getEquipeDoUsuario(login: string): Promise<EquipeUsuario | null> {
  if (cache.has(login)) return cache.get(login) ?? null;

  const snap = await db.collection("users")
    .where("login", "==", login)
    .limit(1)
    .get();

  const equipe = (snap.docs[0]?.data()?.equipe ?? null) as EquipeUsuario | null;
  cache.set(login, equipe);
  return equipe;
}

export function invalidarUsuario(login: string): void {
  cache.delete(login);
}
