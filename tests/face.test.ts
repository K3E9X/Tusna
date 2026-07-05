import { test } from "node:test";
import assert from "node:assert/strict";
import { faceDistance } from "../lib/face.ts";

test("faceDistance: identical descriptors → 0", () => {
  assert.equal(faceDistance([1, 2, 3], [1, 2, 3]), 0);
});
test("faceDistance: euclidean", () => {
  assert.equal(faceDistance([0, 0], [3, 4]), 5);
});
test("faceDistance: length mismatch → Infinity", () => {
  assert.equal(faceDistance([1, 2], [1]), Infinity);
});
