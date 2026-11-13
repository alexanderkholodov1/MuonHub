"use client";

import React from "react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@muonhub/ui";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { errorMessage } from "@/lib/errors";
import { usePathname } from "next/navigation";
import { t } from "@/i18n/t";
import { useLocale } from "@/i18n/LocaleProvider";

/**
 * The site's header, dark in both themes (the public site's night register). `overlay` drops its
 * background and rule so it sits on the landing's sky.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean } = {}): ReactNode {
  const { user, loading, error: authError } = useAuth();
  const provider = useDataProvider();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  const links = [
    { href: "/", label: t("nav.home"), current: pathname === "/" },
    { href: "/#live-data", label: t("nav.live"), current: false },
    { href: "/#detectors", label: t("nav.detectors"), current: false },
    { href: "/network", label: t("nav.network"), current: pathname.startsWith("/network") },
  ];
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
    <header
      className={`surface-night relative z-10 ${overlay ? "border-b border-transparent" : "border-b border-border"}`}
      style={overlay ? { backgroundColor: "transparent" } : undefined}
    >
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
          {t("app.name")}
        </Link>
        <nav
          aria-label={t("nav.main")}
          className="order-3 flex w-full items-center gap-5 overflow-x-auto text-base md:order-2 md:w-auto"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              className={`whitespace-nowrap py-1 ${link.current ? "border-b-2 border-accent text-text" : "text-secondary hover:text-text"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <nav
          aria-label={t("nav.account")}
          className="order-2 flex items-center gap-4 text-base md:order-3"
        >
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "es" : "en")}
            lang={locale === "en" ? "es" : "en"}
            className="min-h-9 rounded-md border border-border px-3 font-mono text-sm text-secondary hover:text-text"
          >
            {locale === "en" ? "ES" : "EN"}
            <span className="sr-only">{`${t("ui.separator")}${t("nav.otherLanguageLabel")}`}</span>
          </button>
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
