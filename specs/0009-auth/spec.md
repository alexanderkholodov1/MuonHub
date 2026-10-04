# 0009 — Authentication (Firebase Auth behind DataProvider) + auth UI

> **Superseded (2026-10-03):** first v6 attempt, kept as a historical record. The v6 rebuild
> replaces this work — see [`specs/README.md`](../README.md) and [`docs/product/ROADMAP.md`](../../docs/product/ROADMAP.md).

- **Status:** implemented
- **Responsible:** Adjutant (spec) → Cursor (implementation, Claude model) → Gemini (cross-provider review, D35) → Adjutant (final review + PR)
- **Depends on:** 0007 (FirebaseProvider — client SDK + `/users` access), 0008 (`@munhub/ui` primitives + web shell), 0003 (shared `User`/`Language` schemas). Stacks on PRs #42 + #43; rebase onto `main` once they merge.
- **Phase:** F1 · **Epic:** EPIC-3 · **Backlog:** 0009. First step of the MVP "an authenticated user creates a station+detector".

## Context

The app has a UI shell (0008) and a data layer (0007) but no identity. This milestone adds
authentication **behind the `DataProvider`** (guardrail 6: the Firebase Auth SDK is imported ONLY
in `packages/data-provider`, never in `apps/web`), plus the auth UI built from `@munhub/ui`.

## Functional requirements

### Contract — extend `DataProvider` (orchestrator-owned; defined here)
Add to the interface in `packages/data-provider/src/provider.ts` (and the in-memory mock in
`provider.test.ts`, and `FirebaseProvider`):
- `register(email: string, password: string, profile: { displayName: string; language: Language }): Promise<User>`
  — creates the Firebase Auth user AND writes `/users/{uid}` (role default `"user"`, the chosen
  `language`, `displayName`, `email`), returns the `User`.
- `signIn(email: string, password: string): Promise<User>` — authenticates, returns the `/users/{uid}` record.
- `signOut(): Promise<void>`.
- `sendPasswordReset(email: string): Promise<void>`.
- `onAuthStateChanged(cb: (user: User | null) => void): Unsubscribe` — fires on login/logout and
  on initial session restore; resolves the `User` from `/users/{uid}`.
`getCurrentUser()` (already in the interface) must reflect the live session.

### FirebaseProvider implementation (client target)
- Use `firebase/auth` (modular) inside `packages/data-provider` only. Persist the session
  (browser local persistence). On `register`, create the auth user then the `/users/{uid}` record
  in one logical flow; on failure, surface a typed error (do not leave a half-created user).
- Map Firebase Auth errors to stable, user-presentable error codes (e.g. `auth/invalid-credential`,
  `auth/email-already-in-use`) — no raw Firebase error objects cross the package boundary.
- The **admin** target throws `Unsupported` for these auth methods (admin has no interactive auth);
  document the asymmetry.

### Web UI (`apps/web`)
- `useAuth()` hook + an auth context provider wrapping the app: exposes `user`, `loading`,
  `signIn`, `register`, `signOut`. Backed by `onAuthStateChanged`. No `firebase/*` import in `apps/web`.
- Pages built from `@munhub/ui` (Observatory Dark, §0 checklist): `/login`, `/register`
  (email, password, display name, preferred language en/es/pt-BR), `/reset-password`. Each ships
  default/loading/error/success states; inline validation; real copy.
- **Route protection:** a guard (component or layout) that redirects unauthenticated users from
  protected routes (`/dashboard`, future app routes) to `/login`, and redirects authenticated
  users away from `/login` `/register`. The public landing `/` stays open.
- The header (`SiteHeader`) shows the signed-in user (displayName + a menu with sign-out) when
  authenticated, and a "Sign in" action when not.

## Non-functional
- Strict TS, no `any`. Guardrail 6: `firebase/auth` only in `packages/data-provider`; `apps/web`
  talks to auth exclusively through the `DataProvider` / `useAuth`.
- All auth tests run against the **Firebase Auth emulator** (extend the existing emulator suite in
  `packages/data-provider`; the default `pnpm test` stays emulator-free). Cover: register creates
  auth user + `/users` record; signIn returns the user; wrong password rejects with the mapped
  code; `onAuthStateChanged` fires on login/logout; signOut clears the session.
- §0 anti-AI-look checklist on every new screen; WCAG AA; `prefers-reduced-motion`.
- No "muon" wording (N/A here) — but keep scientific honesty in any copy.

## Acceptance criteria
1. `DataProvider` interface + mock + `FirebaseProvider` implement all six auth methods; the existing
   contract test still compiles.
2. Emulator tests: register → `/users/{uid}` exists with role `"user"` + chosen language; signIn
   ok; wrong password → mapped error; `onAuthStateChanged` login/logout; signOut.
3. `/login`, `/register`, `/reset-password` render from `@munhub/ui`, with validation + loading/
   error/success states; a user can register, land authenticated, and sign out (verified on the
   emulator / a Vercel preview).
4. Visiting `/dashboard` unauthenticated redirects to `/login`; authenticated users skip `/login`.
5. `apps/web` imports no `firebase/*` (verify by grep); auth flows only through the provider.
6. `pnpm build · test · lint · typecheck` green across the workspace; the data-provider emulator
   job stays green.

## Out of scope
- Roles/tenancy/permissions matrix (0010), institution membership UI, OAuth providers, email
  verification flows beyond password reset, account deletion (0065). Station creation (0011).

## Documentation (D42)
- `docs/technical/ARCHITECTURE.md` (auth behind the provider), `docs/technical/DATA-MODEL.md`
  (`/users` write on register), spec status, `docs/STATUS.md` (Adjutant), `changelog.d/auth.added.md`.
