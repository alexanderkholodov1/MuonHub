// Generates public/globe/land.json: evenly spaced points on land for the landing's globe, from the
// Natural Earth 1:110m land polygons (public domain, via world-atlas). Run once; the output is committed.
//
//   node scripts/make-land-dots.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topology = require("world-atlas/land-110m.json");
const land = feature(topology, topology.objects.land);

const STEP_DEG = 1.25;
const points = [];
for (let lat = -56; lat <= 82; lat += STEP_DEG) {
  // Keep the spacing on the ground even: fewer longitudes towards the poles.
  const lonStep = STEP_DEG / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  for (let lon = -180; lon < 180; lon += lonStep) {
    if (geoContains(land, [lon, lat]))
      points.push(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10);
  }
}
writeFileSync(new URL("../public/globe/land.json", import.meta.url), JSON.stringify(points));
console.log(`${points.length / 2} land points`);
