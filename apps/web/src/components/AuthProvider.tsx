"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Language, User } from "@muonhub/shared";
import type { Unsubscribe } from "@muonhub/data-provider";
import {
  getDataProvider,
  getDataProviderConfigState,
  isDataProviderConfigurationError,
} from "../lib/data-provider";
import { authErrorToMessage } from "../lib/auth-errors";

interface RegisterProfile {
  displayName: string;
  language: Language;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  backendStatus: "checking" | "ready" | "not-configured";
  backendMessage: string | null;
  signIn(email: string, password: string): Promise<User>;
  register(email: string, password: string, profile: RegisterProfile): Promise<User>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<AuthContextValue["backendStatus"]>("checking");
  const [backendMessage, setBackendMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: Unsubscribe | null = null;
    const configState = getDataProviderConfigState();
    if (configState.status !== "ready") {
      setBackendStatus("not-configured");
      setBackendMessage(configState.message);
      setError(configState.message);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void getDataProvider()
      .then((provider) => {
        if (!active) return;
        setBackendStatus("ready");
        setBackendMessage(null);
        unsubscribe = provider.onAuthStateChanged((nextUser) => {
          if (!active) return;
          setUser(nextUser);
          setLoading(false);
          setError(null);
        });
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (isDataProviderConfigurationError(err)) {
          setBackendStatus("not-configured");
          setBackendMessage(err.message);
        }
        setError(authErrorToMessage(err));
        setLoading(false);
      });

    return () => {
      active = false;
      if (unsubscribe != null) {
        unsubscribe();
      }
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    setError(null);
    try {
      const provider = await getDataProvider();
      const signedIn = await provider.signIn(email, password);
      setUser(signedIn);
      return signedIn;
    } catch (err) {
      if (isDataProviderConfigurationError(err)) {
        setBackendStatus("not-configured");
        setBackendMessage(err.message);
      }
      const message = authErrorToMessage(err);
      setError(message);
      throw err;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, profile: RegisterProfile): Promise<User> => {
      setError(null);
      try {
        const provider = await getDataProvider();
        const registered = await provider.register(email, password, profile);
        setUser(registered);
        return registered;
      } catch (err) {
        if (isDataProviderConfigurationError(err)) {
          setBackendStatus("not-configured");
          setBackendMessage(err.message);
        }
        const message = authErrorToMessage(err);
        setError(message);
        throw err;
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const provider = await getDataProvider();
      await provider.signOut();
      setUser(null);
    } catch (err) {
      if (isDataProviderConfigurationError(err)) {
        setBackendStatus("not-configured");
        setBackendMessage(err.message);
      }
      const message = authErrorToMessage(err);
      setError(message);
      throw err;
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    setError(null);
    try {
      const provider = await getDataProvider();
      await provider.sendPasswordReset(email);
    } catch (err) {
      if (isDataProviderConfigurationError(err)) {
        setBackendStatus("not-configured");
        setBackendMessage(err.message);
      }
      const message = authErrorToMessage(err);
      setError(message);
      throw err;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      backendStatus,
      backendMessage,
      signIn,
      register,
      signOut,
      sendPasswordReset,
    }),
    [
      backendMessage,
      backendStatus,
      error,
      loading,
      register,
      sendPasswordReset,
      signIn,
      signOut,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value == null) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return value;
}
