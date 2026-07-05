import { test } from "node:test";
import assert from "node:assert/strict";
import { githubNetwork } from "../lib/relations.ts";

test("githubNetwork degrades gracefully offline (no throw, empty result)", async () => {
  // sandbox blocks the network → every fetch fails → we must get a clean empty shape
  const r = await githubNetwork("someuser", "github", new Date(0).toISOString());
  assert.ok(Array.isArray(r.nodes));
  assert.ok(Array.isArray(r.relations));
  assert.ok(Array.isArray(r.activityTimestamps));
  assert.ok(Array.isArray(r.repos));
});
