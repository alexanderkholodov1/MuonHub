# Session record — 2026-11-13 (MuonHub brigadista, Beacon)

## 1. The maintainer's words

> "Por favor, quiero que avances por el plan de MuonHub, y me presentes ALGO TANGIBLE, algo que se
> VEA que ha avanzado. La anterior sesion lo delego a otros agentes sin darles el contexto, y me
> alzaron una pagina que segun ellos era un "avance", que era una pagina vacia con login en la primera
> ventana (va completamente en contra de mis instrucciones), y con un mapa botado en medio de una
> segunda ventana vacia sin nada. Por favor, encargate tu de eso, por lo menos haz el landing page.
> Dime que necesitas para eso, quisiera que lo despliegues en una URL de pruebas de Firebase"

Read as: build the public landing myself, no delegation, following his recorded instructions
(`PUBLIC-SITE-PLAN.md` §1, `LANDING-CONCEPT.md`, `DESIGN-LANGUAGE.md`), which the earlier start page
(a title and two sign-in buttons) and the bare `/network` page did not follow; then deploy it to a
Firebase test URL. The design session of M2 step 6 is delegated to the brigadista by this request.

## 2. What was built (`6.0.0-alpha.2.5`, spec 0092)

- **Landing `/`** — hero: a night sky (in both themes) where each real detection of the LEOPARD lab
  detector is drawn as a track that crosses a drawn detector about 15 s after it happened and leaves
  a mark on it for a minute; angles drawn from cos²θ and said to be illustrative; the pointer bends
  everything like a point gravitational lens (the concept he chose). Readout: the latest complete
  minute N ± √N, its Quito time and the source's state (live, quiet, unavailable). Then the last hour
  (dots with ±√N against the ±√mean band chance alone fills, mean ± √ΣN / n, minutes recorded,
  pressure, detector temperature, why the dots wobble, the honest-label note), how it works,
  why the equator (≈ 12–13 GV), and the network with links to `/network` and `/signup`. Sign-in
  stays in the header only.
- **Network `/network`** — the detector listed with its live state and a link to the landing's live
  section, beside a larger map; station count and how many send data now.
- **Live source (temporary bridge)** — the visitor's browser reads the detector's **public v5**
  window read-only: `profiles/leopard_test/realtime` (events of the last ≈ 12 minutes) every 10 s and
  `sessions/<session>/minutes` every 60 s, only while the page is visible. The profile root is never
  read: it publishes the owner's e-mail address (a v5 privacy defect; v5 is frozen, reported here).
- **Hosting** — `infra/firebase/firebase.json` gains a Hosting block (clean URLs, security headers,
  immutable caching), checked with the Hosting emulator; `infra/firebase/deploy-web-preview.sh`
  builds the committed tree with muonhub's public web config and deploys to an expiring preview
  channel (the live site, databases and rules untouched).

## 3. Verification

- Unit: web 89 (12 new: parsing, statistics, status, replay delay, lens, zenith sampling, tracks).
- End-to-end: 31 passed, 1 skipped (keyboard on the phone), desktop and phone, axe in both themes;
  the live source is answered by `e2e/live-source.ts`, so CI never reads v5; a test asserts that only
  the two public paths are requested.
- Browser, against the real detector, at 1366 and 390 px: no horizontal scroll, no console errors
  (screenshots in the session's scratch space).
- **Found and fixed:** in the light theme the hero's secondary text was the light theme's grey on the
  night sky (the `@theme` aliases resolve on `:root`); axe did not report it because the canvas
  overlaps the text. A test now checks the computed colours.

## 4. What waits on the maintainer

1. **Firebase CLI sign-in on Beacon** for the preview deploy (`firebase login --no-localhost`,
   one browser approval); the deploy itself is one command.
2. **Authentication** (Email/Password) in the muonhub console, so "Sign in" works on the test URL.
3. Whether the bridge to the v5 public window may serve the public preview (read-only, a few KB
   every 10 s per open page).
4. His judgement of the design.

## 5. Quota

This session runs on the lab account; its week stood at 73 % at the start (resets 2026-11-16
07:00Z). He addressed this session directly.
