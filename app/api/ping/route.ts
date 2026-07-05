import { NextRequest, NextResponse } from "next/server";
import { resolveLLM, llmChat } from "@/lib/llmconfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Tusna-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";

async function withTimeout(fn: (s: AbortSignal) => Promise<Response>, ms = 12000): Promise<Response | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fn(c.signal); } catch { return null; } finally { clearTimeout(t); }
}

// POST { service, cfg } → { ok, detail }
// A real connectivity/auth test ("ping/pong") for each configured tool.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, detail: "bad request" }, { status: 400 }); }
  const service = String(body?.service || "");
  const cfg = body?.cfg || {};

  try {
    if (service === "llm") {
      const r = resolveLLM(cfg.llm);
      if (!r.enabled) return NextResponse.json({ ok: false, detail: "set base URL + model first" });
      const out = await llmChat(r, [{ role: "user", content: "Reply with the single word: pong" }], { maxTokens: 5, temperature: 0, timeoutMs: 20000 });
      if (out == null) return NextResponse.json({ ok: false, detail: "no response (check URL / key / model)" });
      return NextResponse.json({ ok: true, detail: `model replied: "${out.slice(0, 40)}"` });
    }

    if (service === "intelx") {
      const key = cfg.intelx || "";
      const base = (cfg.intelxUrl || "https://2.intelx.io").replace(/\/$/, "");
      if (!key) return NextResponse.json({ ok: false, detail: "enter an IntelX key" });
      const r = await withTimeout((s) => fetch(base + "/authenticate/info", { headers: { "x-key": key, "User-Agent": UA }, signal: s, cache: "no-store" }));
      if (!r) return NextResponse.json({ ok: false, detail: "unreachable" });
      return NextResponse.json({ ok: r.ok, detail: r.ok ? "authenticated" : `HTTP ${r.status} (key rejected?)` });
    }

    if (service === "recordedfuture") {
      const key = cfg.recordedfuture || "";
      if (!key) return NextResponse.json({ ok: false, detail: "enter a Recorded Future key" });
      const r = await withTimeout((s) => fetch("https://api.recordedfuture.com/v2/info/whoami", { headers: { "X-RFToken": key, "User-Agent": UA }, signal: s, cache: "no-store" }));
      if (!r) return NextResponse.json({ ok: false, detail: "unreachable" });
      return NextResponse.json({ ok: r.ok, detail: r.ok ? "authenticated" : `HTTP ${r.status} (key/entitlement?)` });
    }

    if (service === "collector") {
      const url = (cfg.collectorUrl || "").replace(/\/$/, "");
      if (!url) return NextResponse.json({ ok: false, detail: "enter the collector URL" });
      const tok = cfg.collectorToken ? `?token=${encodeURIComponent(cfg.collectorToken)}` : "";
      const r = await withTimeout((s) => fetch(`${url}/health${tok}`, { signal: s, cache: "no-store" }), 15000);
      if (!r) return NextResponse.json({ ok: false, detail: "unreachable (cold start? retry)" });
      return NextResponse.json({ ok: r.ok, detail: r.ok ? "worker healthy" : `HTTP ${r.status}` });
    }

    if (service === "hudsonrock") {
      // free, no key — just confirm the API answers
      const r = await withTimeout((s) => fetch("https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-username?username=test", { headers: { "User-Agent": UA }, signal: s, cache: "no-store" }));
      if (!r) return NextResponse.json({ ok: false, detail: "unreachable" });
      return NextResponse.json({ ok: r.ok, detail: r.ok ? "reachable (free, no key)" : `HTTP ${r.status}` });
    }

    return NextResponse.json({ ok: false, detail: "unknown service" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, detail: String(e) }, { status: 500 });
  }
}
