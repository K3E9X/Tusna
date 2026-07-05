import { NextRequest, NextResponse } from "next/server";
import { metaFromUrl, metaEvidence } from "@/lib/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/metadata?url=<image-url>
// On-demand image forensics: pull the MAXIMUM metadata (EXIF/GPS/IPTC/XMP) out of any
// image — an avatar, a photo found elsewhere, an image from a personal site. Social
// platforms strip it, but when it survives the GPS + camera + timestamp are decisive.
export async function GET(req: NextRequest) {
  const url = (req.nextUrl.searchParams.get("url") || "").trim();
  if (!url || !/^https?:\/\//i.test(url) || url.length > 2048) {
    return NextResponse.json({ error: "a valid http(s) image url is required" }, { status: 400 });
  }
  try {
    const meta = await metaFromUrl(url);
    if (!meta) return NextResponse.json({ url, found: false, meta: null, evidence: [] });
    return NextResponse.json({ url, found: true, meta, evidence: metaEvidence(meta) });
  } catch (e) {
    return NextResponse.json({ error: "metadata extraction failed", detail: String(e) }, { status: 500 });
  }
}
