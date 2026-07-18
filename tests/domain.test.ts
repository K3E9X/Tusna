import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeDomain } from "../lib/domain.ts";

test("looksLikeDomain: accepts real domains, rejects usernames/emails", () => {
  assert.equal(looksLikeDomain("johndoe.com"), true);
  assert.equal(looksLikeDomain("acme.co.uk"), true);
  assert.equal(looksLikeDomain("my-site.dev"), true);
  assert.equal(looksLikeDomain("john.doe"), false);   // "doe" not a TLD → username, not domain
  assert.equal(looksLikeDomain("john@x.com"), false);  // email
  assert.equal(looksLikeDomain("lydia saci"), false);  // name (space)
  assert.equal(looksLikeDomain("johndoe"), false);     // bare username
});
