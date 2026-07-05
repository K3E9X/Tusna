// Mutual-connection analysis — the network is collected, now MINE it. Two signals a
// single-account view can't see:
//
//  1. Shared connections: a person who is connected to SEVERAL of the seed's accounts
//     (follows them on both GitHub and Mastodon, say) is almost certainly a real
//     contact — and their presence corroborates that those accounts are one identity.
//
//  2. Audience overlap (Jaccard): if two of the seed's accounts share a large slice of
//     their followers/following, that overlap is a strong same-person linkage signal —
//     a classic deanonymisation technique. Purely structural, no content, no guessing.

import type { Signal } from "./signals";

export interface ConnSet {
  sig: Signal;
  handles: Set<string>;
}

export type NetworkFinding =
  | { kind: "shared-connection"; handle: string; detail: string; sigs: Signal[] }
  | { kind: "audience-overlap"; detail: string; sigs: Signal[] };

/** Jaccard similarity of two sets: |A∩B| / |A∪B|. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Analyse the seed's per-account connection sets.
 * `overlapThreshold` is the Jaccard ratio above which two accounts are flagged as
 * sharing an audience (default 0.15 — conservative, since these lists are truncated).
 */
export function analyzeNetwork(sets: ConnSet[], overlapThreshold = 0.15): NetworkFinding[] {
  const findings: NetworkFinding[] = [];
  if (sets.length === 0) return findings;

  // 1) shared connections: a handle appearing in ≥2 of the seed's accounts' sets
  const owner = new Map<string, Signal[]>();
  for (const s of sets) {
    for (const h of s.handles) {
      const arr = owner.get(h) || [];
      if (!arr.includes(s.sig)) arr.push(s.sig);
      owner.set(h, arr);
    }
  }
  for (const [handle, sigs] of owner) {
    if (sigs.length >= 2) {
      const plats = sigs.map((s) => s.platform).join(" + ");
      findings.push({
        kind: "shared-connection",
        handle,
        detail: `@${handle} is connected to the seed on ${sigs.length} platforms (${plats}) — a real contact, and evidence those accounts are the same person.`,
        sigs,
      });
    }
  }

  // 2) audience overlap between each pair of the seed's accounts
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const jac = jaccard(sets[i].handles, sets[j].handles);
      if (jac >= overlapThreshold) {
        findings.push({
          kind: "audience-overlap",
          detail: `${sets[i].sig.platform} and ${sets[j].sig.platform} share ${(jac * 100).toFixed(0)}% of their audience — strong signal they belong to one person.`,
          sigs: [sets[i].sig, sets[j].sig],
        });
      }
    }
  }

  return findings;
}
