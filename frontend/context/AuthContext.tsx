"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "analyst" | "customer";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
}

const DEMO_USERS: Record<string, { password: string; user: AuthUser }> = {
  "admin@safebank.pk": {
    password: "admin123",
    user: {
      id: "USR-001",
      name: "Zaid Hamdan",
      email: "admin@safebank.pk",
      role: "admin",
      avatar: "ZH",
    },
  },
  "analyst@safebank.pk": {
    password: "analyst123",
    user: {
      id: "USR-002",
      name: "Aisha Noor",
      email: "analyst@safebank.pk",
      role: "analyst",
      avatar: "AN",
    },
  },
  "customer@safebank.pk": {
    password: "customer123",
    user: {
      id: "USR-003",
      name: "Ali Raza",
      email: "customer@safebank.pk",
      role: "customer",
      avatar: "AR",
    },
  },
};

const STORAGE_KEY = "safebank_auth_v1";

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => ({}),
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const match = DEMO_USERS[email.trim().toLowerCase()];
      if (!match || match.password !== password) {
        return { error: "Invalid email or password." };
      }
      setUser(match.user);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(match.user));
      return {};
    },
    []
  );

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return { user, loading };
}
