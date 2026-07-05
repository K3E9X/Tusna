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
      // append-only history: every save appends an immutable snapshot, so an
      // investigation has a chain of custody (what was seen, and when).
      await q`CREATE TABLE IF NOT EXISTS tusna_snapshots (
        snap_id   text PRIMARY KEY,
        case_id   text NOT NULL,
        seed      text,
        taken_at  bigint NOT NULL,
        signals   jsonb NOT NULL
      )`;
      await q`CREATE INDEX IF NOT EXISTS tusna_snap_case ON tusna_snapshots (case_id, taken_at DESC)`;
      // analyst decisions (confirm/reject) per seed — the feedback loop
      await q`CREATE TABLE IF NOT EXISTS tusna_decisions (
        seed       text NOT NULL,
        node_id    text NOT NULL,
        status     text NOT NULL,
        updated_at bigint NOT NULL,
        PRIMARY KEY (seed, node_id)
      )`;
    })();
  }
  await _ready;
}
