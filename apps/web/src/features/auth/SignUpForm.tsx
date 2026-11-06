"use client";

import React from "react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v2 } from "@muonhub/shared";
import { v2 as dp } from "@muonhub/data-provider";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { t } from "@/i18n/t";
import { Field } from "./fields";
import { useAuth } from "./AuthProvider";
import { safeNext } from "./safe-next";

export function SignUpForm(): ReactNode {
  const provider = useDataProvider();
  const { user, loading } = useAuth();
  const [emailInput, setEmailInput] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const profileCreated = user !== null && profileUid === user.uid;
  const createdUid = user?.uid ?? null;
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider === null || busy || loading) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    const username = String(data.get("username"));
    setError(null);
    setUsernameError(null);
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setUsernameError(t("auth.usernameInvalid"));
      return;
    }
    // The existing shared schema also requires alphanumeric first and last characters.
    if (!v2.UserSchema.shape.username.safeParse(username).success) {
      setUsernameError(t("auth.usernameBoundary"));
      return;
    }
    if (createdUid === null && password.length < 8) {
      setError(t("error.weakPassword"));
      return;
    }
    const profile = v2.UserSchema.safeParse({
      schemaVersion: 2,
      uid: createdUid ?? "pending",
      email,
      username,
      displayName: String(data.get("displayName")).trim(),
      createdAt: Date.now(),
    });
    if (!profile.success) {
      setError(errorMessage(new dp.DataProviderError("invalid-argument")));
      return;
    }
    setBusy(true);
    try {
      if (!profileCreated) {
        const existingProfile = createdUid === null ? null : await provider.getUser(createdUid);
        if (existingProfile !== null) {
          router.replace(safeNext(params.get("next")));
          return;
        }
        if ((await provider.findUidByUsername(username)) !== null) {
          setUsernameError(t("auth.usernameTaken"));
          return;
        }
        const uid = createdUid ?? (await provider.createAccount(email, password)).uid;
        try {
          await provider.createUserProfile({ ...profile.data, uid });
        } catch (error) {
          if (error instanceof dp.DataProviderError && error.code === "already-exists") {
            setUsernameError(t("auth.usernameTaken"));
            return;
          }
          throw error;
        }
        setProfileUid(uid);
      }
      await provider.sendEmailVerification();
      router.replace(safeNext(params.get("next")));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-6">
      <Field
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={user?.email ?? emailInput}
        onChange={(event) => setEmailInput(event.target.value)}
        readOnly={busy || createdUid !== null}
        label={t("auth.email")}
      />
      {createdUid === null && (
        <Field
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          readOnly={busy}
          label={t("auth.password")}
        />
      )}
      <Field
        id="displayName"
        name="displayName"
        autoComplete="name"
        required
        maxLength={120}
        readOnly={busy || profileCreated}
        label={t("auth.displayName")}
      />
      <Field
        id="username"
        name="username"
        autoComplete="username"
        required
        minLength={3}
        maxLength={30}
        readOnly={busy || profileCreated}
        label={t("auth.username")}
        error={usernameError}
      />
      <p className="text-secondary">{t("auth.usernameHint")}</p>
      {createdUid !== null && !profileCreated && <p role="status">{t("auth.profilePending")}</p>}
      {error && <p role="alert">{error}</p>}
      <Button
        size="lg"
        type="submit"
        disabled={provider === null || busy || loading}
        loading={busy}
      >
        {t(
          profileCreated
            ? "auth.retryVerification"
            : createdUid
              ? "auth.finishProfile"
              : "nav.signUp",
        )}
      </Button>
    </form>
  );
}
