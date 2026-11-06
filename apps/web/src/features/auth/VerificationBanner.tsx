"use client";

import React from "react";
import { useState, type ReactNode } from "react";
import { Button } from "@muonhub/ui";
import { useAuth } from "./AuthProvider";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";

export function VerificationBanner(): ReactNode {
  const { user } = useAuth();
  const provider = useDataProvider();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function verify(resend: boolean): Promise<void> {
    if (provider === null || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      if (resend) {
        await provider.sendEmailVerification();
        setMessage(t("auth.verificationSent"));
      } else {
        const refreshed = await provider.reloadUser();
        if (refreshed !== null && !refreshed.emailVerified)
          setMessage(t("auth.verificationPending"));
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (user === null || user.emailVerified) return null;
  return (
    <section
      aria-label={t("auth.verificationTitle")}
      className="space-y-4 rounded-md border border-border bg-surface p-6"
    >
      <p>{t("auth.verificationBanner")}</p>
      <div className="flex flex-wrap gap-4">
        <Button
          size="lg"
          variant="secondary"
          disabled={busy || provider === null}
          onClick={() => void verify(true)}
        >
          {t("auth.resend")}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={busy || provider === null}
          onClick={() => void verify(false)}
        >
          {t("auth.checkVerification")}
        </Button>
      </div>
      {busy && <p role="status">{t("state.loading")}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
