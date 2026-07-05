// Entity resolution — the real thing, not string-matching. Clusters accounts into
// distinct identities via union-find over weighted same_person edges:
//   HARD  (alone enough to merge): matching avatar pHash · declared+verified link ·
//          a shared strong identifier (same email / same phone).
//   SOFT  (needs corroboration ≥2): same display name · same location · same handle.
// A cluster is VERIFIED if it contains a hard edge, PROBABLE if built only from
// corroborated soft edges, POSSIBLE if singleton. This is what turns "30 accounts"
// into "these 6 are ONE person (verified), and these 3 are a different maybe".

import { avatarMatch } from "./phash";

export interface ResolveNode {
  id: string;
  handleN: string;      // normalized handle
  nameN?: string;       // normalized display name
  locN?: string;        // normalized location
  avatarHash?: string;
}

export type ClusterTier = "verified" | "probable" | "possible";

export interface Cluster {
  id: string;
  members: string[];
  tier: ClusterTier;
  size: number;
}

export interface Resolution {
  clusterOf: Record<string, string>; // node id → cluster root id
  clusters: Cluster[];
}

/**
 * @param nodes       platform nodes to resolve
 * @param declared    pairs [a,b] with a declared/verified link (HARD)
 * @param sharedAttr  groups of node ids that share a strong identifier, e.g. the
 *                    same email or phone (each group is a HARD clique)
 */
export function resolveIdentities(
  nodes: ResolveNode[],
  declared: [string, string][] = [],
  sharedAttr: string[][] = [],
): Resolution {
  const parent: Record<string, string> = {};
  const rank: Record<string, number> = {};
  for (const n of nodes) { parent[n.id] = n.id; rank[n.id] = 0; }

  function find(x: string): string {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
  }

  const hardMembers = new Set<string>();
  const markHard = (a: string, b: string) => { hardMembers.add(a); hardMembers.add(b); union(a, b); };

  // explicit hard evidence
  for (const [a, b] of declared) if (parent[a] && parent[b]) markHard(a, b);
  for (const group of sharedAttr) {
    const present = group.filter((id) => parent[id]);
    for (let i = 1; i < present.length; i++) markHard(present[0], present[i]);
  }

  // pairwise derived edges
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      if (A.avatarHash && B.avatarHash && avatarMatch(A.avatarHash, B.avatarHash).near) {
        markHard(A.id, B.id);
        continue;
      }
      let soft = 0;
      if (A.nameN && B.nameN && A.nameN === B.nameN) soft++;
      if (A.locN && B.locN && A.locN === B.locN) soft++;
      if (A.handleN && B.handleN && A.handleN === B.handleN) soft++;
      if (soft >= 2) union(A.id, B.id);
    }
  }

  const groups: Record<string, string[]> = {};
  for (const n of nodes) { const r = find(n.id); (groups[r] ||= []).push(n.id); }

  const clusters: Cluster[] = Object.entries(groups).map(([id, members]) => {
    const hasHard = members.some((m) => hardMembers.has(m));
    const tier: ClusterTier = hasHard ? "verified" : members.length > 1 ? "probable" : "possible";
    return { id, members, tier, size: members.length };
  });

  const clusterOf: Record<string, string> = {};
  for (const n of nodes) clusterOf[n.id] = find(n.id);
  return { clusterOf, clusters };
}
