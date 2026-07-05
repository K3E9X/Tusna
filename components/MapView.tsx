"use client";

// Map view — every location signal that resolved to coordinates (EXIF GPS, geocoded
// profile "location", GEOINFO from deep scans) plotted on a real map. Convergence —
// several independent sources on one spot — is what an analyst trusts, so the map is
// where that becomes visible. Leaflet loads lazily on the client (never SSR); markers
// are vector circles (no external icon assets), tiles come from OSM at runtime.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Signal } from "@/lib/signals";

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

  const located = signals.filter((s) => s.place && typeof s.place.lat === "number");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      if (cancelled || !elRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, { attributionControl: true, worldCopyJump: true }).setView([20, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const layer = layerRef.current;
      layer.clearLayers();
      const pts = signals.filter((s) => s.place && typeof s.place.lat === "number");
      const latlngs: [number, number][] = [];
      for (const s of pts) {
        const { lat, lon, label } = s.place!;
        latlngs.push([lat, lon]);
        const tier = s.tier || "possible";
        const color = tier === "verified" ? "#5FB49C" : tier === "probable" ? "#8FD6D0" : "#c9b458";
        const m = L.circleMarker([lat, lon], {
          radius: 8, color, weight: 2, fillColor: color, fillOpacity: 0.35,
        });
        m.bindPopup(
          `<b>${escapeHtml(s.platform)}</b><br/>${escapeHtml(s.handle)}` +
          (label ? `<br/><span style="opacity:.7">${escapeHtml(label)}</span>` : "") +
          `<br/><span style="opacity:.7">${lat.toFixed(4)}, ${lon.toFixed(4)}</span>`,
        );
        m.on("click", () => onSelectRef.current(s.id));
        layer.addLayer(m);
      }
      if (latlngs.length) {
        try {
          const b = L.latLngBounds(latlngs);
          mapRef.current.fitBounds(b.pad(0.3), { maxZoom: 12 });
        } catch { /* single point / bad bounds → keep world view */ }
      }
    })();
    return () => { cancelled = true; };
  }, [signals]);

  useEffect(() => {
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  return (
    <div className="mapwrap">
      <div className="map-toolbar">
        <span className="table-count">{located.length} located node(s)</span>
        {located.length === 0 && <span className="map-hint">no coordinates yet — scan a profile with a location, or run ⌖ IMG on a photo with GPS</span>}
      </div>
      <div ref={elRef} className="map-canvas" />
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
