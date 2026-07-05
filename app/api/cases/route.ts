import { NextRequest, NextResponse } from "next/server";
import { sql, dbEnabled, ensureSchema } from "@/lib/db";
import type { Signal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CasePayload {
  id: string;
  name: string;
  seed: string;
  mode: string;
  savedAt: number;
  signals: Signal[];
}

// GET /api/cases → { configured, cases }
// GET /api/cases?history=<caseId> → { configured, snapshots:[{snapId, takenAt, signals}] }
export async function GET(req: NextRequest) {
  if (!dbEnabled) return NextResponse.json({ configured: false, cases: [] });
  const history = req.nextUrl.searchParams.get("history");
  try {
    await ensureSchema();
    const q = sql()!;
    if (history) {
      const rows = await q`SELECT snap_id, taken_at, signals FROM tusna_snapshots WHERE case_id = ${history} ORDER BY taken_at DESC LIMIT 30`;
      const snapshots = rows.map((r: any) => ({ snapId: r.snap_id, takenAt: Number(r.taken_at), signals: r.signals }));
      return NextResponse.json({ configured: true, snapshots });
    }
    const rows = await q`SELECT id, name, seed, mode, saved_at, signals FROM tusna_cases ORDER BY saved_at DESC`;
    const cases = rows.map((r: any) => ({
      id: r.id, name: r.name, seed: r.seed, mode: r.mode,
      savedAt: Number(r.saved_at), signals: r.signals,
    }));
    return NextResponse.json({ configured: true, cases });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e), cases: [] }, { status: 500 });
  }
}

// POST /api/cases  body: CasePayload → { configured, case }
export async function POST(req: NextRequest) {
  if (!dbEnabled) return NextResponse.json({ configured: false });
  try {
    const c = (await req.json()) as CasePayload;
    if (!c?.id || !Array.isArray(c.signals)) {
      return NextResponse.json({ error: "invalid case" }, { status: 400 });
    }
    await ensureSchema();
    const q = sql()!;
    const signals = JSON.stringify(c.signals);
    await q`INSERT INTO tusna_cases (id, name, seed, mode, saved_at, signals)
            VALUES (${c.id}, ${c.name}, ${c.seed}, ${c.mode}, ${c.savedAt}, ${signals}::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name, seed = EXCLUDED.seed, mode = EXCLUDED.mode,
              saved_at = EXCLUDED.saved_at, signals = EXCLUDED.signals`;
    // append an immutable snapshot for chain-of-custody history
    const snapId = `${c.id}:${c.savedAt}`;
    await q`INSERT INTO tusna_snapshots (snap_id, case_id, seed, taken_at, signals)
            VALUES (${snapId}, ${c.id}, ${c.seed}, ${c.savedAt}, ${signals}::jsonb)
            ON CONFLICT (snap_id) DO NOTHING`;
    return NextResponse.json({ configured: true, case: c });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 500 });
  }
}

// DELETE /api/cases?id=... → { configured }
export async function DELETE(req: NextRequest) {
  if (!dbEnabled) return NextResponse.json({ configured: false });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    await ensureSchema();
    const q = sql()!;
    await q`DELETE FROM tusna_cases WHERE id = ${id}`;
    return NextResponse.json({ configured: true });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 500 });
  }
}
