// Hudson Rock (Cavalier) connector — infostealer intelligence. FREE public OSINT
// endpoints, no key. Defense-oriented: it tells you whether an email/username
// appears in infostealer logs, and which SERVICES the victim logged into — which
// surfaces real accounts (Instagram, PayPal…) we could never scan directly.
// Credentials themselves are not returned by the free API.

import { normId } from "./extract";
import type { Signal } from "./signals";

const BASE = "https://cavalier.hudsonrock.com/api/json/v2/osint-tools";
const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

async function getJSON(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function domainsFrom(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const url = typeof item === "string" ? item : item?.url || item?.domain || "";
    try { out.push(new URL(url.includes("://") ? url : "http://" + url).host.replace(/^www\./, "")); } catch { /* skip */ }
  }
  return [...new Set(out.filter(Boolean))];
}

function disc(name: string): string {
  return (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "HR").toUpperCase();
}

function build(term: string, data: any): Signal[] {
  const stealers = Array.isArray(data?.stealers) ? data.stealers : [];
  if (!stealers.length) return [];
  const compId = "hr:comp:" + normId(term);
  const s0 = stealers[0] || {};
  const compromised: Signal = {
    id: compId,
    platform: "INFOSTEALER",
    handle: term,
    disc: "HR",
    kind: "leak",
    tier: "probable",
    confidence: 70,
    status: "review",
    createdAt: s0.date_compromised ? String(s0.date_compromised).slice(0, 10) : undefined,
    evidence: [
      { name: "Infostealer compromise", detail: `${term} appears in ${stealers.length} infostealer log(s) (Hudson Rock).`, source: "hudsonrock · cavalier", weight: 80 },
      ...(s0.date_compromised ? [{ name: "Compromise date", detail: String(s0.date_compromised).slice(0, 10), source: "hudsonrock", weight: 55 }] : []),
      ...(s0.operating_system || s0.computer_name ? [{ name: "Victim machine", detail: [s0.operating_system, s0.computer_name].filter(Boolean).join(" · "), source: "hudsonrock", weight: 45 }] : []),
      { name: "Sensitive source", detail: "Infostealer data — defensive/legal use only; credentials are not shown.", source: "guidance", weight: 15 },
    ],
  };
  // services the victim logged into → real account nodes, linked to the compromise
  const domains = [...new Set(stealers.flatMap((s: any) => domainsFrom(s.top_logins)))].slice(0, 6) as string[];
  const services: Signal[] = domains.map((d) => ({
    id: "hr:svc:" + normId(d),
    platform: d.toUpperCase(),
    handle: term,
    disc: disc(d),
    kind: "platform",
    tier: "possible",
    confidence: 52,
    status: "candidate",
    linkedIds: [compId],
    evidence: [{ name: "Service used", detail: `This identifier logged into ${d} (seen in infostealer logs).`, source: "hudsonrock · cavalier", weight: 60 }],
  }));
  return [compromised, ...services];
}

export async function hudsonRockEmail(email: string): Promise<Signal[]> {
  const d = await getJSON(`${BASE}/search-by-email?email=${encodeURIComponent(email)}`);
  return d ? build(email, d) : [];
}

export async function hudsonRockUsername(username: string): Promise<Signal[]> {
  const d = await getJSON(`${BASE}/search-by-username?username=${encodeURIComponent(username)}`);
  return d ? build(username, d) : [];
}
