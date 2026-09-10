"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/utils/api-client";
import { apiRequest, clearAuthSession, onAuthSessionCleared } from "@/utils/api-client";

type AuthStatus = "loading" | "ready";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  setUser: (user: AuthUser | null) => void;
  refreshSession: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname === "/verify-email" || pathname === "/forgot-password" || pathname === "/reset-password";

  const refreshSession = useCallback(async () => {
    const result = await apiRequest<{ user: AuthUser | null }>("GET", "/api/auth/me", {
      skipRefresh: true,
    });
    // 200 + user:null (guest) or a failed probe both mean "not signed in".
    const nextUser = result.data?.user ?? null;
    setUser(nextUser);
    setStatus("ready");
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("POST", "/api/auth/logout", { skipRefresh: true, body: {} });
    clearAuthSession();
    setUser(null);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (isAuthRoute) {
      setStatus("ready");
      return;
    }
    void refreshSession();
  }, [isAuthRoute, refreshSession]);

  useEffect(() => {
    return onAuthSessionCleared(() => {
      setUser(null);
      setStatus("ready");
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: Boolean(user),
      setUser,
      refreshSession,
      logout,
    }),
    [user, status, refreshSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
