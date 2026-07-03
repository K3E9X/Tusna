// Optional Postgres (Neon) persistence. Activates only when a connection string
// is present in the environment; otherwise the app falls back to localStorage.
// Set POSTGRES_URL (or DATABASE_URL / NEON_DATABASE_URL) as a Vercel env var to enable.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

const URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  "";

export const dbEnabled = URL.length > 0;

let _sql: NeonQueryFunction<false, false> | null = null;
let _ready: Promise<void> | null = null;

export function sql(): NeonQueryFunction<false, false> | null {
  if (!dbEnabled) return null;
  if (!_sql) _sql = neon(URL);
  return _sql;
}

/** Create the cases table once per cold start. */
export async function ensureSchema(): Promise<void> {
  const q = sql();
  if (!q) return;
  if (!_ready) {
    _ready = (async () => {
      await q`CREATE TABLE IF NOT EXISTS tusna_cases (
        id        text PRIMARY KEY,
        name      text NOT NULL,
        seed      text,
        mode      text,
        saved_at  bigint NOT NULL,
        signals   jsonb NOT NULL
      )`;
    })();
  }
  await _ready;
}
