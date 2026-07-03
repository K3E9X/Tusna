// Real connectors — query clean PUBLIC APIs only (no scraping, ToS-friendly).
// Each connector maps a username seed to a raw public profile when it exists.
// Confidence and evidence are computed downstream in the scan route; connectors
// only report verifiable facts (existence + public profile fields).

export interface RawProfile {
  id: string;
  platform: string;
  disc: string;
  handle: string;
  url: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  createdAt?: string;
  /** short provenance string, e.g. "api.github.com · API publique" */
  source: string;
}

const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

async function getJSON(url: string, timeoutMs = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

/** GitHub — public REST API, unauthenticated (rate-limited but ToS-clean). */
async function github(u: string): Promise<RawProfile | null> {
  const res = await getJSON(`https://api.github.com/users/${encodeURIComponent(u)}`);
  if (!res.ok) return null;
  const d: any = await res.json();
  if (!d || !d.login) return null;
  return {
    id: "github", platform: "GITHUB", disc: "GH", handle: d.login,
    url: d.html_url, displayName: d.name || undefined, bio: d.bio || undefined,
    avatar: d.avatar_url || undefined, createdAt: d.created_at || undefined,
    source: "api.github.com · API publique",
  };
}

/** Reddit — public about.json for a user. */
async function reddit(u: string): Promise<RawProfile | null> {
  const res = await getJSON(`https://www.reddit.com/user/${encodeURIComponent(u)}/about.json`);
  if (!res.ok) return null;
  const j: any = await res.json();
  const d = j?.data;
  if (!d || !d.name) return null;
  const icon = (d.icon_img || d.snoovatar_img || "").split("?")[0] || undefined;
  return {
    id: "reddit", platform: "REDDIT", disc: "RD", handle: `u/${d.name}`,
    url: `https://www.reddit.com/user/${d.name}`,
    displayName: d.subreddit?.title || undefined,
    bio: d.subreddit?.public_description || undefined,
    avatar: icon,
    createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
    source: "reddit.com · about.json publique",
  };
}

/** GitLab — public users search API. */
async function gitlab(u: string): Promise<RawProfile | null> {
  const res = await getJSON(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(u)}`);
  if (!res.ok) return null;
  const arr: any = await res.json();
  const d = Array.isArray(arr) ? arr[0] : null;
  if (!d || !d.username) return null;
  return {
    id: "gitlab", platform: "GITLAB", disc: "GL", handle: d.username,
    url: d.web_url, displayName: d.name || undefined, bio: d.bio || undefined,
    avatar: d.avatar_url || undefined,
    source: "gitlab.com · API publique",
  };
}

/** Hacker News — public Firebase user endpoint. */
async function hackernews(u: string): Promise<RawProfile | null> {
  const res = await getJSON(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(u)}.json`);
  if (!res.ok) return null;
  const d: any = await res.json();
  if (!d || !d.id) return null;
  return {
    id: "hn", platform: "HACKER NEWS", disc: "HN", handle: d.id,
    url: `https://news.ycombinator.com/user?id=${d.id}`,
    bio: d.about ? String(d.about).replace(/<[^>]+>/g, " ").slice(0, 200) : undefined,
    createdAt: d.created ? new Date(d.created * 1000).toISOString() : undefined,
    source: "news.ycombinator.com · API publique",
  };
}

export const CONNECTORS: Array<(u: string) => Promise<RawProfile | null>> = [
  github, reddit, gitlab, hackernews,
];

/** Run all connectors for a username; never throws — failed ones drop to null. */
export async function scanUsername(username: string): Promise<RawProfile[]> {
  const settled = await Promise.allSettled(CONNECTORS.map((c) => c(username)));
  return settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter((x): x is RawProfile => x != null);
}
