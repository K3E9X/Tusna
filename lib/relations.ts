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

async function ghJSON(path: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GH}${path}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

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

function personNode(u: { login: string; avatar_url?: string; html_url?: string }, via: string, collectedAt: string): Signal {
  return {
    id: "gh-person:" + u.login.toLowerCase(),
    platform: "GITHUB · PERSON",
    handle: u.login,
    disc: "PR",
    kind: "person",
    confidence: 40,
    tier: "possible",
    status: "candidate",
    url: u.html_url || `https://github.com/${u.login}`,
    collectedAt,
    evidence: [{ name: "Related person", detail: `${u.login} — ${via} the seed on GitHub.`, source: "api.github.com · public API", weight: 45 }],
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

  if (Array.isArray(following)) for (const u of following.slice(0, maxPeople)) {
    if (u?.login) addRel(personNode(u, "is followed by", collectedAt), "follows", `seed follows @${u.login}`);
  }
  if (Array.isArray(followers)) for (const u of followers.slice(0, maxPeople)) {
    if (u?.login) addRel(personNode(u, "follows", collectedAt), "follower", `@${u.login} follows seed`);
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
