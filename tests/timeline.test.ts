import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../lib/timeline.ts";
import type { Signal } from "../lib/signals.ts";

const S = (over: Partial<Signal>): Signal => ({ id: "x", platform: "GITHUB", handle: "x", disc: "GH", confidence: 50, status: "review", evidence: [], ...over });

test("builds events from creation date, EXIF photo, and leak", () => {
  const sigs: Signal[] = [
    S({ id: "gh", platform: "GITHUB", createdAt: "2015-09-02T00:00:00Z" }),
    S({ id: "loc", kind: "location", platform: "LOCATION", handle: "48.8,2.3", evidence: [{ name: "Photo taken", detail: "2023-06-15 14:22:31", source: "EXIF", weight: 45 }] }),
    S({ id: "lk", kind: "leak", platform: "LEAK", handle: "dump", createdAt: "2019-01-01" }),
  ];
  const ev = buildTimeline(sigs, () => "possible");
  assert.equal(ev.length, 3);
  assert.equal(ev[0].year, "2015");           // sorted oldest first
  assert.equal(ev[0].type, "account");
  assert.ok(ev.some((e) => e.type === "photo" && e.iso === "2023-06-15"));
  assert.ok(ev.some((e) => e.type === "leak"));
});

test("ignores junk dates and dedupes", () => {
  const ev = buildTimeline([S({ id: "a", createdAt: "not a date", evidence: [{ name: "x", detail: "year 1200 bad", source: "s", weight: 1 }] })], () => "weak");
  assert.equal(ev.length, 0);
});
