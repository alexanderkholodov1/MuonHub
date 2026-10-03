# MuonHub — Design Language: "Observatory Dark"

> **Implementation status:** token foundation and primitive set LANDED in `packages/ui` (spec 0008).
> The full token set (CSS custom properties + Tailwind v4 `@theme`) lives in
> [`packages/ui/src/styles/tokens.css`](../../packages/ui/src/styles/tokens.css).
> Primitives exported from [`packages/ui/src/index.ts`](../../packages/ui/src/index.ts):
> `ThemeProvider`, `Button`, `Card`, `Stat`.

> The visual contract for the whole platform. Every UI spec, every component, every screen — and
> every agent/tool (v0, Cursor, Copilot, Claude) — obeys this document, exactly as code obeys the
> contracts in `packages/shared` and science obeys `docs/research/THEORETICAL-FOUNDATION.md`.
>
> **North star:** MuonHub is a **scientific instrument**, not a generic SaaS. It should feel like
> serious observatory / telescope-control software: calm, precise, data-forward, trustworthy.
> The data is the hero; the chrome gets out of the way.
> **References (study these):** Linear (precision), Observable & Windy (data-forward), Vercel/Geist
> (typographic restraint), GitHub dark (legible engineering UI), NASA Eyes / CERN (gravitas).

---

## 0. The Anti-"AI-look" Doctrine (read first — non-negotiable)

The tells that make an interface look AI-generated, and the rules that kill them:

| AI tell | Rule |
|---|---|
| **Tiny gray text everywhere** | Body text **≥ 16px**. Secondary ≥ 14px. 13px only for micro-labels. Never a wall of 12px. |
| Rainbow of colors | **Max 2 accent colors** on a screen. Function over decoration. |
| Harsh gradients / glows | No neon glows, no purple-on-everything. Gradients only subtle, on the landing hero. |
| Inconsistent spacing | Everything on the **8-pt grid** (4/8/12/16/24/32/48/64). No arbitrary gaps. |
| Emoji as icons | Use **Lucide** icons. Emoji never substitute UI icons. |
| Generic shadcn defaults | Re-tokenized theme (below). Never ship stock shadcn purple/!default radii. |
| 4 different fonts | **One UI family + one mono.** Nothing else. |
| Cramped, no breathing room | Generous whitespace. Density "comfortable", not "compact-by-default". |
| Low contrast | **WCAG AA**: ≥ 4.5:1 body, ≥ 3:1 large text. Verified, not eyeballed. |
| Lorem ipsum / fake data | Always real or realistic scientific content. |
| No empty/loading/error states | Every view designs its empty, loading, and error states. |

> **Every UI PR runs this checklist** (it's in the PR template's physics/self-review spirit).
> A reviewer (Claude design persona / Bugbot) rejects screens that fail it.

---

## 1. Color tokens

Dark is the default (24/7 monitoring, data legibility). Light ships too (papers, daytime, print).
Tokens are semantic — components reference roles, never raw hex.

### Dark (default)
| Role | Hex | Use |
|---|---|---|
| `bg` | `#0B0E14` | app background (near-black, slight blue) |
| `surface` | `#131722` | cards, panels |
| `surface-2` | `#1A2030` | nested/elevated |
| `border` | `#252C3B` | hairlines, dividers |
| `text` | `#E6EAF2` | primary text |
| `text-secondary` | `#9AA4B2` | secondary/labels |
| `text-muted` | `#6B7480` | disabled/hints |
| `accent` | `#4CC9F0` | primary action / live data (cyan, scientific). **Used sparingly.** |
| `accent-warm` | `#F5B544` | highlights, "now" markers (amber) |
| `success` | `#3FB950` · `warning` `#D29922` · `danger` `#F85149` | status (proven legible on dark) |

### Light (mirror)
| Role | Hex |
|---|---|
| `bg` `#FBFCFD` · `surface` `#FFFFFF` · `surface-2` `#F3F5F8` · `border` `#E3E7EC` |
| `text` `#0A0C10` · `text-secondary` `#4B5563` · `text-muted` `#8A93A2` |
| `accent` `#0E9FCF` · `accent-warm` `#C77A12` · status hues darkened for AA on white |

### Data-visualization palette (categorical, colorblind-aware, tuned for dark)
`#4CC9F0` `#F5B544` `#5BD6A0` `#C792EA` `#FF7A85` `#7AA2F7` `#E0AF68` `#8BD450`
Primary series = `accent`. Gridlines = `border` at low opacity. Always offer error bars + log scale.

---

## 2. Typography

- **UI family:** Geist Sans (fallback: Inter). **Mono:** Geist Mono (fallback: JetBrains Mono).
- **Mono is mandatory for all numbers/scientific values** (`font-variant-numeric: tabular-nums`)
  so columns of data align and don't jitter.
- **Base = 16px.** Line-height: body **1.6**, headings **1.15–1.25**.
- Weights: 400 body, 500 medium, 600 semibold headings. **No hairline/100–300 weights** for text.

| Token | Size | Use |
|---|---|---|
| `display` | 60px / 3.75rem | landing hero only |
| `h1` | 38px / 2.375rem | page titles |
| `h2` | 30px / 1.875rem | section titles |
| `h3` | 24px / 1.5rem | card titles |
| `h4` | 20px / 1.25rem | sub-headers |
| `lg` | 18px | lead paragraphs |
| `base` | **16px** | **body (default)** |
| `sm` | 14px | secondary text, table cells |
| `xs` | 13px | micro-labels ONLY (axis ticks, captions) |

> Numbers in KPIs/tables: mono, tabular, right-aligned. A live rate reads like an instrument readout.

---

## 3. Spacing, layout, shape

- **8-pt grid:** spacing scale `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- **Radius:** `sm 6px · md 8px · lg 12px · full` (pills/avatars). Default md.
- **Elevation on dark = border + subtle surface step**, not heavy shadows. Shadows only for
  popovers/menus (low-opacity, large blur). Light mode may use soft shadows.
- **Layout:** max content width ~1280px; comfortable gutters; 12-col grid. Dashboards use a
  responsive card grid (the v5 2×2 idea, evolved). Dense where data demands, airy elsewhere.
- **Touch targets:** interactive elements ≥ 36–40px height.

---

## 4. Data visualization (the hero)

- **Plotly** themed to Observatory Dark (D15): transparent paper, `border`-opacity gridlines,
  `text-secondary` ticks, `accent` for the primary series, the categorical palette above.
- Defaults: tabular mono tick labels, **error bars available**, **log-scale toggle**, range
  selector, export PNG/CSV. Gaps in time series **break the line** (≥2 min, per `GAP_THRESHOLD`).
- A chart is never decorative — every axis labeled with units; every series legible at a glance.
- Scientific honesty in labels (D7/D9): "charged-particle / MIP-type rate", never "muons" for
  single-SiPM. Tooltips pull exact wording from the foundation.

---

## 5. Motion

- Durations **150–250ms**, `ease-out`. Purposeful only (state change, reveal, focus).
- No looping/ambient animation in the app. The landing may use one restrained hero motion.
- Always honor `prefers-reduced-motion`.

---

## 6. Components

- **Base:** shadcn/ui (D15) **re-tokenized** to the palette/radii above — never stock defaults.
- **Icons:** Lucide, 1.5–2px stroke, sized to text.
- Patterns: cards with a clear title + unit + value; KPI tiles with mono readouts; data tables
  with tabular numerals and right-aligned numbers; toasts/modals per `ui-manager` lessons from v5.
- Every component ships: default, hover, focus-visible, disabled, loading, empty, error.

---

## 7. Landing vs. App (two registers, one language)

- **Public landing** (attract universities): may be **dramatic** — `display` type, a hero with the
  Andean night sky / detector imagery, the city-bubble map (D20), one restrained motion. Wow-factor.
- **App / dashboards** (daily science): **calm, dense, data-first.** Restraint wins. Same tokens,
  lower expressiveness. (Same approach as Linear/Stripe: bold marketing, quiet product.)

---

## 8. How the fleet uses this

- **v0.dev (Vercel):** prepend the "v0 prompt kit" (§8.1) so generations are on-brand from token 0.
- **Cursor / Copilot:** `.cursor/rules` + `copilot-instructions` point here; integrate v0 output into
  `packages/ui` with these tokens. Never hand-pick raw hex — use semantic tokens.
- **Claude (design persona):** art-directs, writes/maintains this doc, reviews every UI PR against §0.
- The concrete token implementation (Tailwind theme + CSS variables + shadcn config) lands in a
  dedicated UI spec under `packages/ui`; this document is its source of truth.

### 8.1 v0 prompt kit (paste before any v0 generation)
```
Design system: "Observatory Dark" — scientific instrument UI, NOT generic SaaS.
Dark default bg #0B0E14, surface #131722, border #252C3B, text #E6EAF2 / secondary #9AA4B2.
ONE accent cyan #4CC9F0 used sparingly; amber #F5B544 for highlights. Max 2 accents per screen.
Font: Geist Sans (UI) + Geist Mono for ALL numbers (tabular-nums). Body 16px, generous spacing (8pt grid).
Lucide icons (no emoji). shadcn/ui re-tokenized. No gradients/glows. WCAG AA contrast.
Data (Plotly charts, KPI mono readouts) is the hero. Calm, precise, lots of whitespace, large hierarchy.
```
