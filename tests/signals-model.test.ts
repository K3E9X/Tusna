import { test } from "node:test";
import assert from "node:assert/strict";
import type { Signal, Relation, GeoPlace } from "../lib/signals.ts";

test("Signal carries the new investigation fields", () => {
  const rel: Relation = { to: "gh-person:x", kind: "follows", label: "seed follows @x", source: "gh" };
  const place: GeoPlace = { lat: 48.85, lon: 2.35, label: "Paris" };
  const s: Signal = {
    id: "github", platform: "GITHUB", handle: "x", disc: "GH", confidence: 50, status: "candidate",
    evidence: [], relations: [rel], place, collectedAt: "2024-01-01T00:00:00Z", avatarUrl: "https://e/x.png", kind: "platform",
  };
  assert.equal(s.relations![0].kind, "follows");
  assert.equal(s.place!.label, "Paris");
  assert.ok(s.collectedAt && s.avatarUrl);
});
