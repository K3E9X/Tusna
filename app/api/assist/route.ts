import { NextRequest, NextResponse } from "next/server";
import { investigateWithLLM } from "@/lib/assist";
import { resolveLLM } from "@/lib/llmconfig";
import { readClientConfig } from "@/lib/reqconfig";
import { verifyNarrative } from "@/lib/verify";
import type { Signal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { signals, question? } (+ x-tusna-cfg header) → { configured, result, verification }
export async function POST(req: NextRequest) {
  const cfg = readClientConfig(req);
  const resolved = resolveLLM(cfg.llm);
  if (!resolved.enabled) return NextResponse.json({ configured: false });
  try {
    const body = await req.json();
    const signals = body?.signals as Signal[];
    if (!Array.isArray(signals)) return NextResponse.json({ error: "signals required" }, { status: 400 });
    const result = await investigateWithLLM(signals, body?.question, cfg.llm);
    if (!result) return NextResponse.json({ configured: true, error: "no response from the model" });
    // deterministically verify the conclusion's citations/facts against the evidence
    const verification = result.conclusion ? verifyNarrative(result.conclusion, signals) : null;
    return NextResponse.json({ configured: true, result, verification });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 500 });
  }
}
