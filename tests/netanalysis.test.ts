import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeNetwork, jaccard, type ConnSet } from "../lib/netanalysis.ts";
import type { Signal } from "../lib/signals.ts";

const sig = (id: string, platform: string): Signal => ({ id, platform, handle: id, disc: "XX", confidence: 50, status: "review", evidence: [] });

test("jaccard basic", () => {
  assert.equal(jaccard(new Set(["a","b","c","d"]), new Set(["c","d","e","f"])), 2 / 6);
  assert.equal(jaccard(new Set(), new Set(["a"])), 0);
});

test("flags a connection shared across two seed accounts", () => {
  const sets: ConnSet[] = [
    { sig: sig("github", "GITHUB"), handles: new Set(["alice", "bob"]) },
    { sig: sig("mastodon", "MASTODON"), handles: new Set(["alice", "carol"]) },
  ];
  const f = analyzeNetwork(sets);
  const shared = f.find((x) => x.kind === "shared-connection");
  assert.ok(shared, "should flag a shared connection");
  assert.equal((shared as any).handle, "alice");
  assert.equal((shared as any).sigs.length, 2);
});

test("flags audience overlap above threshold", () => {
  const sets: ConnSet[] = [
    { sig: sig("github", "GITHUB"), handles: new Set(["a","b","c","d"]) },
    { sig: sig("bluesky", "BLUESKY"), handles: new Set(["a","b","c","e"]) },
  ];
  const f = analyzeNetwork(sets, 0.2);
  assert.ok(f.some((x) => x.kind === "audience-overlap"));
});
