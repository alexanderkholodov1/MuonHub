"use client";

/**
 * Client-side roots: theme, configuration check, and the data provider. A build without its public
 * configuration renders one explanatory page instead of a broken app (spec 0088 FR2).
 */
import type { ReactNode } from "react";
import { ThemeProvider } from "@muonhub/ui";
import { parseConfig, readRawConfig } from "@/lib/config";
import { DataProviderRoot } from "@/lib/data/DataProviderContext";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ConfigErrorPage } from "@/components/ConfigErrorPage";

const configResult = parseConfig(readRawConfig());

export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider>
      {configResult.ok ? (
        <DataProviderRoot config={configResult.config}>
          <AuthProvider>{children}</AuthProvider>
        </DataProviderRoot>
      ) : (
        <ConfigErrorPage missing={configResult.missing} />
      )}
    </ThemeProvider>
  );
}
