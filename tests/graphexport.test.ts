import { test } from "node:test";
import assert from "node:assert/strict";
import { toGraphML } from "../lib/graphexport.ts";
import type { Signal } from "../lib/signals.ts";

test("toGraphML emits nodes + edges, escapes XML", () => {
  const sigs: Signal[] = [
    { id: "a", platform: "GITHUB", handle: "john&doe", disc: "GH", confidence: 80, status: "review", tier: "verified", evidence: [], linkedIds: ["b"] },
    { id: "b", platform: "EMAIL", handle: "j@x.com", disc: "EM", kind: "email", confidence: 60, status: "review", evidence: [], relations: [{ to: "a", kind: "mention", label: "x", source: "s" }] },
  ];
  const g = toGraphML(sigs);
  assert.ok(g.includes("<graphml"));
  assert.ok(g.includes('<node id="a">'));
  assert.ok(g.includes("john&amp;doe"));           // escaped
  assert.ok(g.includes('source="a" target="b"'));  // same-identity edge
  assert.ok(g.includes("mention"));                 // relation edge type
  // edge dedupe: only one same-identity a<->b edge
  assert.equal((g.match(/same-identity/g) || []).length, 1);
});
