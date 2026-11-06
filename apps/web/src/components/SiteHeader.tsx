import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/t";

/** The product name and the primary navigation; the account menu arrives with spec 0088 FR7. */
export function SiteHeader({ children }: { children?: ReactNode }): ReactNode {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          {t("app.name")}
        </Link>
        <nav className="flex items-center gap-4 text-sm">{children}</nav>
      </div>
    </header>
  );
}
