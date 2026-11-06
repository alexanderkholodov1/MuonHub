import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { t } from "@/i18n/t";

/** Minimal start page until the public site is designed (spec 0092). */
export default function HomePage(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">{t("home.title")}</h1>
        <p className="mt-6 text-lg text-secondary">{t("home.body")}</p>
        <div className="mt-8 flex gap-4">
          <Link className="rounded-md bg-accent px-4 py-2 font-medium text-bg" href="/signin">
            {t("home.cta.signIn")}
          </Link>
          <Link className="rounded-md border border-border px-4 py-2" href="/signup">
            {t("home.cta.signUp")}
          </Link>
        </div>
      </main>
    </>
  );
}
