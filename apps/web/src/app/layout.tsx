import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { t } from "@/i18n/t";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.tagline"),
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
