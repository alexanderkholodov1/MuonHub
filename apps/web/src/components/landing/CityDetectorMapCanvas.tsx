"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LngLatBounds, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import type { CityDetectorAggregate } from "./city-aggregation";

export function CityDetectorMapCanvas({
  cities,
  selectedCityKey,
  onSelectCity,
}: {
  readonly cities: ReadonlyArray<CityDetectorAggregate>;
  readonly selectedCityKey: string | null;
  readonly onSelectCity: (cityKey: string) => void;
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const moduleRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const initialCenter = useMemo(() => cityCenter(cities), [cities]);

  useEffect(() => {
    if (containerRef.current == null || mapRef.current != null) return;
    let cancelled = false;

    void loadMapLibre().then((maplibregl) => {
      if (cancelled || containerRef.current == null) return;
      moduleRef.current = maplibregl;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: observatoryDarkMapStyle(containerRef.current),
        center: [initialCenter.longitude, initialCenter.latitude],
        zoom: cities.length <= 1 ? 4.2 : 2.4,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;
      void map.once("load", () => {
        if (!cancelled) setMapReady(true);
      });
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      moduleRef.current = null;
      setMapReady(false);
    };
  }, [cities.length, initialCenter.latitude, initialCenter.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = moduleRef.current;
    if (!mapReady || map == null || maplibregl == null) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = cities.map((city) => {
      const element = createMarkerElement(city, city.key === selectedCityKey);
      element.addEventListener("click", () => {
        onSelectCity(city.key);
        map.easeTo({
          center: [city.centroid.longitude, city.centroid.latitude],
          zoom: Math.max(map.getZoom(), 5),
          duration: reducedMotion ? 0 : 300,
        });
      });

      return new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat([city.centroid.longitude, city.centroid.latitude])
        .addTo(map);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [cities, mapReady, onSelectCity, reducedMotion, selectedCityKey]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = moduleRef.current;
    if (!mapReady || map == null || maplibregl == null || cities.length === 0) return;

    if (cities.length === 1) {
      const city = cities[0];
      if (city == null) return;
      map.easeTo({
        center: [city.centroid.longitude, city.centroid.latitude],
        zoom: 5,
        duration: reducedMotion ? 0 : 250,
      });
      return;
    }

    const bounds = cities.reduce<LngLatBounds>((current, city) => {
      return current.extend([city.centroid.longitude, city.centroid.latitude]);
    }, new maplibregl.LngLatBounds());

    map.fitBounds(bounds, {
      padding: 72,
      maxZoom: 5.6,
      duration: reducedMotion ? 0 : 250,
    });
  }, [cities, mapReady, reducedMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || map == null || selectedCityKey == null) return;
    const selectedCity = cities.find((city) => city.key === selectedCityKey);
    if (selectedCity == null) return;

    map.easeTo({
      center: [selectedCity.centroid.longitude, selectedCity.centroid.latitude],
      zoom: Math.max(map.getZoom(), 5),
      duration: reducedMotion ? 0 : 250,
    });
  }, [cities, mapReady, reducedMotion, selectedCityKey]);

  return (
    <div
      ref={containerRef}
      className="min-h-[420px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
      role="application"
      aria-label="City-aggregated public detector map"
    />
  );
}

function observatoryDarkMapStyle(element: HTMLElement): StyleSpecification {
  const background = cssVar(element, "--color-bg");

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "carto-dark": {
        type: "raster",
        tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": background,
        },
      },
      {
        id: "carto-dark",
        type: "raster",
        source: "carto-dark",
        paint: {
          "raster-opacity": 0.82,
          "raster-saturation": -0.35,
        },
      },
    ],
  };
}

function createMarkerElement(city: CityDetectorAggregate, selected: boolean): HTMLElement {
  const button = document.createElement("button");
  const size = markerSize(city.detectorCount);
  button.type = "button";
  button.setAttribute(
    "aria-label",
    `${city.city}, ${city.country}: ${city.detectorCount} public detectors, ${city.activeNowCount} active now`,
  );
  button.style.width = `${size}px`;
  button.style.height = `${size}px`;
  button.style.borderRadius = "9999px";
  button.style.border = `2px solid var(${selected ? "--color-accent-warm" : "--color-accent"})`;
  button.style.background = "color-mix(in srgb, var(--color-surface) 82%, transparent)";
  button.style.color = "var(--color-text)";
  button.style.display = "grid";
  button.style.placeItems = "center";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 10px 30px color-mix(in srgb, var(--color-bg) 70%, transparent)";
  button.style.fontFamily = "var(--font-mono)";
  button.style.fontVariantNumeric = "tabular-nums";
  button.style.position = "relative";
  button.style.padding = "0";

  const count = document.createElement("span");
  count.textContent = city.detectorCount.toString();
  count.style.fontWeight = "700";
  count.style.fontSize = city.detectorCount >= 10 ? "var(--text-base)" : "var(--text-lg)";
  button.appendChild(count);

  const active = document.createElement("span");
  active.textContent = `${city.activeNowCount}`;
  active.style.position = "absolute";
  active.style.right = "-6px";
  active.style.bottom = "-6px";
  active.style.minWidth = "24px";
  active.style.height = "24px";
  active.style.borderRadius = "9999px";
  active.style.border = "1px solid var(--color-border)";
  active.style.display = "grid";
  active.style.placeItems = "center";
  active.style.background =
    city.activeNowCount > 0 ? "var(--color-success)" : "var(--color-surface-2)";
  active.style.color = city.activeNowCount > 0 ? "var(--color-bg)" : "var(--color-text-muted)";
  active.style.fontSize = "var(--text-xs)";
  active.style.fontWeight = "700";
  button.appendChild(active);

  return button;
}

function markerSize(detectorCount: number): number {
  return Math.min(92, Math.max(48, 40 + Math.sqrt(detectorCount) * 18));
}

function cityCenter(cities: ReadonlyArray<CityDetectorAggregate>): CityCentroidLike {
  if (cities.length === 0) {
    return { latitude: -8, longitude: -74 };
  }
  const totals = cities.reduce(
    (current, city) => ({
      latitude: current.latitude + city.centroid.latitude,
      longitude: current.longitude + city.centroid.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / cities.length,
    longitude: totals.longitude / cities.length,
  };
}

function cssVar(element: HTMLElement, name: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value === "" ? "rgb(11, 14, 20)" : value;
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, []);

  return reducedMotion;
}

interface CityCentroidLike {
  readonly latitude: number;
  readonly longitude: number;
}

async function loadMapLibre() {
  return import("maplibre-gl");
}

type MapLibreModule = Awaited<ReturnType<typeof loadMapLibre>>;
