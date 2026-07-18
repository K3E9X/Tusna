// One-time storage migration for the Tusna → Octopus rename. Copies any data saved
// under the old "tusna:*" localStorage keys to the new "octopus:*" keys, so an analyst's
// saved cases, snapshots, decisions and settings survive the rebrand. Idempotent and
// non-destructive (old keys are left in place).

const PAIRS: [string, string][] = [
  ["tusna:cases:v1", "octopus:cases:v1"],
  ["tusna:snapshots:v1", "octopus:snapshots:v1"],
  ["tusna:decisions:v1", "octopus:decisions:v1"],
  ["tusna:settings:v1", "octopus:settings:v1"],
  ["tusna:apps:v1", "octopus:apps:v1"],
];

export function migrateLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    for (const [oldK, newK] of PAIRS) {
      if (window.localStorage.getItem(newK) == null) {
        const v = window.localStorage.getItem(oldK);
        if (v != null) window.localStorage.setItem(newK, v);
      }
    }
  } catch { /* storage disabled */ }
}
