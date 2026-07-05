"use client";

// Map view — every location signal that resolved to coordinates (EXIF GPS, geocoded
// profile "location", GEOINFO from deep scans) plotted on a real map, PLUS a readable
// side list of all location signals (including ones that didn't geocode) so the view is
// useful even when only a few points resolve. Convergence — several independent sources
// on one spot — is called out as the area to trust. Leaflet loads lazily on the client.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Signal } from "@/lib/signals";
import { convergeLocations, type GeoPoint } from "@/lib/geo";

interface Props {
  signals: Signal[];
  onSelect: (id: string) => void;
}

export default function MapView({ signals, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  const locs = signals.filter((s) => s.kind === "location");
  const located = locs.filter((s) => s.place && typeof s.place.lat === "number");
  const unlocated = locs.filter((s) => !s.place);

  // convergence: which area do the most independent sources agree on?
  const pts: GeoPoint[] = located.map((s) => ({ id: s.id, lat: s.place!.lat, lon: s.place!.lon, label: s.place!.label, source: (s.linkedIds || [])[0] || s.id }));
  const clusters = convergeLocations(pts, 25);
  const top = clusters.find((c) => c.sources >= 2) || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      if (cancelled || !elRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, { attributionControl: true, worldCopyJump: true }).setView([20, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const layer = layerRef.current;
      layer.clearLayers();
      const latlngs: [number, number][] = [];
      for (const s of located) {
        const { lat, lon, label } = s.place!;
        latlngs.push([lat, lon]);
        const tier = s.tier || "possible";
        const color = tier === "verified" ? "#5FB49C" : tier === "probable" ? "#8FD6D0" : "#c9b458";
        const m = L.circleMarker([lat, lon], { radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.35 });
        m.bindPopup(`<b>${escapeHtml(s.platform)}</b><br/>${escapeHtml(s.handle)}` + (label ? `<br/><span style="opacity:.7">${escapeHtml(label)}</span>` : "") + `<br/><span style="opacity:.7">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>`);
        m.on("click", () => onSelectRef.current(s.id));
        layer.addLayer(m);
      }
      // emphasise the convergence area with a translucent ring
      if (top) L.circle([top.lat, top.lon], { radius: Math.max(20000, top.radiusKm * 1000), color: "#8FD6D0", weight: 1, opacity: 0.5, fillColor: "#8FD6D0", fillOpacity: 0.06 }).addTo(layer);
      if (latlngs.length) {
        try { mapRef.current.fitBounds(L.latLngBounds(latlngs).pad(0.3), { maxZoom: 12 }); } catch { /* keep world view */ }
      }
    })();
    return () => { cancelled = true; };
  }, [signals]);

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } }, []);

  return (
    <div className="mapwrap">
      <div className="map-toolbar">
        <span className="table-count">{located.length} located · {unlocated.length} unresolved</span>
        {top && <span className="map-converge">strongest area: {top.members.length} points from {top.sources} sources{top.members[0]?.label ? ` · ${String(top.members[0].label).split(",").slice(0, 2).join(",")}` : ""}</span>}
      </div>
      <div className="map-body">
        <div className="map-side">
          {locs.length === 0 && <div className="map-empty">No location yet. Locations come from a profile&apos;s location field, EXIF GPS (Image metadata), or a deep scan. Geocoding needs outbound network (works in production).</div>}
          {located.map((s) => (
            <button className="map-item" key={s.id} onClick={() => onSelectRef.current(s.id)}>
              <span className={"map-dot t-" + (s.tier || "possible")} />
              <span className="map-item-main">
                <b>{s.handle}</b>
                <span>{s.place!.label || `${s.place!.lat.toFixed(3)}, ${s.place!.lon.toFixed(3)}`}</span>
              </span>
              <span className="map-item-src">{s.platform}</span>
            </button>
          ))}
          {unlocated.length > 0 && <div className="map-sub">not geocoded</div>}
          {unlocated.map((s) => (
            <button className="map-item dim" key={s.id} onClick={() => onSelectRef.current(s.id)}>
              <span className="map-dot" />
              <span className="map-item-main"><b>{s.handle}</b><span>could not resolve to coordinates</span></span>
              <span className="map-item-src">{s.platform}</span>
            </button>
          ))}
        </div>
        <div ref={elRef} className="map-canvas" />
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
