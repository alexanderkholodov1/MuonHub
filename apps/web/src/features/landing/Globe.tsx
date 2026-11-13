"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ParticleEvent } from "./live-feed";
import {
  arrivalDirection,
  clusterAround,
  facing,
  latLonToVector,
  localAxes,
  sampleZenith,
} from "./globe-math";

/** The live detector's site at the public, approximate precision (0.1°, about 11 km). */
export const SITE = { lat: -0.2, lon: -78.4 } as const;
/** The resting view: South America from the south, so particles fall onto Quito from above. */
const HOME = facing(-38, -72);

const TRAVEL_MS = 1_100;
const TRAIL = 0.45;
const FALL_FROM = 1.15;
const PULSE_MS = 900;
const LATE_MS = 1_000;
const STREAKS = 48;
const PULSES = 8;
const IDLE_RETURN_MS = 3_000;

const ATMOSPHERE_VERTEX = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ATMOSPHERE_FRAGMENT = `
uniform vec3 color;
varying vec3 vNormal;
void main() {
  float intensity = pow(0.58 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2) * 0.55;
  gl_FragColor = vec4(color, 1.0) * intensity;
}`;

interface Flight {
  dir: [number, number, number];
  arriveAt: number;
  pulsed: boolean;
}

/**
 * The 3-D planet of the landing: land as dots, a violet atmosphere, the detectors at their site, and
 * each real detection drawn as a particle falling onto the site at its replay time (detection + a
 * fixed delay), from a direction drawn from the cos²θ distribution. Drag to turn it. With reduced
 * motion it stays still and draws no particles.
 */
export function Globe({
  queue,
  replayDelayMs,
  detectors,
  liveDetectors,
  label,
  sublabel,
}: {
  queue: RefObject<ParticleEvent[]>;
  replayDelayMs: number | null;
  detectors: number;
  liveDetectors: number;
  label: string;
  sublabel: string;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const delayRef = useRef(replayDelayMs);
  const markersRef = useRef({ detectors, liveDetectors });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    delayRef.current = replayDelayMs;
  }, [replayDelayMs]);
  useEffect(() => {
    markersRef.current = { detectors, liveDetectors };
  }, [detectors, liveDetectors]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const THREE = await import("three");
      const canvas = canvasRef.current;
      if (disposed || canvas === null) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const style = getComputedStyle(canvas);
      const token = (name: string, fallback: string): string =>
        style.getPropertyValue(name).trim() || fallback;
      const accent = new THREE.Color(token("--color-accent", "#4cc9f0"));
      const brand = new THREE.Color(token("--color-brand", "#f2b33d"));
      const cosmic = new THREE.Color(token("--color-cosmic", "#8b7cf6"));
      const muted = new THREE.Color(token("--color-text-muted", "#808996"));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 0, 5.1);
      const outer = new THREE.Group();
      const inner = new THREE.Group();
      outer.add(inner);
      scene.add(outer);
      // Light from the upper left gives the ocean its roundness.
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-3, 2.5, 4);
      scene.add(sun, new THREE.AmbientLight(0xffffff, 0.45));
      const disposables: Array<{ dispose: () => void }> = [];
      const keep = <T extends { dispose: () => void }>(x: T): T => {
        disposables.push(x);
        return x;
      };

      // The ocean hides what is behind the planet; the land is a field of dots.
      const oceanGeometry = keep(new THREE.SphereGeometry(0.995, 64, 48));
      const oceanMaterial = keep(
        new THREE.MeshLambertMaterial({ color: new THREE.Color("#14223f") }),
      );
      inner.add(new THREE.Mesh(oceanGeometry, oceanMaterial));
      void fetch("/globe/land.json")
        .then((res) => (res.ok ? (res.json() as Promise<number[]>) : []))
        .then((flat) => {
          if (disposed || flat.length === 0) return;
          const positions = new Float32Array((flat.length / 2) * 3);
          for (let i = 0; i < flat.length; i += 2) {
            const v = latLonToVector(flat[i] ?? 0, flat[i + 1] ?? 0);
            positions.set(v, (i / 2) * 3);
          }
          const geometry = keep(new THREE.BufferGeometry());
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          const material = keep(
            new THREE.PointsMaterial({ color: new THREE.Color("#7f97c9"), size: 0.019 }),
          );
          inner.add(new THREE.Points(geometry, material));
          render();
        })
        .catch(() => undefined);

      const atmosphereGeometry = keep(new THREE.SphereGeometry(1, 64, 48));
      const atmosphereMaterial = keep(
        new THREE.ShaderMaterial({
          uniforms: { color: { value: cosmic } },
          vertexShader: ATMOSPHERE_VERTEX,
          fragmentShader: ATMOSPHERE_FRAGMENT,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
        }),
      );
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
      atmosphere.scale.setScalar(1.14);
      scene.add(atmosphere);

      // The detectors: the live one at the site, the others in a small ring around it.
      const site = new THREE.Vector3(...latLonToVector(SITE.lat, SITE.lon));
      const markerGeometry = keep(new THREE.SphereGeometry(1, 16, 12));
      const liveMaterial = keep(new THREE.MeshBasicMaterial({ color: brand }));
      const restMaterial = keep(new THREE.MeshBasicMaterial({ color: muted }));
      const markerGroup = new THREE.Group();
      inner.add(markerGroup);
      function placeMarkers(): void {
        markerGroup.clear();
        const { detectors: count, liveDetectors: live } = markersRef.current;
        const live0 = new THREE.Mesh(markerGeometry, live > 0 ? liveMaterial : restMaterial);
        live0.position.copy(site).multiplyScalar(1.004);
        live0.scale.setScalar(0.022);
        markerGroup.add(live0);
        const others = clusterAround(SITE.lat, SITE.lon, Math.max(count - 1, 0), 2.2);
        if (count > 1) {
          others.forEach(([lat, lon]) => {
            const m = new THREE.Mesh(markerGeometry, restMaterial);
            m.position.set(...latLonToVector(lat, lon)).multiplyScalar(1.004);
            m.scale.setScalar(0.011);
            markerGroup.add(m);
          });
        }
      }
      placeMarkers();

      // Pulses at the site, one per arrival.
      const ringGeometry = keep(new THREE.RingGeometry(0.02, 0.028, 48));
      const pulses = Array.from({ length: PULSES }, () => {
        const material = keep(
          new THREE.MeshBasicMaterial({
            color: brand,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        const ring = new THREE.Mesh(ringGeometry, material);
        ring.position.copy(site).multiplyScalar(1.006);
        ring.lookAt(site.clone().multiplyScalar(2));
        ring.visible = false;
        inner.add(ring);
        return { ring, material, at: 0 };
      });

      // Falling particles: a bright head fading to nothing along its trail.
      const headMaterial = keep(
        new THREE.PointsMaterial({
          color: accent,
          size: 0.05,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const streaks = Array.from({ length: STREAKS }, () => {
        const geometry = keep(new THREE.BufferGeometry());
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        const colors = new Float32Array([accent.r, accent.g, accent.b, 0, 0, 0]);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const material = keep(
          new THREE.LineBasicMaterial({
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
          }),
        );
        const line = new THREE.Line(geometry, material);
        line.visible = false;
        line.frustumCulled = false;
        inner.add(line);
        // A bright head, so each particle reads as a point of light and not only a thin line.
        const headGeometry = keep(new THREE.BufferGeometry());
        headGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
        const head = new THREE.Points(headGeometry, headMaterial);
        head.visible = false;
        head.frustumCulled = false;
        inner.add(head);
        return { line, geometry, head, headGeometry, flight: null as Flight | null };
      });
      const axes = localAxes(SITE.lat, SITE.lon);

      // Rotation: home view with a slow drift; dragging turns it, then it returns home.
      const rotation = { x: HOME.x, y: HOME.y };
      let dragging: { x: number; y: number } | null = null;
      let lastTouch = -Infinity;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      let frame = 0;
      let onScreen = true;
      const start = performance.now();

      function resize(): void {
        const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        render();
      }

      const projected = new THREE.Vector3();
      const normal = new THREE.Vector3();
      function placeLabel(): void {
        const el = labelRef.current;
        const c = canvas as HTMLCanvasElement;
        if (el === null) return;
        projected.copy(site).multiplyScalar(1.01);
        inner.localToWorld(projected);
        normal.copy(projected).normalize();
        const facingViewer = normal.dot(camera.position.clone().normalize()) > 0.15;
        projected.project(camera);
        const x = ((projected.x + 1) / 2) * c.clientWidth;
        const y = ((1 - projected.y) / 2) * c.clientHeight;
        // Beside the marker, on whichever side keeps the label inside the canvas.
        const width = el.offsetWidth;
        let left = x + 14;
        if (left + width > c.clientWidth - 4) left = x - 14 - width;
        left = Math.max(4, left);
        el.style.transform = `translate(${String(Math.round(left))}px, ${String(Math.round(y - 12))}px)`;
        el.style.opacity = facingViewer ? "1" : "0";
      }

      function render(): void {
        outer.rotation.x = rotation.x;
        inner.rotation.y = rotation.y;
        renderer.render(scene, camera);
        placeLabel();
      }

      function launch(event: ParticleEvent, delay: number): void {
        const slot = streaks.find((s) => s.flight === null);
        if (slot === undefined) return;
        const dir = arrivalDirection(
          axes,
          sampleZenith(Math.random()),
          Math.random() * 2 * Math.PI,
        );
        slot.flight = { dir, arriveAt: event.ts + delay, pulsed: false };
        slot.line.visible = true;
        slot.head.visible = true;
      }

      function tick(): void {
        frame = 0;
        const now = Date.now();
        const t = performance.now();
        // Rotation: return home after a drag, with a slow drift of ±10° about the polar axis.
        if (dragging === null && t - lastTouch > IDLE_RETURN_MS) {
          const drift = HOME.y + 0.17 * Math.sin((t - start) / 9_000);
          rotation.y += (drift - rotation.y) * 0.03;
          rotation.x += (HOME.x - rotation.x) * 0.03;
        }
        const delay = delayRef.current;
        const pending = queue.current;
        if (delay !== null) {
          while (pending.length > 0) {
            const next = pending[0] as ParticleEvent;
            if (next.ts + delay - now > TRAVEL_MS) break;
            pending.shift();
            if (next.ts + delay < now - LATE_MS) continue;
            launch(next, delay);
          }
        }
        for (const s of streaks) {
          const f = s.flight;
          if (f === null) continue;
          const left = (f.arriveAt - now) / TRAVEL_MS; // 1 → 0 while falling
          const head = Math.max(left, 0) * FALL_FROM;
          // Falling: a trail behind the head. Arrived: the trail shrinks into the site.
          const tail =
            left > 0 ? Math.min(head + TRAIL, FALL_FROM) : Math.max(0, TRAIL * (1 + left / 0.3));
          const p = s.geometry.getAttribute("position") as InstanceType<
            typeof THREE.BufferAttribute
          >;
          const r0 = 1.006;
          p.setXYZ(
            0,
            site.x * r0 + f.dir[0] * head,
            site.y * r0 + f.dir[1] * head,
            site.z * r0 + f.dir[2] * head,
          );
          p.setXYZ(
            1,
            site.x * r0 + f.dir[0] * tail,
            site.y * r0 + f.dir[1] * tail,
            site.z * r0 + f.dir[2] * tail,
          );
          p.needsUpdate = true;
          const h = s.headGeometry.getAttribute("position") as InstanceType<
            typeof THREE.BufferAttribute
          >;
          h.setXYZ(0, p.getX(0), p.getY(0), p.getZ(0));
          h.needsUpdate = true;
          s.head.visible = left > -0.05;
          if (left <= 0) {
            // Arrived: pulse once, then the trail shrinks into the site.
            const pulse = pulses.find((x) => !x.ring.visible);
            if (!f.pulsed && pulse !== undefined) {
              pulse.at = now;
              pulse.ring.visible = true;
            }
            f.pulsed = true;
            if (left < -0.3) {
              s.flight = null;
              s.line.visible = false;
              s.head.visible = false;
              s.head.visible = false;
            }
          }
        }
        for (const pulse of pulses) {
          if (!pulse.ring.visible) continue;
          const age = (now - pulse.at) / PULSE_MS;
          if (age >= 1) {
            pulse.ring.visible = false;
            continue;
          }
          pulse.ring.scale.setScalar(1 + age * 3.5);
          pulse.material.opacity = 0.9 * (1 - age);
        }
        render();
        schedule();
      }

      function schedule(): void {
        if (frame === 0 && onScreen && !document.hidden && !reduce.matches) {
          frame = requestAnimationFrame(tick);
        }
      }

      function onPointerDown(e: PointerEvent): void {
        dragging = { x: e.clientX, y: e.clientY };
        (canvas as HTMLCanvasElement).setPointerCapture(e.pointerId);
      }
      function onPointerMove(e: PointerEvent): void {
        if (dragging === null) return;
        rotation.y += (e.clientX - dragging.x) * 0.006;
        rotation.x = Math.min(Math.max(rotation.x + (e.clientY - dragging.y) * 0.004, -1.2), 0.6);
        dragging = { x: e.clientX, y: e.clientY };
        lastTouch = performance.now();
        if (reduce.matches) render();
      }
      function onPointerUp(): void {
        dragging = null;
        lastTouch = performance.now();
      }
      function onMotion(): void {
        cancelAnimationFrame(frame);
        frame = 0;
        if (reduce.matches) {
          for (const s of streaks) {
            s.flight = null;
            s.line.visible = false;
            s.head.visible = false;
          }
          render();
        } else schedule();
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
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      reduce.addEventListener("change", onMotion);
      const markerTimer = setInterval(placeMarkers, 5_000);
      resize();
      onMotion();

      cleanup = () => {
        cancelAnimationFrame(frame);
        clearInterval(markerTimer);
        resizeObserver.disconnect();
        visibility.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        reduce.removeEventListener("change", onMotion);
        for (const d of disposables) d.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [queue]);

  return (
    <div className="relative h-full w-full" aria-hidden="true">
      {!failed && (
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
        />
      )}
      <div
        ref={labelRef}
        className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md border border-border bg-bg/80 px-3 py-2 opacity-0 backdrop-blur-sm"
      >
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="font-mono text-xs text-secondary">{sublabel}</p>
      </div>
    </div>
  );
}
