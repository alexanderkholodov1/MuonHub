- `apps/v5-mirror` and `infra/demo`: a demo of the v6 web app on the Firebase emulators, fed every
  minute by a read-only mirror of the running v5 detector (public profile, write-once copies; nothing
  is written to v5 or to any Firebase project), run as restartable user services.
