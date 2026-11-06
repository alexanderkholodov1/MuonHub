"use client";

/**
 * Stream dashboard (spec 0090): the per-minute charged-particle rate as recorded, barometric pressure
 * and temperature, the mean rate with its Poisson uncertainty, data freshness shown apart from the
 * connection, and the recording sessions with their source.
 */
import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { Stat } from "@muonhub/ui";
import { useDataProvider } from "@/lib/data/DataProviderContext";
import { useResource } from "@/lib/data/useResource";
import { t, type MessageKey } from "@/i18n/t";
import { formatTime } from "./format";
import { freshness, rangeStats, toChartData } from "./series";
import { TimeChart } from "./TimeChart";
import { useStreamMinutes } from "./useStreamMinutes";

const RANGES: ReadonlyArray<{ hours: number; label: MessageKey }> = [
  { hours: 6, label: "dashboard.range.6h" },
  { hours: 24, label: "dashboard.range.24h" },
  { hours: 72, label: "dashboard.range.72h" },
];

const time = (ms: number): string => formatTime(ms);

export function StreamDashboard({ streamId }: { streamId: string }): ReactNode {
  const provider = useDataProvider();
  const [hours, setHours] = useState(24);
  const meta = useResource(provider === null ? null : `stream:${streamId}`, async () => {
    if (provider === null) throw new Error("no provider");
    const stream = await provider.getStream(streamId);
    if (stream === null) return null;
    const [station, device, sessions] = await Promise.all([
      provider.getStation(stream.stationId),
      provider.getDevice(stream.deviceId),
      provider.listSessions(streamId, { limit: 20 }),
    ]);
    return { stream, station, device, sessions: sessions.items };
  });
  const data = useStreamMinutes(provider, streamId, hours);

  if (meta.status === "loading") return <p role="status">{t("state.loading")}</p>;
  if (meta.status === "error") {
    return (
      <div role="alert">
        <p>{meta.error}</p>
        <button className="mt-2 underline" onClick={meta.reload}>
          {t("state.retry")}
        </button>
      </div>
    );
  }
  if (meta.data === null) return <p role="alert">{t("error.notFound")}</p>;

  const { station, device, sessions } = meta.data;
  const stats = rangeStats(data.minutes, data.fromTs, data.toTs);
  const chart = toChartData(data.minutes);
  const fresh = freshness(stats.lastTs, Date.now());
  const mirrored = sessions.some((s) => s.agentVersion.startsWith("v5-mirror"));
  const freshTone =
    fresh === "fresh" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]";

  return (
    <div className="space-y-8">
      <div>
        {station !== null && (
          <Link className="text-secondary underline" href={`/app/station?id=${station.id}`}>
            {station.name}
          </Link>
        )}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {device?.label ?? t("dashboard.title")}
        </h1>
        {mirrored && (
          <p className="mt-3 rounded-md border border-border bg-surface px-4 py-3">
            {t("dashboard.source.v5Mirror")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div role="group" aria-label={t("dashboard.range")} className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              aria-pressed={hours === r.hours}
              onClick={() => setHours(r.hours)}
              className={`rounded-md border px-3 py-1.5 ${
                hours === r.hours ? "border-accent text-accent" : "border-border"
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <p aria-live="polite">
          <span className="text-secondary">{t("dashboard.freshness.label")}</span>{" "}
          <span className={freshTone}>{t(`dashboard.freshness.${fresh}`)}</span>
          {stats.lastTs !== null && (
            <span className="text-secondary">
              {t("ui.separator")}
              {t("dashboard.lastMinute", { time: time(stats.lastTs) })}
            </span>
          )}
        </p>
        <p aria-live="polite">
          <span className="text-secondary">{t("dashboard.connection.label")}</span>{" "}
          {data.error === null ? (
            <span>{t("dashboard.connection.ok")}</span>
          ) : (
            <span className="text-[var(--color-danger)]">{t("dashboard.connection.failed")}</span>
          )}
          {data.lastOkAt !== null && (
            <span className="text-secondary">
              {t("ui.separator")}
              {t("dashboard.lastRefresh", { time: time(data.lastOkAt) })}
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("dashboard.stat.rate")}
          loading={data.status === "loading"}
          {...(stats.meanPerMin === null || stats.sigmaPerMin === null
            ? {}
            : { value: `${stats.meanPerMin.toFixed(1)} ± ${stats.sigmaPerMin.toFixed(1)}` })}
          unit={t("dashboard.stat.rate.unit")}
          note={t("dashboard.stat.rate.note")}
        />
        <Stat
          label={t("dashboard.stat.coverage")}
          loading={data.status === "loading"}
          value={(stats.coverage * 100).toFixed(1)}
          unit={t("unit.percent")}
          note={t("dashboard.stat.coverage.note", {
            minutes: stats.minutes,
            span: Math.round((data.toTs - data.fromTs) / 60_000),
          })}
        />
        <Stat
          label={t("dashboard.stat.pressure")}
          loading={data.status === "loading"}
          {...(stats.meanPressureHpa === null ? {} : { value: stats.meanPressureHpa.toFixed(1) })}
          unit={t("unit.hPa")}
        />
        <Stat
          label={t("dashboard.stat.temperature")}
          loading={data.status === "loading"}
          {...(stats.meanTemperatureC === null ? {} : { value: stats.meanTemperatureC.toFixed(1) })}
          unit={t("unit.celsius")}
        />
      </div>

      {data.status === "ready" && data.minutes.length === 0 ? (
        <p>{t("dashboard.empty")}</p>
      ) : (
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 text-lg font-medium">{t("dashboard.chart.rate")}</h2>
            <TimeChart
              x={chart.x}
              y={chart.rate}
              label={t("dashboard.chart.rate")}
              unit={t("dashboard.chart.rate.unit")}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-lg font-medium">{t("dashboard.chart.pressure")}</h2>
              <TimeChart
                x={chart.x}
                y={chart.pressure}
                label={t("dashboard.chart.pressure")}
                unit={t("unit.hPa")}
                height={180}
              />
            </div>
            <div>
              <h2 className="mb-2 text-lg font-medium">{t("dashboard.chart.temperature")}</h2>
              <TimeChart
                x={chart.x}
                y={chart.temperature}
                label={t("dashboard.chart.temperature")}
                unit={t("unit.celsius")}
                height={180}
              />
            </div>
          </div>
        </section>
      )}

      <div className="space-y-2 text-secondary">
        <p>{t("dashboard.uncorrected")}</p>
        <p>{t("dashboard.physicsNote")}</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">{t("dashboard.sessions")}</h2>
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li key={s.id} className="font-mono text-sm">
              {t("dashboard.session.started", { time: time(s.startedAt) })}
              {t("ui.separator")}
              {s.endedAt === undefined
                ? t("dashboard.session.active")
                : t("dashboard.session.ended", { time: time(s.endedAt) })}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
