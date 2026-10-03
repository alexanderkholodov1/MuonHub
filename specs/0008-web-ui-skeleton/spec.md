# 0008 — Web app shell + UI design-system foundation (Observatory Dark)

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** ready for implementation
- **Responsible:** Adjutant (spec) → Sonnet executor (implementation) → cross-provider review (D35)
- **Depends on:** 0003 (shared), 0001 (scaffold). Independent of 0007 (FirebaseProvider, PR #42) —
  disjoint file set, branches cleanly from `main`.
- **Phase:** F1 → enables F2/F3 UI · **Epic:** EPIC-5/6 foundation · **Design:** binding —
  `docs/design/DESIGN-LANGUAGE.md` "Observatory Dark" (obey §0 anti-AI-look checklist exactly).

## Context

`apps/web`, `apps/agent`, and `packages/ui` are stubs. Nothing visual exists. This milestone
stands up the **web application shell** and the **design-system foundation** so every later UI
spec (dashboards, landing, admin) has a real, on-brand surface to build on. It is the foundational
front-end milestone STATUS.md calls "web/agent skeleton next."

**Scope boundary (important):** this is the **shell + tokens + a minimal primitive set**, calm/
app-register. It is **NOT** the dramatic public landing hero (the cursor-reactive particle field
in `docs/design/LANDING-CONCEPT.md` is explicitly deferred to a dedicated design session) and
**NOT** any data wiring to the provider (no live charts, no auth). Those are later specs.

## Functional requirements

### `packages/ui` — Observatory Dark foundation
- **FR1 — Design tokens.** Implement the full Observatory Dark token set from
  `DESIGN-LANGUAGE.md` §1–§3 as **CSS custom properties** (semantic roles, never raw hex in
  components): dark palette (default) + light palette (mirror), typography scale, the 8-pt spacing
  scale, radii. Expose them through a Tailwind theme so components reference tokens
  (`bg-surface`, `text-secondary`, `rounded-md`, …), never literal values.
- **FR2 — Tailwind + shadcn base, re-tokenized.** Configure Tailwind (v4) wired to the tokens;
  set up shadcn/ui primitives **re-tokenized** to the palette/radii (no stock shadcn purple or
  default radii — §0). Geist Sans (UI) + Geist Mono (numbers, `tabular-nums`) as the only families.
- **FR3 — Minimal primitive set (prove the system, not the whole library):** `ThemeProvider`
  (dark default, light toggle, honors `prefers-reduced-motion`), `Button` (variants: primary/
  secondary/ghost; states default/hover/focus-visible/disabled/loading), `Card` (title + body),
  and a `Stat`/KPI tile with a **mono tabular-nums** readout. Lucide icons wired. Each primitive
  ships its states. Export all from `packages/ui` `index.ts`.
- **FR4 — A11y baseline.** WCAG AA contrast for the shipped tokens (verify, don't eyeball);
  focus-visible rings on interactives; touch targets ≥ 36px.

### `apps/web` — Next.js shell
- **FR5 — Next.js App Router, static export.** Wire Next.js with `output: "export"` (Phase A =
  Firebase Hosting static; SSR is Phase B). Replace the stub `build`/`dev` scripts with real ones
  (`next build` producing `out/`, `next dev`). TypeScript strict; ESLint via the workspace config.
- **FR6 — Root layout + theme.** Global stylesheet importing the `@munhub/ui` tokens; `<html>`
  dark by default; Geist fonts loaded (next/font). The `ThemeProvider` wraps the app; a header
  with the MunHub wordmark, nav placeholders, and a working light/dark toggle.
- **FR7 — Landing scaffold (calm, on-brand, real copy).** A `/` route: hero section (type scale,
  **no particle animation** — a static, restrained hero placeholder noting the design session
  owns the motion), a short "what is MunHub" section, and a CTA. Real/realistic scientific copy
  (no lorem ipsum, §0). Plus a `/dashboard` placeholder route showing the Card/Stat primitives
  with **realistic** sample readouts (clearly marked as sample), to prove the app register.
- **FR8 — States.** The dashboard placeholder demonstrates empty/loading/error states for a Card
  (per §0 / §6 "every component ships its states").

## Non-functional
- Strict TS, no `any`. ESM. No backend SDK, no `@munhub/data-provider` calls yet (deps may be
  declared but unused wiring is out of scope).
- `prefers-reduced-motion` honored; the only motion is purposeful (150–250ms, ease-out, §5).
- Static export must produce `out/` with no SSR-only APIs.
- §0 anti-AI-look checklist: body ≥16px, max 2 accents, 8-pt grid, Lucide (no emoji), one UI + one
  mono family, AA contrast, real content, every view has empty/loading/error.

## Acceptance criteria
1. `pnpm --filter @munhub/ui build test lint typecheck` green; tokens + the 4 primitives exported.
2. `pnpm --filter @munhub/web build` runs `next build` and emits a static `out/` (no SSR APIs).
3. `pnpm --filter @munhub/web dev` serves `/` (landing scaffold) and `/dashboard` (primitives +
   empty/loading/error states), dark by default, with a working light/dark toggle.
4. The whole workspace stays green: `pnpm build test lint typecheck` from the root.
5. Screenshots of `/` and `/dashboard` (dark + light) attached to the PR; a §0 checklist
   self-review in the PR body, each item ticked.
6. No raw hex in components (tokens only); no stock shadcn defaults; AA contrast verified for the
   shipped surfaces.

## Out of scope (explicit)
- The particle-field landing hero (deferred to the design session — `LANDING-CONCEPT.md`).
- Any live data, auth, charts, or provider wiring (later specs).
- The full component library (only the foundation + 4 primitives here).
- `apps/agent` Tauri UI (separate track).

## Documentation (D42)
- `docs/technical/ARCHITECTURE.md`: note the web shell + static-export decision and the
  `@munhub/ui` token foundation.
- `docs/design/DESIGN-LANGUAGE.md`: mark the token implementation as landed (link to `packages/ui`).
- `docs/STATUS.md` (Adjutant, at consolidation); `changelog.d/web-ui-skeleton.added.md`.
