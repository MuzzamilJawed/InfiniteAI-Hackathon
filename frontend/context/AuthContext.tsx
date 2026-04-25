"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type UserRole = "analyst" | "customer";

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
  "analyst@fraudentify.pk": {
    password: "analyst123",
    user: {
      id: "USR-001",
      name: "Analyst",
      email: "analyst@fraudentify.pk",
      role: "analyst",
      avatar: "A",
    },
  },
  "customer1@fraudentify.pk": {
    password: "customer123",
    user: {
      id: "USR-002",
      name: "Customer 1",
      email: "customer1@fraudentify.pk",
      role: "customer",
      avatar: "C1",
    },
  },
  "customer2@fraudentify.pk": {
    password: "customer123",
    user: {
      id: "USR-003",
      name: "Customer 2",
      email: "customer2@fraudentify.pk",
      role: "customer",
      avatar: "C2",
    },
  },
};

const STORAGE_KEY = "fraudentify_auth_v1";

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
