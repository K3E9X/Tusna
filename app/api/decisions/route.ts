import { NextRequest, NextResponse } from "next/server";
import { sql, dbEnabled, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/decisions?seed=<seed> → { configured, decisions: { nodeId: status } }
export async function GET(req: NextRequest) {
  if (!dbEnabled) return NextResponse.json({ configured: false, decisions: {} });
  const seed = (req.nextUrl.searchParams.get("seed") || "").trim().toLowerCase();
  if (!seed) return NextResponse.json({ configured: true, decisions: {} });
  try {
    await ensureSchema();
    const q = sql()!;
    const rows = await q`SELECT node_id, status FROM octopus_decisions WHERE seed = ${seed}`;
    const decisions: Record<string, string> = {};
    for (const r of rows as any[]) decisions[r.node_id] = r.status;
    return NextResponse.json({ configured: true, decisions });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), decisions: {} }, { status: 500 });
  }
}

// POST /api/decisions  { seed, nodeId, status } → { configured }
export async function POST(req: NextRequest) {
  if (!dbEnabled) return NextResponse.json({ configured: false });
  try {
    const { seed, nodeId, status } = await req.json();
    if (!seed || !nodeId || !status) return NextResponse.json({ error: "seed, nodeId, status required" }, { status: 400 });
    await ensureSchema();
    const q = sql()!;
    await q`INSERT INTO octopus_decisions (seed, node_id, status, updated_at)
            VALUES (${String(seed).toLowerCase()}, ${nodeId}, ${status}, ${Date.now()})
            ON CONFLICT (seed, node_id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`;
    return NextResponse.json({ configured: true });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 500 });
  }
}
