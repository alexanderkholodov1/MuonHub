"use client";

import React from "react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { Field } from "./fields";

export function ResetForm(): ReactNode {
  const provider = useDataProvider();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider === null || busy) return;
    const email = String(new FormData(event.currentTarget).get("email"));
    setBusy(true);
    setError(null);
    try {
      await provider.sendPasswordReset(email);
      setSent(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (sent) return <p role="status">{t("auth.resetConfirmation")}</p>;
  return (
    <form className="space-y-6" onSubmit={(event) => void submit(event)}>
      <Field
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        label={t("auth.email")}
      />
      {error && <p role="alert">{error}</p>}
      <Button size="lg" type="submit" disabled={provider === null || busy} loading={busy}>
        {t("auth.sendReset")}
      </Button>
    </form>
  );
}
