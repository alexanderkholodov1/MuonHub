"use client";

import React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { v2 as dp } from "@muonhub/data-provider";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";

interface AuthState {
  user: dp.AuthUser | null;
  loading: boolean;
  error: string | null;
}
const Context = createContext<AuthState>({ user: null, loading: true, error: null });

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const provider = useDataProvider();
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });
  useEffect(() => {
    if (provider === null) return;
    let active = true;
    const unsubscribe = provider.onAuthChange({
      onChange: (user) => {
        if (active) setState({ user, loading: false, error: null });
      },
      onError: (error) => {
        if (active) setState({ user: null, loading: false, error: errorMessage(error) });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [provider]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Context);
}
