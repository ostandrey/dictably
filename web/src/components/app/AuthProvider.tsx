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
import {
  ApiError,
  getAuthConfig,
  getMe,
  type AuthConfig,
  type User,
} from "@/lib/api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  config: AuthConfig | null;
  error: string | null;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Survives layout remounts (e.g. /app ↔ /admin) so Sign-in never flashes. */
let cached: {
  user: User | null;
  config: AuthConfig | null;
  status: Exclude<AuthStatus, "loading">;
} | null = null;

/** Drop cached session after logout (keep auth config for Sign-in buttons). */
export function clearAuthSession() {
  cached = {
    user: null,
    config: cached?.config ?? null,
    status: "anonymous",
  };
}

export function AuthProvider({
  children,
  errorLabel = "Something went wrong. Try again.",
}: {
  children: ReactNode;
  errorLabel?: string;
}) {
  const [user, setUser] = useState<User | null>(cached?.user ?? null);
  const [config, setConfig] = useState<AuthConfig | null>(cached?.config ?? null);
  const [status, setStatus] = useState<AuthStatus>(cached?.status ?? "loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [cfg, me] = await Promise.all([
        getAuthConfig().catch(() => null),
        getMe().catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 401) return null;
          throw err;
        }),
      ]);
      setConfig(cfg);
      setUser(me);
      const next = me ? "authenticated" : "anonymous";
      setStatus(next);
      cached = { user: me, config: cfg, status: next };
      setError(null);
    } catch {
      setError(errorLabel);
      setUser(null);
      setStatus("anonymous");
      cached = { user: null, config: null, status: "anonymous" };
    }
  }, [errorLabel]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cfg, me] = await Promise.all([
          getAuthConfig().catch(() => null),
          getMe().catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 401) return null;
            throw err;
          }),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setUser(me);
        const next = me ? "authenticated" : "anonymous";
        setStatus(next);
        cached = { user: me, config: cfg, status: next };
      } catch {
        if (!cancelled) {
          setError(errorLabel);
          setUser(null);
          setStatus("anonymous");
          cached = { user: null, config: null, status: "anonymous" };
        }
      }
    })();
    const onAuth = () => {
      void refresh();
    };
    window.addEventListener("dictably:auth", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("dictably:auth", onAuth);
    };
  }, [errorLabel, refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      config,
      error,
      setUser: (next) => {
        setUser(next);
        const st = next ? "authenticated" : "anonymous";
        setStatus(st);
        cached = {
          user: next,
          config,
          status: st,
        };
      },
      refresh,
    }),
    [status, user, config, error, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
