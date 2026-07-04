// Intelligence X connector — breaches / pastes / darkweb / historical data.
// Requires an API key (freemium): set INTELX_API_KEY (and optionally INTELX_URL).
// Sensitive source — use under a legal basis; never redistribute credentials.

import { normId } from "./extract";
import type { Signal } from "./signals";

const KEY = process.env.INTELX_API_KEY || "";
const BASE = (process.env.INTELX_URL || "https://2.intelx.io").replace(/\/$/, "");
const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

export const intelxEnabled = KEY.length > 0;

function ix(path: string, init: RequestInit = {}) {
  return fetch(BASE + path, { ...init, headers: { ...(init.headers || {}), "x-key": KEY, "User-Agent": UA }, cache: "no-store" });
}

function toNode(rec: any): Signal {
  const name = String(rec.name || rec.systemid || "leak record").slice(0, 48);
  const bucket = String(rec.bucket || "leak");
  const date = rec.date ? String(rec.date).slice(0, 10) : "";
  return {
    id: "leak:" + (rec.systemid || normId(name)),
    platform: bucket.toUpperCase().slice(0, 18),
    handle: name,
    disc: "LK",
    kind: "leak",
    confidence: 50,
    status: "review",
    evidence: [
      { name: "Appears in leak / paste", detail: `${name} · ${bucket}${date ? " · " + date : ""}`, source: "intelx.io", weight: 62 },
      { name: "Sensitive source", detail: "Breach/leak data — handle under a legal basis; do not redistribute credentials.", source: "guidance", weight: 15 },
    ],
  };
}

export async function searchIntelX(term: string, max = 8): Promise<Signal[]> {
  if (!intelxEnabled || !term) return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const start = await ix("/intelligent/search", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, maxresults: max, media: 0, sort: 2, timeout: 5, terminate: [] }),
      });
      if (!start.ok) return [];
      const { id } = await start.json();
      if (!id) return [];
      let records: any[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await ix(`/intelligent/search/result?id=${encodeURIComponent(id)}&limit=${max}`, { signal: ctrl.signal });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.records) && d.records.length) { records = d.records; break; }
          if (d.status === 1 || d.status === 2) break; // done / not found
        }
        await new Promise((res) => setTimeout(res, 700));
      }
      return records.slice(0, max).map(toNode);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return [];
  }
}
