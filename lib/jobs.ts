// Async deep-scan jobs — for scans that exceed a serverless timeout (SpiderFoot,
// deep Maigret). The collector worker runs them in the background; Tusna starts a
// job, polls it, and merges the normalized result into the board when it finishes.

import { normId } from "./extract";
import type { Signal } from "./signals";

const COLLECTOR_URL = process.env.COLLECTOR_URL || "";
const TOKEN = process.env.COLLECTOR_TOKEN || "";
export const jobsEnabled = COLLECTOR_URL.length > 0;

const base = () => COLLECTOR_URL.replace(/\/$/, "");
const auth = (sep: "?" | "&") => (TOKEN ? `${sep}token=${encodeURIComponent(TOKEN)}` : "");

export type JobType = "maigret" | "holehe" | "spiderfoot";

export interface JobState {
  status: "running" | "done" | "error" | "not_found";
  type?: string;
  result?: any;
  error?: string;
  elapsed?: number;
}

export async function startJob(type: JobType, target: string): Promise<string | null> {
  if (!jobsEnabled) return null;
  try {
    const url = `${base()}/jobs?type=${type}&target=${encodeURIComponent(target)}${auth("&")}`;
    const r = await fetch(url, { method: "POST", cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.jobId || null;
  } catch {
    return null;
  }
}

export async function pollJob(id: string): Promise<JobState | null> {
  if (!jobsEnabled) return null;
  try {
    const r = await fetch(`${base()}/jobs/${encodeURIComponent(id)}${auth("?")}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function disc(name: string): string {
  return (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "DS").toUpperCase();
}
function hostOf(url: string): string {
  try { return new URL(url.includes("://") ? url : "http://" + url).host.replace(/^www\./, ""); } catch { return "web"; }
}

function acct(id: string, platform: string, handle: string, url: string | undefined, source: string): Signal {
  return {
    id, platform: platform.toUpperCase(), handle, disc: disc(platform), url,
    kind: "platform", tier: "possible", confidence: 55, status: "candidate",
    evidence: [{ name: "Account (deep scan)", detail: `Found on ${platform}${url ? " · " + url : ""}.`, source, weight: 60 }],
  };
}

function attr(kind: Signal["kind"], value: string, source: string): Signal {
  const glyph = kind === "email" ? "EM" : kind === "alias" ? "AL" : kind === "phone" ? "TEL" : kind === "location" ? "GEO" : kind === "person" ? "PER" : "DS";
  return {
    id: `${kind}:${normId(value)}`, platform: (kind || "attr").toUpperCase(),
    handle: kind === "alias" ? "@" + value : value, disc: glyph, kind, tier: "possible",
    confidence: 52, status: "candidate",
    evidence: [{ name: "Discovered (deep scan)", detail: value, source, weight: 55 }],
  };
}

function fromMaigret(result: any, target: string): Signal[] {
  const sites = Array.isArray(result?.sites) ? result.sites : [];
  return sites.map((s: any) => acct("mgj:" + normId(s.name), s.name, target, s.url, `${hostOf(s.url || "")} · Maigret`));
}

function fromHolehe(result: any, target: string): Signal[] {
  const used = Array.isArray(result?.used) ? result.used : [];
  return used.slice(0, 20).map((d: string) => acct("holehe:" + normId(d), d, target, undefined, "holehe · via collector"));
}

function fromSpiderfoot(result: any, target: string): Signal[] {
  const events = Array.isArray(result?.events) ? result.events : [];
  const out = new Map<string, Signal>();
  const push = (s: Signal) => { if (!out.has(s.id)) out.set(s.id, s); };
  for (const e of events) {
    const t = String(e.type || "").toUpperCase();
    const data = String(e.data || "").trim();
    if (!data) continue;
    const src = "spiderfoot" + (e.module ? " · " + e.module : "");
    if (t === "EMAILADDR") push({ ...attr("email", data, src) });
    else if (t === "USERNAME") push({ ...attr("alias", data, src) });
    else if (t === "HUMAN_NAME") push({ ...attr("person", data, src) });
    else if (t === "PHONE_NUMBER") push({ ...attr("phone", data, src) });
    else if (t === "GEOINFO" || t === "PHYSICAL_ADDRESS") push({ ...attr("location", data, src) });
    else if (t === "ACCOUNT_EXTERNAL_OWNED" || t === "SOCIAL_MEDIA") {
      // data is often "Provider: https://…"
      const m = data.match(/^([^:]+):\s*(https?:\/\/\S+)/);
      const platform = m ? m[1].trim() : hostOf(data);
      const url = m ? m[2].trim() : (data.startsWith("http") ? data : undefined);
      push(acct("sf:" + normId(platform + data).slice(0, 40), platform, target, url, src));
    }
    if (out.size >= 40) break;
  }
  return [...out.values()];
}

export function normalizeJob(type: string | undefined, result: any, target: string): Signal[] {
  if (type === "maigret") return fromMaigret(result, target);
  if (type === "holehe") return fromHolehe(result, target);
  if (type === "spiderfoot") return fromSpiderfoot(result, target);
  return [];
}
