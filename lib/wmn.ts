// WhatsMyName engine — checks a username against the maintained WhatsMyName
// detection ruleset (600+ sites). This is what powers Sherlock/Maigret-style
// presence discovery. Presences found here are flagged `unverified` (detected
// by URL pattern, not by an official API) and scored low downstream — the human
// confirms. This keeps coverage broad WITHOUT manufacturing false positives.

import sample from "./wmn-data.sample.json";
import type { RawProfile } from "./connectors";

interface WmnSite {
  name: string;
  uri_check: string;
  uri_pretty?: string;
  e_code?: number;
  e_string?: string;
  m_code?: number;
  m_string?: string;
  cat?: string;
  valid?: boolean;
}

const WMN_URL = "https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json";
const UA = "Octopus-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

let cache: WmnSite[] | null = null;

/** Load the maintained ruleset once (cached); fall back to the bundled sample. */
async function loadSites(): Promise<WmnSite[]> {
  if (cache) return cache;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(WMN_URL, { signal: ctrl.signal, headers: { "User-Agent": UA }, cache: "no-store" });
    clearTimeout(t);
    if (res.ok) {
      const j: any = await res.json();
      if (Array.isArray(j?.sites) && j.sites.length) {
        cache = j.sites.filter((s: WmnSite) => s.valid !== false && s.uri_check);
        return cache!;
      }
    }
  } catch {
    /* offline / blocked → fall back */
  }
  cache = (sample as any).sites as WmnSite[];
  return cache;
}

function disc(name: string): string {
  const a = name.replace(/[^A-Za-z0-9]/g, "");
  return (a.slice(0, 2) || "WM").toUpperCase();
}

// Popular / mainstream sites first, so the depth cap always covers where real
// people actually are (not just alphabetical/niche entries).
const POPULAR = [
  "instagram", "tiktok", "twitter", "x", "facebook", "snapchat", "youtube", "pinterest",
  "reddit", "telegram", "spotify", "soundcloud", "steam", "twitch", "github", "gitlab",
  "linktree", "linktr", "patreon", "onlyfans", "medium", "tumblr", "vimeo", "flickr",
  "gravatar", "keybase", "mastodon", "cashapp", "venmo", "paypal", "aboutme", "behance",
  "dribbble", "replit", "kaggle", "chess", "lichess", "strava", "goodreads", "letterboxd",
  "lastfm", "deviantart", "wattpad", "quora", "vk", "discord", "twitch", "ebay", "etsy",
];
function popRank(name: string): number {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < POPULAR.length; i++) if (n.includes(POPULAR[i])) return i;
  return 999;
}

async function checkSite(site: WmnSite, username: string, timeoutMs = 3500): Promise<RawProfile | null> {
  const url = site.uri_check.replace(/\{account\}/g, encodeURIComponent(username));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/json" },
      redirect: "follow",
      cache: "no-store",
    });
    const needBody = !!(site.e_string || site.m_string);
    const body = needBody ? await res.text() : "";
    const eOk = (site.e_code == null || res.status === site.e_code) && (!site.e_string || body.includes(site.e_string));
    const mHit = (site.m_string ? body.includes(site.m_string) : false) || (site.m_code != null && res.status === site.m_code);
    if (!eOk || mHit) return null;
    const pretty = (site.uri_pretty || site.uri_check).replace(/\{account\}/g, username);
    let host = "";
    try { host = new URL(pretty).host; } catch { host = "web"; }
    return {
      id: "wmn:" + site.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
      platform: site.name.toUpperCase(),
      disc: disc(site.name),
      handle: username,
      url: pretty,
      unverified: true,
      source: `${host} · WhatsMyName (URL pattern)`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pool<T, R>(items: T[], limit: number, worker: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const n = Math.min(limit, items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { out[idx] = await worker(items[idx]); } catch { out[idx] = null as R; }
      }
    }),
  );
  return out;
}

/**
 * Scan a username across the WhatsMyName ruleset.
 * `depth` caps how many sites are checked per request (Vercel function time limit);
 * the cap is reported by the caller so coverage is never silently truncated.
 */
export async function scanWmn(username: string, depth = 120, concurrency = 40): Promise<{ hits: RawProfile[]; checked: number; total: number }> {
  const sites = await loadSites();
  const ordered = [...sites].sort((a, b) => popRank(a.name) - popRank(b.name));
  const subset = ordered.slice(0, Math.max(1, depth));
  const results = await pool(subset, concurrency, (s) => checkSite(s, username));
  return { hits: results.filter((x): x is RawProfile => x != null), checked: subset.length, total: sites.length };
}
