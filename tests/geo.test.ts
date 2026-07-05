import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoords, distanceKm, convergeLocations } from "../lib/geo.ts";

test("parseCoords accepts valid, rejects junk", () => {
  assert.deepEqual(parseCoords("48.8566, 2.3522"), { lat: 48.8566, lon: 2.3522 });
  assert.equal(parseCoords("not coords"), null);
  assert.equal(parseCoords("999, 999"), null);
});

test("distanceKm Paris↔London ~343km", () => {
  const d = distanceKm({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
  assert.ok(d > 300 && d < 380, `got ${d}`);
});

test("convergeLocations merges nearby, splits far, ranks by sources", () => {
  const pts = [
    { id: "a", lat: 48.8566, lon: 2.3522, source: "github" },   // Paris
    { id: "b", lat: 48.86, lon: 2.35, source: "exif" },         // ~Paris (diff source)
    { id: "c", lat: 51.5074, lon: -0.1278, source: "reddit" },  // London
  ];
  const cl = convergeLocations(pts, 25);
  assert.equal(cl.length, 2);
  assert.equal(cl[0].sources, 2); // Paris cluster, two distinct sources, ranked first
  assert.equal(cl[0].members.length, 2);
});
