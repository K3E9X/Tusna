// Client for the optional Maigret collector worker (see collector/).
// Activates only when COLLECTOR_URL is set; otherwise returns nothing and Tusna
// uses its built-in connectors. This is the "delegate deep collection, pull the
// info" bridge: Maigret crawls 3000+ sites and extracts profile data/identifiers,
// Tusna normalizes it into the entity graph.

import { normId } from "./extract";
import type { RawProfile } from "./connectors";

const COLLECTOR_URL = process.env.COLLECTOR_URL || "";
const COLLECTOR_TOKEN = process.env.COLLECTOR_TOKEN || "";

export const collectorEnabled = COLLECTOR_URL.length > 0;

function disc(name: string): string {
  return (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "MG").toUpperCase();
}

function firstStr(v: any): string | undefined {
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  return v != null ? String(v) : undefined;
}

/** Map the worker's normalized report into rich RawProfiles. */
function mapSites(username: string, data: any): RawProfile[] {
  const sites = Array.isArray(data?.sites) ? data.sites : [];
  return sites.map((s: any) => {
    const ids = s.ids || {};
    // stuff discovered identifiers into `bio` so the extraction pass mines
    // emails / @aliases out of them into the graph.
    const idText = Object.entries(ids)
      .filter(([k]) => !["image", "avatar"].includes(k))
      .map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : [v]).join(", ")}`)
      .join("  \n  ");
    let host = "";
    try { host = new URL(s.url).host; } catch { host = "web"; }
    const p: RawProfile = {
      id: "mg:" + normId(s.name),
      platform: String(s.name).toUpperCase(),
      disc: disc(String(s.name)),
      handle: username,
      url: s.url || "",
      displayName: firstStr(ids.fullname) || firstStr(ids.name),
      bio: idText || undefined,
      avatar: firstStr(ids.image) || firstStr(ids.avatar),
      source: `${host} · Maigret`,
    };
    return p;
  });
}

export async function collect(username: string, top = 300, timeout = 8): Promise<RawProfile[]> {
  if (!collectorEnabled) return [];
  try {
    const base = COLLECTOR_URL.replace(/\/$/, "");
    const tok = COLLECTOR_TOKEN ? `&token=${encodeURIComponent(COLLECTOR_TOKEN)}` : "";
    const url = `${base}/scan?username=${encodeURIComponent(username)}&top=${top}&timeout=${timeout}${tok}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    return mapSites(username, data);
  } catch {
    return [];
  }
}
