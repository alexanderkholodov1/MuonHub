"use client";

import React, { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { StreamDashboard } from "@/features/dashboard/StreamDashboard";
import { t } from "@/i18n/t";

function StreamFromQuery(): ReactNode {
  const id = useSearchParams().get("id");
  if (id === null || id === "") return <p role="alert">{t("dashboard.missingId")}</p>;
  return <StreamDashboard streamId={id} />;
}

export default function Page(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Suspense fallback={<p role="status">{t("state.loading")}</p>}>
          <RequireAuth>
            <StreamFromQuery />
          </RequireAuth>
        </Suspense>
      </main>
    </>
  );
}
