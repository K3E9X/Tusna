import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "../lib/monitor.ts";
import type { Signal } from "../lib/signals.ts";

const mk = (id: string, extra: Partial<Signal> = {}): Signal => ({
  id, platform: "GITHUB", handle: id, disc: "GH", confidence: 50, status: "candidate", evidence: [], ...extra,
});

test("detects added, removed, tier-changed, new-leak", () => {
  const prev = [mk("a", { tier: "possible" }), mk("gone")];
  const curr = [
    mk("a", { tier: "verified" }),               // strengthened
    mk("b"),                                      // added
    mk("leak1", { kind: "leak", platform: "LEAK" }), // new leak
  ];
  const d = diffSnapshots(prev, curr);
  assert.ok(d.hasChanges);
  assert.equal(d.removed.length, 1);
  assert.ok(d.added.some((c) => c.id === "b" && c.kind === "added"));
  assert.ok(d.added.some((c) => c.id === "leak1" && c.kind === "new-leak"));
  assert.ok(d.changed.some((c) => c.id === "a" && c.kind === "tier-changed"));
});

test("no change => hasChanges false", () => {
  const s = [mk("a", { tier: "possible" })];
  assert.equal(diffSnapshots(s, s).hasChanges, false);
});
