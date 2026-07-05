import { test } from "node:test";
import assert from "node:assert/strict";
import { recordedFutureLookup, recordedFutureEnabled } from "../lib/recordedfuture.ts";

test("recorded future is OFF by default (no key) and returns nothing", async () => {
  assert.equal(recordedFutureEnabled, false);
  assert.deepEqual(await recordedFutureLookup("john@example.com", true), []);
  assert.deepEqual(await recordedFutureLookup("example.com", false), []);
});
