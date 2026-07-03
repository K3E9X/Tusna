// Installed/enabled apps — persisted in the browser (localStorage).
// Built-in connectors are enabled by default; manual pivots start off until "added".

import { BUILTIN_IDS } from "./registry";

const KEY = "tusna:apps:v1";

export function loadEnabled(): Set<string> {
  const def = new Set(BUILTIN_IDS); // all built-ins on by default
  if (typeof window === "undefined") return def;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return def;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr);
  } catch { /* fall back */ }
  return def;
}

export function saveEnabled(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* quota / disabled */ }
}
