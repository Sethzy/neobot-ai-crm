/**
 * One-time build script: fetches URA Master Plan 2019 Planning Area GeoJSON,
 * simplifies polygons, projects to Mercator SVG paths, and writes
 * src/components/property/charts/sg-planning-area-paths.ts.
 *
 * Usage: npx tsx scripts/generate-sg-map.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import simplify from "@turf/simplify";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

const DATASET_URL =
  "https://api-open.data.gov.sg/v1/public/api/datasets/d_4765db0e87b9c86336792efe8a1f7a66/poll-download";

const OUTPUT_PATH = resolve(
  import.meta.dirname,
  "../src/components/property/charts/sg-planning-area-paths.ts"
);

/** SVG canvas dimensions (with padding). */
const WIDTH = 800;
const HEIGHT = 600;
const PADDING = 20;

/** Simplification tolerance (~100m accuracy). */
const SIMPLIFY_TOLERANCE = 0.001;

async function fetchGeoJSON(): Promise<FeatureCollection> {
  console.log("Fetching download URL from data.gov.sg...");
  const pollRes = await fetch(DATASET_URL);
  const pollData = (await pollRes.json()) as { data: { url: string } };
  const downloadUrl = pollData.data.url;

  console.log(`Downloading GeoJSON from: ${downloadUrl}`);
  const geoRes = await fetch(downloadUrl);

  if (!geoRes.ok) {
    throw new Error(`Failed to fetch GeoJSON: ${geoRes.status} ${geoRes.statusText}`);
  }

  return geoRes.json() as Promise<FeatureCollection>;
}

/** Simple Mercator projection: lon/lat → x/y pixels. */
function mercatorProject(lon: number, lat: number): [number, number] {
  const x = ((lon + 180) / 360) * WIDTH * 100;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * HEIGHT * 100;
  return [x, y];
}

/** Get bounding box of all features in pixel space. */
function getBounds(features: Feature<Polygon | MultiPolygon>[]): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    const rings = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates[0]]
      : f.geometry.coordinates.map((p) => p[0]);
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        const [x, y] = mercatorProject(lon, lat);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Convert a ring of coordinates to an SVG path `d` string portion. */
function ringToPath(
  ring: Position[],
  bounds: { minX: number; minY: number; scaleX: number; scaleY: number; scale: number; offsetX: number; offsetY: number }
): string {
  const points = ring.map(([lon, lat]) => {
    const [px, py] = mercatorProject(lon, lat);
    const x = ((px - bounds.minX) * bounds.scale + bounds.offsetX).toFixed(1);
    const y = ((py - bounds.minY) * bounds.scale + bounds.offsetY).toFixed(1);
    return `${x},${y}`;
  });
  return `M${points.join("L")}Z`;
}

function run(geojson: FeatureCollection) {
  console.log(`Processing ${geojson.features.length} features...`);

  // Step 1: Simplify each feature
  const simplified = geojson.features.map((feature) =>
    simplify(feature as Feature<Polygon | MultiPolygon>, {
      tolerance: SIMPLIFY_TOLERANCE,
      highQuality: true,
    })
  );

  // Step 2: Compute bounds and scale to fit viewport
  const { minX, minY, maxX, maxY } = getBounds(simplified);
  const dataWidth = maxX - minX;
  const dataHeight = maxY - minY;
  const usableW = WIDTH - 2 * PADDING;
  const usableH = HEIGHT - 2 * PADDING;
  const scale = Math.min(usableW / dataWidth, usableH / dataHeight);
  const offsetX = PADDING + (usableW - dataWidth * scale) / 2;
  const offsetY = PADDING + (usableH - dataHeight * scale) / 2;
  const projBounds = { minX, minY, scaleX: 0, scaleY: 0, scale, offsetX, offsetY };

  // Step 3: Generate paths
  const entries: Array<{
    code: string;
    name: string;
    region: string;
    d: string;
  }> = [];

  for (const feature of simplified) {
    const props = feature.properties as Record<string, string>;
    const name = (props.PLN_AREA_N ?? "UNKNOWN").toUpperCase();
    const code = (props.PLN_AREA_C ?? "").toUpperCase();
    const region = (props.REGION_N ?? "").toUpperCase();

    let d: string;
    if (feature.geometry.type === "Polygon") {
      d = feature.geometry.coordinates
        .map((ring) => ringToPath(ring, projBounds))
        .join("");
    } else {
      // MultiPolygon
      d = feature.geometry.coordinates
        .flatMap((polygon) => polygon.map((ring) => ringToPath(ring, projBounds)))
        .join("");
    }

    if (!d) {
      console.warn(`  Skipping ${name}: no path generated`);
      continue;
    }

    entries.push({ code, name, region, d });
    console.log(`  ${name} (${code}) — ${region}`);
  }

  // Sort by name for deterministic output
  entries.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\nGenerated ${entries.length} planning area paths.`);

  // Step 4: Write TypeScript file
  const lines = entries.map(
    (e) =>
      `  { code: ${JSON.stringify(e.code)}, name: ${JSON.stringify(e.name)}, region: ${JSON.stringify(e.region)}, d: ${JSON.stringify(e.d)} },`
  );

  const output = `/** Auto-generated by scripts/generate-sg-map.ts — DO NOT EDIT. */

export type PlanningAreaPath = {
  code: string;
  name: string;
  region: string;
  d: string;
};

/** SVG viewBox for the planning area paths. */
export const PLANNING_AREA_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";

export const PLANNING_AREA_PATHS: PlanningAreaPath[] = [
${lines.join("\n")}
];
`;

  writeFileSync(OUTPUT_PATH, output, "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

// Main
const geojson = await fetchGeoJSON();
run(geojson);
