"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ParticleEvent } from "./live-feed";
import { EVENT_POLL_MS } from "./useLiveFeed";
import {
  lensed,
  sampleZenith,
  screenDirection,
  seededRandom,
  slabFor,
  trackThrough,
  type Point,
  type Slab,
  type Track,
} from "./field-math";

const SPEED_PX_PER_S = 950;
const TRAIL_PX = 260;
/** A track fades out this far past the detector instead of crossing the text below it. */
const EXIT_PX = 110;
/** A faint trace of each whole track lingers this long after its crossing, as in a cloud chamber. */
const AFTERGLOW_MS = 2_500;
const FLASH_MS = 500;
/** Each crossing leaves a mark on the detector for a minute: the marks add up to a minute's count. */
const HIT_MEMORY_MS = 60_000;
const LENS_RADIUS_PX = 60;
/** Events whose replay time passed more than this long ago are dropped, never bunched up. */
const LATE_MS = 1_000;

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}

interface Flight {
  track: Track;
  /** Crossing position across the detector (see Hit.u). */
  u: number;
  /** Wall-clock time (ms) at which the track crosses the detector: detection + replay delay. */
  crossAt: number;
  flashed: boolean;
}

interface Hit {
  /** Position across the detector, as a fraction of its width from its centre (−0.5…0.5). */
  u: number;
  at: number;
}

function makeStars(width: number, height: number): Star[] {
  const rand = seededRandom(Math.round(width) * 7919 + Math.round(height));
  const count = Math.min(420, Math.round((width * height) / 3200));
  return Array.from({ length: count }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: 0.4 + rand() * 0.9,
    a: 0.1 + Math.pow(rand(), 2) * 0.5,
  }));
}

/**
 * The hero's sky. Each real detection becomes a track that crosses the drawn detector exactly at its
 * replay time (detection + a fixed delay), entering at an angle drawn from the cos²θ distribution.
 * The pointer bends the light of everything behind it like a point mass. With reduced motion, a still
 * image of the latest tracks, redrawn when new detections arrive.
 */
export function ParticleField({
  queue,
  replayDelayMs,
  detectorLabel,
}: {
  queue: RefObject<ParticleEvent[]>;
  replayDelayMs: number | null;
  detectorLabel: string;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const delayRef = useRef<number | null>(replayDelayMs);
  const [labelAt, setLabelAt] = useState<Point | null>(null);

  useEffect(() => {
    delayRef.current = replayDelayMs;
  }, [replayDelayMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas === null || ctx === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let slab: Slab = slabFor(1, 1);
    const flights: Flight[] = [];
    const hits: Hit[] = [];
    let pointer: Point | null = null;
    let lens: Point = { x: 0, y: 0 };
    let lensStrength = 0;
    let frame = 0;
    let onScreen = true;
    let staticTimer: ReturnType<typeof setInterval> | undefined;
    const colors = { accent: "#4cc9f0", star: "#e6eaf2", border: "#252c3b", surface: "#131722" };

    function readColors(): void {
      const style = getComputedStyle(canvas as HTMLCanvasElement);
      const read = (name: string, fallback: string): string =>
        style.getPropertyValue(name).trim() || fallback;
      colors.accent = read("--color-accent", colors.accent);
      colors.star = read("--color-text", colors.star);
      colors.border = read("--color-border", colors.border);
      colors.surface = read("--color-surface-2", colors.surface);
    }

    function resize(): void {
      const el = canvas as HTMLCanvasElement;
      const rect = el.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(width, height);
      slab = slabFor(width, height);
      setLabelAt({ x: slab.center.x, y: slab.center.y + slab.thickness / 2 + 16 });
      readColors();
      if (reduce.matches) drawStill();
    }

    const view = (p: Point): Point =>
      lensStrength > 0.01 ? lensed(p, lens, LENS_RADIUS_PX * lensStrength) : p;

    function drawSky(c: CanvasRenderingContext2D): void {
      c.clearRect(0, 0, width, height);
      c.fillStyle = colors.star;
      for (const s of stars) {
        const p = view(s);
        c.globalAlpha = s.a;
        c.beginPath();
        c.arc(p.x, p.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function drawSlab(c: CanvasRenderingContext2D, now: number): void {
      const { center, width: w, thickness: t } = slab;
      const corners = [
        { x: center.x - w / 2, y: center.y - t / 2 },
        { x: center.x + w / 2, y: center.y - t / 2 },
        { x: center.x + w / 2, y: center.y + t / 2 },
        { x: center.x - w / 2, y: center.y + t / 2 },
      ].map(view);
      c.beginPath();
      corners.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
      c.closePath();
      c.fillStyle = colors.surface;
      c.fill();
      let glow = 0;
      for (const h of hits) glow = Math.max(glow, 1 - (now - h.at) / FLASH_MS);
      if (glow > 0) {
        c.globalAlpha = 0.4 * glow;
        c.fillStyle = colors.accent;
        c.fill();
      }
      c.globalAlpha = 0.55 + 0.45 * glow;
      c.strokeStyle = colors.accent;
      c.lineWidth = 1;
      c.stroke();
      // The marks of the last minute's crossings, brightest when new.
      c.strokeStyle = colors.accent;
      for (const h of hits) {
        const age = Math.min(Math.max((now - h.at) / HIT_MEMORY_MS, 0), 1);
        const x = center.x + h.u * w;
        const top = view({ x, y: center.y - t / 2 + 2 });
        const bottom = view({ x, y: center.y + t / 2 - 2 });
        c.globalAlpha = 0.2 + 0.8 * (1 - age);
        c.beginPath();
        c.moveTo(top.x, top.y);
        c.lineTo(bottom.x, bottom.y);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    /** Draws the visible part of a track from `from` to `to` px along it, bent by the lens. */
    function drawTrack(c: CanvasRenderingContext2D, track: Track, from: number, to: number): void {
      const steps = 24;
      const pts: Point[] = [];
      for (let i = 0; i <= steps; i++) {
        const d = from + ((to - from) * i) / steps;
        pts.push(
          view({
            x: track.start.x + track.direction.x * d,
            y: track.start.y + track.direction.y * d,
          }),
        );
      }
      const first = pts[0] as Point;
      const last = pts[steps] as Point;
      const gradient = c.createLinearGradient(first.x, first.y, last.x, last.y);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, colors.accent);
      c.strokeStyle = gradient;
      c.lineWidth = 1.6;
      c.lineCap = "round";
      c.beginPath();
      pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
      c.stroke();
      c.fillStyle = colors.star;
      c.beginPath();
      c.arc(last.x, last.y, 1.6, 0, Math.PI * 2);
      c.fill();
    }

    function trackAt(u: number, random: () => number): Track {
      const crossing = { x: slab.center.x + u * slab.width, y: slab.center.y };
      return trackThrough(
        crossing,
        screenDirection(sampleZenith(random()), random() * 2 * Math.PI),
      );
    }

    function launch(event: ParticleEvent, delay: number): Flight {
      const u = (Math.random() - 0.5) * 0.9;
      return { track: trackAt(u, Math.random), u, crossAt: event.ts + delay, flashed: false };
    }

    /** A faint line along the whole track so far. */
    function drawTrace(c: CanvasRenderingContext2D, track: Track, to: number, alpha: number): void {
      if (alpha <= 0.01) return;
      const steps = 24;
      c.globalAlpha = alpha;
      c.strokeStyle = colors.accent;
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const d = (to * i) / steps;
        const p = view({
          x: track.start.x + track.direction.x * d,
          y: track.start.y + track.direction.y * d,
        });
        if (i === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    function tick(): void {
      frame = 0;
      const c = ctx as CanvasRenderingContext2D;
      const now = Date.now();
      // Ease the lens toward the pointer, and its strength in or out.
      if (pointer !== null) {
        lens = { x: lens.x + (pointer.x - lens.x) * 0.18, y: lens.y + (pointer.y - lens.y) * 0.18 };
      }
      lensStrength += ((pointer === null ? 0 : 1) - lensStrength) * 0.08;

      const delay = delayRef.current;
      const pending = queue.current;
      if (delay !== null) {
        while (pending.length > 0) {
          const next = pending[0] as ParticleEvent;
          const crossAt = next.ts + delay;
          // Launch early enough to reach the detector at crossAt.
          if (crossAt - now > 2_000) break;
          pending.shift();
          if (crossAt < now - LATE_MS) continue;
          flights.push(launch(next, delay));
        }
      }

      drawSky(c);
      for (let i = flights.length - 1; i >= 0; i--) {
        const f = flights[i] as Flight;
        const position = f.track.toCrossing + ((now - f.crossAt) / 1000) * SPEED_PX_PER_S;
        if (position < 0) continue;
        const end = f.track.toCrossing + (width >= 900 ? EXIT_PX : EXIT_PX / 2);
        if (!f.flashed && now >= f.crossAt) {
          f.flashed = true;
          hits.push({ u: f.u, at: f.crossAt });
        }
        const afterglow = now < f.crossAt ? 1 : 1 - (now - f.crossAt) / AFTERGLOW_MS;
        const tail = Math.max(0, position - TRAIL_PX);
        if (tail >= end && afterglow <= 0) {
          flights.splice(i, 1);
          continue;
        }
        drawTrace(c, f.track, Math.min(position, end), 0.16 * afterglow);
        if (tail < end) drawTrack(c, f.track, tail, Math.min(position, end));
      }
      while (hits.length > 0 && now - (hits[0] as Hit).at > HIT_MEMORY_MS) hits.shift();
      drawSlab(c, now);
      schedule();
    }

    function schedule(): void {
      if (frame === 0 && onScreen && !document.hidden && !reduce.matches) {
        frame = requestAnimationFrame(tick);
      }
    }

    function drawStill(): void {
      const c = ctx as CanvasRenderingContext2D;
      lensStrength = 0;
      drawSky(c);
      const now = Date.now();
      const recent = queue.current.filter(
        (e) => e.ts >= (queue.current.at(-1)?.ts ?? now) - HIT_MEMORY_MS,
      );
      const random = seededRandom(recent.length + Math.round(width));
      hits.length = 0;
      for (let i = 0; i < recent.length; i++) {
        hits.push({ u: (random() - 0.5) * 0.9, at: now - HIT_MEMORY_MS / 2 });
      }
      for (const hit of hits.slice(-12)) {
        const track = trackAt(hit.u, random);
        drawTrace(c, track, track.toCrossing + (width >= 900 ? EXIT_PX : EXIT_PX / 2), 0.3);
      }
      drawSlab(c, now);
    }

    function onPointerMove(e: PointerEvent): void {
      const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const inside = p.x >= 0 && p.y >= 0 && p.x <= rect.width && p.y <= rect.height;
      if (inside && pointer === null) lens = p;
      pointer = inside ? p : null;
    }
    function onPointerLeave(): void {
      pointer = null;
    }

    function onMotionPreference(): void {
      cancelAnimationFrame(frame);
      frame = 0;
      clearInterval(staticTimer);
      if (reduce.matches) {
        drawStill();
        staticTimer = setInterval(drawStill, EVENT_POLL_MS);
      } else {
        schedule();
      }
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
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    reduce.addEventListener("change", onMotionPreference);
    resize();
    onMotionPreference();

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(staticTimer);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      reduce.removeEventListener("change", onMotionPreference);
    };
  }, [queue]);

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
      {labelAt !== null && (
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-xs text-secondary"
          style={{ left: labelAt.x, top: labelAt.y }}
        >
          {detectorLabel}
        </span>
      )}
    </div>
  );
}
