import { NextRequest, NextResponse } from "next/server";
import { scanUsername, type RawProfile } from "@/lib/connectors";
import { scanWmn } from "@/lib/wmn";
import { dHashFromUrl, avatarMatch } from "@/lib/phash";
import type { Signal, Evidence, Status } from "@/lib/signals";

/** Compute perceptual hashes for profiles that expose an avatar (bounded, graceful). */
async function enrichAvatars(profiles: RawProfile[], max = 14): Promise<void> {
  const targets = profiles.filter((p) => p.avatar).slice(0, max);
  await Promise.all(
    targets.map(async (p) => {
      try { p.avatarHash = (await dHashFromUrl(p.avatar!)) || undefined; } catch { /* skip */ }
    }),
  );
}

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
    if (p.unverified) {
      evidence.push({
        name: "Présence détectée",
        detail: `${p.handle} trouvé sur ${p.platform} par motif d'URL (WhatsMyName) — existence non vérifiée par une API.`,
        source: p.source,
        weight: 45,
      });
    } else {
      evidence.push({
        name: exact ? "Username exact" : "Username proche",
        detail: `${p.handle} ${exact ? "≡" : "≈"} graine « ${seed} », compte public existant.`,
        source: p.source,
        weight: exact ? 74 : 58,
      });
    }

    if (p.displayName) evidence.push({ name: "Nom public", detail: p.displayName, source: p.source, weight: 55 });
    if (p.bio) evidence.push({ name: "Bio publique", detail: p.bio.slice(0, 140), source: p.source, weight: 44 });
    if (p.avatar) evidence.push({ name: "Avatar présent", detail: p.avatarHash ? "Image de profil publique (hachée pour corrélation)." : "Image de profil publique.", source: p.source, weight: 48 });
    if (p.createdAt) evidence.push({ name: "Ancienneté", detail: `Compte créé le ${p.createdAt.slice(0, 10)}.`, source: p.source, weight: 30 });

    // cross-signal: display name shared with another platform
    const other = profiles.find((q) => q.id !== p.id && q.displayName && p.displayName && norm(q.displayName) === norm(p.displayName));
    let crossBoost = 0;
    if (other) {
      crossBoost += 14;
      evidence.push({ name: "Nom concordant", detail: `Nom public identique à ${other.platform}.`, source: "corrélation inter-sources", weight: 82 });
    }

    // strong cross-signal: matching avatar (perceptual hash) with another platform
    if (p.avatarHash) {
      let best: { platform: string; distance: number; strong: boolean } | null = null;
      for (const q of profiles) {
        if (q.id === p.id || !q.avatarHash) continue;
        const m = avatarMatch(p.avatarHash, q.avatarHash);
        if (m.near && (!best || m.distance < best.distance)) best = { platform: q.platform, distance: m.distance, strong: m.match };
      }
      if (best) {
        crossBoost += best.strong ? 20 : 12;
        evidence.push({
          name: best.strong ? "Avatar identique" : "Avatar proche",
          detail: `Photo de profil concordante avec ${best.platform} (distance pHash ${best.distance}/64).`,
          source: "corrélation d'avatars · pHash local",
          weight: best.strong ? 92 : 78,
        });
      }
    }

    // strong cross-signal: self-declared / verified linked accounts (Keybase, Gravatar)
    if (p.links?.length) {
      crossBoost += 18;
      for (const l of p.links.slice(0, 4)) {
        evidence.push({ name: "Compte lié déclaré", detail: l.label + (l.url ? ` → ${l.url}` : ""), source: `${p.source} · lien déclaré`, weight: 85 });
      }
    }

    let confidence = (p.unverified ? (exact ? 42 : 32) : (exact ? 62 : 46)) + crossBoost;
    if (p.displayName) confidence += 6;
    if (p.bio) confidence += 5;
    if (p.avatar) confidence += 5;
    confidence = clamp(Math.round(confidence), 22, 94);

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
  const depth = clamp(parseInt(req.nextUrl.searchParams.get("depth") || "100", 10) || 100, 1, 250);
  if (!username || username.length > 64 || /[^\w.\-@]/.test(username)) {
    return NextResponse.json({ error: "username invalide" }, { status: 400 });
  }
  try {
    // official APIs (rich, verified) + WhatsMyName ruleset (broad, unverified) in parallel
    const [apiProfiles, wmn] = await Promise.all([
      scanUsername(username),
      scanWmn(username, depth),
    ]);
    // dedupe: prefer the richer API profile when a platform appears in both
    const seen = new Set(apiProfiles.map((p) => norm(p.platform)));
    const merged = [...apiProfiles, ...wmn.hits.filter((w) => !seen.has(norm(w.platform)))];

    // link accounts by avatar (perceptual hash) before scoring
    await enrichAvatars(merged);

    const signals = correlate(username, merged);
    signals.sort((a, b) => b.confidence - a.confidence);
    return NextResponse.json({
      seed: username,
      count: signals.length,
      signals,
      sources: { api: apiProfiles.length, web: wmn.hits.length },
      // coverage transparency — never silently truncate
      coverage: { checked: wmn.checked, available: wmn.total, capped: wmn.checked < wmn.total },
    });
  } catch (e) {
    return NextResponse.json({ error: "scan échoué", detail: String(e) }, { status: 500 });
  }
}
