import { NextRequest, NextResponse } from "next/server";
import { scanUsername, type RawProfile } from "@/lib/connectors";
import { scanWmn } from "@/lib/wmn";
import { scanEmail } from "@/lib/email";
import { dHashFromUrl, avatarMatch } from "@/lib/phash";
import { extractFromText, normId } from "@/lib/extract";
import { collect, collectorEnabled } from "@/lib/collector";
import { searchIntelX, intelxEnabled } from "@/lib/intelx";
import { looksLikePhone, phoneIntel, type PhoneIntel } from "@/lib/phone";
import { looksLikeName, nameSignals } from "@/lib/name";
import { scoreEvidence } from "@/lib/scoring";
import type { Signal, Evidence, Status } from "@/lib/signals";

function phoneSignal(intel: PhoneIntel): Signal {
  const valid = intel.valid;
  const typeLabel = (intel.type || "unknown type").toLowerCase().replace(/_/g, " ");
  const evidence: Evidence[] = [
    {
      name: valid ? "Valid number" : "Not a valid number",
      detail: `${intel.country || "unknown region"} · ${typeLabel}${intel.callingCode ? " · " + intel.callingCode : ""}`,
      source: "libphonenumber · offline, deterministic",
      weight: valid ? 72 : 30,
    },
  ];
  if (intel.e164) {
    evidence.push({ name: "Formats", detail: `E.164 ${intel.e164}${intel.national ? " · national " + intel.national : ""}`, source: "libphonenumber", weight: 58 });
  }
  evidence.push({
    name: "Owner lookup",
    detail: "Automated owner identity isn't free — use the Epieos / Truecaller / PhoneInfoga pivots (pre-filled with this number).",
    source: "guidance",
    weight: 20,
  });
  return {
    id: "phone:" + (intel.e164 || intel.input).replace(/\D/g, ""),
    platform: "PHONE",
    handle: intel.international || intel.input,
    disc: "TEL",
    kind: "phone",
    confidence: valid ? 68 : 30,
    tier: valid ? "possible" : "weak",
    status: "review",
    evidence,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICE_TO_PLATFORM: Record<string, string> = {
  twitter: "X / TWITTER", x: "X / TWITTER", github: "GITHUB", gitlab: "GITLAB",
  reddit: "REDDIT", hackernews: "HACKER NEWS", facebook: "FACEBOOK", mastodon: "MASTODON",
  bluesky: "BLUESKY", keybase: "KEYBASE", telegram: "TELEGRAM", instagram: "INSTAGRAM",
  youtube: "YOUTUBE", twitch: "TWITCH", stackoverflow: "STACK OVERFLOW", hackerone: "HACKERONE",
  wordpress: "WORDPRESS", tumblr: "TUMBLR", vimeo: "VIMEO", flickr: "FLICKR", medium: "MEDIUM",
};
const SKIP_SERVICE = new Set(["web", "dns", "http", "https", "pgp", "gpg", "bitcoin", "zcash", "generic_web_site"]);
const serviceToPlatform = (s: string) => SERVICE_TO_PLATFORM[s.toLowerCase()] || s.toUpperCase();
const isRealService = (s: string) => !SKIP_SERVICE.has(s.toLowerCase());
const disc2 = (name: string) => (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "LK").toUpperCase();

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
export const maxDuration = 60; // allow the WhatsMyName sweep to finish (Vercel Pro)

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
        name: "Presence detected",
        detail: `${p.handle} found on ${p.platform} by URL pattern (WhatsMyName) — existence not verified by an API.`,
        source: p.source,
        weight: 45,
      });
    } else if (p.declared) {
      evidence.push({
        name: "Declared account",
        detail: `${p.handle} on ${p.platform} — ${p.source}.`,
        source: p.source,
        weight: 85,
      });
    } else if (p.derived) {
      evidence.push({
        name: "Handle derived from email",
        detail: `${p.handle} obtained by deriving the handle from the email — public account exists, link to the person to be confirmed.`,
        source: p.source,
        weight: 50,
      });
    } else {
      evidence.push({
        name: exact ? "Exact username" : "Near-match username",
        detail: `${p.handle} ${exact ? "=" : "≈"} target "${matchTarget}", public account exists.`,
        source: p.source,
        weight: exact ? 74 : 58,
      });
    }

    if (p.displayName) evidence.push({ name: "Public name", detail: p.displayName, source: p.source, weight: 55 });
    if (p.bio) evidence.push({ name: "Public bio", detail: p.bio.slice(0, 140), source: p.source, weight: 44 });
    if (p.avatar) evidence.push({ name: "Avatar present", detail: p.avatarHash ? "Public profile image (hashed for correlation)." : "Public profile image.", source: p.source, weight: 48 });
    if (p.createdAt) evidence.push({ name: "Account age", detail: `Account created on ${p.createdAt.slice(0, 10)}.`, source: p.source, weight: 30 });

    // cross-signal: display name shared with another platform (SOFT — a shared name
    // alone is a hint, not proof; it must be corroborated to lift the tier)
    const other = profiles.find((q) => q.id !== p.id && q.displayName && p.displayName && norm(q.displayName) === norm(p.displayName));
    if (other) {
      evidence.push({ name: "Matching name", detail: `Public name identical to ${other.platform}.`, source: "cross-source correlation", weight: 82 });
    }

    // strong cross-signal: matching avatar (perceptual hash) with another platform (HARD)
    if (p.avatarHash) {
      let best: { platform: string; distance: number; strong: boolean } | null = null;
      for (const q of profiles) {
        if (q.id === p.id || !q.avatarHash) continue;
        const m = avatarMatch(p.avatarHash, q.avatarHash);
        if (m.near && (!best || m.distance < best.distance)) best = { platform: q.platform, distance: m.distance, strong: m.match };
      }
      if (best) {
        evidence.push({
          name: best.strong ? "Matching avatar" : "Near-match avatar",
          detail: `Profile photo matches ${best.platform} (pHash distance ${best.distance}/64).`,
          source: "avatar correlation · local pHash",
          weight: best.strong ? 92 : 78,
        });
      }
    }

    // strong cross-signal: self-declared / verified linked accounts (Keybase, Gravatar) (HARD)
    if (p.links?.length) {
      for (const l of p.links.slice(0, 4)) {
        evidence.push({ name: "Declared linked account", detail: l.label + (l.url ? ` → ${l.url}` : ""), source: `${p.source} · declared link`, weight: 85 });
      }
    }

    // honest, evidence-driven score: qualitative tier + derived confidence
    const scored = scoreEvidence(evidence);
    const confidence = scored.confidence;
    const tier = scored.tier;
    const status: Status = (tier === "verified" || tier === "probable") ? "review" : "candidate";

    return {
      id: p.id,
      platform: p.platform,
      handle: p.handle,
      disc: p.disc,
      url: p.url || undefined,
      displayName: p.displayName || undefined,
      tier,
      confidence,
      status,
      evidence,
    };
  });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("username") || "").trim();
  const depth = clamp(parseInt(req.nextUrl.searchParams.get("depth") || "120", 10) || 120, 1, 300);
  if (!q || q.length > 128) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  const isEmail = EMAIL_RE.test(q);
  const isPhone = !isEmail && looksLikePhone(q);

  // phone mode: deterministic offline intel + pivots (no free owner lookup)
  if (isPhone) {
    const country = (req.nextUrl.searchParams.get("country") || "FR").toUpperCase();
    const intel = phoneIntel(q, country);
    const sig = phoneSignal(intel);
    return NextResponse.json({ seed: q, mode: "phone", count: 1, signals: [sig], phone: intel });
  }

  // name mode: full-name → person node + candidate handles + Name pivots
  if (!isEmail && !isPhone && looksLikeName(q)) {
    return NextResponse.json({ seed: q, mode: "name", count: 0, signals: nameSignals(q) });
  }

  if (!isEmail && /[^\w.\-@]/.test(q)) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  // enabled apps allowlist (omit → run everything)
  const cParam = req.nextUrl.searchParams.get("connectors");
  const enabled = cParam != null ? new Set(cParam.split(",").filter(Boolean)) : null;
  const wmnOn = !enabled || enabled.has("whatsmyname");
  const phashOn = !enabled || enabled.has("phash");
  try {
    let apiProfiles: RawProfile[];
    let wmnHits: RawProfile[];
    let checked = 0, totalSites = 0;
    let matchTarget = q;
    let email: { handle: string; mxValid: boolean } | undefined;

    if (isEmail) {
      const r = await scanEmail(q, depth, enabled ?? undefined);
      apiProfiles = r.profiles;
      wmnHits = r.wmnHits;
      checked = r.wmnChecked; totalSites = r.wmnTotal;
      matchTarget = r.handle || q;
      email = { handle: r.handle, mxValid: r.mxValid };
    } else {
      const [api, wmn] = await Promise.all([
        scanUsername(q, enabled ?? undefined),
        wmnOn ? scanWmn(q, depth) : Promise.resolve({ hits: [] as RawProfile[], checked: 0, total: 0 }),
      ]);
      apiProfiles = api; wmnHits = wmn.hits;
      checked = wmn.checked; totalSites = wmn.total;
    }

    // deep collection via the Maigret worker (rich profile data + discovered
    // identifiers), when a COLLECTOR_URL is configured and the app is enabled
    if (collectorEnabled && (!enabled || enabled.has("maigret"))) {
      const mg = await collect(matchTarget);
      if (isEmail) mg.forEach((p) => (p.derived = true));
      apiProfiles = [...apiProfiles, ...mg];
    }

    // dedupe: prefer the richer API profile per platform, then collapse duplicates
    // by id AND by platform+handle (community WhatsMyName data has near-dup entries)
    const seen = new Set(apiProfiles.map((p) => norm(p.platform)));
    const mergedRaw = [...apiProfiles, ...wmnHits.filter((w) => !seen.has(norm(w.platform)))];
    const byId = new Map<string, RawProfile>();
    const byKey = new Set<string>();
    const merged: RawProfile[] = [];
    for (const p of mergedRaw) {
      const key = norm(p.platform) + "|" + norm(p.handle.replace(/^u\//, ""));
      if (byId.has(p.id) || byKey.has(key)) continue;
      byId.set(p.id, p); byKey.add(key); merged.push(p);
    }

    // expand declared/verified links (Keybase, Gravatar) into connected nodes + edges
    const edges = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string) => {
      if (a === b) return;
      (edges.get(a) ?? edges.set(a, new Set()).get(a)!).add(b);
      (edges.get(b) ?? edges.set(b, new Set()).get(b)!).add(a);
    };
    for (const p of [...merged]) {
      if (!p.links?.length) continue;
      for (const l of p.links) {
        if (!isRealService(l.service)) continue;
        const platN = norm(serviceToPlatform(l.service));
        let target = merged.find(
          (q) => q.id !== p.id && (norm(q.platform) === platN || (l.handle && norm(q.handle.replace(/^u\//, "")) === norm(l.handle))),
        );
        if (!target && l.handle) {
          const id = `decl:${l.service.toLowerCase()}:${norm(l.handle)}`;
          target = byId.get(id);
          if (!target) {
            target = {
              id, platform: serviceToPlatform(l.service), disc: disc2(serviceToPlatform(l.service)),
              handle: l.handle, url: l.url, declared: true, source: `declared & verified via ${p.platform}`,
            };
            merged.push(target); byId.set(id, target);
          }
        }
        if (target) addEdge(p.id, target.id);
      }
    }

    // link accounts by avatar (perceptual hash) before scoring
    if (phashOn) await enrichAvatars(merged);

    const signals = correlate(matchTarget, merged);

    // entity extraction: mine collected bios/names for emails, aliases, links →
    // typed nodes wired to their source, growing the knowledge graph.
    const sigById = new Map(signals.map((s) => [s.id, s]));
    const byHandle = new Map(signals.map((s) => [norm(s.handle.replace(/^u\//, "")), s]));
    type AttrKind = "EMAIL" | "ALIAS" | "LOCATION";
    const attrs = new Map<string, { id: string; kind: AttrKind; value: string; sources: Set<string> }>();
    for (const p of merged) {
      const ex = extractFromText(p.bio, p.displayName);
      const items: Array<{ kind: AttrKind; value: string }> = [
        ...ex.emails.map((v) => ({ kind: "EMAIL" as const, value: v })),
        ...ex.aliases.map((v) => ({ kind: "ALIAS" as const, value: v })),
        ...(p.location ? [{ kind: "LOCATION" as const, value: p.location.trim() }] : []),
      ];
      for (const it of items) {
        const vn = normId(it.value);
        if (vn.length < (it.kind === "LOCATION" ? 2 : 3)) continue;
        if (it.kind === "ALIAS") {
          const existing = byHandle.get(vn);
          if (existing && existing.id !== p.id) { addEdge(p.id, existing.id); continue; } // link, no dup
          if (vn === norm((matchTarget || "").replace(/^u\//, ""))) continue; // it's the seed handle
        }
        const id = `attr:${it.kind.toLowerCase()}:${vn}`;
        if (!attrs.has(id)) attrs.set(id, { id, kind: it.kind, value: it.value, sources: new Set() });
        attrs.get(id)!.sources.add(p.id);
      }
    }
    const ATTR_META: Record<AttrKind, { disc: string; kind: Signal["kind"]; label: string }> = {
      EMAIL: { disc: "EM", kind: "email", label: "Email discovered" },
      ALIAS: { disc: "AL", kind: "alias", label: "Alias discovered" },
      LOCATION: { disc: "GEO", kind: "location", label: "Location" },
    };
    for (const a of attrs.values()) {
      const plats = [...a.sources].map((id) => sigById.get(id)?.platform).filter(Boolean) as string[];
      const meta = ATTR_META[a.kind];
      signals.push({
        id: a.id,
        platform: a.kind,
        handle: a.kind === "ALIAS" ? "@" + a.value : a.value,
        disc: meta.disc,
        kind: meta.kind,
        confidence: a.kind === "LOCATION" ? 58 : 52,
        tier: "possible",
        status: "candidate",
        evidence: [{
          name: meta.label,
          detail: `From the profile ${a.kind === "LOCATION" ? "location field" : "text"} on ${plats.slice(0, 3).join(", ") || "a collected profile"}.`,
          source: "entity extraction · from collected profiles",
          weight: 55,
        }],
      });
      for (const sid of a.sources) addEdge(sid, a.id);
    }

    // breach / leak search (Intelligence X) when a key is configured + app enabled
    if (intelxEnabled && (!enabled || enabled.has("intelx"))) {
      const leaks = await searchIntelX(isEmail ? q : matchTarget);
      signals.push(...leaks);
    }

    for (const s of signals) {
      const set = edges.get(s.id);
      if (set?.size) s.linkedIds = [...set];
    }
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
    return NextResponse.json({ error: "scan failed", detail: String(e) }, { status: 500 });
  }
}
