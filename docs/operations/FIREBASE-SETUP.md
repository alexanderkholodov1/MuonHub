# Firebase setup guide (for the maintainer)

> **When:** at the start of milestone **M1**, not before. **Who:** the maintainer, by hand, in the
> Firebase web console at <https://console.firebase.google.com> — on purpose, to learn how each
> service works. **Project:** `muonhub`.
>
> Console labels change over time. Menu names below follow the Firebase documentation as of October
> 2026 (for example **Security > Authentication**, **Databases & Storage > Firestore**). If a label
> differs, look for the closest match and note it for the Adjutant. Steps marked **(verify)** are the
> ones most likely to look different.
>
> **Golden rule:** nothing here costs money. If any screen asks you to add a billing account,
> upgrade to Blaze, or accept a paid feature — **stop** and tell the Adjutant.

The current state of the project is in [`ENVIRONMENTS.md`](ENVIRONMENTS.md).

---

## 1. Authentication — user accounts

**What it is:** Firebase's sign-in service. It stores accounts and checks passwords so MuonHub never
handles them itself.
**Why MuonHub needs it:** every user, station owner, and agent signs in with a MuonHub account.

1. Open the `muonhub` project → **Security > Authentication** → **Get started** (first time only).
2. Tab **Sign-in method** → **Email/Password** → enable the first switch (**Email/Password**) →
   **Save**.
   - Leave **Email link (passwordless sign-in)** **off**: the free plan allows only 5 such emails
     per day.
3. **Add new provider** → **Google** → enable → set the public-facing name to `MuonHub` and pick
   your support email → **Save**.
4. Tab **Settings** → **Authorized domains**: check that `localhost`, `muonhub.firebaseapp.com`, and
   `muonhub.web.app` are listed **(verify — they are normally added automatically)**. Do not add
   other domains yet.

**How to verify:** the **Sign-in method** tab shows Email/Password and Google as *Enabled*; the
**Users** tab exists and is empty.

**Do not:**
- enable Anonymous or Phone sign-in (phone sign-in is not available on the free plan);
- click any "Upgrade to Identity Platform" offer (it changes the free-tier limits);
- create users by hand — accounts are created through MuonHub in M2.

---

## 2. Cloud Firestore — structured data

**What it is:** a document database with real queries (filter by country, owner, and so on).
**Why MuonHub needs it:** stations, devices, device types, calibrations, notifications, and the
audit log. The fast, high-volume live data stays in the Realtime Database.

1. **Databases & Storage > Firestore** → **Create database**.
2. Edition: **Standard** (the free-tier edition). **Do not** choose Enterprise.
3. Database ID: keep **`(default)`**.
4. Location: **`nam5 (United States)`**.
   - ⚠️ **This choice is permanent.** Once created, a database's location cannot be changed.
     Double-check before clicking.
5. Security rules: **Start in production mode** (denies all reads and writes from browsers until
   MuonHub deploys its own rules).
6. **Create**.

**How to verify:** the **Data** tab shows an empty database; the **Rules** tab shows rules that deny
everything (`allow read, write: if false;`).

**Do not:**
- choose **test mode** — it lets anyone on the internet read and overwrite the database;
- add data or edit rules by hand (rules are deployed from the repository, with tests).

---

## 3. Register the web app — the public configuration

**What it is:** an entry that tells Firebase "the MuonHub website is a client of this project" and
gives it its configuration.
**Why MuonHub needs it:** the website (and App Check) need an app registration.

1. Project **Overview** (home) → **Add app** → the **Web** icon (`</>`).
2. Nickname: `MuonHub web`.
3. Leave **"Also set up Firebase Hosting"** unchecked — Hosting is configured from the repository
   later.
4. **Register app**. Firebase shows a configuration object (`apiKey`, `authDomain`, `projectId`,
   `storageBucket`, `messagingSenderId`, `appId`, and `measurementId` if Analytics is on).
5. You do not need to copy anything now: the Adjutant reads it from the console API (read-only, with
   your authorisation) or from **Project settings > General > Your apps**.

**Good to know:** these values are **public by design**. They are shipped to every browser and
protected by security rules and App Check. They go into the `NEXT_PUBLIC_FIREBASE_*` environment
variables of the web build, never into code. Service-account keys are the opposite: secret, and they
stay in `private/`.

**How to verify:** **Project settings > General > Your apps** lists `MuonHub web`.

---

## 4. App Check — only MuonHub may use the databases

**What it is:** a gatekeeper. The website proves it is the real MuonHub site (through reCAPTCHA)
before the databases answer.
**Why MuonHub needs it:** it protects the free quotas (100 live connections, 10 GB/month of
downloads) from scrapers and abuse.

This step has two parts. Part A happens in the **Google Cloud console**, the platform underneath
Firebase.

**Part A — create the reCAPTCHA key (verify).**
1. In the Google Cloud console (<https://console.cloud.google.com>, project `muonhub`), open the
   reCAPTCHA page. The Firebase docs currently call it the **Fraud Defense** page; search for
   "reCAPTCHA" if you cannot find it.
2. Create a key of type **Web (website)**.
3. Domains: `muonhub.web.app` and `muonhub.firebaseapp.com`. **Do not add `localhost`** to this
   production key (local development uses a separate debug token).
4. Leave **"Use checkbox challenge"** unselected (we want the invisible, score-based check).
5. Create, and keep the page open — you need the **key ID** in Part B.

**Part B — register the app in App Check.**
1. Firebase console → **Security > App Check** → tab **Apps** → `MuonHub web` → provider
   **reCAPTCHA Enterprise** → paste the key ID → **Save**.
2. Token time-to-live: set it to **1 day** or more **(verify the field name)**. Allowed values range
   from 30 minutes to 7 days; longer tokens use fewer of the free reCAPTCHA assessments (10,000 per
   month).
3. Tab **APIs**: leave **Realtime Database** and **Cloud Firestore** **unenforced** (monitoring
   only).

**How to verify:** `MuonHub web` shows reCAPTCHA Enterprise as registered; the APIs tab shows
metrics (empty until the website sends tokens in M2).

**Do not:**
- click **Enforce** now. Once enforcement is on, only apps that send valid tokens get through — that
  would block the agent and the website until they are built to send tokens. Enforcement is switched
  on later, deliberately, after the metrics show only verified traffic.

**Note:** on the free plan reCAPTCHA offers 4 score levels instead of 11. That is enough for MuonHub.

---

## 5. Cloud Messaging — browser notifications

**What it is:** Firebase's push-notification service.
**Why MuonHub needs it:** messages such as "your detector has been silent for 15 minutes", even when
the site is closed.

1. **Project settings** (gear icon) → **General** → tab **Cloud Messaging**.
2. Section **Web configuration** → **Web Push certificates** → **Generate key pair**.
3. The console shows a **public key** string and the date. That public key goes into the web app
   later; it is not a secret.

**How to verify:** a key pair is listed under Web Push certificates.

**Do not:** delete or regenerate the key pair later without telling the Adjutant — it would break
every existing notification subscription.

---

## 6. Remote Config — nothing to create yet

**What it is:** settings that can change the website's behaviour without a redeploy (feature flags,
an emergency switch for the public live page).
**What to do now:** open **Remote Config** once, only to see where it lives. **Do not publish any
parameters** — they are created in the milestone that needs them.

---

## 7. Google Analytics — optional, later

**What it is:** visit statistics (how many people see the landing page, from where).
**Recommendation:** **postpone** until the public site is built in M2. Analytics needs a privacy
notice (and possibly a consent banner), which is part of that milestone's plan. It can be enabled at
any time from **Project settings > Integrations > Google Analytics**; it then adds a `measurementId`
to the web configuration.

---

## Final checklist

- [ ] Authentication: Email/Password and Google enabled; email-link sign-in off; authorized domains
      checked.
- [ ] Firestore: Standard edition, `(default)`, location **`nam5`**, production mode.
- [ ] Web app `MuonHub web` registered (Hosting option unchecked).
- [ ] App Check: reCAPTCHA key (web, score-based, production domains only) registered for
      `MuonHub web`; token TTL raised; **nothing enforced**.
- [ ] Cloud Messaging: Web Push key pair generated.
- [ ] Remote Config: visited, nothing published.
- [ ] Analytics: postponed (or enabled, if you decided otherwise — tell the Adjutant).
- [ ] No screen asked for billing (if one did, you stopped there).

**When done:** tell the Adjutant in the chat. With your authorisation, the Adjutant verifies every
item read-only through the Firebase APIs and records the result in
[`ENVIRONMENTS.md`](ENVIRONMENTS.md).
