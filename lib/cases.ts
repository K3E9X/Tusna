// Investigation persistence — client-side (localStorage). No backend required,
// works on Vercel out of the box. Server-side / multi-device persistence would
// use a hosted DB (Vercel Postgres / Neon) via an env var — a later step.

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

function read(): Case[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(cases: Case[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(cases)); } catch { /* quota / disabled */ }
}

export function listCases(): Case[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveCase(name: string, seed: string, mode: string, signals: Signal[]): Case {
  const cases = read();
  const c: Case = {
    id: "case_" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: name || seed || "case",
    seed, mode, savedAt: Date.now(), signals,
  };
  cases.push(c);
  write(cases);
  return c;
}

export function removeCase(id: string): void {
  write(read().filter((c) => c.id !== id));
}

export function loadCase(id: string): Case | null {
  return read().find((c) => c.id === id) || null;
}
