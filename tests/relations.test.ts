import { test } from "node:test";
import assert from "node:assert/strict";
import { githubNetwork, blueskyNetwork, mastodonNetwork } from "../lib/relations.ts";

const shape = (r: any) => Array.isArray(r.nodes) && Array.isArray(r.relations)
  && Array.isArray(r.activityTimestamps) && Array.isArray(r.repos);

test("githubNetwork degrades gracefully (no throw, valid shape)", async () => {
  assert.ok(shape(await githubNetwork("someuser", "github", new Date(0).toISOString())));
});
test("blueskyNetwork degrades gracefully", async () => {
  assert.ok(shape(await blueskyNetwork("someone.bsky.social", new Date(0).toISOString())));
});
test("mastodonNetwork degrades gracefully", async () => {
  assert.ok(shape(await mastodonNetwork("@someone", new Date(0).toISOString())));
});
