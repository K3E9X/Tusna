// Decision feedback loop — an investigation should get SMARTER as the analyst works.
// Every CONFIRM / REJECT is persisted per seed and re-applied on the next scan, so a
// node you already rejected stays rejected, and a node you confirmed stays confirmed —
// your judgment compounds instead of evaporating each run. Server-backed when a DB is
// configured (durable, multi-device), else localStorage. Mirrors lib/cases.ts.

import type { Signal, Status } from "./signals";

// "removed" is a decision too — the analyst deleted the node; like "rejected" it means
// "don't propose this again". Both are SUPPRESSED on the next scan.
export type StoredStatus = Status | "removed";
export type DecisionMap = Record<string, StoredStatus>; // nodeId → decision

const KEY = "tusna:decisions:v1";
const seedKey = (seed: string) => seed.trim().toLowerCase();

function readLocalAll(): Record<string, DecisionMap> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function writeLocalAll(all: Record<string, DecisionMap>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* quota */ }
}

/** Load the analyst's stored decisions for a seed (server if configured, else local). */
export async function loadDecisions(seed: string): Promise<DecisionMap> {
  const sk = seedKey(seed);
  try {
    const res = await fetch(`/api/decisions?seed=${encodeURIComponent(sk)}`, { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.configured) return data.decisions || {};
  } catch { /* fall back */ }
  return readLocalAll()[sk] || {};
}

/** Persist one decision. Best-effort server, always mirrored locally. */
export async function saveDecision(seed: string, nodeId: string, status: StoredStatus): Promise<void> {
  const sk = seedKey(seed);
  const all = readLocalAll();
  all[sk] = { ...(all[sk] || {}), [nodeId]: status };
  writeLocalAll(all);
  try {
    await fetch("/api/decisions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed: sk, nodeId, status }),
    });
  } catch { /* local copy already saved */ }
}

/** Re-apply stored decisions to a fresh scan's signals (mutates status in place).
 *  Returns how many nodes were overridden by a prior decision. */
export function applyDecisions(signals: Signal[], decisions: DecisionMap): number {
  let n = 0;
  for (const s of signals) {
    const prior = decisions[s.id];
    if (prior && prior !== "removed" && prior !== s.status) { s.status = prior as Status; n++; }
  }
  return n;
}

/** Set of node ids the analyst has suppressed (rejected or removed). */
export function suppressedIds(decisions: DecisionMap): Set<string> {
  const set = new Set<string>();
  for (const [id, d] of Object.entries(decisions)) if (d === "rejected" || d === "removed") set.add(id);
  return set;
}

/**
 * Apply decisions to a fresh scan AND drop anything the analyst suppressed, so
 * rejected/removed nodes are never proposed again. Returns the kept signals plus a
 * count of how many were suppressed.
 */
export function applyDecisionsFiltered(signals: Signal[], decisions: DecisionMap): { signals: Signal[]; suppressed: number } {
  const kept: Signal[] = [];
  let suppressed = 0;
  for (const s of signals) {
    const d = decisions[s.id];
    if (d === "rejected" || d === "removed") { suppressed++; continue; }
    if (d && d !== s.status) s.status = d as Status;
    kept.push(s);
  }
  return { signals: kept, suppressed };
}
