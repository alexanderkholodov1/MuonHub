"use client";

import React from "react";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { Field } from "./fields";
import { safeNext } from "./safe-next";

export function SignInForm(): ReactNode {
  const provider = useDataProvider();
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signIn(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    if (provider === null || busy) return;
    const data = event ? new FormData(event.currentTarget) : null;
    setBusy(true);
    setError(null);
    try {
      if (data === null) await provider.signInWithGoogle();
      else await provider.signInWithEmail(String(data.get("email")), String(data.get("password")));
      router.replace(safeNext(params.get("next")));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <form onSubmit={(event) => void signIn(event)} className="space-y-6">
        <Field
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          label={t("auth.email")}
        />
        <Field
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          label={t("auth.password")}
        />
        {error && <p role="alert">{error}</p>}
        <Button size="lg" type="submit" disabled={provider === null || busy} loading={busy}>
          {t("nav.signIn")}
        </Button>
      </form>
      {process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1" && (
        <Button
          size="lg"
          variant="secondary"
          disabled={provider === null || busy}
          onClick={() => void signIn()}
        >
          {t("auth.google")}
        </Button>
      )}
      <div className="flex flex-wrap gap-6">
        <Link className="underline" href="/reset">
          {t("auth.forgotPassword")}
        </Link>
        <Link
          className="underline"
          href={`/signup?next=${encodeURIComponent(safeNext(params.get("next")))}`}
        >
          {t("nav.signUp")}
        </Link>
      </div>
    </div>
  );
}
