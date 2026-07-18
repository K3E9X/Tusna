// Geospatial — turn scattered location signals into a coherent geography.
//  - reverse geocode GPS coords → a human place label (Nominatim, keyless, ToS-ok)
//  - forward geocode a free-text place → coords, so profile "location" fields land
//    on the map alongside EXIF GPS
//  - CONVERGENCE: cluster location points by proximity; several independent sources
//    pointing at the same area is a strong, honest signal (stronger than any one).
//
// All network calls degrade gracefully (null on failure) — the sandbox blocks them,
// production (Vercel) allows them. Nominatim asks for a real UA + light usage.

import type { GeoPlace } from "./signals";

const UA = "Octopus-OSINT/0.1 (+https://github.com/K3E9X/Tusna)";
const NOMINATIM = "https://nominatim.openstreetmap.org";

async function getJSON(url: string, timeoutMs = 6000): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Coords → place label. Returns the input coords with a label added, or null. */
export async function reverseGeocode(lat: number, lon: number): Promise<GeoPlace | null> {
  const d = await getJSON(`${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=0`);
  if (!d?.display_name) return { lat, lon }; // still a valid point, just unlabeled
  return { lat, lon, label: String(d.display_name) };
}

/** Free-text place → coords. Null when nothing resolves (or offline). */
export async function forwardGeocode(place: string): Promise<GeoPlace | null> {
  const q = place.trim();
  if (q.length < 2) return null;
  const arr = await getJSON(`${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
  const d = Array.isArray(arr) ? arr[0] : null;
  if (!d?.lat || !d?.lon) return null;
  return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), label: d.display_name ? String(d.display_name) : q };
}

/** Parse a "lat, lon" string into coords, if it is one. */
export function parseCoords(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Haversine distance in km between two points. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeoPoint { id: string; lat: number; lon: number; label?: string; source: string; }
export interface GeoCluster {
  lat: number; lon: number;
  members: GeoPoint[];
  /** distinct sources agreeing — the crux of convergence */
  sources: number;
  radiusKm: number;
}

/**
 * Cluster location points that fall within `radiusKm` of each other (single-link).
 * A cluster fed by several DISTINCT sources is the strong signal — that convergence
 * is what a human should trust, not any lone coordinate.
 */
export function convergeLocations(points: GeoPoint[], radiusKm = 25): GeoCluster[] {
  const clusters: GeoCluster[] = [];
  for (const p of points) {
    let placed = false;
    for (const c of clusters) {
      if (distanceKm(c, p) <= radiusKm) {
        c.members.push(p);
        // recompute centroid
        c.lat = c.members.reduce((s, m) => s + m.lat, 0) / c.members.length;
        c.lon = c.members.reduce((s, m) => s + m.lon, 0) / c.members.length;
        c.sources = new Set(c.members.map((m) => m.source)).size;
        c.radiusKm = Math.max(...c.members.map((m) => distanceKm(c, m)));
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ lat: p.lat, lon: p.lon, members: [p], sources: 1, radiusKm: 0 });
  }
  // strongest convergence first (most agreeing sources, then most points)
  return clusters.sort((a, b) => b.sources - a.sources || b.members.length - a.members.length);
}
