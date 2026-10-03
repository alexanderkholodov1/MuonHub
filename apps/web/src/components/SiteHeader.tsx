"use client";

/**
 * SiteHeader — top navigation bar.
 *
 * - MuonHub wordmark (logotype, not an image — consistent rendering).
 * - Nav link placeholders (Stations, Dashboard, About) for future routes.
 * - Working light/dark theme toggle via useTheme().
 * - Observatory Dark tokens only — no raw hex.
 * - Sticky; subtle bottom border for elevation on dark (no shadow).
 */
import React from "react";
import Link from "next/link";
import { Sun, Moon, Radio, LogOut, UserCircle } from "lucide-react";
import { useTheme, Button } from "@muonhub/ui";
import { useAuth } from "./AuthProvider";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/stations", label: "Stations" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "#about", label: "About" },
] as const;

export function SiteHeader(): React.ReactElement {
  const { theme, toggleTheme } = useTheme();
  const { user, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 var(--space-6)",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-8)",
        }}
      >
        {/* Wordmark */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            textDecoration: "none",
            color: "var(--color-text)",
          }}
          aria-label="MuonHub — home"
        >
          <Radio
            size={22}
            color="var(--color-accent)"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span
            style={{
              fontSize: "var(--text-h4)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
            }}
          >
            MuonHub
            <span style={{ color: "var(--color-accent)", marginLeft: "2px" }}>Lab</span>
          </span>
        </Link>

        {/* Nav */}
        <nav
          aria-label="Main navigation"
          style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
                textDecoration: "none",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                transition: `color var(--duration-fast) var(--ease-out)`,
                minHeight: "36px",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {loading ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-muted)",
              }}
            >
              Checking session
            </span>
          ) : user != null ? (
            <details style={{ position: "relative" }}>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  minHeight: "36px",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-surface-2)",
                  fontSize: "var(--text-sm)",
                }}
                aria-label={`Signed in as ${user.displayName}`}
              >
                <UserCircle size={16} aria-hidden="true" />
                <span>{user.displayName}</span>
              </summary>
              <div
                role="menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + var(--space-2))",
                  width: "260px",
                  padding: "var(--space-4)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "var(--color-surface)",
                  zIndex: 60,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text)",
                    fontWeight: 600,
                  }}
                >
                  {user.displayName}
                </p>
                <p
                  style={{
                    margin: "2px 0 var(--space-3)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-muted)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {user.email}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={signingOut}
                  onClick={handleSignOut}
                  icon={<LogOut size={14} aria-hidden="true" />}
                  style={{ width: "100%" }}
                >
                  Sign out
                </Button>
              </div>
            </details>
          ) : (
            <Link href="/login" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
          )}

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            icon={
              theme === "dark" ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )
            }
          >
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
        </div>
      </div>
    </header>
  );
}
