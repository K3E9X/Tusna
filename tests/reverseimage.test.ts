import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseImageLinks } from "../lib/reverseimage.ts";

test("builds engine deep links for a valid image url", () => {
  const links = reverseImageLinks("https://example.com/a.jpg");
  assert.ok(links.length >= 5);
  const yandex = links.find((l) => l.id === "yandex")!;
  assert.ok(yandex.url.includes(encodeURIComponent("https://example.com/a.jpg")));
});

test("rejects non-http input", () => {
  assert.equal(reverseImageLinks("javascript:alert(1)").length, 0);
  assert.equal(reverseImageLinks("").length, 0);
});
