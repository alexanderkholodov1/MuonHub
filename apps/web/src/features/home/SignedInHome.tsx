"use client";

import React from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@muonhub/ui";
import type { v2 } from "@muonhub/shared";
import { v2 as dp } from "@muonhub/data-provider";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource, type Resource } from "@/lib/data/useResource";
import { useAuth } from "@/features/auth/AuthProvider";
import { VerificationBanner } from "@/features/auth/VerificationBanner";
import { OwnershipNotice } from "@/features/stations/OwnershipNotice";
import { t, type MessageKey } from "@/i18n/t";

interface StationRow {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}
interface StationRows {
  items: StationRow[];
  invalid: number;
}

function StationList({
  titleKey,
  empty,
  resource,
  showNewLink,
}: {
  titleKey: MessageKey;
  empty: MessageKey;
  resource: Resource<StationRows>;
  showNewLink?: boolean;
}): ReactNode {
  return (
    <section
      aria-label={t(titleKey)}
      className="space-y-4 rounded-md border border-border bg-surface p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold">{t(titleKey)}</h2>
        {showNewLink && (
          <Link className="underline" href="/app/station/new">
            {t("station.newLink")}
          </Link>
        )}
      </div>
      {resource.status === "loading" && <p role="status">{t("state.loading")}</p>}
      {resource.status === "error" && (
        <>
          <p role="alert">{resource.error}</p>
          <Button size="lg" variant="secondary" onClick={resource.reload}>
            {t("state.retry")}
          </Button>
        </>
      )}
      {resource.status === "ready" && (
        <>
          {resource.data.invalid > 0 && (
            <p role="alert">{t("stations.invalid", { count: resource.data.invalid })}</p>
          )}
          {resource.data.items.length === 0 && resource.data.invalid === 0 && (
            <p className="text-secondary">{t(empty)}</p>
          )}
          {resource.data.items.length > 0 && (
            <ul className="space-y-4">
              {resource.data.items.map((station) => (
                <li key={station.id} className="flex flex-wrap justify-between gap-4">
                  <Link
                    className="underline"
                    href={`/app/station?id=${encodeURIComponent(station.id)}`}
                  >
                    {station.name}
                  </Link>
                  <span className="text-secondary">{t(`stations.role.${station.role}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Accounts created before public profiles existed have none, so fellow members would see a neutral
 * label. The home page publishes it, or refreshes it if it no longer matches the profile. Best
 * effort: the page and the profile are unaffected when this fails.
 */
async function syncPublicProfile(provider: dp.DataProviderV2, own: v2.User): Promise<void> {
  try {
    const current = await provider.getPublicProfile(own.uid);
    if (current?.displayName === own.displayName && current.username === own.username) return;
    await provider.publishPublicProfile();
  } catch (cause) {
    console.warn("public profile not published", cause);
  }
}

export function SignedInHome(): ReactNode {
  const provider = useDataProvider();
  const { user } = useAuth();
  const key = provider !== null && user !== null ? user.uid : null;
  const profile = useResource(key, async () => {
    if (provider === null || user === null) throw new dp.DataProviderError("unauthenticated");
    const own = await provider.getUser(user.uid);
    if (own !== null) void syncPublicProfile(provider, own);
    return own;
  });
  const owned = useResource<StationRows>(key, async () => {
    if (provider === null) throw new dp.DataProviderError("unauthenticated");
    const result = await provider.listMyStations();
    return {
      items: result.items.map(({ id, name }) => ({ id, name, role: "owner" })),
      invalid: result.quarantine.count,
    };
  });
  const shared = useResource<StationRows>(key, async () => {
    if (provider === null) throw new dp.DataProviderError("unauthenticated");
    const result = await provider.listSharedWithMe();
    return {
      items: result.items.map(({ station, role }) => ({
        id: station.id,
        name: station.name,
        role,
      })),
      invalid: result.quarantine.count,
    };
  });
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-semibold">{t("stations.title")}</h1>
      {profile.status === "loading" && <p role="status">{t("state.loading")}</p>}
      {profile.status === "error" && (
        <div className="space-y-4">
          <p role="alert">{profile.error}</p>
          <Button size="lg" variant="secondary" onClick={profile.reload}>
            {t("state.retry")}
          </Button>
        </div>
      )}
      {profile.status === "ready" && (
        <p>
          {profile.data === null
            ? t("auth.profileMissing")
            : t("auth.welcome", { name: profile.data.displayName })}
        </p>
      )}
      {profile.status === "ready" && profile.data === null && (
        <Link className="inline-block underline" href="/signup">
          {t("auth.finishProfile")}
        </Link>
      )}
      <VerificationBanner />
      <OwnershipNotice />
      <div className="grid gap-8 md:grid-cols-2">
        <StationList
          titleKey="nav.myStations"
          empty="stations.ownedEmpty"
          resource={owned}
          showNewLink
        />
        <StationList titleKey="stations.shared" empty="stations.sharedEmpty" resource={shared} />
      </div>
    </div>
  );
}
