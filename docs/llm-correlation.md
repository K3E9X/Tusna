# LLM correlation without hallucination — architecture

> Product constraint: the LLM helps correlate identities **without hallucinating or producing false positives**.
> In OSINT, a false link = a false accusation. The LLM must therefore be **subordinate to evidence**, never a generator of truth.

## Guiding principle

**The LLM produces no facts. It only orders, explains and weighs evidence already collected by the connectors.** The correlation score is computed by a deterministic/probabilistic engine (Splink + signals); the LLM contributes only as a **constrained judge**, and only when a decision remains ambiguous after the mechanical signals.

Three barriers, in this order:

1. **Deterministic first** (no LLM). Normalization + exact rules + computable signals (avatar pHash, PGP fingerprint, commit email, observed cross-link, username distance). ~80% of decisions settle here, with no LLM.
2. **Probabilistic** (no LLM). Splink combines signals into an explainable score with thresholds. The grey zone (mid-range scores) goes to the human — optionally assisted by the LLM.
3. **LLM as a constrained judge** (tie-breaker only). On an ambiguous case, the LLM receives **only the collected evidence** and must answer in structured JSON, citing each evidence item used. It cannot see the web; it cannot invent a source.

## The 6 technical guardrails

### 1. Strict grounding (RAG over our own observations)
The LLM only has access to the **evidence context** passed in the prompt (the `observation_id`s from the database), never a free web search. No evidence in context → the LLM has nothing to say. We remove the source of hallucination at the root: there is no "world knowledge" to hallucinate, only the facts provided.

### 2. Structured output + mandatory citation (at the schema level)
The response is forced by **JSON Schema / grammar-constrained decoding**. Every assertion must cite the `evidence_id` that supports it. An assertion without a citation is **rejected at parse time** (invalid), not displayed.

```json
{
  "verdict": "same_entity | different_entity | insufficient",
  "confidence": 0-100,
  "cited_evidence": ["ev_avatar_phash", "ev_crosslink_x_gh"],
  "rationale": "short text",
  "contradictions_noticed": ["ev_geo_texas"]
}
```

### 3. Entailment verification (post-generation)
For each `(assertion, cited evidence)` pair, an **entailment** check verifies that the evidence actually supports the assertion. An assertion not entailed by its evidence → discarded. This is the equivalent of "CiteCheck": we don't trust the LLM at its word, we verify that the citation says what it claims.

### 4. Anti-false-positive bias (assumed asymmetry)
The prompt and threshold are **calibrated toward doubt**: when uncertain, the default output is `insufficient`, not `same_entity`. A false negative (missing a link) is recoverable by the human; a false positive (asserting a wrong link) is dangerous. The cost of error is asymmetric, so the machine must be too.

### 5. Panel + self-consistency (for high-stakes decisions)
On an important "confirm/reject", we query **multiple times** (or multiple models) from distinct angles (correctness / contradiction / provenance). We keep `same_entity` only if a **majority** converges. "Self-consistent errors" (the model failing in a stable way) are mitigated by angle diversity, not by identical repetition.

### 6. Confidence calibration
The LLM's confidence number is **never** shown raw: it is recalibrated against a labeled validation set (the LLM is chronically overconfident). The score shown to the analyst comes from the probabilistic engine, not the LLM; the LLM only **ranks** and **explains**.

## What the human always keeps

- **No automatic merge** of person entities. The LLM proposes, the analyst decides (confirm / review / reject — the verbs on the board).
- Every decision is **logged** (who, when, on what evidence) for the GDPR audit.
- The UI shows the **evidence and its provenance**, not just the verdict: the analyst can always trace back to the raw fact.

## Retained LLM uses (by ROI, all grounded)

| Use | LLM role | Key guardrail |
|---|---|---|
| Entity extraction (NER) over free text | turn text → normalized fields | structured output, no field invention |
| Investigation summary | condense N sourced observations | each sentence cites its `observation_id`s |
| Matching tie-break | judge an ambiguous case | grounding + entailment + doubt bias + panel |
| Translation / transliteration | normalize multilingual content | verifiable deterministic |
| Natural-language query → table filter | translate an intent into a filter | accesses only the schema, not the data |

**Excluded uses:** letting the LLM search the web, invent an unobserved link, produce a displayed score without evidence, decide a merge on its own.

## Models

Self-hosted open-weight by default (cost control, sensitive data off third-party APIs): **Qwen 3** or **Mistral Small** (Apache 2.0, good function-calling / JSON). Served via **Ollama** (MVP) then **vLLM** (throughput). The LLM is a **decoupled, asynchronous service**: the product works without it (graceful degradation). See `docs/architecture.md` §5.

## References
- Grounding & citation enforcement (schema + registry check + entailment): https://futureagi.com/blog/llm-hallucination-deep-dive-2026/
- CiteCheck — citation-hallucination detection via structured verification: https://arxiv.org/html/2605.27700v1
- Retrieval-grounded / tiered retrieval: https://arxiv.org/html/2603.17872v1
- LLM confidence calibration: https://arxiv.org/pdf/2505.21772
- Self-consistent errors (why repetition isn't enough): https://arxiv.org/pdf/2505.17656
- Probabilistic entity resolution (Splink): https://moj-analytical-services.github.io/splink/
