"use client";

/**
 * A uPlot line chart over time (spec 0090): colors from the design tokens, width follows the
 * container, missing values break the line. uPlot is loaded in the browser only.
 */
import { useEffect, useRef, type ReactNode } from "react";
import "uplot/dist/uPlot.min.css";
import { t } from "@/i18n/t";
import { chartSummary } from "./series";

const formatValue = (value: number | null): string =>
  value === null ? "" : Number.isInteger(value) ? String(value) : value.toFixed(1);

type UPlotInstance = {
  setData(data: unknown): void;
  setSize(size: { width: number; height: number }): void;
  destroy(): void;
};

const token = (name: string, fallback: string): string =>
  typeof window === "undefined"
    ? fallback
    : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function TimeChart(props: {
  x: readonly number[];
  y: readonly (number | null)[];
  label: string;
  unit: string;
  height?: number;
  color?: string;
}): ReactNode {
  const host = useRef<HTMLDivElement | null>(null);
  const plot = useRef<UPlotInstance | null>(null);
  const height = props.height ?? 260;
  const data: [number[], (number | null)[]] = [[...props.x], [...props.y]];

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    void import("uplot").then(({ default: UPlot }) => {
      const el = host.current;
      if (disposed || el === null) return;
      const text = token("--color-text-secondary", "#9aa4b2");
      const grid = token("--color-border", "#252c3b");
      const stroke = props.color ?? token("--color-accent", "#4cc9f0");
      const axis = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid } };
      const instance = new UPlot(
        {
          width: el.clientWidth,
          height,
          scales: { x: { time: true } },
          axes: [axis, { ...axis, label: props.unit, size: 64 }],
          series: [
            {},
            { label: props.label, stroke, width: 1.5, spanGaps: false, points: { show: false } },
          ],
          legend: { show: true },
        },
        data,
        el,
      ) as unknown as UPlotInstance;
      plot.current = instance;
      observer = new ResizeObserver(() => instance.setSize({ width: el.clientWidth, height }));
      observer.observe(el);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // Created once per label, unit, height and color; data updates go through setData below.
  }, [props.label, props.unit, height, props.color]);

  useEffect(() => {
    plot.current?.setData(data);
  });

  // The canvas is invisible to assistive technology; this text stands in for it.
  const summary = chartSummary(props.y);
  const description =
    summary.count === 0
      ? t("dashboard.chart.summaryEmpty", { label: props.label })
      : t("dashboard.chart.summary", {
          label: props.label,
          unit: props.unit,
          count: summary.count,
          min: formatValue(summary.min),
          max: formatValue(summary.max),
        });
  return <div ref={host} className="w-full" role="img" aria-label={description} />;
}
