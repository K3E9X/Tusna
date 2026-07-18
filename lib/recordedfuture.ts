// Recorded Future connector — OPTIONAL, enterprise threat-intelligence enrichment.
//
// This is a BONUS source, wired exactly like Intelligence X: it activates only when a
// key is present (RECORDED_FUTURE_API_KEY, a.k.a. RF_API_KEY). Remove the key and
// Octopus runs unchanged — it is never a base dependency. Recorded Future is a paid
// enterprise product; entitlements (Identity, SOAR, risk) depend on the org's licence,
// so the endpoints are env-configurable and every call degrades gracefully.
//
// Defensive use only: we surface EXPOSURE and RISK (a credential leaked, a domain
// flagged) — never the credentials themselves. Handle under a legal basis.

import type { Signal } from "./signals";

const normId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

const ENV_KEY = process.env.RECORDED_FUTURE_API_KEY || process.env.RF_API_KEY || "";
// Connect API base (risk/SOAR) and Identity API base — override per your contract.
const BASE = (process.env.RF_API_URL || "https://api.recordedfuture.com/v2").replace(/\/$/, "");
const IDENTITY = (process.env.RF_IDENTITY_URL || "https://api.recordedfuture.com/identity").replace(/\/$/, "");
const UA = "Octopus-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

export const recordedFutureEnabled = ENV_KEY.length > 0;
export const recordedFutureConfigured = (key?: string) => (key || ENV_KEY).length > 0;

function rf(url: string, key: string, init: RequestInit = {}) {
  return fetch(url, { ...init, headers: { ...(init.headers || {}), "X-RFToken": key, "User-Agent": UA }, cache: "no-store" });
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 12000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); }
  catch { return null; }
  finally { clearTimeout(t); }
}

function exposureNode(email: string, count: number, sources: string[]): Signal {
  return {
    id: "rf:identity:" + normId(email),
    platform: "RECORDED FUTURE",
    handle: email,
    disc: "RF",
    kind: "leak",
    confidence: 60,
    tier: "probable",
    status: "review",
    evidence: [
      { name: "Credential exposure (breach/leak)", detail: `${count} exposure(s) reported by Recorded Future Identity${sources.length ? " · " + sources.slice(0, 4).join(", ") : ""}.`, source: "recordedfuture.com · Identity API", weight: 70 },
      { name: "Sensitive source", detail: "Enterprise threat intel — legal basis required; never redistribute credentials.", source: "guidance", weight: 15 },
    ],
  };
}

function riskNode(entity: string, kind: string, score: number, rules: string[]): Signal {
  return {
    id: "rf:risk:" + normId(entity),
    platform: "RECORDED FUTURE",
    handle: entity,
    disc: "RF",
    kind: "leak",
    confidence: Math.max(30, Math.min(90, score)),
    tier: score >= 65 ? "probable" : "possible",
    status: "review",
    evidence: [
      { name: `${kind} risk score`, detail: `Recorded Future risk ${score}/99${rules.length ? " · " + rules.slice(0, 3).join("; ") : ""}.`, source: "recordedfuture.com · Connect API", weight: Math.round(40 + score / 3) },
      { name: "Sensitive source", detail: "Enterprise threat intel — legal basis required.", source: "guidance", weight: 15 },
    ],
  };
}

/**
 * Optional enrichment. For an email → Identity credential-exposure lookup; for a
 * domain → Connect API risk. Returns [] when disabled, unlicensed, or offline.
 */
export async function recordedFutureLookup(seed: string, isEmail: boolean, keyOverride?: string): Promise<Signal[]> {
  const key = keyOverride || ENV_KEY;
  if (!key || !seed) return [];
  const out: Signal[] = [];

  if (isEmail) {
    const data = await withTimeout((signal) =>
      rf(`${IDENTITY}/credentials/lookup`, key, {
        method: "POST", signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjects: [seed], subjects_type: "email" }),
      }).then((r) => (r.ok ? r.json() : null)),
    );
    // RF shapes vary by contract; read defensively.
    const entries = (data && (data.identities || data.results || data.data)) || [];
    const arr = Array.isArray(entries) ? entries : [];
    if (arr.length || (data && typeof data.count === "number" && data.count > 0)) {
      const count = arr.length || data.count || 0;
      const sources = arr.map((e: any) => e?.source?.name || e?.dump?.name).filter(Boolean);
      out.push(exposureNode(seed, count, [...new Set(sources)] as string[]));
    }
  } else {
    // treat a domain-looking seed as a Connect API risk lookup
    const domain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(seed) ? seed : "";
    if (domain) {
      const data = await withTimeout((signal) =>
        rf(`${BASE}/domain/${encodeURIComponent(domain)}?fields=risk`, key, { signal }).then((r) => (r.ok ? r.json() : null)),
      );
      const risk = data?.data?.risk;
      if (risk && typeof risk.score === "number") {
        const rules = Array.isArray(risk.evidenceDetails) ? risk.evidenceDetails.map((e: any) => e.rule).filter(Boolean) : [];
        out.push(riskNode(domain, "Domain", risk.score, rules));
      }
    }
  }
  return out;
}
