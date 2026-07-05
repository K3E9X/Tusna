// LLM investigative assistant — the model as a lead analyst, NOT an oracle. Given the
// current graph, it produces a grounded assessment: a factual conclusion, the most
// valuable next pivots, suspected false positives (with reasoning), and uncertainties.
// It may ONLY reference identifiers present in the evidence; every claim is cited and
// then verified deterministically against the evidence. The analyst decides — the
// assistant proposes and coordinates. This is where the LLM helps with correlation,
// false-positive triage, and drawing conclusions without inventing facts.

import type { Signal } from "./signals";
import { resolveLLM, llmChat, type LLMConfig } from "./llmconfig";
import { scoreEvidence } from "./scoring";

export interface AssistResult {
  conclusion: string;
  pivots: { query: string; why: string }[];
  falsePositives: { node: string; why: string }[];
  uncertainties: string[];
  confidence: "low" | "medium" | "high" | string;
  raw?: string;
}

const SYSTEM = [
  "You are a lead OSINT analyst coordinating an investigation. You are given the CURRENT GRAPH of a subject (accounts, identifiers, relations, evidence).",
  "Your job: correlate what is there, decide what to chase next, flag likely false positives, and draw a careful conclusion. You COORDINATE; the human analyst decides.",
  "STRICT RULES:",
  "- Use ONLY the identifiers, names, accounts and facts present in the input. NEVER invent an account, email, name, location or link.",
  "- Cite the source of every factual claim in brackets, e.g. [GITHUB], [entity extraction], [face recognition].",
  "- Bias toward doubt. A shared username or name alone is weak (many people collide). Call weak links weak.",
  "- If web search is available and used, cite those findings as [web] and treat them as leads to verify, not facts.",
  "Return STRICT JSON only, matching this shape:",
  '{ "conclusion": string, "pivots": [{"query": string, "why": string}], "falsePositives": [{"node": string, "why": string}], "uncertainties": [string], "confidence": "low"|"medium"|"high" }',
  "- pivots: the 2-5 MOST valuable next identifiers to search (a username, email, or name already visible in the graph). Explain why each advances the case.",
  "- falsePositives: nodes (by their handle) that look weakly tied or contradictory and should probably be rejected, with the reason.",
  "- conclusion: 3-6 sentences. State what is established vs. not established. Prefer 'not established' over guessing.",
].join("\n");

/** Compact, grounded description of the graph for the model. */
function contextFrom(signals: Signal[]): string {
  const tier = (s: Signal) => s.tier || scoreEvidence(s.evidence).tier;
  const lines = signals.slice(0, 48).map((s) => {
    const ev = (s.evidence || []).slice(0, 4).map((e) => `${e.name}: ${e.detail} [${s.platform}·${e.source}]`).join(" | ");
    const rel = s.relations?.length ? ` relations=${s.relations.slice(0, 5).map((r) => r.kind + "->" + r.to).join(",")}` : "";
    return `- (${s.kind || "platform"}, tier=${tier(s)}, status=${s.status}) ${s.platform} :: ${s.handle}${s.displayName ? ` ["${s.displayName}"]` : ""}${rel} :: ${ev}`;
  });
  return lines.join("\n");
}

export function parseAssist(raw: string): AssistResult {
  const base: AssistResult = { conclusion: "", pivots: [], falsePositives: [], uncertainties: [], confidence: "low", raw };
  let obj: any = null;
  try { obj = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch { /* keep null */ } }
  }
  if (!obj || typeof obj !== "object") return { ...base, conclusion: raw.slice(0, 1200) };
  return {
    conclusion: String(obj.conclusion || "").trim(),
    pivots: Array.isArray(obj.pivots) ? obj.pivots.filter((p: any) => p?.query).map((p: any) => ({ query: String(p.query), why: String(p.why || "") })).slice(0, 6) : [],
    falsePositives: Array.isArray(obj.falsePositives) ? obj.falsePositives.filter((p: any) => p?.node).map((p: any) => ({ node: String(p.node), why: String(p.why || "") })).slice(0, 8) : [],
    uncertainties: Array.isArray(obj.uncertainties) ? obj.uncertainties.map((u: any) => String(u)).slice(0, 8) : [],
    confidence: ["low", "medium", "high"].includes(obj.confidence) ? obj.confidence : "low",
    raw,
  };
}

export async function investigateWithLLM(signals: Signal[], question: string | undefined, override?: Partial<LLMConfig>): Promise<AssistResult | null> {
  const cfg = resolveLLM(override);
  if (!cfg.enabled) return null;
  const user = [
    question ? `ANALYST QUESTION: ${question}\n` : "",
    "CURRENT GRAPH:",
    contextFrom(signals),
    cfg.web ? "\n(Web search is available — you MAY look up public records / people-search / tools we cannot query directly. Cite as [web].)" : "",
  ].join("\n");
  const out = await llmChat(cfg, [{ role: "system", content: SYSTEM }, { role: "user", content: user }], { temperature: 0.2, maxTokens: 1100, json: true, timeoutMs: 60000 });
  if (out == null) return null;
  return parseAssist(out);
}
