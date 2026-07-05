// Monitoring — an investigation is not a snapshot. Accounts appear and vanish, bios
// change, new breaches surface. Tusna keeps timestamped snapshots of a case; this
// module diffs two of them so an analyst sees exactly WHAT CHANGED since last look —
// the difference between a one-shot recon and an investigation that lives over time.

import type { Signal } from "./signals";

export interface Change {
  kind: "added" | "removed" | "tier-changed" | "renamed" | "new-leak";
  id: string;
  label: string;
  detail: string;
}

export interface MonitorDiff {
  added: Change[];
  removed: Change[];
  changed: Change[];
  /** true if anything at all moved */
  hasChanges: boolean;
  summary: string;
}

const TIER_RANK: Record<string, number> = { verified: 4, probable: 3, possible: 2, weak: 1 };

function label(s: Signal): string {
  return `${s.platform} · ${s.handle}`;
}

/**
 * Diff a previous snapshot against the current one.
 * `prev` / `curr` are the signal arrays of two snapshots of the same case.
 */
export function diffSnapshots(prev: Signal[], curr: Signal[]): MonitorDiff {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const currById = new Map(curr.map((s) => [s.id, s]));

  const added: Change[] = [];
  const removed: Change[] = [];
  const changed: Change[] = [];

  for (const s of curr) {
    const before = prevById.get(s.id);
    if (!before) {
      added.push({
        kind: s.kind === "leak" ? "new-leak" : "added",
        id: s.id,
        label: label(s),
        detail: s.kind === "leak" ? "New breach/leak surfaced." : "New presence appeared since last snapshot.",
      });
      continue;
    }
    // tier movement (up or down) is the signal that matters most
    const a = TIER_RANK[before.tier || ""] || 0;
    const b = TIER_RANK[s.tier || ""] || 0;
    if (a !== b) {
      changed.push({
        kind: "tier-changed",
        id: s.id,
        label: label(s),
        detail: `${before.tier || "unscored"} → ${s.tier || "unscored"} (${b > a ? "strengthened" : "weakened"}).`,
      });
    }
    if ((before.displayName || "") !== (s.displayName || "") && s.displayName) {
      changed.push({ kind: "renamed", id: s.id, label: label(s), detail: `Public name changed to "${s.displayName}".` });
    }
  }

  for (const s of prev) {
    if (!currById.has(s.id)) {
      removed.push({ kind: "removed", id: s.id, label: label(s), detail: "Presence disappeared since last snapshot (deleted / hidden)." });
    }
  }

  const n = added.length + removed.length + changed.length;
  const summary = n === 0
    ? "No change since the last snapshot."
    : `${added.length} new, ${removed.length} gone, ${changed.length} changed since last snapshot.`;

  return { added, removed, changed, hasChanges: n > 0, summary };
}
