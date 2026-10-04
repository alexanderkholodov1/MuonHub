"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Card } from "@muonhub/ui";
import { useAuth } from "./AuthProvider";

type AuthGateMode = "protected" | "guest";

interface AuthGateProps {
  mode: AuthGateMode;
  children: React.ReactNode;
}

function loginRedirect(pathname: string): string {
  const next = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/dashboard";
  return `/login?next=${encodeURIComponent(next)}`;
}

export function AuthGate({ mode, children }: AuthGateProps): React.ReactElement {
  const { user, loading, backendStatus, backendMessage } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (loading) return;
    if (backendStatus === "not-configured") return;
    if (mode === "protected" && user == null) {
      router.replace(loginRedirect(pathname));
    }
    if (mode === "guest" && user != null) {
      router.replace("/dashboard");
    }
  }, [backendStatus, loading, mode, pathname, router, user]);

  if (loading) {
    return (
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <Card title="Checking session" loading />
      </div>
    );
  }

  if (backendStatus === "not-configured") {
    return (
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <Card
          title="Backend not configured"
          error={
            backendMessage ??
            "Set the NEXT_PUBLIC_FIREBASE_* variables documented in .env.example to connect the MuonHub data provider."
          }
        />
      </div>
    );
  }

  if (mode === "protected" && user == null) {
    return (
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <Card title="Redirecting to sign in" loading />
      </div>
    );
  }

  if (mode === "guest" && user != null) {
    return (
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "var(--space-12) var(--space-6)" }}>
        <Card title="Opening your dashboard" loading />
      </div>
    );
  }

  return <>{children}</>;
}
