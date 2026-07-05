import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDecisions } from "../lib/decisions.ts";
import type { Signal } from "../lib/signals.ts";

const mk = (id: string, status: any): Signal => ({ id, platform: "X", handle: id, disc: "X", confidence: 50, status, evidence: [] });

test("applyDecisions overrides status from prior judgments", () => {
  const sigs = [mk("a", "candidate"), mk("b", "review"), mk("c", "review")];
  const n = applyDecisions(sigs, { a: "confirmed", b: "rejected" });
  assert.equal(n, 2);
  assert.equal(sigs[0].status, "confirmed");
  assert.equal(sigs[1].status, "rejected");
  assert.equal(sigs[2].status, "review"); // untouched
});

test("applyDecisions counts only real changes", () => {
  const sigs = [mk("a", "confirmed")];
  assert.equal(applyDecisions(sigs, { a: "confirmed" }), 0);
});
