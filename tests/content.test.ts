import { test } from "node:test";
import assert from "node:assert/strict";
import { mineContent } from "../lib/content.ts";

test("mines mentions (excluding self), emails, urls, hashtags", () => {
  const r = mineContent([
    "working with @alice and @bob on this, ping me at me@dev.io #rustlang",
    "big thanks @alice again! see https://example.com/x #rustlang #osint",
  ], "self");
  assert.equal(r.mentions[0].handle, "alice"); // most frequent first
  assert.equal(r.mentions[0].count, 2);
  assert.ok(r.emails.includes("me@dev.io"));
  assert.ok(r.urls.some((u) => u.includes("example.com")));
  assert.equal(r.hashtags[0].tag, "rustlang");
});

test("excludes the self-handle from mentions", () => {
  const r = mineContent(["@self posting @friend"], "self");
  assert.ok(!r.mentions.some((m) => m.handle === "self"));
  assert.ok(r.mentions.some((m) => m.handle === "friend"));
});

test("conservative self-reported place / employer extraction", () => {
  const r = mineContent(["Based in Lyon, France. Currently works at Acme Corp building things."]);
  assert.ok(r.places.some((p) => p.startsWith("Lyon")));
  assert.ok(r.employers.some((e) => e.startsWith("Acme")));
});
