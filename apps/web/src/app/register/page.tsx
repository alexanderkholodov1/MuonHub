"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card } from "@muonhub/ui";
import { LANGUAGES, type Language } from "@muonhub/shared";
import { AuthGate } from "../../components/AuthGate";
import { useAuth } from "../../components/AuthProvider";
import { authErrorToMessage } from "../../lib/auth-errors";

const languageLabels: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  "pt-BR": "Portuguese (Brazil)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "44px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
  backgroundColor: "var(--color-surface-2)",
  color: "var(--color-text)",
  padding: "0 var(--space-3)",
  fontSize: "var(--text-base)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--color-text)",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  marginBottom: "var(--space-2)",
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function languageFromValue(value: string): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : "en";
}

export default function RegisterPage(): React.ReactElement {
  const router = useRouter();
  const { register, error: contextError } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = displayName.trim();

    if (trimmedName.length < 2) {
      setError("Enter the name that collaborators will recognize in MuonHub.");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address for account recovery and station sharing.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least eight characters for your password.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await register(normalizedEmail, password, {
        displayName: trimmedName,
        language,
      });
      setSuccess("Account created. Opening your dashboard…");
      window.setTimeout(() => router.replace("/dashboard"), 250);
    } catch (err) {
      setError(authErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const visibleError = error ?? contextError;

  return (
    <AuthGate mode="guest">
      <div
        style={{ maxWidth: "520px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}
      >
        <Card title="Create your MuonHub account">
          <p
            style={{
              marginTop: 0,
              marginBottom: "var(--space-6)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-base)",
              lineHeight: 1.6,
            }}
          >
            Register once for the web dashboard and the detector agent. Stations and detectors are
            connected after sign-in.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <label htmlFor="displayName" style={labelStyle}>
                Display name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "var(--space-4)" }}>
              <label htmlFor="email" style={labelStyle}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "var(--space-4)" }}>
              <label htmlFor="password" style={labelStyle}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "var(--space-4)" }}>
              <label htmlFor="language" style={labelStyle}>
                Preferred language
              </label>
              <select
                id="language"
                name="language"
                value={language}
                onChange={(event) => setLanguage(languageFromValue(event.target.value))}
                style={inputStyle}
              >
                {LANGUAGES.map((value) => (
                  <option key={value} value={value}>
                    {languageLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            {visibleError != null && (
              <p
                role="alert"
                style={{
                  color: "var(--color-danger)",
                  fontSize: "var(--text-sm)",
                  marginBottom: "var(--space-4)",
                }}
              >
                {visibleError}
              </p>
            )}

            {success != null && (
              <p
                role="status"
                style={{
                  color: "var(--color-success)",
                  fontSize: "var(--text-sm)",
                  marginBottom: "var(--space-4)",
                }}
              >
                {success}
              </p>
            )}

            <Button
              type="submit"
              loading={loading}
              icon={<ArrowRight size={16} aria-hidden="true" />}
              style={{ width: "100%", marginBottom: "var(--space-4)" }}
            >
              Create account
            </Button>
          </form>

          <p
            style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}
          >
            Already registered?{" "}
            <Link href="/login" style={{ color: "var(--color-accent)" }}>
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </AuthGate>
  );
}
