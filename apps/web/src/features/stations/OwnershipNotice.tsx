"use client";

import React from "react";
import { useEffect, useState, type ReactNode } from "react";
import { v2 as dp } from "@muonhub/data-provider";
import { Button } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource } from "@/lib/data/useResource";
import { t } from "@/i18n/t";
import { useAuth } from "@/features/auth/AuthProvider";
import { dismissTransferNotice, isTransferNoticeDismissed } from "./transfer-notice";

interface PendingNotice {
  transferId: string;
  stationName: string;
}

export function OwnershipNotice(): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const [, bump] = useState(0);
  const key = provider !== null && user !== null ? `notices:${user.uid}` : null;
  const resource = useResource<PendingNotice[]>(key, async () => {
    if (provider === null || user === null) throw new dp.DataProviderError("unauthenticated");
    const owned = await provider.listMyStations();
    const notices: PendingNotice[] = [];
    for (const station of owned.items) {
      if (station.transferId === undefined) continue;
      if (isTransferNoticeDismissed(station.transferId)) continue;
      const transfer = await provider.getTransfer(station.transferId);
      if (transfer === null || transfer.to !== user.uid) continue;
      notices.push({ transferId: station.transferId, stationName: station.name });
    }
    return notices;
  });

  useEffect(() => {
    const onStorage = (): void => bump((n) => n + 1);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (resource.status !== "ready" || resource.data.length === 0) return null;

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface-2 p-6">
      {resource.data.map((notice) => (
        <div key={notice.transferId} className="space-y-3">
          <p role="status">{t("station.transferNotice", { name: notice.stationName })}</p>
          <Button
            size="lg"
            variant="secondary"
            type="button"
            onClick={() => {
              dismissTransferNotice(notice.transferId);
              resource.reload();
              bump((n) => n + 1);
            }}
          >
            {t("station.transferDismiss")}
          </Button>
        </div>
      ))}
    </div>
  );
}
