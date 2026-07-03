// Investigation persistence — hybrid.
//  - If a Postgres/Neon URL is configured on the server (POSTGRES_URL), cases are
//    stored server-side via /api/cases (durable, multi-device).
//  - Otherwise they fall back to the browser (localStorage) — zero config, works
//    on Vercel immediately.
// Cases can also be exported/imported as JSON files, independent of storage.

import type { Signal } from "./signals";

export interface Case {
  id: string;
  name: string;
  seed: string;
  mode: string;
  savedAt: number;
  signals: Signal[];
}

const KEY = "tusna:cases:v1";
let backend: "server" | "local" | null = null;

/** Which backend is in use (null until the first listCases probe). */
export function backendMode(): "server" | "local" | null {
  return backend;
}

function readLocal(): Case[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function writeLocal(cases: Case[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(cases)); } catch { /* quota / disabled */ }
}

function newId(): string {
  return "case_" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export async function listCases(): Promise<Case[]> {
  try {
    const res = await fetch("/api/cases", { cache: "no-store" });
    const data = await res.json();
    if (res.ok && data.configured) { backend = "server"; return data.cases || []; }
  } catch { /* fall back */ }
  backend = "local";
  return readLocal().sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveCase(name: string, seed: string, caseMode: string, signals: Signal[]): Promise<Case> {
  const c: Case = { id: newId(), name: name || seed || "case", seed, mode: caseMode, savedAt: Date.now(), signals };
  if (backend !== "local") {
    try {
      const res = await fetch("/api/cases", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c),
      });
      const data = await res.json();
      if (res.ok && data.configured) { backend = "server"; return c; }
    } catch { /* fall back */ }
  }
  backend = "local";
  const cases = readLocal(); cases.push(c); writeLocal(cases);
  return c;
}

export async function removeCase(id: string): Promise<void> {
  if (backend !== "local") {
    try {
      const res = await fetch(`/api/cases?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok && data.configured) return;
    } catch { /* fall back */ }
  }
  writeLocal(readLocal().filter((c) => c.id !== id));
}

/** Serialize a case for file export. */
export function caseToJSON(c: Case): string {
  return JSON.stringify(c, null, 2);
}

/** Parse an imported case file; returns null if it isn't a valid case. */
export function parseCase(text: string): Case | null {
  try {
    const c = JSON.parse(text);
    if (c && typeof c.seed === "string" && Array.isArray(c.signals)) {
      return { id: c.id || newId(), name: c.name || c.seed, seed: c.seed, mode: c.mode || "", savedAt: c.savedAt || Date.now(), signals: c.signals };
    }
  } catch { /* invalid */ }
  return null;
}
