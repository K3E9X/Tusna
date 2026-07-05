import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, scoreEvidence } from "../lib/scoring.ts";

test("classify: hard evidence recognised", () => {
  assert.equal(classify("Matching avatar"), "hard");
  assert.equal(classify("Commit email"), "hard");
});

test("classify: weak evidence recognised", () => {
  assert.equal(classify("Presence detected"), "weak");
});

test("scoreEvidence: two hard signals => verified tier", () => {
  const s = scoreEvidence([{ name: "Matching avatar" }, { name: "Declared account" }]);
  assert.equal(s.tier, "verified");
});

test("scoreEvidence: a single weak signal stays weak", () => {
  const s = scoreEvidence([{ name: "Presence detected" }]);
  assert.ok(["weak", "possible"].includes(s.tier));
});
