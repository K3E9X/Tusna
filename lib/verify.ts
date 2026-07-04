// Grounding verification for the LLM brief — deterministic, no second LLM.
// Two checks straight from docs/llm-correlation.md:
//  1. Citation validity: every [source] cited must correspond to a real source
//     present in the collected evidence.
//  2. Fact grounding: any email / @alias / phone the brief states must appear in
//     the evidence. A specific fact not in the evidence = a hallucination → flagged.

import { extractFromText, normId } from "./extract";
import type { Signal } from "./signals";

export interface Verification {
  citations: { label: string; valid: boolean }[];
  unsupportedFacts: string[];
  validCitations: number;
  totalCitations: number;
  verdict: "grounded" | "warnings";
}

function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

export function verifyNarrative(narrative: string, signals: Signal[]): Verification {
  // --- source corpus (platforms + evidence sources), normalized ---
  const srcNorm = normId(
    signals.map((s) => s.platform + " " + s.evidence.map((e) => e.source).join(" ")).join(" "),
  );

  const cited = uniq([...narrative.matchAll(/\[([^\]]{2,40})\]/g)].map((m) => m[1].trim()));
  const citations = cited.map((label) => {
    const n = normId(label);
    return { label, valid: n.length >= 3 && srcNorm.includes(n) };
  });

  // --- fact corpus (handles, names, evidence text) ---
  const factLower = signals
    .map((s) => [s.handle, s.displayName, ...s.evidence.flatMap((e) => [e.detail, e.source])].filter(Boolean).join(" "))
    .join("  ")
    .toLowerCase();
  const factNorm = factLower.replace(/[^a-z0-9]/g, "");
  const factDigits = factLower.replace(/\D/g, "");

  const ex = extractFromText(narrative);
  const unsupported: string[] = [];

  for (const em of ex.emails) {
    if (!factLower.includes(em.toLowerCase())) unsupported.push(em);
  }
  for (const al of ex.aliases) {
    const n = normId(al);
    if (n.length >= 4 && !factNorm.includes(n)) unsupported.push("@" + al);
  }
  const phoneRuns = (narrative.match(/\d[\d\s().-]{6,}\d/g) || []).map((x) => x.replace(/\D/g, "")).filter((d) => d.length >= 7);
  for (const d of uniq(phoneRuns)) {
    const tail = d.slice(-8);
    if (!factDigits.includes(tail)) unsupported.push("+" + d);
  }

  const totalCitations = citations.length;
  const validCitations = citations.filter((c) => c.valid).length;
  const unsupportedFacts = uniq(unsupported);
  const verdict: Verification["verdict"] =
    unsupportedFacts.length === 0 && validCitations === totalCitations ? "grounded" : "warnings";

  return { citations, unsupportedFacts, validCitations, totalCitations, verdict };
}
