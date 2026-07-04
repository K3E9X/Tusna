// Dossier — the intelligence layer. Aggregates the correlated graph into a single
// "who is this person" summary: likely name, emails, phones, locations, aliases,
// accounts, leaks + an identification confidence. Pure & deterministic — it only
// consolidates verified nodes, it does not invent anything.

import type { Signal } from "./signals";

export interface DossierAccount {
  platform: string;
  handle: string;
  confidence: number;
  status: string;
  url?: string;
}

export interface Dossier {
  name?: string;
  nameAlts: string[];
  emails: string[];
  phones: string[];
  locations: string[];
  aliases: string[];
  accounts: DossierAccount[];
  leaks: { platform: string; handle: string }[];
  confirmedCount: number;
  identificationScore: number;
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

export function buildDossier(signals: Signal[]): Dossier {
  const accountsSig = signals.filter((s) => !s.kind || s.kind === "platform");
  const emails = uniq(signals.filter((s) => s.kind === "email").map((s) => s.handle));
  const phones = uniq(signals.filter((s) => s.kind === "phone").map((s) => s.handle));
  const locations = uniq(signals.filter((s) => s.kind === "location").map((s) => s.handle));
  const aliases = uniq(signals.filter((s) => s.kind === "alias").map((s) => s.handle));
  const leaks = signals.filter((s) => s.kind === "leak").map((s) => ({ platform: s.platform, handle: s.handle }));

  // likely real name: from display names, weighted by status + confidence, favoring "First Last"
  const nameScore = new Map<string, number>();
  for (const s of accountsSig) {
    const n = (s.displayName || "").trim();
    if (n && /\s/.test(n) && n.length <= 60) {
      const w = (s.status === "confirmed" ? 3 : s.status === "review" ? 2 : 1) + s.confidence / 100;
      nameScore.set(n, (nameScore.get(n) || 0) + w);
    }
  }
  const namesRanked = [...nameScore.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

  const rank = (st: string) => (st === "confirmed" ? 0 : st === "review" ? 1 : st === "candidate" ? 2 : 3);
  const accounts = accountsSig
    .filter((s) => s.status !== "rejected")
    .sort((a, b) => rank(a.status) - rank(b.status) || b.confidence - a.confidence)
    .map((s) => ({ platform: s.platform, handle: s.handle, confidence: s.confidence, status: s.status, url: s.url }));

  const confirmedCount = accountsSig.filter((s) => s.status === "confirmed").length;

  // identification score: corroboration across attribute types + account strength
  let score = 0;
  if (namesRanked.length) score += 25;
  if (emails.length) score += 20;
  if (phones.length) score += 15;
  if (locations.length) score += 15;
  score += Math.min(25, confirmedCount * 8 + accounts.length * 2);
  score = Math.min(99, score);

  return {
    name: namesRanked[0],
    nameAlts: namesRanked.slice(1, 3),
    emails, phones, locations, aliases, accounts, leaks,
    confirmedCount,
    identificationScore: score,
  };
}
