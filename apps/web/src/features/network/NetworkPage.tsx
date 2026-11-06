"use client";

import React, { useMemo, type ReactNode } from "react";
import { t } from "@/i18n/t";
import { placeText, toFeatures } from "./geojson";
import { NetworkMap } from "./NetworkMap";
import { usePublicStations } from "./usePublicStations";

export function NetworkPage(): ReactNode {
  const stations = usePublicStations();
  const features = useMemo(
    () => toFeatures(stations.status === "ready" ? stations.data : []),
    [stations.status, stations.data],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("network.title")}</h1>
        <p className="mt-2 text-secondary">{t("network.intro")}</p>
      </div>
      {stations.status === "loading" && <p role="status">{t("state.loading")}</p>}
      {stations.status === "error" && (
        <div role="alert">
          <p>{stations.error}</p>
          <button className="mt-2 underline" onClick={stations.reload}>
            {t("state.retry")}
          </button>
        </div>
      )}
      {stations.status === "ready" && (
        <>
          <NetworkMap stations={features} />
          {stations.data.length === 0 ? (
            <p>{t("network.empty")}</p>
          ) : (
            <section>
              <h2 className="mb-3 text-lg font-medium">{t("network.listTitle")}</h2>
              <ul className="divide-y divide-border rounded-md border border-border">
                {stations.data.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-secondary">{placeText(s) ?? t("network.hidden")}</span>
                    <span className="text-secondary">
                      {t("network.devices", { count: s.deviceCount })}
                    </span>
                    <span className={s.active ? "text-[var(--color-success)]" : "text-secondary"}>
                      {s.active ? t("network.active") : t("network.idle")}
                    </span>
                    {s.point === undefined && (
                      <span className="text-muted">{t("network.notOnMap")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
