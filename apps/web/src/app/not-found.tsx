import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/t";

export default function NotFound(): ReactNode {
  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold">{t("notFound.title")}</h1>
      <p className="mt-4 text-secondary">{t("notFound.body")}</p>
      <Link className="mt-8 inline-block underline" href="/">
        {t("notFound.back")}
      </Link>
    </main>
  );
}
