// Email connector — "email → accounts", using clean public sources only (no key).
//  1. Gravatar by email hash → verified profile + self-declared linked accounts (the anchor).
//  2. Derived handle (email local-part) → re-run username connectors, flagged `derived`
//     (weaker link to the person; scored lower; human confirms).
//  3. MX check → is the domain able to receive mail (deliverability signal).

import { createHash } from "crypto";
import { promises as dns } from "dns";
import { scanUsername, type RawProfile, type ProfileLink } from "./connectors";
import { scanWmn } from "./wmn";

const UA = "Octopus-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

async function fetchJSON(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") || "").includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Derive a candidate username from an email local-part (gmail dot/tag normalization). */
export function deriveHandle(email: string): string {
  const [lpRaw, domRaw] = email.toLowerCase().split("@");
  const dom = domRaw || "";
  let lp = (lpRaw || "").split("+")[0];
  if (dom === "gmail.com" || dom === "googlemail.com") lp = lp.replace(/\./g, "");
  return lp.replace(/[^a-z0-9_.\-]/g, "");
}

/** Gravatar profile from an email (md5, then sha256 fallback). Verified anchor. */
export async function gravatarByEmail(email: string): Promise<RawProfile | null> {
  const norm = email.trim().toLowerCase();
  const md5 = createHash("md5").update(norm).digest("hex");
  let j = await fetchJSON(`https://gravatar.com/${md5}.json`);
  let algo = "md5";
  if (!j) {
    const sha = createHash("sha256").update(norm).digest("hex");
    j = await fetchJSON(`https://gravatar.com/${sha}.json`);
    algo = "sha256";
  }
  const e = Array.isArray(j?.entry) ? j.entry[0] : null;
  if (!e?.hash) return null;
  const accounts = Array.isArray(e.accounts) ? e.accounts : [];
  const links: ProfileLink[] = accounts.slice(0, 6).map((a: any) => ({ service: a.shortname || a.name || "account", handle: a.username || a.display || undefined, url: a.url || "", label: a.shortname || a.name || "account" }));
  return {
    id: "gravatar", platform: "GRAVATAR", disc: "GR",
    handle: e.preferredUsername || norm.split("@")[0],
    url: e.profileUrl || `https://gravatar.com/${md5}`,
    displayName: e.displayName || e.name?.formatted || undefined,
    bio: e.aboutMe || undefined, avatar: e.thumbnailUrl || undefined,
    links: links.length ? links : undefined,
    source: `gravatar.com · via email (${algo})`,
  };
}

/** Does the email domain accept mail (has MX records)? Best-effort. */
export async function mxValid(email: string): Promise<boolean> {
  try {
    const dom = email.split("@")[1];
    if (!dom) return false;
    const mx = await dns.resolveMx(dom);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

export interface EmailScan {
  profiles: RawProfile[];
  wmnHits: RawProfile[];
  wmnChecked: number;
  wmnTotal: number;
  handle: string;
  mxValid: boolean;
}

export async function scanEmail(email: string, depth = 100, enabled?: Set<string>): Promise<EmailScan> {
  const handle = deriveHandle(email);
  const wmnOn = !enabled || enabled.has("whatsmyname");
  const [grav, derivedApi, wmn, mx] = await Promise.all([
    gravatarByEmail(email),
    handle ? scanUsername(handle, enabled) : Promise.resolve([] as RawProfile[]),
    handle && wmnOn ? scanWmn(handle, depth) : Promise.resolve({ hits: [] as RawProfile[], checked: 0, total: 0 }),
    mxValid(email),
  ]);

  const profiles: RawProfile[] = [];
  if (grav) profiles.push(grav); // verified anchor (from the email itself)
  for (const p of derivedApi) {
    if (p.id === "gravatar") continue; // avoid dup with the email-derived Gravatar anchor
    p.derived = true;
    profiles.push(p);
  }
  const wmnHits = wmn.hits.map((h) => ({ ...h, derived: true }));

  return { profiles, wmnHits, wmnChecked: wmn.checked, wmnTotal: wmn.total, handle, mxValid: mx };
}
