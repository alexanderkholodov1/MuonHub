"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { t } from "@/i18n/t";
import { fetchRecentEvents, type ParticleEvent } from "./live-feed";
import { logHistogram } from "./hour-stats";

const WINDOW_MS = 60_000;
const AMP_MAX_MV = 70;

/** Height of a bar for a pulse, on a log scale (0.3 … 70 mV → 0.15 … 1). */
export function pulseHeight(mv: number): number {
  const v = Math.log10(Math.max(mv, 0.3) / 0.3) / Math.log10(AMP_MAX_MV / 0.3);
  return 0.15 + 0.85 * Math.min(Math.max(v, 0), 1);
}

/**
 * The last minute of particles as they are replayed: each one a bar that enters at the right and
 * moves left; its height is the size of its light pulse; small pulses cyan, larger violet, the
 * largest gold. With reduced motion, a still picture redrawn every few seconds.
 */
export function EventStream({
  recent,
  replayDelayMs,
  label,
}: {
  recent: RefObject<ParticleEvent[]>;
  replayDelayMs: number | null;
  label: string;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const delayRef = useRef(replayDelayMs);
  useEffect(() => {
    delayRef.current = replayDelayMs;
  }, [replayDelayMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas === null || ctx === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const style = getComputedStyle(canvas);
    const color = (name: string, fallback: string): string =>
      style.getPropertyValue(name).trim() || fallback;
    const accent = color("--color-accent", "#4cc9f0");
    const cosmic = color("--color-cosmic", "#9d8cff");
    const brand = color("--color-brand", "#f5b544");
    const border = color("--color-border", "#252c3b");
    let width = 0;
    let height = 0;
    let frame = 0;
    let onScreen = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    function resize(): void {
      const el = canvas as HTMLCanvasElement;
      const rect = el.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw(): void {
      const c = ctx as CanvasRenderingContext2D;
      c.clearRect(0, 0, width, height);
      const base = height - 1;
      c.strokeStyle = border;
      c.lineWidth = 1;
      for (let s = 0; s <= 60; s += 10) {
        const gx = width - (s / 60) * width;
        c.beginPath();
        c.moveTo(gx, 0);
        c.lineTo(gx, base);
        c.stroke();
      }
      const delay = delayRef.current;
      if (delay === null) return;
      const now = Date.now() - delay;
      for (const e of recent.current) {
        const age = now - e.ts;
        if (age < 0 || age > WINDOW_MS) continue;
        const x = width - (age / WINDOW_MS) * width;
        const h = pulseHeight(e.amplitude) * (height - 6);
        c.fillStyle = e.amplitude >= 10 ? brand : e.amplitude >= 1.5 ? cosmic : accent;
        c.globalAlpha = age < 600 ? 1 : 0.85;
        c.fillRect(x - 1, base - h, 2, h);
      }
      c.globalAlpha = 1;
      c.fillStyle = brand;
      c.fillRect(width - 2, 0, 2, height);
    }

    function tick(): void {
      frame = 0;
      draw();
      schedule();
    }
    function schedule(): void {
      if (frame === 0 && onScreen && !document.hidden && !reduce.matches)
        frame = requestAnimationFrame(tick);
    }
    function onMotion(): void {
      cancelAnimationFrame(frame);
      frame = 0;
      clearInterval(timer);
      if (reduce.matches) timer = setInterval(draw, 5_000);
      else schedule();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const visibility = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      schedule();
    });
    visibility.observe(canvas);
    const onVisibility = (): void => schedule();
    document.addEventListener("visibilitychange", onVisibility);
    reduce.addEventListener("change", onMotion);
    resize();
    onMotion();
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", onMotion);
    };
  }, [recent]);

  return (
    <div>
      <canvas ref={canvasRef} className="block h-36 w-full" role="img" aria-label={label} />
      <div className="mt-2 flex justify-between font-mono text-xs text-muted">
        <span>{t("landing.stream.ago", { seconds: 60 })}</span>
        <span>{t("landing.stream.ago", { seconds: 30 })}</span>
        <span className="text-brand">{t("landing.stream.now")}</span>
      </div>
    </div>
  );
}

const SPECTRUM_BINS = 28;
const SPECTRUM_MIN = 0.25;
const SPECTRUM_MAX = 100;

/**
 * The pulse-height spectrum of the detector's latest events: how many pulses of each size, on log
 * axes. Loaded when shown, refreshed every two minutes while visible.
 */
export function PulseSpectrum({ label }: { label: string }): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<ParticleEvent[] | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = (): void => {
      if (document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      fetchRecentEvents(1_000, signal)
        .then((data) => {
          if (!signal.aborted) setEvents(data);
        })
        .catch(() => undefined);
    };
    const resizeObserver = new ResizeObserver(() => setWidth(el.clientWidth));
    resizeObserver.observe(el);
    setWidth(el.clientWidth);
    const visibility = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && timer === undefined) {
        load();
        timer = setInterval(load, 120_000);
      }
    });
    visibility.observe(el);
    return () => {
      controller?.abort();
      clearInterval(timer);
      resizeObserver.disconnect();
      visibility.disconnect();
    };
  }, []);

  const height = 220;
  const m = { top: 10, right: 10, bottom: 26, left: 44 };
  const bins =
    events === null
      ? []
      : logHistogram(
          events.map((e) => e.amplitude),
          SPECTRUM_MIN,
          SPECTRUM_MAX,
          SPECTRUM_BINS,
        );
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const w = Math.max(width - m.left - m.right, 1);
  const h = height - m.top - m.bottom;
  const ylog = (c: number): number => (c <= 0 ? 0 : Math.log10(1 + c) / Math.log10(1 + maxCount));
  const xTicks = [0.3, 1, 3, 10, 30, 100];
  const xOf = (mv: number): number =>
    m.left +
    ((Math.log10(mv) - Math.log10(SPECTRUM_MIN)) /
      (Math.log10(SPECTRUM_MAX) - Math.log10(SPECTRUM_MIN))) *
      w;

  return (
    <div ref={host} className="w-full">
      {events === null || width === 0 ? (
        <p className="text-secondary" style={{ height }} role="status">
          {t("landing.spectrum.loading")}
        </p>
      ) : (
        <svg width={width} height={height} role="img" aria-label={label} className="block">
          <defs>
            <linearGradient
              id="spectrum-fill"
              gradientUnits="userSpaceOnUse"
              x1={m.left}
              x2={m.left + w}
              y1="0"
              y2="0"
            >
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="55%" stopColor="var(--color-cosmic)" />
              <stop offset="100%" stopColor="var(--color-brand)" />
            </linearGradient>
          </defs>
          <line
            x1={m.left}
            x2={m.left + w}
            y1={m.top + h}
            y2={m.top + h}
            className="stroke-border"
          />
          {bins.map((b, i) => {
            const x0 = xOf(b.from);
            const x1 = xOf(b.to);
            const bh = ylog(b.count) * h;
            return (
              <rect
                key={i}
                x={x0 + 1}
                y={m.top + h - bh}
                width={Math.max(x1 - x0 - 2, 1)}
                height={bh}
                rx={2}
                fill="url(#spectrum-fill)"
              />
            );
          })}
          {xTicks.map((v) => (
            <text
              key={v}
              x={xOf(v)}
              y={height - 6}
              textAnchor={v === 100 ? "end" : "middle"}
              className="fill-muted font-mono text-xs"
            >
              {v}
            </text>
          ))}
          <text
            x={m.left - 8}
            y={m.top + 8}
            textAnchor="end"
            className="fill-muted font-mono text-xs"
          >
            {maxCount}
          </text>
          <text
            x={m.left - 8}
            y={m.top + h}
            textAnchor="end"
            className="fill-muted font-mono text-xs"
          >
            {0}
          </text>
        </svg>
      )}
    </div>
  );
}
