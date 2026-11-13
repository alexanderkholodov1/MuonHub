"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FolderGit2 } from "lucide-react";
import { t } from "@/i18n/t";

const REPO_URL = "https://github.com/alexanderkholodov1/MuonHub";

/** The public pages' footer, a night band in both themes, with the same links as the header. */
export function SiteFooter(): ReactNode {
  return (
    <footer className="surface-night border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 text-sm text-secondary md:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-base text-text">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-brand" />
            {t("landing.footer.about")}
          </p>
          <p>{t("landing.footer.origin")}</p>
          <p className="text-muted">{t("landing.footer.dataNote")}</p>
        </div>
        <nav aria-label={t("nav.footer")} className="flex flex-col gap-2">
          <Link href="/" className="hover:text-text">
            {t("nav.home")}
          </Link>
          <Link href="/#live-data" className="hover:text-text">
            {t("nav.live")}
          </Link>
          <Link href="/#detectors" className="hover:text-text">
            {t("nav.detectors")}
          </Link>
          <Link href="/network" className="hover:text-text">
            {t("nav.network")}
          </Link>
          <a className="inline-flex items-center gap-2 hover:text-text" href={REPO_URL}>
            <FolderGit2 size={16} aria-hidden="true" />
            {t("landing.footer.source")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
