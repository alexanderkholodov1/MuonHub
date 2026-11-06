"use client";

import React from "react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@muonhub/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";

export function SiteHeader(): ReactNode {
  const { user, loading, error: authError } = useAuth();
  const provider = useDataProvider();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut(): Promise<void> {
    if (provider === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await provider.signOut();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          {t("app.name")}
        </Link>
        <nav aria-label={t("nav.account")} className="flex items-center gap-4 text-base">
          {loading ? (
            <span role="status">{t("state.loading")}</span>
          ) : user === null ? (
            <Link href="/signin">{t("nav.signIn")}</Link>
          ) : (
            <details className="relative">
              <summary className="cursor-pointer rounded-md px-4 py-2">{t("nav.account")}</summary>
              <div className="absolute right-0 z-10 mt-2 w-64 space-y-4 rounded-md border border-border bg-surface p-4">
                <p className="break-words">{user.email}</p>
                <Link className="block underline" href="/app">
                  {t("nav.myStations")}
                </Link>
                <Button
                  size="lg"
                  variant="secondary"
                  icon={<LogOut size={20} aria-hidden="true" />}
                  loading={busy}
                  disabled={busy}
                  onClick={() => void signOut()}
                >
                  {t("nav.signOut")}
                </Button>
              </div>
            </details>
          )}
        </nav>
      </div>
      {(error ?? authError) && (
        <p className="mx-auto max-w-6xl px-6 pb-4" role="alert">
          {error ?? authError}
        </p>
      )}
    </header>
  );
}
