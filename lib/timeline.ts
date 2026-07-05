// Timeline sourcing — a footprint has a chronology, and it's more than "account
// created on". This pulls every DATED fact out of the graph: account-creation dates,
// EXIF capture dates (when a photo was actually taken), and breach/leak dates. Each
// becomes a labelled event so the timeline reads like a history, not a list.

import type { Signal } from "./signals";
import type { Tier } from "./scoring";

export interface TimeEvent {
  iso: string;        // YYYY-MM-DD
  year: string;
  type: "account" | "photo" | "leak" | "record";
  label: string;      // what happened
  platform: string;
  handle: string;
  tier: Tier;
  signalId: string;
}

const DATE_RE = /\b(\d{4})[-/.](\d{2})[-/.](\d{2})\b/;

function pickDate(s: string): string | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1995 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Build a chronology from every dated fact in the graph, oldest first. */
export function buildTimeline(signals: Signal[], tierOf: (s: Signal) => Tier): TimeEvent[] {
  const events: TimeEvent[] = [];
  const seen = new Set<string>();
  const push = (iso: string, type: TimeEvent["type"], label: string, s: Signal) => {
    const key = s.id + "|" + iso + "|" + type;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ iso, year: iso.slice(0, 4), type, label, platform: s.platform, handle: s.handle, tier: tierOf(s), signalId: s.id });
  };

  for (const s of signals) {
    // 1) account / footprint creation
    if (s.createdAt) {
      const iso = pickDate(s.createdAt) || (/^\d{4}-\d{2}-\d{2}/.test(s.createdAt) ? s.createdAt.slice(0, 10) : null);
      if (iso) push(iso, s.kind === "leak" ? "leak" : "account", s.kind === "leak" ? "Appears in breach/leak" : `${s.platform} account created`, s);
    }
    // 2) dates hidden in evidence: EXIF capture, leak dates, etc.
    for (const e of s.evidence) {
      const iso = pickDate(e.detail) || pickDate(e.name);
      if (!iso) continue;
      const n = e.name.toLowerCase();
      if (n.includes("photo") || n.includes("exif") || n.includes("taken")) push(iso, "photo", "Photo taken (EXIF)", s);
      else if (n.includes("leak") || n.includes("breach") || s.kind === "leak") push(iso, "leak", "Breach / leak record", s);
      else push(iso, "record", e.name, s);
    }
  }

  return events.sort((a, b) => a.iso.localeCompare(b.iso));
}
