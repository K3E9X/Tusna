import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManualSignal, correlateManual, type ManualInput } from "../lib/manual.ts";
import type { Signal } from "../lib/signals.ts";

const at = "2024-01-01T00:00:00Z";
const mk = (id: string, platform: string, handle: string, extra: Partial<Signal> = {}): Signal => ({
  id, platform, handle, disc: "XX", confidence: 50, status: "review", evidence: [], ...extra,
});

test("buildManualSignal carries custody + seed match", () => {
  const s = buildManualSignal({ platform: "Instagram", handle: "john.doe", note: "same face" }, at, "john.doe");
  assert.equal(s.kind, "platform");
  assert.ok(s.collectedAt === at);
  assert.ok(s.evidence.some((e) => e.name === "Analyst-captured"));
  assert.ok(s.evidence.some((e) => e.name === "Matches the seed"));
});

test("correlateManual links by shared handle across platforms", () => {
  const existing = [mk("github", "GITHUB", "johndoe"), mk("reddit", "REDDIT", "u/johndoe")];
  const manual = buildManualSignal({ platform: "Instagram", handle: "johndoe" }, at);
  const r = correlateManual(manual, { platform: "Instagram", handle: "johndoe" }, existing);
  assert.ok(r.matched >= 2, `expected >=2 links, got ${r.matched}`);
  assert.ok(r.addEvidence.some((e) => e.name === "Same handle"));
});

test("correlateManual links by matching display name", () => {
  const existing = [mk("gh", "GITHUB", "xyz", { displayName: "Jean Dupont" })];
  const input: ManualInput = { platform: "Facebook", handle: "jd.1990", displayName: "Jean Dupont" };
  const manual = buildManualSignal(input, at);
  const r = correlateManual(manual, input, existing);
  assert.equal(r.matched, 1);
  assert.ok(r.addEvidence.some((e) => e.name === "Matching name"));
});

test("correlateManual extracts email + aliases from pasted bio", () => {
  const input: ManualInput = { platform: "Instagram", handle: "john", bio: "contact me john@proton.me or @john_dev" };
  const manual = buildManualSignal(input, at);
  const r = correlateManual(manual, input, []);
  assert.ok(r.extracted.some((s) => s.kind === "email" && s.handle === "john@proton.me"));
  assert.ok(r.extracted.some((s) => s.kind === "alias" && s.handle === "@john_dev"));
});
