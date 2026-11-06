# 0088 — Web foundation and accounts

- **Status:** draft (implementation started 2026-11-06 at the maintainer's instruction, before the
  M2 plan's formal approval — see [`../../docs/product/plans/M2-web-platform.md`](../../docs/product/plans/M2-web-platform.md))
- **Milestone:** M2 — Web platform (`6.0.0-alpha.2.x`), steps 1 and 2
- **Owner:** written by the MuonHub brigadista; implemented by Codex workers and the brigadista;
  reviewed by code, security and silent-failure reviewers
- **Depends on:** specs 0083 (contracts v2), 0084 (rules v2); ADR-004 (terminology), ADR-005 (free
  tier, static hosting), ADR-009 (security baseline); `docs/design/DESIGN-LANGUAGE.md`

## Context

The first web attempt (`legacy/web-first-attempt`) is reference only. Its audit (B-M2-01, 02, 03)
found a dynamic `[id]` shell that 404s on static hosting, configuration that silently failed to reach
the browser, sample pages with fake data, and raw backend errors shown to users. M2 starts a new
`apps/web` on the M1 contracts and `DataProviderV2`, which stays the only place that talks to
Firebase. This spec is the foundation every other M2 spec builds on, plus the account flows.

It is **not** the public site (spec 0092, after a design session), the dashboard (0090), or station
management (0089).

## Functional requirements

- **FR1 — Static export without dynamic segments.** `next build` with `output: "export"` produces
  plain files. Every route is a fixed path; entity ids travel as query parameters
  (`/app/station?id=…`, `/app/stream?id=…`). A real `404` page exists. Firebase Hosting serves clean
  URLs (`cleanUrls: true`, `trailingSlash: false`).
- **FR2 — Public configuration validated once.** `src/lib/config.ts` reads each `NEXT_PUBLIC_*`
  variable **literally** (`process.env.NEXT_PUBLIC_FIREBASE_API_KEY`, never through a computed key, so
  Next inlines it) and validates them with zod: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`,
  `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_APP_ID`, optional `USE_EMULATORS`
  (`"1"` → Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`, Realtime Database `127.0.0.1:9000`).
  When validation fails the app renders one full-page configuration error naming the missing
  variables — never a blank page or a half-working app.
- **FR3 — One data provider per browser tab.** `src/lib/data/DataProviderContext.tsx` creates
  `createFirebaseProviderV2(...)` once on the client and exposes it through `useDataProvider()`.
  Tests inject `createMemoryProviderV2()` through the same context.
- **FR4 — Data hooks.** `src/lib/data/useResource.ts`: `useResource(key, load)` returns
  `{ status: "loading" | "ready" | "error", data, error, reload }`. A newer key or unmount cancels
  the older load (its result is ignored). Errors are `DataProviderError` codes mapped to safe,
  translated messages (`src/lib/errors.ts`); unknown errors become a generic message and are logged
  to the console, never shown raw. Every page renders its loading, empty, and error state.
- **FR5 — Strings ready for translation.** All user-visible text comes from `src/i18n/en.ts`
  (English, the source locale) through `t(key, params?)`; no literal UI strings in components.
- **FR6 — Layout and design language.** Root layout with the `packages/ui` `ThemeProvider`, tokens
  and fonts (one UI family, one mono); dark default, no theme flash; a header with the product name,
  the signed-in user's menu or a sign-in link; Lucide icons only.
- **FR7 — Accounts** (`src/features/auth`):
  - **Sign-up** (`/signup`): email, password (≥ 8 characters), display name, username
    (3–30 characters, `[a-z0-9_]`, unique). Creates the account, then `createUserProfile` (which
    claims `usernames/{username}` atomically); a taken username is reported on the field.
  - **Sign-in** (`/signin`): email and password; Google sign-in shown only when
    `NEXT_PUBLIC_AUTH_GOOGLE` is `"1"` (the provider must be enabled in the console first).
  - **Password reset** (`/reset`): sends the reset email; the same confirmation is shown whether or
    not the address exists (no account enumeration).
  - **Email verification:** after sign-up a verification email is sent; `/app` shows a banner until
    the address is verified (with "resend"); unverified accounts can still use their own data.
  - **Sign-out** from the user menu.
  - **`?next=`**: protected pages redirect to `/signin?next=<path+query>`; after sign-in the user
    returns there. Only same-origin relative paths starting with `/` and not `//` are honoured.
- **FR8 — Provider additions** (`packages/data-provider`, Firebase and in-memory implementations
  with tests): `AuthUser.emailVerified: boolean`; `sendPasswordReset(email)`;
  `sendEmailVerification()`; `signInWithGoogle()` (popup); `reloadUser()`. Existing callers keep
  working.
- **FR9 — Signed-in home** (`/app`): the user's stations and the stations shared with them (names
  and roles only in this spec; management is spec 0089), with empty states that explain the next
  step.

## Non-functional requirements

- Strict TypeScript (repository settings), ESLint, Prettier; React 19 and Next.js 16.
- **Free-tier budget (ADR-005):** static files only; reads only on signed-in pages, one profile read
  and the two station lists on `/app`; no realtime subscription in this spec.
- **Security (ADR-009):** no secrets in the client (the Firebase web configuration is public by
  design); safe error messages; `?next=` restricted to relative paths; no account enumeration on
  reset; nothing written before the user is signed in; rules unchanged.
- **Accessibility:** labelled inputs, visible focus, errors announced (`aria-live`), WCAG AA contrast
  from the tokens, body text ≥ 16 px.

## Data integrity (ADR-006)

Not applicable: no measurement data is read or written.

## Design / approach

```
apps/web/
  package.json            @muonhub/web; next, react, react-dom, @muonhub/{shared,data-provider,ui}, zod,
                          lucide-react; dev: tailwindcss, @tailwindcss/postcss, vitest, jsdom,
                          @testing-library/react, @testing-library/user-event
  next.config.ts          output "export", transpilePackages ["@muonhub/ui"], images unoptimized
  src/app/                layout.tsx, page.tsx (minimal home until spec 0092), not-found.tsx,
                          signin/, signup/, reset/, app/ (page.tsx = signed-in home)
  src/features/auth/      AuthProvider, RequireAuth, forms, username validation
  src/lib/                config.ts, errors.ts, next-param.ts, data/DataProviderContext.tsx,
                          data/useResource.ts
  src/i18n/               en.ts, t.ts
  src/test/               render helpers with the in-memory provider
infra/firebase/firebase.json   hosting: public "../../apps/web/out", cleanUrls, trailingSlash false
```

## Acceptance criteria (verifiable)

- [ ] CA1: `pnpm --filter @muonhub/web build` produces `apps/web/out/` with `index.html`,
  `signin.html`, `signup.html`, `reset.html`, `app.html`, `404.html`; `grep -r "\[id\]" apps/web/src/app`
  finds nothing.
- [ ] CA2: config tests — valid env passes; each missing variable is named in the error; the app
  renders the configuration error page when invalid.
- [ ] CA3: `useResource` tests — loading → ready; error → mapped message; a key change ignores the
  stale result; unmount ignores a late result.
- [ ] CA4: sign-up test (in-memory provider): creates the account and profile; a taken username
  shows the field error and creates nothing else; invalid usernames are refused client-side.
- [ ] CA5: sign-in redirect tests — `/app` without a user goes to `/signin?next=%2Fapp`; after sign-in
  the user lands on `next`; `next=//evil.example` and `next=https://evil.example` fall back to `/app`.
- [ ] CA6: reset shows the same confirmation for a known and an unknown address.
- [ ] CA7: data-provider tests for FR8 (memory provider; Firebase provider against the Auth emulator).
- [ ] CA8: no literal user-visible strings in `src/features` and `src/app` outside `src/i18n`
  (lint rule or test).
- [ ] CA9: typecheck · lint · build · test green, and the emulator tests.

## Validation in practice

The maintainer signs up, verifies the address, signs out and in, resets the password, and opens a
protected link while signed out — on a phone and on a computer — against `muonhub-dev` (or the
emulators until it exists).
