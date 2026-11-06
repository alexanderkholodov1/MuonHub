"use client";

import React from "react";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { t } from "@/i18n/t";

export function RequireAuth({ children }: { children: ReactNode }): ReactNode {
  const { user, loading, error } = useAuth();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const query = params.toString();
  useEffect(() => {
    if (!loading && error === null && user === null) {
      const next = pathname + (query ? `?${query}` : "");
      router.replace(`/signin?next=${encodeURIComponent(next)}`);
    }
  }, [user, loading, error, pathname, query, router]);
  if (error !== null) return <p role="alert">{error}</p>;
  if (loading || user === null) return <p role="status">{t("state.loading")}</p>;
  return <React.Fragment key={user.uid}>{children}</React.Fragment>;
}
