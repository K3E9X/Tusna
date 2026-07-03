# Tusna

**OSINT identity aggregation & correlation platform.**
Tusna is not a script launcher: it's a hub that merges, deduplicates, links and **scores** what dozens of OSINT tools produce, in a fast, auditable experience.

The signature view is **Orbit**: identity correlation shown as a **gravitational system**. The seed (a username, an email, a person) sits at the center; every presence found on the net is a body in orbit; **the matching engine's confidence = the pull of gravity**. Strong evidence → tight orbit (the "confirmed self"); weak or contradicted evidence → drift into the cold. Spring physics: everything glides, nothing is frozen.

> Status: interface prototype with a live scan backend. Full ingestion, matching engine, and persistence are described in [`docs/architecture.md`](docs/architecture.md) and land in stages.

## Run locally

```bash
npm install
npm run dev
# http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

## Deploy on Vercel (free)

Standard Next.js app, zero-config deploy.

1. Push this repo to GitHub (already done: `K3E9X/Tusna`).
2. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
3. **Import** the `K3E9X/Tusna` repo (pick the working branch if not merged to `main`).
4. Vercel auto-detects Next.js — nothing to change (build `next build`, output `.next`).
5. **Deploy**. Preview URL is ready in ~1 min; every push redeploys.

No environment variables are required yet. Connector API keys (Shodan, HIBP, etc.) will be added as Vercel env vars when those paid sources are wired — never committed.

## Structure

```
app/            # Next.js App Router (layout, page, global styles)
  api/scan/     # server route: live scan + sourced scoring
components/     # OrbitBoard.tsx — the Orbit view (canvas + spring physics)
lib/            # signals.ts (typed model) · connectors.ts (13 public APIs)
                # wmn.ts (WhatsMyName) · phash.ts (avatar hashing)
                # email.ts (email→accounts) · cases.ts (local persistence)
docs/           # architecture, osint-tools-research, llm-correlation (FR)
```

## Live connectors (real scan)

The **seed** accepts a **username or an email**.

**Username mode** — **SCAN** queries **13 official public APIs** in parallel (no key, no scraping, ToS-respecting): GitHub, GitLab, Reddit, Hacker News, **Keybase**, **Gravatar**, Bluesky, Mastodon, Chess.com, Codeforces, npm, Docker Hub, Wikipedia. Keybase and Gravatar also surface **declared linked accounts** (verified cross-links) — a strong correlation signal.

**Email mode** — `email → accounts`, no key: (1) **Gravatar by hash** (MD5/SHA256) → verified profile + declared linked accounts (the anchor); (2) a **handle derived** from the local-part (gmail dot/tag normalization) re-run across every source, flagged **"derived (inference)"** and scored lower — the link to the person still needs confirming; (3) **MX validation** of the domain.

**Broad layer — WhatsMyName.** On top of the 13 APIs, the scan queries the **official WhatsMyName dataset** (600+ sites, loaded at runtime from the maintained repo). These presences are detected by **URL pattern**: they are explicitly flagged **"unverified"**, scored low and placed in cold orbit — the human confirms. This broadens coverage **without manufacturing false positives**. Sites checked per scan are capped (`?depth=`, default 100, to fit a serverless function's time limit) and the response exposes `coverage.capped` — **never a silent truncation**.

**Linking by photo — pHash.** Avatars of the presences found are hashed (perceptual dHash, local) and compared pairwise: two accounts whose photos match (low Hamming distance) are linked by a strong "Matching/near-match avatar" evidence. This is **deterministic and verifiable** — so no hallucination — and links accounts even when usernames differ. No external facial service: we compare images, not faces (no biometric exposure).

**Linked-account web.** Declared/verified links (Keybase proofs, Gravatar accounts) are expanded into **connected nodes** and drawn as **inter-node edges** — the board shows who is linked to whom, not just each body to the seed.

Deliberately **excluded** from automated connectors: Instagram, X/Twitter, Facebook, LinkedIn, TikTok (closed APIs / restrictive ToS) — those belong to the **manual pivots** catalogue (cipher387), not automation.

## Persistence

Investigations can be **saved and reloaded** (SAVE / CASES in the top bar), stored in the browser (`localStorage`) — no backend, works on Vercel immediately. Server-side / multi-device persistence would use a hosted DB (Vercel Postgres / Neon) via an env var — a later step.

## Art direction

Purist, minimal, spare. A void, hairline rings, monospace as the hero face (a scientific instrument), **a single accent** (desaturated cyan). Confidence is encoded by **distance and brightness**, not loud colors. Negative space is part of the design.

## LLM correlation — no hallucination

The LLM **assists, it does not decide, and it never invents**. The correlation score aggregates only **evidence tied to a verifiable source** (avatar pHash, observed cross-link, PGP key, commit email…). Every evidence item carries its provenance and weight. No unsourced assertion is produced. The human decides (confirm / review / reject) — never a silent automatic merge on a person. Details in [`docs/llm-correlation.md`](docs/llm-correlation.md).

## Roadmap (summary)

1. **Done** — Orbit view, live username/email scan (13 APIs + WhatsMyName + pHash + linked-account web), local persistence, reference architecture, tools research.
2. Server-side persistence (hosted DB) + shared investigations.
3. Matching engine hardening (Splink + embeddings) + triage queue.
4. Grounded LLM layer (extraction, tie-break, summary).
5. Auth, audit, GDPR compliance, multi-tenant.

See [`docs/architecture.md`](docs/architecture.md) and [`docs/osint-tools-research.md`](docs/osint-tools-research.md).

## Legal note

Intended for **legitimate** OSINT investigation (threat intel, due diligence, brand protection, journalism). Processing personal data → GDPR by design (legal basis, minimization, limited retention, audit, data-subject rights). Source ToS respected; sources with restrictive ToS are excluded or clearly labeled.
