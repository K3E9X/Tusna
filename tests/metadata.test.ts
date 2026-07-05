import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { metaFromBuffer, metaEvidence } from "../lib/metadata.ts";

test("extracts GPS/camera/date from a crafted JPEG", async () => {
  const path = "scratchpad/exif.jpg";
  if (!fs.existsSync(path)) { console.log("(skipped: fixture missing)"); return; }
  const buf = new Uint8Array(fs.readFileSync(path));
  const m = await metaFromBuffer(buf);
  assert.ok(m, "should extract");
  assert.ok(m!.gps && Math.abs(m!.gps.lat - 48.8566) < 0.001, "Paris lat");
  assert.equal(m!.make, "Canon");
  const ev = metaEvidence(m!);
  assert.ok(ev.some((e) => e.name === "GPS in image" && e.weight >= 80));
});
