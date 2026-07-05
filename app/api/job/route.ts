import { NextRequest, NextResponse } from "next/server";
import { startJob, pollJob, normalizeJob, jobsEnabled, type JobType } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/job  { type, target } → { configured, jobId }
export async function POST(req: NextRequest) {
  if (!jobsEnabled) return NextResponse.json({ configured: false });
  try {
    const { type, target } = await req.json();
    if (!type || !target || !["maigret", "holehe", "spiderfoot"].includes(type)) {
      return NextResponse.json({ error: "type (maigret|holehe|spiderfoot) and target required" }, { status: 400 });
    }
    const jobId = await startJob(type as JobType, String(target));
    if (!jobId) return NextResponse.json({ configured: true, error: "worker did not start the job" }, { status: 502 });
    return NextResponse.json({ configured: true, jobId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/job?id=&target= → { status, elapsed, signals? }
export async function GET(req: NextRequest) {
  if (!jobsEnabled) return NextResponse.json({ configured: false });
  const id = req.nextUrl.searchParams.get("id");
  const target = req.nextUrl.searchParams.get("target") || "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const state = await pollJob(id);
  if (!state) return NextResponse.json({ status: "error", error: "worker unreachable" });
  if (state.status === "done") {
    const signals = normalizeJob(state.type, state.result, target);
    return NextResponse.json({ status: "done", elapsed: state.elapsed, count: signals.length, signals });
  }
  return NextResponse.json({ status: state.status, elapsed: state.elapsed, error: state.error });
}
