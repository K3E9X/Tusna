import { NextRequest, NextResponse } from "next/server";
import { buildDossier } from "@/lib/dossier";
import { synthesize, llmEnabled } from "@/lib/llm";
import { verifyNarrative } from "@/lib/verify";
import type { Signal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { signals: Signal[] } → { configured, narrative }
export async function POST(req: NextRequest) {
  if (!llmEnabled) return NextResponse.json({ configured: false });
  try {
    const body = await req.json();
    const signals = body?.signals as Signal[];
    if (!Array.isArray(signals)) return NextResponse.json({ error: "signals required" }, { status: 400 });
    const dossier = buildDossier(signals);
    const evidence = signals.flatMap((s) =>
      (s.evidence || []).map((e) => `[${s.platform}] ${e.name}: ${e.detail} (${e.source})`),
    );
    const narrative = await synthesize(dossier, evidence);
    const verification = narrative ? verifyNarrative(narrative, signals) : null;
    return NextResponse.json({ configured: true, narrative, verification });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 500 });
  }
}
