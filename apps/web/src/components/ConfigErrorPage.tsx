import type { ReactNode } from "react";
import { t } from "@/i18n/t";

export function ConfigErrorPage({ missing }: { missing: readonly string[] }): ReactNode {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">{t("config.title")}</h1>
      <p className="mt-4 text-secondary">{t("config.body")}</p>
      <ul className="mt-4 list-disc pl-6 font-mono text-sm">
        {missing.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    </main>
  );
}
