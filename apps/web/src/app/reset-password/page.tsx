"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Button, Card } from "@muonhub/ui";
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

export default function ResetPasswordPage(): React.ReactElement {
  const { sendPasswordReset, error: contextError } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Enter the email address linked to your MuonHub account.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await sendPasswordReset(normalizedEmail);
      setSuccess("If that email is registered, MuonHub has sent password reset instructions.");
    } catch (err) {
      setError(authErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const visibleError = error ?? contextError;

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
      <Card title="Reset your password">
        <p
          style={{
            marginTop: 0,
            marginBottom: "var(--space-6)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-base)",
            lineHeight: 1.6,
          }}
        >
          Enter your account email and MuonHub will send a secure reset link through the active auth
          provider.
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
            icon={<Mail size={16} aria-hidden="true" />}
            style={{ width: "100%", marginBottom: "var(--space-4)" }}
          >
            Send reset link
          </Button>
        </form>

        <Link href="/login" style={{ color: "var(--color-accent)", fontSize: "var(--text-sm)" }}>
          Back to sign in
        </Link>
      </Card>
    </div>
  );
}
