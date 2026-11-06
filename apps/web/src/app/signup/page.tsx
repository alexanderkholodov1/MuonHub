import React from "react";
import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SignUpForm } from "@/features/auth/SignUpForm";
import { t } from "@/i18n/t";

export default function Page(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-lg space-y-8 px-6 py-12">
        <h1 className="text-4xl font-semibold">{t("nav.signUp")}</h1>
        <Suspense fallback={<p role="status">{t("state.loading")}</p>}>
          <SignUpForm />
        </Suspense>
      </main>
    </>
  );
}
