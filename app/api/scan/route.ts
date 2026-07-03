import { NextRequest, NextResponse } from "next/server";
import { scanUsername, type RawProfile } from "@/lib/connectors";
import type { Signal, Evidence, Status } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s?: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Turn verifiable public profiles into scored Signals.
 * Confidence reflects "how strongly this account ties to the seed" — computed
 * only from observed facts. No account is auto-confirmed; a human decides.
 */
function correlate(seed: string, profiles: RawProfile[]): Signal[] {
  const seedN = norm(seed);
  return profiles.map((p) => {
    const evidence: Evidence[] = [];
    const handleN = norm(p.handle.replace(/^u\//, ""));

    // exact / near username match against the seed
    const exact = handleN === seedN;
    evidence.push({
      name: exact ? "Username exact" : "Username proche",
      detail: `${p.handle} ${exact ? "≡" : "≈"} graine « ${seed} », compte public existant.`,
      source: p.source,
      weight: exact ? 74 : 58,
    });

    if (p.displayName) evidence.push({ name: "Nom public", detail: p.displayName, source: p.source, weight: 55 });
    if (p.bio) evidence.push({ name: "Bio publique", detail: p.bio.slice(0, 140), source: p.source, weight: 44 });
    if (p.avatar) evidence.push({ name: "Avatar présent", detail: "Image de profil publique (pHash à venir).", source: p.source, weight: 48 });
    if (p.createdAt) evidence.push({ name: "Ancienneté", detail: `Compte créé le ${p.createdAt.slice(0, 10)}.`, source: p.source, weight: 30 });

    // cross-signal: display name shared with another platform
    const other = profiles.find((q) => q.id !== p.id && q.displayName && p.displayName && norm(q.displayName) === norm(p.displayName));
    let crossBoost = 0;
    if (other) {
      crossBoost += 14;
      evidence.push({ name: "Nom concordant", detail: `Nom public identique à ${other.platform}.`, source: "corrélation inter-sources", weight: 82 });
    }

    // strong cross-signal: self-declared / verified linked accounts (Keybase, Gravatar)
    if (p.links?.length) {
      crossBoost += 18;
      for (const l of p.links.slice(0, 4)) {
        evidence.push({ name: "Compte lié déclaré", detail: l.label + (l.url ? ` → ${l.url}` : ""), source: `${p.source} · lien déclaré`, weight: 85 });
      }
    }

    let confidence = (exact ? 62 : 46) + crossBoost;
    if (p.displayName) confidence += 6;
    if (p.bio) confidence += 5;
    if (p.avatar) confidence += 5;
    confidence = clamp(Math.round(confidence), 30, 94);

    const status: Status = confidence >= 78 ? "review" : "candidate";

    return {
      id: p.id,
      platform: p.platform,
      handle: p.handle,
      disc: p.disc,
      confidence,
      status,
      evidence,
    };
  });
}

export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get("username") || "").trim();
  if (!username || username.length > 64 || /[^\w.\-@]/.test(username)) {
    return NextResponse.json({ error: "username invalide" }, { status: 400 });
  }
  try {
    const profiles = await scanUsername(username);
    const signals = correlate(username, profiles);
    // strongest first
    signals.sort((a, b) => b.confidence - a.confidence);
    return NextResponse.json({ seed: username, count: signals.length, signals });
  } catch (e) {
    return NextResponse.json({ error: "scan échoué", detail: String(e) }, { status: 500 });
  }
}
