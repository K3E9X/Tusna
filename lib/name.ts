// Name connector — a full name is a weak seed on its own (no free API resolves a
// person from a name), so name mode does two useful things: (1) generate candidate
// handles to pivot on, and (2) point to the pre-filled Name pivots (Google dork,
// LinkedIn, people-search). It produces a person node + candidate alias nodes.

import { normId } from "./extract";
import type { Signal } from "./signals";

export function looksLikeName(s: string): boolean {
  const t = s.trim();
  if (!/\s/.test(t)) return false;
  if (/[@\d]/.test(t)) return false;
  if (!/^[\p{L}][\p{L}\s'.-]{2,50}$/u.test(t)) return false;
  const w = t.split(/\s+/).filter(Boolean);
  return w.length >= 2 && w.length <= 4;
}

export function nameCandidates(name: string): string[] {
  const parts = name.trim().toLowerCase().split(/\s+/).map((p) => p.normalize("NFD").replace(/[^a-z-]/g, "")).filter(Boolean);
  if (parts.length < 2) return [];
  const f = parts[0], l = parts[parts.length - 1];
  const fi = f[0], li = l[0];
  const cands = [f + l, f + "." + l, f + "_" + l, fi + l, f + li, l + f, l + "." + f, f + "-" + l, fi + "." + l];
  return [...new Set(cands)].filter((c) => c.length >= 3).slice(0, 8);
}

export function nameSignals(name: string): Signal[] {
  const id = "person:" + normId(name);
  const person: Signal = {
    id,
    platform: "PERSON",
    handle: name,
    disc: "PER",
    kind: "person",
    confidence: 40,
    tier: "weak",
    status: "review",
    evidence: [{
      name: "Name query",
      detail: "Full-name search. Candidate handles are generated below — pivot to verify them. Use the Name pivots (Google, LinkedIn, people-search) for public records.",
      source: "name input",
      weight: 35,
    }],
  };
  const candidates: Signal[] = nameCandidates(name).map((h) => ({
    id: "cand:" + normId(h),
    platform: "CANDIDATE",
    handle: h,
    disc: "?",
    kind: "alias",
    confidence: 28,
    tier: "weak",
    status: "candidate",
    linkedIds: [id],
    evidence: [{
      name: "Candidate handle",
      detail: `Generated from "${name}" — pivot to check if this handle exists.`,
      source: "name permutation",
      weight: 30,
    }],
  }));
  return [person, ...candidates];
}
