/**
 * Root layout — MuonHub web app.
 *
 * - Loads Geist Sans (UI) and Geist Mono (numbers) via next/font/local.
 * - Sets <html> to dark by default (data-theme="dark").
 * - Wraps the app in ThemeProvider for client-side theme toggling.
 * - Imports Observatory Dark global tokens via globals.css.
 */
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@muonhub/ui";
import { AuthProvider } from "../components/AuthProvider";
import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "MuonHub",
  description:
    "Cosmic-ray detector monitoring network. Real-time charged-particle rate, " +
    "barometric correction, and Forbush decrease detection across Latin America.",
  keywords: ["cosmic rays", "muon detector", "CosmicWatch", "physics", "monitoring"],
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ThemeProvider defaultTheme="dark">
          <AuthProvider>
            <SiteHeader />
            <main>{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
