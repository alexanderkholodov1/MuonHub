"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button, Card } from "@muonhub/ui";
import { AuthGate } from "../../components/AuthGate";
import { useAuth } from "../../components/AuthProvider";
import { authErrorToMessage } from "../../lib/auth-errors";

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

function nextPathFromLocation(): string {
  if (typeof window !== "object") return "/dashboard";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next == null || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }
  return next;
}

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const { signIn, error: contextError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter the email address linked to your MuonHub account.");
      return;
    }
    if (password.length === 0) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await signIn(normalizedEmail, password);
      router.replace(nextPathFromLocation());
    } catch (err) {
      setError(authErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const visibleError = error ?? contextError;

  return (
    <AuthGate mode="guest">
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <Card title="Sign in to MuonHub">
          <p
            style={{
              marginTop: 0,
              marginBottom: "var(--space-6)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-base)",
              lineHeight: 1.6,
            }}
          >
            Access your station dashboard, detector setup, and collaboration tools with your MuonHub
            account.
          </p>

          <form onSubmit={handleSubmit} noValidate>
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
                aria-invalid={visibleError != null}
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
                aria-invalid={visibleError != null}
              />
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

            <Button
              type="submit"
              loading={loading}
              icon={<ArrowRight size={16} aria-hidden="true" />}
              style={{ width: "100%", marginBottom: "var(--space-4)" }}
            >
              Sign in
            </Button>
          </form>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              flexWrap: "wrap",
              fontSize: "var(--text-sm)",
            }}
          >
            <Link href="/reset-password" style={{ color: "var(--color-accent)" }}>
              Reset password
            </Link>
            <Link href="/register" style={{ color: "var(--color-accent)" }}>
              Create an account
            </Link>
          </div>
        </Card>
      </div>
    </AuthGate>
  );
}
