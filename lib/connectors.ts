// Real connectors — query clean PUBLIC APIs only (no auth, no scraping, ToS-friendly).
// Each connector maps a username seed to a raw public profile when it exists.
// Confidence/evidence are computed downstream; connectors only report verifiable facts.
//
// Deliberately EXCLUDED: Instagram / X-Twitter / Facebook / LinkedIn / TikTok — their
// public APIs are closed and scraping breaks their ToS. Those belong to the "manual
// pivots" catalogue (cipher387), not to automated connectors.

export interface ProfileLink {
  label: string;
  url: string;
}

export interface RawProfile {
  id: string;
  platform: string;
  disc: string;
  handle: string;
  url: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  /** perceptual hash (dHash) of the avatar, filled in by the enrichment step */
  avatarHash?: string;
  createdAt?: string;
  /** self-declared / verified links to other accounts (strong cross-signal) */
  links?: ProfileLink[];
  /** true when existence is inferred by URL pattern (WhatsMyName), not an official API */
  unverified?: boolean;
  /** short provenance, e.g. "api.github.com · API publique" */
  source: string;
}

const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

async function getJSON(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const enc = encodeURIComponent;

/** GitHub — public REST API (unauthenticated: 60 req/h/IP). */
async function github(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://api.github.com/users/${enc(u)}`);
  if (!d?.login) return null;
  return {
    id: "github", platform: "GITHUB", disc: "GH", handle: d.login, url: d.html_url,
    displayName: d.name || undefined, bio: d.bio || undefined, avatar: d.avatar_url || undefined,
    createdAt: d.created_at || undefined, links: d.blog ? [{ label: "site", url: d.blog }] : undefined,
    source: "api.github.com · API publique",
  };
}

/** GitLab — public users search API. */
async function gitlab(u: string): Promise<RawProfile | null> {
  const arr = await getJSON(`https://gitlab.com/api/v4/users?username=${enc(u)}`);
  const d = Array.isArray(arr) ? arr[0] : null;
  if (!d?.username) return null;
  return {
    id: "gitlab", platform: "GITLAB", disc: "GL", handle: d.username, url: d.web_url,
    displayName: d.name || undefined, bio: d.bio || undefined, avatar: d.avatar_url || undefined,
    source: "gitlab.com · API publique",
  };
}

/** Reddit — public about.json. */
async function reddit(u: string): Promise<RawProfile | null> {
  const j = await getJSON(`https://www.reddit.com/user/${enc(u)}/about.json`);
  const d = j?.data;
  if (!d?.name) return null;
  return {
    id: "reddit", platform: "REDDIT", disc: "RD", handle: `u/${d.name}`,
    url: `https://www.reddit.com/user/${d.name}`,
    displayName: d.subreddit?.title || undefined, bio: d.subreddit?.public_description || undefined,
    avatar: (d.icon_img || d.snoovatar_img || "").split("?")[0] || undefined,
    createdAt: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : undefined,
    source: "reddit.com · about.json publique",
  };
}

/** Hacker News — public Firebase user endpoint. */
async function hackernews(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://hacker-news.firebaseio.com/v0/user/${enc(u)}.json`);
  if (!d?.id) return null;
  return {
    id: "hn", platform: "HACKER NEWS", disc: "HN", handle: d.id,
    url: `https://news.ycombinator.com/user?id=${d.id}`,
    bio: d.about ? String(d.about).replace(/<[^>]+>/g, " ").slice(0, 200) : undefined,
    createdAt: d.created ? new Date(d.created * 1000).toISOString() : undefined,
    source: "news.ycombinator.com · API publique",
  };
}

/** Keybase — lists cryptographically-verified linked accounts (strong cross-signal). */
async function keybase(u: string): Promise<RawProfile | null> {
  const j = await getJSON(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${enc(u)}&fields=basics,profile,pictures,proofs_summary`);
  const d = Array.isArray(j?.them) ? j.them[0] : j?.them;
  if (!d?.basics?.username) return null;
  const proofs = Array.isArray(d.proofs_summary?.all) ? d.proofs_summary.all : [];
  const links: ProfileLink[] = proofs
    .filter((p: any) => p?.nametag && p?.proof_type)
    .slice(0, 6)
    .map((p: any) => ({ label: `${p.proof_type}:${p.nametag}`, url: p.service_url || p.proof_url || "" }));
  return {
    id: "keybase", platform: "KEYBASE", disc: "KB", handle: d.basics.username,
    url: `https://keybase.io/${d.basics.username}`,
    displayName: d.profile?.full_name || undefined, bio: d.profile?.bio || undefined,
    avatar: d.pictures?.primary?.url || undefined,
    links: links.length ? links : undefined,
    source: "keybase.io · API publique (comptes vérifiés)",
  };
}

/** Gravatar — profile slug JSON; often declares linked accounts. */
async function gravatar(u: string): Promise<RawProfile | null> {
  const j = await getJSON(`https://gravatar.com/${enc(u)}.json`);
  const e = Array.isArray(j?.entry) ? j.entry[0] : null;
  if (!e?.hash) return null;
  const accounts = Array.isArray(e.accounts) ? e.accounts : [];
  const links: ProfileLink[] = accounts.slice(0, 6).map((a: any) => ({ label: a.shortname || a.name || "compte", url: a.url || "" }));
  return {
    id: "gravatar", platform: "GRAVATAR", disc: "GR", handle: e.preferredUsername || u,
    url: e.profileUrl || `https://gravatar.com/${u}`,
    displayName: e.displayName || e.name?.formatted || undefined,
    bio: e.aboutMe || undefined, avatar: e.thumbnailUrl || undefined,
    links: links.length ? links : undefined,
    source: "gravatar.com · API publique",
  };
}

/** Bluesky — public AppView (no auth). */
async function bluesky(u: string): Promise<RawProfile | null> {
  const actor = u.includes(".") ? u : `${u}.bsky.social`;
  const d = await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${enc(actor)}`);
  if (!d?.handle) return null;
  return {
    id: "bluesky", platform: "BLUESKY", disc: "BS", handle: d.handle,
    url: `https://bsky.app/profile/${d.handle}`,
    displayName: d.displayName || undefined, bio: d.description || undefined, avatar: d.avatar || undefined,
    createdAt: d.createdAt || undefined, source: "public.api.bsky.app · API publique",
  };
}

/** Mastodon (mastodon.social instance) — public account lookup. */
async function mastodon(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://mastodon.social/api/v1/accounts/lookup?acct=${enc(u)}`);
  if (!d?.username) return null;
  return {
    id: "mastodon", platform: "MASTODON", disc: "MA", handle: `@${d.username}@mastodon.social`,
    url: d.url, displayName: d.display_name || undefined,
    bio: d.note ? String(d.note).replace(/<[^>]+>/g, " ").slice(0, 200) : undefined,
    avatar: d.avatar || undefined, createdAt: d.created_at || undefined,
    source: "mastodon.social · API publique",
  };
}

/** Chess.com — public player API. */
async function chesscom(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://api.chess.com/pub/player/${enc(u.toLowerCase())}`);
  if (!d?.username) return null;
  return {
    id: "chesscom", platform: "CHESS.COM", disc: "CH", handle: d.username, url: d.url,
    displayName: d.name || undefined, avatar: d.avatar || undefined,
    createdAt: d.joined ? new Date(d.joined * 1000).toISOString() : undefined,
    source: "api.chess.com · API publique",
  };
}

/** Codeforces — public user info API. */
async function codeforces(u: string): Promise<RawProfile | null> {
  const j = await getJSON(`https://codeforces.com/api/user.info?handles=${enc(u)}`);
  const d = j?.status === "OK" && Array.isArray(j.result) ? j.result[0] : null;
  if (!d?.handle) return null;
  const name = [d.firstName, d.lastName].filter(Boolean).join(" ") || undefined;
  return {
    id: "codeforces", platform: "CODEFORCES", disc: "CF", handle: d.handle,
    url: `https://codeforces.com/profile/${d.handle}`,
    displayName: name, avatar: d.titlePhoto ? `https:${d.titlePhoto}` : undefined,
    source: "codeforces.com · API publique",
  };
}

/** npm — public registry user document. */
async function npm(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://registry.npmjs.org/-/user/org.couchdb.user:${enc(u)}`);
  if (!d?.name) return null;
  return {
    id: "npm", platform: "NPM", disc: "NP", handle: d.name,
    url: `https://www.npmjs.com/~${d.name}`,
    source: "registry.npmjs.org · API publique",
  };
}

/** Docker Hub — public user endpoint. */
async function dockerhub(u: string): Promise<RawProfile | null> {
  const d = await getJSON(`https://hub.docker.com/v2/users/${enc(u)}/`);
  if (!d?.username) return null;
  return {
    id: "dockerhub", platform: "DOCKER HUB", disc: "DK", handle: d.username,
    url: `https://hub.docker.com/u/${d.username}`,
    displayName: d.full_name || undefined, avatar: d.gravatar_url || undefined,
    createdAt: d.date_joined || undefined, source: "hub.docker.com · API publique",
  };
}

/** Wikipedia — public MediaWiki users query. */
async function wikipedia(u: string): Promise<RawProfile | null> {
  const j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=users&ususers=${enc(u)}&usprop=editcount|registration&format=json`);
  const d = j?.query?.users?.[0];
  if (!d || d.missing !== undefined || d.invalid !== undefined || !d.name) return null;
  return {
    id: "wikipedia", platform: "WIKIPEDIA", disc: "WK", handle: d.name,
    url: `https://en.wikipedia.org/wiki/User:${enc(d.name)}`,
    bio: typeof d.editcount === "number" ? `${d.editcount} contributions` : undefined,
    createdAt: d.registration || undefined, source: "en.wikipedia.org · API publique",
  };
}

export const CONNECTORS: Array<(u: string) => Promise<RawProfile | null>> = [
  github, gitlab, reddit, hackernews, keybase, gravatar, bluesky,
  mastodon, chesscom, codeforces, npm, dockerhub, wikipedia,
];

/** Run all connectors for a username; never throws — failed ones drop to null. */
export async function scanUsername(username: string): Promise<RawProfile[]> {
  const settled = await Promise.allSettled(CONNECTORS.map((c) => c(username)));
  return settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter((x): x is RawProfile => x != null);
}
