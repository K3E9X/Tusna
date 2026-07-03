import { NextRequest, NextResponse } from "next/server";
import { scanUsername, type RawProfile } from "@/lib/connectors";
import { scanWmn } from "@/lib/wmn";
import { scanEmail } from "@/lib/email";
import { dHashFromUrl, avatarMatch } from "@/lib/phash";
import type { Signal, Evidence, Status } from "@/lib/signals";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
function correlate(matchTarget: string, profiles: RawProfile[]): Signal[] {
  const seedN = norm(matchTarget);
  return profiles.map((p) => {
    const evidence: Evidence[] = [];
    const handleN = norm(p.handle.replace(/^u\//, ""));

    // exact / near username match against the target (username, or email-derived handle)
    const exact = handleN === seedN;
    if (p.unverified) {
      evidence.push({
        name: "Présence détectée",
        detail: `${p.handle} trouvé sur ${p.platform} par motif d'URL (WhatsMyName) — existence non vérifiée par une API.`,
        source: p.source,
        weight: 45,
      });
    } else if (p.derived) {
      evidence.push({
        name: "Handle dérivé de l'email",
        detail: `${p.handle} obtenu en dérivant le handle de l'email — compte public existant, lien à la personne à confirmer.`,
        source: p.source,
        weight: 50,
      });
    } else {
      evidence.push({
        name: exact ? "Username exact" : "Username proche",
        detail: `${p.handle} ${exact ? "≡" : "≈"} cible « ${matchTarget} », compte public existant.`,
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

    const base = p.unverified ? (exact ? 42 : 32) : p.derived ? (exact ? 48 : 38) : (exact ? 62 : 46);
    let confidence = base + crossBoost;
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
  const q = (req.nextUrl.searchParams.get("username") || "").trim();
  const depth = clamp(parseInt(req.nextUrl.searchParams.get("depth") || "100", 10) || 100, 1, 250);
  if (!q || q.length > 128) {
    return NextResponse.json({ error: "entrée invalide" }, { status: 400 });
  }
  const isEmail = EMAIL_RE.test(q);
  if (!isEmail && /[^\w.\-@]/.test(q)) {
    return NextResponse.json({ error: "pseudo invalide" }, { status: 400 });
  }
  try {
    let apiProfiles: RawProfile[];
    let wmnHits: RawProfile[];
    let checked = 0, totalSites = 0;
    let matchTarget = q;
    let email: { handle: string; mxValid: boolean } | undefined;

    if (isEmail) {
      const r = await scanEmail(q, depth);
      apiProfiles = r.profiles;
      wmnHits = r.wmnHits;
      checked = r.wmnChecked; totalSites = r.wmnTotal;
      matchTarget = r.handle || q;
      email = { handle: r.handle, mxValid: r.mxValid };
    } else {
      const [api, wmn] = await Promise.all([scanUsername(q), scanWmn(q, depth)]);
      apiProfiles = api; wmnHits = wmn.hits;
      checked = wmn.checked; totalSites = wmn.total;
    }

    // dedupe: prefer the richer API profile per platform, then drop duplicate ids
    const seen = new Set(apiProfiles.map((p) => norm(p.platform)));
    const mergedRaw = [...apiProfiles, ...wmnHits.filter((w) => !seen.has(norm(w.platform)))];
    const byId = new Map<string, RawProfile>();
    for (const p of mergedRaw) if (!byId.has(p.id)) byId.set(p.id, p);
    const merged = [...byId.values()];

    // link accounts by avatar (perceptual hash) before scoring
    await enrichAvatars(merged);

    const signals = correlate(matchTarget, merged);
    signals.sort((a, b) => b.confidence - a.confidence);
    return NextResponse.json({
      seed: q,
      mode: isEmail ? "email" : "username",
      count: signals.length,
      signals,
      email,
      sources: { api: apiProfiles.length, web: wmnHits.length },
      // coverage transparency — never silently truncate
      coverage: { checked, available: totalSites, capped: checked < totalSites },
    });
  } catch (e) {
    return NextResponse.json({ error: "scan échoué", detail: String(e) }, { status: 500 });
  }
}
