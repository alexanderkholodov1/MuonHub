import React from "react";
import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { StationQueryPage } from "@/features/stations/StationQueryPage";
import { t } from "@/i18n/t";

export default function Page(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-6 py-12">
        <Suspense fallback={<p role="status">{t("state.loading")}</p>}>
          <RequireAuth>
            <StationQueryPage />
          </RequireAuth>
        </Suspense>
      </main>
    </>
  );
}
