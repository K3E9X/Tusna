// Board-lifecycle helpers — small, pure, testable rules that decide when the graph
// should be wiped before applying new results. Extracted from OrbitBoard so the
// "don't mix demo/previous data into a fresh scan" rule has regression coverage.

/**
 * Should the board be cleared BEFORE running a scan for `seed`?
 * Yes when the board still holds the sample/demo data, or when we're now targeting a
 * different seed than the last scan — so nothing stale (the demo "john_doe", or a
 * previous target's nodes) survives into, or gets auto-expanded from, the new results.
 * Re-scanning the SAME seed does NOT wipe, so a transient empty/error keeps prior work.
 */
export function shouldWipeBeforeScan(isDemo: boolean, seed: string, lastSeed: string): boolean {
  if (isDemo) return true;
  return seed.trim().toLowerCase() !== lastSeed.trim().toLowerCase();
}
