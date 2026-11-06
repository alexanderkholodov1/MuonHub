import React, { type ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { NetworkPage } from "@/features/network/NetworkPage";

export default function Page(): ReactNode {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-6 py-10">
        <NetworkPage />
      </main>
    </>
  );
}
