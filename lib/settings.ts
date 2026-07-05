// Client-side settings — API keys the analyst enters in the API panel, stored in the
// browser (localStorage) and sent to the server per request via the `x-tusna-cfg`
// header. Keys stay on the analyst's machine; nothing is persisted server-side. This
// lets a self-hosted deploy configure everything from the UI, no redeploy, while env
// vars still work in production.

export interface TusnaSettings {
  intelx?: string;
  intelxUrl?: string;
  recordedfuture?: string;
  collectorUrl?: string;
  collectorToken?: string;
  llmUrl?: string;
  llmModel?: string;
  llmKey?: string;
  llmWeb?: boolean;
}

const KEY = "tusna:settings:v1";

export function loadSettings(): TusnaSettings {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function saveSettings(s: TusnaSettings): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

/** Server-shaped config object (matches lib/reqconfig.ClientConfig). */
export function toClientConfig(s: TusnaSettings) {
  return {
    intelx: s.intelx || undefined,
    intelxUrl: s.intelxUrl || undefined,
    recordedfuture: s.recordedfuture || undefined,
    collectorUrl: s.collectorUrl || undefined,
    collectorToken: s.collectorToken || undefined,
    llm: (s.llmUrl || s.llmModel || s.llmKey) ? { url: s.llmUrl, model: s.llmModel, key: s.llmKey, web: s.llmWeb } : undefined,
  };
}

function b64(str: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(str)));
  return Buffer.from(str, "utf8").toString("base64");
}

/** Headers to attach to any fetch that should honour the analyst's saved keys. */
export function cfgHeaders(): Record<string, string> {
  const cfg = toClientConfig(loadSettings());
  try { return { "x-tusna-cfg": b64(JSON.stringify(cfg)) }; } catch { return {}; }
}

/** True if the LLM is configured in the UI (base URL + model at minimum). */
export function llmConfiguredLocally(s: TusnaSettings): boolean {
  return !!(s.llmUrl && s.llmModel);
}
