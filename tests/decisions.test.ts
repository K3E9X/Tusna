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

import { applyDecisionsFiltered, suppressedIds } from "../lib/decisions.ts";

test("applyDecisionsFiltered drops rejected AND removed (never proposed again)", () => {
  const sigs = [mk("a", "candidate"), mk("b", "review"), mk("c", "review"), mk("d", "candidate")];
  const { signals, suppressed } = applyDecisionsFiltered(sigs, { a: "rejected", b: "removed", c: "confirmed" });
  assert.equal(suppressed, 2);
  assert.deepEqual(signals.map((s) => s.id), ["c", "d"]); // a,b gone
  assert.equal(signals[0].status, "confirmed"); // c re-applied
});

test("suppressedIds returns rejected + removed", () => {
  const s = suppressedIds({ a: "rejected", b: "removed", c: "confirmed", d: "review" });
  assert.deepEqual([...s].sort(), ["a", "b"]);
});
