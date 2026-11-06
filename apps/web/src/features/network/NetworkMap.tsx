"use client";

/**
 * MapLibre map of the public stations that have a point (spec 0091). The library and its styles are
 * loaded in the browser only. Tiles: OpenFreeMap (free, no key) — the production provider is an open
 * question in the M2 plan.
 */
import { useEffect, useRef, type ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@muonhub/ui";
import { t } from "@/i18n/t";
import type { StationCollection } from "./geojson";

const STYLE = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
} as const;

const token = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

export function NetworkMap({ stations }: { stations: StationCollection }): ReactNode {
  const host = useRef<HTMLDivElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | null = null;
    void import("maplibre-gl").then((maplibre) => {
      const el = host.current;
      if (disposed || el === null) return;
      // Copied by scripts/copy-maplibre-worker.mjs at build time (bundlers do not emit it).
      maplibre.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
      const map = new maplibre.Map({
        container: el,
        style: STYLE[theme],
        center: [-78.5, -0.2],
        zoom: 2,
        attributionControl: { compact: true },
      });
      remove = () => map.remove();
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const active = token("--color-success", "#3fb950");
        const idle = token("--color-text-muted", "#808996");
        map.addSource("stations", { type: "geojson", data: stations });
        map.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-radius": ["case", ["get", "approximate"], 14, 7],
            "circle-color": ["case", ["get", "active"], active, idle],
            "circle-opacity": ["case", ["get", "approximate"], 0.35, 0.9],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": ["case", ["get", "active"], active, idle],
          },
        });
        map.on("click", "stations", (event) => {
          const feature = event.features?.[0];
          if (feature === undefined || feature.geometry.type !== "Point") return;
          const p = feature.properties as Record<string, unknown>;
          const state = p["active"] === true ? t("network.active") : t("network.idle");
          const lines = [
            `<strong>${escapeHtml(String(p["name"]))}</strong>`,
            escapeHtml(String(p["place"])),
            escapeHtml(t("network.devices", { count: Number(p["deviceCount"]) })),
            escapeHtml(state),
            p["approximate"] === true ? escapeHtml(t("network.approximate")) : "",
          ].filter((line) => line !== "");
          new maplibre.Popup()
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setHTML(lines.join("<br>"))
            .addTo(map);
        });
        map.on("mouseenter", "stations", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "stations", () => (map.getCanvas().style.cursor = ""));
        const points = stations.features.map((f) => f.geometry.coordinates);
        if (points.length === 1 && points[0] !== undefined) {
          map.jumpTo({ center: points[0], zoom: 9 });
        } else if (points.length > 1) {
          const bounds = new maplibre.LngLatBounds();
          for (const point of points) bounds.extend(point);
          map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
        }
      });
    });
    return () => {
      disposed = true;
      remove?.();
    };
  }, [stations, theme]);

  return (
    <div
      ref={host}
      role="region"
      aria-label={t("network.mapLabel")}
      className="h-[420px] w-full overflow-hidden rounded-md border border-border"
    />
  );
}
