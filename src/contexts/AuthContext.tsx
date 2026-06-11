"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthChange, getUserData } from "@/lib/auth";
import type { AppUser } from "@/types";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await getUserData(firebaseUser.uid);
        if (userData && !userData.login && firebaseUser.email) {
          userData.login = firebaseUser.email;
        }
        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
