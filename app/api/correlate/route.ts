import { NextRequest, NextResponse } from "next/server";
import { buildManualSignal, correlateManual, type ManualInput } from "@/lib/manual";
import { fetchImageBuffer, dHashFromBuffer, avatarMatch } from "@/lib/phash";
import { metaFromBuffer } from "@/lib/metadata";
import { forwardGeocode, reverseGeocode, parseCoords } from "@/lib/geo";
import type { Signal, Evidence } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/correlate  { input: ManualInput, signals: Signal[], seed?: string }
// Runs a manually-captured finding through the SAME correlation engine as automated
// collection: deterministic linking (handle / name / email / alias) PLUS async
// enrichment — avatar perceptual-hash match against existing accounts, EXIF/GPS from
// the avatar, and geocoding of a supplied location. Returns the enriched manual node,
// any extracted attribute nodes, and the id-pairs to link on the board.
export async function POST(req: NextRequest) {
  let body: { input?: ManualInput; signals?: Signal[]; seed?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }
  const input = body.input;
  const existing = Array.isArray(body.signals) ? body.signals : [];
  if (!input?.platform?.trim() || !input?.handle?.trim()) {
    return NextResponse.json({ error: "platform and handle are required" }, { status: 400 });
  }

  const collectedAt = new Date().toISOString();
  const manual = buildManualSignal(input, collectedAt, body.seed);
  const { links, addEvidence, extracted, matched } = correlateManual(manual, input, existing);
  manual.evidence.push(...addEvidence);
  let matchedCount = matched;

  // --- async enrichment: avatar pHash match + EXIF/GPS ---
  if (input.avatar?.trim()) {
    try {
      const buf = await fetchImageBuffer(input.avatar.trim());
      if (buf) {
        const [hash, meta] = await Promise.all([dHashFromBuffer(buf), metaFromBuffer(buf)]);
        if (hash) {
          // compare against existing accounts that expose an avatar (bounded)
          const targets = existing.filter((s) => s.avatarUrl && (!s.kind || s.kind === "platform")).slice(0, 14);
          const hashes = await Promise.all(targets.map(async (s) => {
            try { const b = await fetchImageBuffer(s.avatarUrl!); return b ? await dHashFromBuffer(b) : null; } catch { return null; }
          }));
          targets.forEach((s, i) => {
            const h = hashes[i];
            if (!h) return;
            const m = avatarMatch(hash, h);
            if (m.near) {
              links.push([manual.id, s.id]);
              matchedCount++;
              manual.evidence.push({
                name: m.match ? "Matching avatar" : "Near-match avatar",
                detail: `Profile photo matches ${s.platform} (pHash distance ${m.distance}/64).`,
                source: "avatar correlation · local pHash", weight: m.match ? 92 : 78,
              });
            }
          });
        }
        // GPS embedded in the manually-supplied photo → precise location node
        if (meta?.gps) {
          const coords = `${meta.gps.lat.toFixed(5)}, ${meta.gps.lon.toFixed(5)}`;
          const gid = "attr:location:" + coords.replace(/[^0-9\-]/g, "");
          const ev: Evidence[] = [{ name: "GPS from image", detail: `Coordinates ${coords} embedded in the ${manual.platform} photo — precise, not self-reported.`, source: "EXIF · exifr", weight: 88 }];
          const place = await reverseGeocode(meta.gps.lat, meta.gps.lon).catch(() => ({ lat: meta.gps!.lat, lon: meta.gps!.lon }));
          extracted.push({ id: gid, platform: "LOCATION", handle: coords, disc: "GEO", kind: "location", confidence: 74, tier: "probable", status: "review", collectedAt, place: place || { lat: meta.gps.lat, lon: meta.gps.lon }, evidence: ev });
          links.push([manual.id, gid]);
        }
      }
    } catch { /* avatar unreachable → skip, node still stands */ }
  }

  // --- location the analyst typed → geocode + map node ---
  if (input.location?.trim()) {
    const loc = input.location.trim();
    const lid = "attr:location:" + loc.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
    try {
      const coords = parseCoords(loc);
      const place = coords ? await reverseGeocode(coords.lat, coords.lon) : await forwardGeocode(loc);
      const ev: Evidence[] = [{ name: "Location (analyst)", detail: `${loc}${place?.label ? " → " + place.label : ""} — from ${manual.platform}.`, source: "manual capture · geocoded", weight: 58 }];
      extracted.push({ id: lid, platform: "LOCATION", handle: loc, disc: "GEO", kind: "location", confidence: 58, tier: "possible", status: "review", collectedAt, place: place || undefined, evidence: ev });
      links.push([manual.id, lid]);
    } catch {
      extracted.push({ id: lid, platform: "LOCATION", handle: loc, disc: "GEO", kind: "location", confidence: 55, tier: "possible", status: "review", collectedAt, evidence: [{ name: "Location (analyst)", detail: `${loc} — from ${manual.platform}.`, source: "manual capture", weight: 55 }] });
      links.push([manual.id, lid]);
    }
  }

  // dedupe links
  const seen = new Set<string>();
  const uniqLinks = links.filter(([a, b]) => { const k = a < b ? a + "|" + b : b + "|" + a; if (seen.has(k)) return false; seen.add(k); return true; });

  const summary = `${manual.platform} captured · ${matchedCount} correlation(s)` +
    (extracted.length ? ` · +${extracted.length} identifier node(s)` : "");

  return NextResponse.json({ manual, extracted, links: uniqLinks, matched: matchedCount, summary });
}
