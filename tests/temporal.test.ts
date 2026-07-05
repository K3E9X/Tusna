import { test } from "node:test";
import assert from "node:assert/strict";
import { inferTimezone, hourHistogramUTC } from "../lib/temporal.ts";

// Build activity centered on UTC+1 local daytime: person active ~09:00-22:00 local,
// i.e. 08:00-21:00 UTC. Quiet at night.
function synth(offset: number, n = 60): string[] {
  const out: string[] = [];
  const active = [9,10,11,13,14,15,16,18,19,20,21]; // local hours
  for (let i = 0; i < n; i++) {
    const localH = active[i % active.length];
    const utcH = (((localH - offset) % 24) + 24) % 24;
    const d = new Date(Date.UTC(2024, 0, 1 + (i % 20), utcH, (i * 7) % 60));
    out.push(d.toISOString());
  }
  return out;
}

test("inferTimezone recovers a UTC+1 signal", () => {
  const r = inferTimezone(synth(1));
  assert.ok(r, "should infer");
  assert.ok(Math.abs(r!.offset - 1) <= 1, `offset ~1, got ${r!.offset}`);
  assert.ok(r!.confidence > 0.3, `confidence should be meaningful, got ${r!.confidence}`);
});

test("inferTimezone recovers a UTC-5 signal", () => {
  const r = inferTimezone(synth(-5));
  assert.ok(r);
  assert.ok(Math.abs(r!.offset - (-5)) <= 1, `offset ~-5, got ${r!.offset}`);
});

test("inferTimezone refuses too-thin samples (honest)", () => {
  assert.equal(inferTimezone(["2024-01-01T10:00:00Z", "2024-01-01T11:00:00Z"]), null);
});

test("hourHistogramUTC sums correctly", () => {
  const h = hourHistogramUTC(["2024-01-01T10:00:00Z", "2024-01-01T10:30:00Z", "2024-01-01T22:00:00Z"]);
  assert.equal(h[10], 2);
  assert.equal(h[22], 1);
});
