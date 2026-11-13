import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { LandingPage } from "@/features/landing/LandingPage";

/** The public landing (spec 0092, PUBLIC-SITE-PLAN §1). */
export default function HomePage(): ReactNode {
  return (
    <>
      <SiteHeader />
      <LandingPage />
    </>
  );
}
