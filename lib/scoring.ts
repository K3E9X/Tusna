// Honest scoring — replaces magic-number confidence with an evidence-class model.
// Every piece of evidence is classified hard / soft / weak, and the node gets a
// QUALITATIVE tier that an analyst can actually trust, plus a corroboration count
// (how many independent supporting signals). The numeric confidence is derived
// transparently from the classes — it is secondary to the tier.

export type EvidenceClass = "hard" | "soft" | "weak";
export type Tier = "verified" | "probable" | "possible" | "weak";

// hard = cryptographic / cross-verified / same-image ; weak = mere existence,
// inference, or derivation ; everything else = soft (observed but not proof).
const HARD_RE = /matching avatar|declared|pgp|fingerprint|cross-link|commit email|breach|leak/i;
const WEAK_RE = /presence detected|derived|near-match|account age|timezone|writing style|generated|candidate|partial|speculative|not a valid|name query|owner lookup|sensitive source|initials|age consistency/i;

export function classify(name: string): EvidenceClass {
  if (HARD_RE.test(name)) return "hard";
  if (WEAK_RE.test(name)) return "weak";
  return "soft";
}

export interface Scored {
  tier: Tier;
  confidence: number;
  corroboration: number; // independent supporting signals (hard + soft)
}

export function scoreEvidence(evidence: { name: string }[]): Scored {
  let hard = 0, soft = 0, weak = 0;
  for (const e of evidence) {
    const c = classify(e.name);
    if (c === "hard") hard++;
    else if (c === "soft") soft++;
    else weak++;
  }
  const tier: Tier = hard >= 1 ? "verified" : soft >= 2 ? "probable" : soft === 1 ? "possible" : "weak";
  const corroboration = hard + soft;
  let confidence = 18 + Math.min(2, hard) * 34 + Math.min(3, soft) * 12 + Math.min(3, weak) * 4;
  confidence = Math.max(12, Math.min(97, Math.round(confidence)));
  return { tier, confidence, corroboration };
}

export const TIER_LABEL: Record<Tier, string> = {
  verified: "VERIFIED",
  probable: "PROBABLE",
  possible: "POSSIBLE",
  weak: "WEAK",
};
