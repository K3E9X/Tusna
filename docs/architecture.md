# Tusna — Architecture & Product Strategy (OSINT aggregation & correlation platform)

> Architecture document v1. Role: product architect + lead engineer + OSINT research assistant.
> Goal: build **Tusna**, a web platform aggregating public OSINT tools/sources,
> with a dynamic search table, a matching / entity-resolution engine, and a lightweight LLM layer.

---

## 0. Frame & assumptions

**Assumptions (to confirm):**

1. **Target user**: cyber analysts / investigative journalists / fraud-DPOs / due diligence. Not the general public. → shapes the UX (dense, pro) and compliance.
2. **Initial scale**: 1–20 concurrent users, a few hundred investigations/month at MVP. No "mass scanning".
3. **Team**: small (1–3 devs). → we favor **a single-language, single modular monolith**, not a swarm of micro-services.
4. **Hosting**: self-host / EU VPS (GDPR) at first, cloud-agnostic afterwards.
5. **Budget**: bootstrap. Maximize open-source and free tiers; isolate variable costs (paid APIs, LLM GPU).

**Legal & ethical guardrails (non-negotiable, built in from the MVP):**

- **GDPR**: Tusna processes personal data. Legal basis (legitimate interest), minimization, limited retention, right to erasure, access log. → an **audit layer from day 1**, not optional.
- **Source ToS respect**: no scraping that explicitly violates terms (e.g. LinkedIn, Meta). Prefer **official APIs + reputable OSINT tools**. Every connector carries a `legal_status` + `rate_policy` flag.
- **Defensive scope**: legitimate investigation, threat intel, due diligence, brand protection. No harassment/stalking. → logged **consent/investigation mandate**, quotas, export watermark.
- **No "illusion of completeness"**: any rate-limited, freemium, unstable or geo-restricted source is **labeled in the UI** (reliability + freshness badge).

---

## 1. Executive summary

Tusna is **not** a script launcher: it's an **orchestration hub + a data store of correlated entities**. The value isn't "run theHarvester", it's **merging the results of 30 tools into a single entity view, deduplicated, linked and scored**.

The open-source market has already solved two bricks you **must not rewrite**:

- **Connector aggregation** → the **IntelOwl** model (Django + Celery + "analyzers/connectors" plugins). Exactly your need. Draw heavily on it, or extend it.
- **Entity resolution** → **Splink** (probabilistic, scalable, explainable). Open-source state of the art, free, MIT license.

**Direct recommendation:** modular monolith in **Python (FastAPI or Django)** + **PostgreSQL** (source of truth + `pgvector`) + **OpenSearch** (search/full-text) + **Redis + Celery/RQ** (jobs) + isolated connector workers + **Splink** for matching + **PostgreSQL/Apache AGE or Neo4j** for the entity graph. Frontend **Next.js (React) + TanStack Table/Query**. LLM wired as a **decoupled service** (self-hosted Ollama/vLLM, or per-token API), never in the critical path.

Risk #1 isn't technical: it's **source fragility** (rate limits, breakage, legality). The architecture must make each connector **replaceable, isolable and degradable** without taking the product down.

---

## 2. Landscape analysis

### 2.1 OSINT tool/source categories to integrate

Structure derived from **OSINT Framework** and the major directories (awesome-osint, IntelOwl analyzers). MVP → V2 prioritization.

| Category (pivot) | What we look for | Open-source tools/sources or API | Priority |
|---|---|---|---|
| **Domain / DNS / Infra** | subdomains, DNS, WHOIS, certs | Amass, Subfinder, dnsx, crt.sh, **theHarvester**, SecurityTrails*, DNSDumpster | **MVP** |
| **IP / Network** | geo, ASN, ports, reputation | **Shodan***, Censys*, GreyNoise*, AbuseIPDB*, IPinfo*, MaxMind GeoLite (free) | **MVP** |
| **Email** | validity, breach, reputation | **Have I Been Pwned*** (paid API), holehe, Hunter*, EmailRep, mailfilter MX-check | **MVP** |
| **Username / Handle** | multi-platform presence | **Sherlock**, **Maigret**, WhatsMyName (JSON list) | **MVP** |
| **Person / Identity** | identity aggregation | internal correlation + connectors above | V2 |
| **Files / Media** | metadata, hash, malware | **ExifTool**, VirusTotal*, YARA, reverse image (limited) | V2 |
| **Social networks** | posts, profiles | official APIs where available; **otherwise excluded/labeled** (ToS) | V2 (cautious) |
| **Threat Intel / IoC** | indicator enrichment | MISP, OpenCTI (connector), OTX AlienVault*, URLScan* | V2 |
| **Leaks / Breach / Paste** | exposed credentials | HIBP*, Dehashed* (paid), public paste sources | V2 (sensitive) |
| **Geospatial / Imagery** | imagery, maps | OpenStreetMap, Sentinel/Copernicus (free), Overpass | V3 |
| **Companies / Registries** | corporate, KYB | OpenCorporates* (freemium), EU public registries, GLEIF (free) | V2 |
| **Blockchain** | addresses, flows | public explorers, Blockchair* | V3 |

`*` = **freemium / key required / quotas / potentially paid → to be labeled in the UI.**

### 2.2 Relevant source types (by access mode)

1. **Packaged open-source CLIs** (Sherlock, Amass, theHarvester, ExifTool, Subfinder…) → wrapped in dockerized workers. Free, but breakage/maintenance to watch.
2. **Official public APIs** (Shodan, HIBP, VirusTotal, IPinfo, crt.sh, GLEIF…) → HTTP connectors with key/quota handling. **Most reliable, but costs/limits.**
3. **Static datasets** (MaxMind GeoLite, WhatsMyName, ASN lists) → ingested into the DB, queryable offline. **Fastest, zero runtime dependency.**
4. **Scraping** → **last resort**, only sources without restrictive ToS, isolated and clearly flagged as fragile.

### 2.3 Internal vs delegated

| Must be **internal** (your differentiator) | Must be **delegated** (don't reinvent) |
|---|---|
| Dynamic search table + UX | Raw collection per source (existing CLIs/APIs) |
| **Entity resolution / dedup / matching** | DNS resolution, port scan, breach lookup |
| Entity relationship graph | IP geo (MaxMind), certs (crt.sh) |
| Normalization & unified entity schema | Reverse image, malware scan (VT) |
| Job orchestration + cache + freshness | LLM model (Ollama/vLLM/API), no training |
| Confidence scoring & provenance | Mapping (OSM/tiles) |
| Audit / compliance / RBAC | — |

**Golden rule:** you own the **entity model, the correlation and the experience**. Everything else is a **replaceable plugin**.

---

## 3. Architecture recommendation

### 3.1 Overview (modular monolith + workers)

```
                         ┌──────────────────────────┐
                         │   Frontend Next.js/React │
                         │  TanStack Table + Query  │
                         │  Graph (Sigma/Cytoscape) │
                         └────────────┬─────────────┘
                                      │ REST/GraphQL + WebSocket (progress)
                         ┌────────────▼─────────────┐
                         │      API (FastAPI/Django) │
                         │  Auth/RBAC · Audit · Jobs │
                         └───┬──────────┬─────────┬──┘
             enqueue jobs    │          │ read    │ read/write
                     ┌───────▼───┐  ┌───▼────┐ ┌──▼─────────┐
                     │ Redis +   │  │OpenSearch│ │ PostgreSQL │
                     │ Celery/RQ │  │ (search) │ │  (truth)   │
                     └─────┬─────┘  └──────────┘ │ + pgvector │
                           │                     │ + AGE(graph)│
        ┌──────────────────┼──────────────┐      └────┬───────┘
        │                  │              │           │ index sync (CDC/outbox)
  ┌─────▼─────┐     ┌──────▼──────┐  ┌────▼─────┐ ┌───▼──────────┐
  │Connector  │ ... │ Connector   │  │ Matching │ │ LLM service  │
  │worker (CLI│     │ worker (API)│  │ (Splink) │ │ (Ollama/vLLM │
  │ dockerized)│    │             │  │  ER/dedup│ │  or API)     │
  └───────────┘     └─────────────┘  └──────────┘ └──────────────┘
```

### 3.2 Frontend

- **Next.js (React, TypeScript)** — SSR for first-render speed, mature ecosystem, easy hiring.
- **TanStack Table** (dynamic table: sort/filter/columns/virtualization) + **TanStack Query** (network cache, invalidation, job status).
- **Entity graph**: **Cytoscape.js** or **Sigma.js + Graphology** (WebGL, handles thousands of nodes). Avoid raw D3 for large graphs.
- **UI kit**: shadcn/ui + Tailwind (fast, consistent, free).
- **Real time**: WebSocket/SSE for job progress (an OSINT scan = variable latency → never block the UI).

### 3.3 Backend

- **Python** (the OSINT ground language: most tools are Python/CLI, direct bindings).
- **MVP → FastAPI** (light, async, perfect for orchestrating network I/O) **OR Django + DRF** if you want batteries-included admin/ORM/RBAC/migrations (IntelOwl's choice, and defensible).
  - **Internal verdict:** **Django + DRF** at MVP if you want to move fast on auth/admin/audit; **FastAPI** if the team is comfortable and wants full-async. Both hold up.
- **Modular monolith**: `sources/`, `entities/`, `matching/`, `search/`, `audit/` modules. No micro-services before you *really* need them.

### 3.4 Database

- **PostgreSQL = single source of truth.** Robust, transactional, JSONB for connectors' heterogeneous payloads.
- **`pgvector`** for embeddings (semantic similarity, assisted dedup, "fuzzy" search).
- **Graph**: start with **Apache AGE** (Postgres extension, openCypher) to stay single-DB; migrate to **Neo4j** only if the graph becomes the analytical core (complex path queries at scale).
- **Canonical entity model** (the product's key):
  - `entity` (type: person/email/domain/ip/username/org…), `observation` (raw fact + source + timestamp + confidence), `relationship` (entity↔entity, typed), `source_run` (provenance/job).
  - Every fact keeps **its source and freshness** → traceable provenance, GDPR-compatible.

### 3.5 Search engine

- **OpenSearch** (Apache 2.0 Elasticsearch fork, no license risk): full-text, facets, aggregations, autocomplete, fuzzy queries.
- Postgres stays the truth; OpenSearch is a **derived index** (synced via an **outbox/CDC** pattern, never written directly by the user).
- Lightweight MVP alternative: **Postgres full-text (`tsvector`) + `pg_trgm`** is enough for < ~1M docs. → **you can start without OpenSearch** and add it when volume demands. (Recommended: MVP on Postgres FTS, OpenSearch in V2.)

### 3.6 Ingestion pipeline

Normalized flow for **each** connector:

```
seed (e.g. domain) → job → connector worker → raw payload (JSONB)
   → normalization to the canonical entity schema
   → dedup/matching (Splink)  → upsert entities + relationships (Postgres)
   → indexing (OpenSearch/FTS)  → UI notification (WebSocket)
```

- **Standardized connector contract**: `input_types`, `output_entities`, `rate_policy`, `legal_status`, `cost_tier`, `reliability`. → a new connector = a class + a manifest, testable in isolation.
- **Per-source cache + TTL**: don't re-hit Shodan for the same IP within 24h. Saves quotas and money.
- **Idempotency**: replaying a job doesn't duplicate entities (natural key + fact hash).

### 3.7 Job orchestration

- **Redis + Celery** (mature, monitoring via Flower) **or RQ** (simpler at MVP). Multi-queues by profile: `fast` (API), `slow` (heavy CLIs), `paid` (quota-limited), `llm`.
- **Playbooks** (IntelOwl concept): chains like "if domain → subdomains → IPs → geo → breach" = **automatic pivots**. This is the heart of correlation.
- Backpressure & retries with backoff; **circuit breaker** per source (if an API goes down, degrade, don't fail everything).
- **Advanced workflow (V2)**: if DAGs get complex, consider **Temporal** (durable execution) — but not at MVP (over-engineering).

### 3.8 Matching / dedup / entity resolution layer — *the differentiating core*

- **Splink** (MIT, probabilistic, explainable, scalable via DuckDB/Spark) = default choice. Handles blocking rules, match weights, thresholds, clustering — and **explains why** two records match (crucial in investigation & compliance).
- **Deterministic complement** upstream: normalization (lowercased emails, punycode domains, E.164 phones, transliterated names) + exact rules → reduces noise before the probabilistic pass.
- **Semantic assist**: `pgvector` + embeddings to bring together "fuzzy" variants (aliases, typos) that the probabilistic pass alone misses.
- **Human in the loop**: a queue of "merge candidates" with a score → the analyst validates/rejects (Splink + UI). **Never a silent automatic merge** on personal data.
- Alternatives: **Zingg** (if you go data-engineering/Spark), **dedupe** (small scale, active learning — doesn't scale > ~10k). **Senzing/Tilores** = powerful but proprietary/expensive → avoid at bootstrap.

### 3.9 Security & audit

- **AuthN/AuthZ**: OIDC (self-hosted Keycloak, free) or Auth.js; **RBAC** (analyst / lead / admin).
- **Immutable audit log**: who searched what, when, on what legal basis (append-only, hash-chained).
- **Secrets**: all API keys in a vault (Doppler/Infisical/Vault), never in the DB or the repo.
- **Worker isolation**: unprivileged containers, filtered egress network (a connector only talks to its source).
- **GDPR by design**: configurable retention, purge, per-subject export/erasure, minimization, export watermark & log.
- **Multi-tenant** (if SaaS): strict per-organization isolation (Postgres row-level security).

---

## 4. Stack proposal — comparison table

### 4.1 Options comparison

| Layer | **Simple / MVP** option | **Robust / scalable** option | Not recommended (and why) |
|---|---|---|---|
| Frontend | Next.js + TanStack Table/Query + shadcn | same + Sigma/Cytoscape (WebGL) + design system | homegrown SPA / jQuery; Angular (needless weight here) |
| Backend | **Django+DRF** (or FastAPI) monolith | same, modules extracted to services *if* needed | micro-services upfront; Node for OSINT orchestration (tools ecosystem = Python) |
| Truth | PostgreSQL + JSONB | Postgres + partitions + read replicas | MongoDB as truth (loss of relational/ACID) |
| Search | Postgres FTS (`tsvector`+`pg_trgm`) | **OpenSearch** | Elasticsearch (SSPL license risk); Algolia (cost, sensitive data outside EU) |
| Vectors | `pgvector` | pgvector + HNSW index, or Qdrant if volume | Pinecone (cost, hosting personal data with a third party) |
| Graph | Apache AGE (in Postgres) | **Neo4j** (community/enterprise) | "emulated" graph in untyped SQL joins |
| Jobs | Redis + RQ | Redis + Celery multi-queue (+ Temporal V2) | homegrown cron; synchronous jobs in the API |
| Connectors | dockerized CLI wrappers + API clients | IntelOwl-like plugins + registry + sandbox | fragile unisolated scraping; everything in the API process |
| Matching | Splink (DuckDB backend) | Splink (Spark) + pgvector + review UI | ad-hoc SQL-rule merging; homegrown ML from scratch |
| LLM | Ollama (Qwen/Mistral) *off the critical path* | vLLM on a dedicated GPU, or per-use API | synchronous LLM blocking the UI; premature fine-tuning |
| Auth/Audit | Auth.js + append-only Postgres audit | Keycloak OIDC + RBAC + hash-chain | homegrown auth; no audit (GDPR blocker) |
| Infra | Docker Compose (1 EU VPS) | Kubernetes (once ≥ several nodes) | K8s from day 1 (operational overhead) |

### 4.2 Recommended stack — **MVP** (time-to-market, 1–3 devs)

- **Front**: Next.js + TypeScript + TanStack Table/Query + shadcn/ui + Cytoscape.js.
- **Back**: **Django + DRF** (auth/admin/migrations/RBAC included) — modular monolith.
- **Data**: **PostgreSQL** (JSONB + `pgvector` + `pg_trgm` FTS + Apache AGE for a minimal graph).
- **Jobs**: **Redis + Celery** (multi-queue), Flower for monitoring.
- **Connectors**: 8–10 max to start — theHarvester, Amass/Subfinder, Sherlock/Maigret, crt.sh, MaxMind GeoLite, IPinfo, HIBP (if budget), Shodan (if budget). Each: dockerized worker + manifest.
- **Matching**: **Splink** (DuckDB backend) + deterministic normalization + review UI.
- **LLM**: local **Ollama** (Qwen 3 / Mistral Small) for extraction & summary, **asynchronous**, optional.
- **Infra**: **Docker Compose** on 1 EU VPS. Simple CI (GitHub Actions).
- **Security**: Auth.js/OIDC + append-only audit + secrets in a vault.

> Why: one dominant language (Python), one DB to operate, no Kubernetes, state-of-the-art free matching brick. **Deliverable in weeks, not months.**

### 4.3 Recommended stack — **scalable / long-term**

- **Search**: migrate Postgres FTS → **OpenSearch** (facets, large volumes, aggregations).
- **Graph**: Apache AGE → dedicated **Neo4j** if graph analysis becomes central.
- **Orchestration**: Celery → add **Temporal** for durable/long workflows (resumable multi-step playbooks).
- **Vectors**: `pgvector` → **Qdrant** if embedding volume explodes.
- **LLM**: Ollama → **vLLM** on a dedicated GPU (batching, throughput) or per-token API with router/cache.
- **Infra**: Compose → **Kubernetes** (auto-scaling connector workers, strong isolation).
- **Connectors**: IntelOwl-style plugin registry + sandbox + internal marketplace.
- **Multi-tenant**: Row-Level Security + usage-based billing for paid sources.

### 4.4 What I explicitly advise against

- **Micro-services from the start**: kills a small team's velocity. Modular monolith first.
- **Elasticsearch** (SSPL license) → prefer **OpenSearch** (Apache 2.0).
- **MongoDB as source of truth**: you lose the ACID and relational model entity resolution needs.
- **LLM in the critical path** (page render blocked by an inference): fragilizes everything. Always async, always degradable.
- **Scraping restrictive-ToS platforms** (LinkedIn, Meta…): legal risk + permanent breakage. Label/exclude.
- **LLM fine-tuning at MVP**: expensive, premature. Prompting + RAG are enough.
- **Rewriting entity resolution from scratch**: Splink exists, and it's better than what you'd build in 6 months.

---

## 5. LLM strategy

**Principle: the LLM assists, it doesn't decide, and it never blocks.** In OSINT, hallucination is a security risk (false positive = wrong accusation). So: **assistive tooling, with mandatory source citation**. See `docs/llm-correlation.md` for the anti-hallucination architecture.

### 5.1 Uses that are genuinely worth it (decreasing ROI)

1. **Entity extraction** (NER) over free text (pastes, WHOIS, articles) → normalize to the schema. **High ROI.**
2. **Investigation summary & narration**: condense 200 observations into a readable brief. **High ROI.**
3. **Matching assist (tie-breaker)**: "are these two profiles the same person?" with justification — **complementing Splink, never replacing it.**
4. **Translation / transliteration** of multilingual content. **Good ROI.**
5. **Natural-language queries → table filters** ("show Russian IPs seen this week"). **Good UX, medium ROI.**
6. **Ranking/prioritizing** results by relevance. Medium ROI.

**Avoid:** letting the LLM *invent* unsourced facts/links; using it as a search engine; putting it synchronously in the render.

### 5.2 Candidate open-weight models (self-host)

- **Qwen 3 (Apache 2.0)** — best quality/size/multilingual ratio, good function-calling & structured JSON. **Recommended default.**
- **Mistral Small (Apache 2.0)** — excellent for agents/JSON/function-calling in production, lightweight.
- **Gemma 3 27B** / **Phi-4 14B** — fit on a single GPU (16/8 GB VRAM) for extraction/summary.
- **DeepSeek** — top reasoning, but heavier to operate; reserve for hard tasks.

> Licenses: prefer **Apache 2.0 / MIT** (clean commercial use). Check each weight's exact license before prod.

### 5.3 How to wire them without fragility

- **Decoupled LLM service** behind an internal (OpenAI-compatible) API → swap the backend without touching the product.
  - MVP: **Ollama** (simple, modest CPU/GPU, quantized).
  - Scale: **vLLM** (throughput/batching) on a dedicated GPU, or **per-token API** (router + cache).
- **Always asynchronous**: `llm` task on a queue, result pushed via WebSocket. The product works **without** the LLM (graceful degradation).
- **Mandatory structured outputs**: JSON Schema / grammar-constrained → no free text to parse.
- **Grounding & provenance**: RAG over *your* observations; each LLM assertion cites the source `observation_id`. No source → not displayed.
- **Guardrails**: timeouts, token budget per investigation, cache (same prompt → same response), human review on sensitive decisions.

### 5.4 Cost control

- Quantized self-host for constant volume (extraction/summary); per-token API for spikes/hard tasks.
- **Aggressive cache** (embeddings + responses), batching, short prompts, **router**: small model by default, large model only when needed.
- Count the LLM as an **isolated variable cost** (like paid APIs) — visible in the cost dashboard.

---

## 6. Product strategy

### 6.1 Dynamic search table

- **One row = one entity** (person/email/domain/ip/username/org), not a raw tool result (otherwise you drown).
- Columns: type, canonical value, **confidence score**, **freshness**, **# of sources**, tags, last update.
- Features: multi-criteria sort/filter, facets (by type, source, country, reliability), configurable columns, **virtualization** (10k+ smooth rows), multi-select → bulk actions (enrich, export, merge).
- **Entity detail view** (drawer): observation timeline **with source + date + confidence** for each, relationships, enrichment history.
- **Quality badges** everywhere: `freemium`, `rate-limited`, `stale`, `unverified` → the analyst knows what they're looking at.

### 6.2 Result indexing

- **Postgres = truth**, **OpenSearch/FTS = derived index** (never the reverse).
- Sync via **outbox pattern** (event `entity.updated` → reindex) → consistency without tight coupling.
- Index: full-text (values, notes), facets (type/source/country), vector (`pgvector`) for "similar to".
- **Indexed provenance**: filter by source, reliability, freshness = a direct query, not a post-process.

### 6.3 Displaying relationships between entities

- **Interactive graph** (Cytoscape/Sigma): nodes = entities (color/shape by type), edges = typed relationships (`resolves_to`, `same_as`, `registered_by`, `seen_with`).
- Interactions: progressive expand (load neighbors on demand — never the whole graph at once), filters by edge type, paths between 2 entities, visual clustering.
- **Edge thickness/color = confidence**; edges from Splink matching marked "inferred" vs "observed".
- **Table ↔ graph** toggle on the same selection (two views of the same sub-graph).

### 6.4 Keeping the UX fast

- **Everything async**: launching a scan returns a `job_id` immediately; results stream in (WebSocket) → **never a 30s spinner**.
- **Optimistic UI** + TanStack Query cache; server pagination + client virtualization.
- **Per-source cache (TTL)**: an already-known result = instant, no re-scan.
- **Progressive graph rendering** (WebGL, lazy-expand).
- **Perf budget**: search < 200 ms (warm index), first scan result row < 2 s.

---

## 7. Risks

### 7.1 Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Connector fragility** (APIs break, rate limits, abandoned CLIs) | High | Per-worker isolation, circuit breaker, graceful degradation, contract tests, per-source health checks |
| **Entity-resolution quality** (false positives/negatives) | High | Explainable Splink + human in the loop + tunable thresholds + never a silent auto-merge |
| **Cost blowup** (paid APIs, LLM GPU) | Medium | Cache/TTL, quotas, isolated & monitored variable cost, quantized self-host |
| **Search/graph scalability** | Medium | Start simple (Postgres), migrate to OpenSearch/Neo4j on real signals, not preemptively |
| **LLM hallucination** | Medium-high | Structured outputs + mandatory citation + human review + degradation without the LLM |
| **Truth ↔ index consistency** | Medium | Outbox/CDC pattern, idempotent reindexing |

### 7.2 Product & legal risks

| Risk | Impact | Mitigation |
|---|---|---|
| **GDPR / personal data** | Critical | Audit from day 1, legal basis, retention/purge, minimization, data-subject rights, EU hosting |
| **Source ToS violation** | High | Per-connector `legal_status`, exclude forbidden sources, prefer official APIs |
| **Malicious use** (stalking/harassment) | High | Logged investigation mandate, RBAC, quotas, export watermark, strict ToS |
| **"Illusion of completeness"** (partial results taken as exhaustive) | Medium | Freshness/reliability badges, explicit display of unqueried/failed sources |
| **Dependence on a dominant source** | Medium | Multiple sources per category, fallback, never rely on a single provider |

---

## 8. Implementation plan (by steps)

**Step 0 — Foundations (1–2 wks)**
Repo, Docker Compose (Postgres, Redis, API, worker, front). **Canonical entity model** (entity/observation/relationship/source_run). Auth + **append-only audit** + minimal RBAC. CI.

**Step 1 — Ingestion + 3 connectors (2–3 wks)**
Connector contract + manifest. 3 reliable free connectors: **crt.sh** (domain→certs/subdomains), **Sherlock/Maigret** (username), **MaxMind GeoLite** (IP→geo). Normalization → upsert. Async Celery jobs + WebSocket progress.

**Step 2 — Dynamic table + search (2 wks)**
TanStack Table + facets + entity detail view (sourced timeline). Postgres FTS + `pg_trgm` search. Freshness/reliability badges.

**Step 3 — Matching / Entity Resolution (2–3 wks)**
Splink (DuckDB) + deterministic normalization + `pgvector`. **Merge queue to validate** (human in the loop). Dedup at ingestion.

**Step 4 — Relationship graph (2 wks)**
Apache AGE + Cytoscape.js. Progressive expand, paths between entities, table↔graph toggle. Observed vs inferred edges.

**Step 5 — Playbooks / pivots (1–2 wks)**
Auto chains (domain→subdomains→IPs→geo→breach). Multi-queue (fast/slow/paid). Circuit breakers + TTL cache.

**Step 6 — Assistive LLM (1–2 wks)**
Decoupled Ollama service (Qwen/Mistral), async. NER extraction + investigation summary, **structured outputs + citations**. Graceful degradation.

**Step 7 — Hardening & compliance (ongoing)**
Secrets in a vault, filtered worker egress, GDPR retention/purge, watermarked export, cost dashboard. Paid connectors (Shodan/HIBP/VT) behind feature flags + quotas.

**Step 8 — Scale (on real signals)**
OpenSearch, Neo4j, Temporal, vLLM/GPU, Kubernetes — **only when metrics justify it**, not preemptively.

---

## 9. Verdict

**If I had to choose today, I'd go with:**

> A **modular Django + DRF monolith in Python**, with **PostgreSQL** as the single source of truth (JSONB + `pgvector` + `pg_trgm` + Apache AGE for the graph), **Redis + Celery** for async job orchestration, **isolated dockerized connectors** (IntelOwl model: a manifest + a class per source), **Splink** for explainable entity resolution with a **human in the loop**, a **Next.js + TanStack Table/Query + Cytoscape.js** frontend, and an **open-weight LLM (Qwen 3 / Mistral Small via Ollama) wired in a decoupled, asynchronous way**, never in the critical path.
>
> All deployed via **Docker Compose on an EU VPS** at MVP, with **audit and GDPR compliance from day one**. Migrate to OpenSearch, Neo4j, Temporal, vLLM/GPU and Kubernetes **only when real metrics justify it**.

**The core conviction:** your product doesn't win by having *more tools* — it wins by **merging, deduplicating, linking and scoring** what those tools spit out, in a fast, traceable experience. Spend your engineering time on the **entity model, matching and correlation UX**. Treat everything else as **disposable, replaceable plugins**.

---

### Sources & references

- OSINT Framework — category map: https://osintframework.com
- osint.club free tools: https://osint.club/free-tools/
- IntelOwl (plugin/analyzer model, Django+Celery+Postgres): https://github.com/intelowlproject/IntelOwl · https://intelowlproject.github.io/docs/IntelOwl/usage/
- Splink (probabilistic entity resolution, MIT): https://moj-analytical-services.github.io/splink/
- Open-source ER comparison (Splink/Zingg/dedupe): https://tilores.io/content/best-open-source-entity-resolution-and-record-linkage-libraries-splink-zingg-dedupe-and-when-to-move-beyond-them/
- Awesome Entity Resolution: https://github.com/OlivierBinette/Awesome-Entity-Resolution
- OSINT tools (SpiderFoot, theHarvester, Recon-ng, Sherlock, Maigret, Amass…): https://www.pynetlabs.com/osint-tools/
- Open-weight LLMs 2026 (Qwen/Mistral/Gemma, licenses): https://huggingface.co/blog/daya-shankar/open-source-llms
