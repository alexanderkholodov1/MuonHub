import type { ReactNode } from "react";
import { LandingPage } from "@/features/landing/LandingPage";

/** The public landing (spec 0092, PUBLIC-SITE-PLAN §1); it renders the header over its sky. */
export default function HomePage(): ReactNode {
  return <LandingPage />;
}
