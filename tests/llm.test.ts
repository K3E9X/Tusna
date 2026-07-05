import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLLM, LLM_PRESETS } from "../lib/llmconfig.ts";
import { parseAssist } from "../lib/assist.ts";
import { toClientConfig } from "../lib/settings.ts";

test("resolveLLM: disabled without url+model, enabled with override", () => {
  assert.equal(resolveLLM().enabled, false);
  assert.equal(resolveLLM({ url: "https://x/v1", model: "m" }).enabled, true);
});

test("presets include free providers (openrouter, z.ai, qwen)", () => {
  const ids = LLM_PRESETS.map((p) => p.id);
  assert.ok(ids.includes("openrouter"));
  assert.ok(ids.includes("zai"));
  assert.ok(ids.includes("qwen"));
});

test("parseAssist: strict JSON", () => {
  const r = parseAssist(JSON.stringify({ conclusion: "c [X]", pivots: [{ query: "bob", why: "w" }], falsePositives: [{ node: "@x", why: "weak" }], uncertainties: ["u"], confidence: "medium" }));
  assert.equal(r.conclusion, "c [X]");
  assert.equal(r.pivots[0].query, "bob");
  assert.equal(r.falsePositives[0].node, "@x");
  assert.equal(r.confidence, "medium");
});

test("parseAssist: recovers JSON embedded in prose, else raw fallback", () => {
  const r = parseAssist('Here is my answer:\n{"conclusion":"ok","confidence":"low"}\nthanks');
  assert.equal(r.conclusion, "ok");
  const r2 = parseAssist("no json here");
  assert.equal(r2.conclusion, "no json here");
});

test("toClientConfig shapes llm block only when set", () => {
  assert.equal(toClientConfig({}).llm, undefined);
  const c = toClientConfig({ llmUrl: "u", llmModel: "m", intelx: "k" });
  assert.equal(c.llm?.url, "u");
  assert.equal(c.intelx, "k");
});
