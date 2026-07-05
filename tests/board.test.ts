import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldWipeBeforeScan } from "../lib/board.ts";

test("wipes when the demo/sample board is still loaded (the reported bug)", () => {
  // demo present → scanning ANY seed must clear it first, so 'john_doe' never lingers
  assert.equal(shouldWipeBeforeScan(true, "aziz.kadiri13@hotmail.fr", ""), true);
});

test("wipes when targeting a different seed than last scan", () => {
  assert.equal(shouldWipeBeforeScan(false, "bob", "alice"), true);
});

test("does NOT wipe when re-scanning the same seed (keep work on empty/error)", () => {
  assert.equal(shouldWipeBeforeScan(false, "alice", "alice"), false);
  assert.equal(shouldWipeBeforeScan(false, "  Alice ", "alice"), false); // case/space-insensitive
});
