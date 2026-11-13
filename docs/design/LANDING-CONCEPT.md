# MuonHub — Landing concept (parking lot)

> **Status: built (spec 0092, 2026-11-13).** The maintainer asked for a **3-D planet where every
> detector is seen** ("no sale el planeta tridimensional que yo pedí donde se vean todos los
> detectores"). The hero is a three.js globe: land as dots, a violet atmosphere, the detectors at their
> site, and each real detection drawn as a particle falling onto Quito at its replay time, from a
> cos²θ direction; drag to turn it. The first version's pointer lens was dropped at his word ("la
> distorsión de cuando paso el mouse sobre el detector no tiene sentido, la animación no se entiende").
>
> **Original status:** not started — to be developed in the dedicated design session (with Claude Design).
> This file only captures the idea so it isn't lost. It obeys `DESIGN-LANGUAGE.md` ("Observatory
> Dark") and the landing-vs-app split (§7): the landing may be dramatic; the app stays calm.

## The seed idea (from Alexander)
Reference: the **Antigravity** landing page — a **cursor-reactive particle field** that "perturbs
the space" around the pointer. Alexander loved how the cursor disturbs the surrounding field.

## Observatory adaptation (concept directions to explore)
- **Gravitational lensing cursor:** a field of faint **stars + cosmic-ray streaks**; the cursor
  behaves like a **mass that bends/attracts nearby particles** — a perfect conceptual pun: lensing
  + "Antigravity" ↔ cosmic rays. (Alt: the cursor **clears a bubble** in the particle field.)
- **Live science tie-in:** optionally seed the field density/▮motion from a real (or demo) live
  particle rate — the hero literally breathes with cosmic-ray data.
- **Restraint:** one hero motion only; the rest of the landing follows the type scale and palette.

## Implementation candidates (decide in design session)
- `react-three-fiber` / Three.js (WebGL, GPU particles) for depth + lensing, or a tuned 2D canvas
  for lightness. Must honor `prefers-reduced-motion`, degrade gracefully, and stay smooth on mobile.
- Lives only on the public landing (`apps/web`), never in the app/dashboards.

## Open questions for the design session
- WebGL vs canvas (perf vs richness)? Lensing-attract vs clear-bubble interaction?
- Tie particle density to live data, or keep purely aesthetic?
- Hero imagery: Andean night sky / the real detector / abstract field?
