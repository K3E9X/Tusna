// Relationship graph — map the person's WORLD, not just their accounts.
//
// Tusna's graph is otherwise star-shaped: one identity, its accounts. Real
// investigation also needs the edges between PEOPLE — who they follow, who follows
// them, which orgs/groups they belong to. GitHub's public API exposes exactly this
// with no auth, so it is the first, cleanest source of a genuine network.
//
// The same event feed also yields activity timestamps (→ timezone inference, see
// lib/temporal) and mentioned repos (content). One fetch, three payoffs.
//
// Everything degrades gracefully: the sandbox blocks the network, Vercel allows it.

import type { Signal, Relation } from "./signals";

const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";
const GH = "https://api.github.com";
const BSKY = "https://public.api.bsky.app";
const MASTO = "https://mastodon.social";

async function getJSON(url: string, accept: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
const ghJSON = (path: string) => getJSON(`${GH}${path}`, "application/vnd.github+json");

export interface NetworkResult {
  /** related people / orgs, as graph nodes */
  nodes: Signal[];
  /** typed edges FROM the seed node TO those nodes */
  relations: Relation[];
  /** activity timestamps (event feed) → timezone inference */
  activityTimestamps: string[];
  /** repos the person pushed to recently (content / interests) */
  repos: string[];
}

interface PlatformCfg { key: string; label: string; source: string; }

function personNode(cfg: PlatformCfg, handle: string, url: string | undefined, via: string, collectedAt: string): Signal {
  return {
    id: `${cfg.key}-person:` + handle.toLowerCase(),
    platform: `${cfg.label} · PERSON`,
    handle,
    disc: "PR",
    kind: "person",
    confidence: 40,
    tier: "possible",
    status: "candidate",
    url,
    collectedAt,
    evidence: [{ name: "Related person", detail: `${handle} — ${via} the seed on ${cfg.label}.`, source: cfg.source, weight: 45 }],
  };
}

function orgNode(o: { login: string; avatar_url?: string; description?: string }, collectedAt: string): Signal {
  return {
    id: "gh-org:" + o.login.toLowerCase(),
    platform: "GITHUB · ORG",
    handle: o.login,
    disc: "OG",
    kind: "org",
    confidence: 48,
    tier: "possible",
    status: "candidate",
    url: `https://github.com/${o.login}`,
    collectedAt,
    evidence: [{ name: "Organisation membership", detail: `Public member of ${o.login}${o.description ? " — " + o.description : ""}.`, source: "api.github.com · public API", weight: 55 }],
  };
}

/**
 * Build the GitHub relationship graph around a username.
 * `seedNodeId` is the id of the seed's GitHub account node the edges hang off.
 */
export async function githubNetwork(
  username: string,
  seedNodeId: string,
  collectedAt: string,
  opts: { maxPeople?: number } = {},
): Promise<NetworkResult> {
  const maxPeople = opts.maxPeople ?? 12;
  const enc = encodeURIComponent(username);
  const [followers, following, orgs, events] = await Promise.all([
    ghJSON(`/users/${enc}/followers?per_page=${maxPeople}`),
    ghJSON(`/users/${enc}/following?per_page=${maxPeople}`),
    ghJSON(`/users/${enc}/orgs?per_page=10`),
    ghJSON(`/users/${enc}/events/public?per_page=100`),
  ]);

  const nodes = new Map<string, Signal>();
  const relations: Relation[] = [];
  const seen = new Set<string>();
  const addRel = (n: Signal, kind: Relation["kind"], label: string) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    if (!seen.has(n.id + kind)) { seen.add(n.id + kind); relations.push({ to: n.id, kind, label, source: "api.github.com · public API" }); }
  };

  const GH_CFG: PlatformCfg = { key: "gh", label: "GITHUB", source: "api.github.com · public API" };
  if (Array.isArray(following)) for (const u of following.slice(0, maxPeople)) {
    if (u?.login) addRel(personNode(GH_CFG, u.login, u.html_url, "is followed by", collectedAt), "follows", `seed follows @${u.login}`);
  }
  if (Array.isArray(followers)) for (const u of followers.slice(0, maxPeople)) {
    if (u?.login) addRel(personNode(GH_CFG, u.login, u.html_url, "follows", collectedAt), "follower", `@${u.login} follows seed`);
  }
  if (Array.isArray(orgs)) for (const o of orgs) {
    if (o?.login) addRel(orgNode(o, collectedAt), "member", `member of ${o.login}`);
  }

  const activityTimestamps: string[] = [];
  const repos = new Set<string>();
  if (Array.isArray(events)) for (const e of events) {
    if (e?.created_at) activityTimestamps.push(e.created_at);
    if (e?.repo?.name) repos.add(e.repo.name);
  }

  // stamp the seed→node edges onto no particular node here; the caller attaches
  // `relations` to the seed node (seedNodeId) so the graph can draw them.
  void seedNodeId;

  return { nodes: [...nodes.values()], relations, activityTimestamps, repos: [...repos].slice(0, 20) };
}

/** Small helper: build nodes + edges from a follows/followers/timestamps set. */
function assemble(
  cfg: PlatformCfg,
  following: { handle: string; url?: string }[],
  followers: { handle: string; url?: string }[],
  timestamps: string[],
  collectedAt: string,
): NetworkResult {
  const nodes = new Map<string, Signal>();
  const relations: Relation[] = [];
  const seen = new Set<string>();
  const addRel = (n: Signal, kind: Relation["kind"], label: string) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    if (!seen.has(n.id + kind)) { seen.add(n.id + kind); relations.push({ to: n.id, kind, label, source: cfg.source }); }
  };
  for (const u of following) addRel(personNode(cfg, u.handle, u.url, "is followed by", collectedAt), "follows", `seed follows ${u.handle}`);
  for (const u of followers) addRel(personNode(cfg, u.handle, u.url, "follows", collectedAt), "follower", `${u.handle} follows seed`);
  return { nodes: [...nodes.values()], relations, activityTimestamps: timestamps, repos: [] };
}

/**
 * Bluesky relationship graph — public AppView, no auth. Resolves the DID, then pulls
 * follows / followers and recent post timestamps (for timezone inference).
 */
export async function blueskyNetwork(handle: string, collectedAt: string, opts: { maxPeople?: number } = {}): Promise<NetworkResult> {
  const max = opts.maxPeople ?? 12;
  const actor = handle.includes(".") ? handle : `${handle}.bsky.social`;
  const prof = await getJSON(`${BSKY}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`, "application/json");
  const did = prof?.did;
  if (!did) return { nodes: [], relations: [], activityTimestamps: [], repos: [] };
  const [follows, followers, feed] = await Promise.all([
    getJSON(`${BSKY}/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(did)}&limit=${max}`, "application/json"),
    getJSON(`${BSKY}/xrpc/app.bsky.graph.getFollowers?actor=${encodeURIComponent(did)}&limit=${max}`, "application/json"),
    getJSON(`${BSKY}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50`, "application/json"),
  ]);
  const cfg: PlatformCfg = { key: "bsky", label: "BLUESKY", source: "public.api.bsky.app · public API" };
  const map = (arr: any, field: string) => (Array.isArray(arr?.[field]) ? arr[field] : [])
    .filter((x: any) => x?.handle).slice(0, max)
    .map((x: any) => ({ handle: x.handle, url: `https://bsky.app/profile/${x.handle}` }));
  const ts = (Array.isArray(feed?.feed) ? feed.feed : [])
    .map((it: any) => it?.post?.record?.createdAt || it?.post?.indexedAt).filter(Boolean);
  return assemble(cfg, map(follows, "follows"), map(followers, "followers"), ts, collectedAt);
}

/**
 * Mastodon relationship graph (mastodon.social) — public unless the user hid it.
 * Resolves the account id, then follows / followers and recent status timestamps.
 */
export async function mastodonNetwork(acct: string, collectedAt: string, opts: { maxPeople?: number } = {}): Promise<NetworkResult> {
  const max = opts.maxPeople ?? 12;
  const clean = acct.replace(/^@/, "").split("@")[0];
  const lookup = await getJSON(`${MASTO}/api/v1/accounts/lookup?acct=${encodeURIComponent(clean)}`, "application/json");
  const id = lookup?.id;
  if (!id) return { nodes: [], relations: [], activityTimestamps: [], repos: [] };
  const [following, followers, statuses] = await Promise.all([
    getJSON(`${MASTO}/api/v1/accounts/${id}/following?limit=${max}`, "application/json"),
    getJSON(`${MASTO}/api/v1/accounts/${id}/followers?limit=${max}`, "application/json"),
    getJSON(`${MASTO}/api/v1/accounts/${id}/statuses?limit=40&exclude_replies=false`, "application/json"),
  ]);
  const cfg: PlatformCfg = { key: "masto", label: "MASTODON", source: "mastodon.social · public API" };
  const map = (arr: any) => (Array.isArray(arr) ? arr : [])
    .filter((x: any) => x?.acct).slice(0, max)
    .map((x: any) => ({ handle: `@${x.acct}`, url: x.url }));
  const ts = (Array.isArray(statuses) ? statuses : []).map((s: any) => s?.created_at).filter(Boolean);
  return assemble(cfg, map(following), map(followers), ts, collectedAt);
}
