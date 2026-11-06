// MapLibre GL 6 runs its tile parsing in a module worker that bundlers do not emit; the build copies
// it next to the static files and NetworkMap points MapLibre at it (setWorkerUrl).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const target = join(here, "..", "public", "maplibre");
mkdirSync(target, { recursive: true });
copyFileSync(join(dist, "maplibre-gl-worker.mjs"), join(target, "maplibre-gl-worker.mjs"));
