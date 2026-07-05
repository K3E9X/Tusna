// LLM configuration + call layer, shared by synthesis, the investigative assistant,
// and the ping test. Provider-agnostic (OpenAI-compatible /chat/completions). Config
// resolves from a per-request override (keys entered in the API panel) first, then
// environment variables — so the app works whether keys live in the UI or in env.

export interface LLMConfig {
  url: string;
  model: string;
  key: string;
  /** enable web search where the provider supports it (OpenRouter :online) */
  web?: boolean;
}

export interface ResolvedLLM extends LLMConfig {
  enabled: boolean;
}

export function resolveLLM(override?: Partial<LLMConfig>): ResolvedLLM {
  const url = (override?.url || process.env.LLM_API_URL || "").replace(/\/$/, "");
  const model = override?.model || process.env.LLM_MODEL || "";
  const key = override?.key || process.env.LLM_API_KEY || "";
  const web = override?.web ?? false;
  return { url, model, key, web, enabled: url.length > 0 && model.length > 0 };
}

/** OpenRouter enables web search by suffixing the model with ":online". */
function effectiveModel(cfg: ResolvedLLM): string {
  if (cfg.web && /openrouter\.ai/i.test(cfg.url) && !/:online$/.test(cfg.model)) return cfg.model + ":online";
  return cfg.model;
}

export interface ChatOpts { temperature?: number; maxTokens?: number; json?: boolean; timeoutMs?: number; }

/** One chat completion. Returns the assistant text, or null on any failure. */
export async function llmChat(cfg: ResolvedLLM, messages: { role: string; content: string }[], opts: ChatOpts = {}): Promise<string | null> {
  if (!cfg.enabled) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
  try {
    const body: any = {
      model: effectiveModel(cfg),
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 900,
      messages,
    };
    if (opts.json) body.response_format = { type: "json_object" };
    const res = await fetch(cfg.url + "/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        ...(cfg.key ? { Authorization: "Bearer " + cfg.key } : {}),
        // OpenRouter asks for these; harmless elsewhere
        "HTTP-Referer": "https://github.com/K3E9X/Tusna",
        "X-Title": "Tusna OSINT",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Presets for free / low-cost OpenAI-compatible providers (user pastes their key). */
export interface LLMPreset { id: string; label: string; url: string; model: string; note: string; web: boolean; }
export const LLM_PRESETS: LLMPreset[] = [
  { id: "openrouter", label: "OpenRouter (free models)", url: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat-v3.1:free", note: "Free tier; many :free models. Web search via :online.", web: true },
  { id: "openrouter-qwen", label: "OpenRouter · Qwen (free)", url: "https://openrouter.ai/api/v1", model: "qwen/qwen3-8b:free", note: "Qwen free model on OpenRouter.", web: true },
  { id: "zai", label: "z.ai · GLM-4-Flash (free)", url: "https://api.z.ai/api/paas/v4", model: "glm-4-flash", note: "Zhipu GLM, free flash model, OpenAI-compatible.", web: false },
  { id: "qwen", label: "Qwen · DashScope", url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo", note: "Alibaba DashScope (intl), OpenAI-compatible.", web: false },
  { id: "groq", label: "Groq (fast, free tier)", url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", note: "Very fast; generous free tier.", web: false },
  { id: "ollama", label: "Ollama (local, no key)", url: "http://localhost:11434/v1", model: "llama3.1", note: "Runs on your machine; no key, fully private.", web: false },
];
