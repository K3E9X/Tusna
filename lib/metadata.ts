// Image metadata extraction — the maximum an image gives up: GPS, camera, lens,
// software, capture date, author/copyright (EXIF + IPTC + XMP), via exifr (pure JS).
// Social platforms usually strip this, but when it survives (Gravatar, personal
// sites, forums, a photo found elsewhere) the GPS + device + timestamp are gold.

import exifr from "exifr";

export interface ImageMeta {
  gps?: { lat: number; lon: number };
  make?: string;
  model?: string;
  software?: string;
  lens?: string;
  dateTaken?: string;
  artist?: string;
  copyright?: string;
  width?: number;
  height?: number;
  orientation?: number;
}

export async function metaFromBuffer(buf: Uint8Array): Promise<ImageMeta | null> {
  try {
    const opts: any = { ifd0: true, exif: true, gps: true, iptc: true, xmp: true };
    const p: any = await exifr.parse(buf, opts);
    if (!p) return null;
    const m: ImageMeta = {};
    if (typeof p.latitude === "number" && typeof p.longitude === "number") m.gps = { lat: p.latitude, lon: p.longitude };
    if (p.Make) m.make = String(p.Make).trim();
    if (p.Model) m.model = String(p.Model).trim();
    if (p.Software) m.software = String(p.Software).trim();
    if (p.LensModel) m.lens = String(p.LensModel).trim();
    const dt = p.DateTimeOriginal || p.CreateDate || p.ModifyDate;
    if (dt) { try { m.dateTaken = new Date(dt).toISOString().slice(0, 19).replace("T", " "); } catch { /* skip */ } }
    if (p.Artist) m.artist = String(p.Artist).trim();
    if (p.Copyright) m.copyright = String(p.Copyright).trim();
    if (p.ExifImageWidth) m.width = p.ExifImageWidth;
    if (p.ExifImageHeight) m.height = p.ExifImageHeight;
    if (p.Orientation && typeof p.Orientation === "number") m.orientation = p.Orientation;
    // nothing meaningful → treat as no metadata
    if (!m.gps && !m.make && !m.model && !m.software && !m.dateTaken && !m.artist && !m.copyright) return null;
    return m;
  } catch {
    return null;
  }
}

export async function metaFromUrl(url: string, timeoutMs = 6000): Promise<ImageMeta | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": "Octopus-OSINT/0.1" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return await metaFromBuffer(buf);
  } catch {
    return null;
  }
}

export function metaEvidence(m: ImageMeta): { name: string; detail: string; source: string; weight: number }[] {
  const ev: { name: string; detail: string; source: string; weight: number }[] = [];
  if (m.gps) ev.push({ name: "GPS in image", detail: `${m.gps.lat.toFixed(5)}, ${m.gps.lon.toFixed(5)} — embedded in the photo`, source: "EXIF · exifr", weight: 88 });
  const cam = [m.make, m.model].filter(Boolean).join(" ");
  if (cam) ev.push({ name: "Camera", detail: cam + (m.lens ? " · " + m.lens : ""), source: "EXIF", weight: 50 });
  if (m.software) ev.push({ name: "Software", detail: m.software, source: "EXIF", weight: 40 });
  if (m.dateTaken) ev.push({ name: "Photo taken", detail: m.dateTaken, source: "EXIF", weight: 45 });
  if (m.artist || m.copyright) ev.push({ name: "Author / copyright", detail: [m.artist, m.copyright].filter(Boolean).join(" · "), source: "EXIF / IPTC", weight: 55 });
  return ev;
}
