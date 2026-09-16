---
title: Claude models
summary: >-
  The current Anthropic Claude models as published on the verification date:
  API IDs, aliases, context windows, output limits, and list prices, plus how to
  read those numbers, how to discover them at runtime instead of hard-coding
  them, and the traps in pinning, platform IDs, and per-token pricing.
topic: models
verified: 2026-09-16
applies_to:
  - "Claude API (first-party) as documented on platform.claude.com on 2026-09-16"
  - "Current models only: Claude Fable 5.1, Claude Opus 5, Claude Sonnet 5, Claude Haiku 4.5"
sources:
  - https://platform.claude.com/docs/en/models/overview
  - https://platform.claude.com/docs/en/about-claude/pricing
  - https://platform.claude.com/docs/en/api/models/list
related:
  - guides/context/context-management.md
seed: true
---

# Claude models

## 1. What this covers / who it's for

Anthropic's current Claude models and the numbers you need to choose, configure, and budget for one: API ID, alias, context window, max output, and list price. Other vendors' models are out of scope for this page.
For anyone writing Claude API code or estimating its cost. Beginners can stop after section 2; section 5 is for people who already ship against these models.

## 2. The 60-second version

**Almost everything on this page goes stale fast, so the first skill is asking the API instead of a web page.** The Models API returns every model your key can use, with its input limit (`max_input_tokens`) and output cap (`max_tokens`) ([Models API](https://platform.claude.com/docs/en/api/models/list)):

```bash
#!/usr/bin/env bash
# Requires: bash, curl, jq, and ANTHROPIC_API_KEY in the environment.
set -euo pipefail
curl -sSf "https://api.anthropic.com/v1/models?limit=100" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" |
  jq -r '["id","display_name","max_input_tokens","max_tokens"],
         (.data[] | [.id, .display_name, .max_input_tokens, .max_tokens])
         | @tsv' |
  column -t -s $'\t'
```

The output includes legacy models that are still served, not just the four below. Prices are not in the Models API; they live only on the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing).

The current lineup, as published on the verification date. Prices are base USD per million tokens (MTok) on the Claude API:

<!-- corpus:table fields=name,api_id,api_alias,context_window,max_output,input_price,output_price tag=claude-current -->
| name | api_id | api_alias | context_window | max_output | input_price | output_price |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Fable 5.1 | claude-fable-5-1 | claude-fable-5-1 | 1M tokens | 128K tokens | $10 / MTok | $50 / MTok |
| Claude Opus 5 | claude-opus-5 | claude-opus-5 | 1M tokens | 128K tokens | $5 / MTok | $25 / MTok |
| Claude Sonnet 5 | claude-sonnet-5 | claude-sonnet-5 | 1M tokens | 128K tokens | $2 / MTok | $10 / MTok |
| Claude Haiku 4.5 | claude-haiku-4-5-20251001 | claude-haiku-4-5 | 200K tokens | 64K tokens | $1 / MTok | $5 / MTok |
<!-- /corpus:table -->

If the table and the [models overview](https://platform.claude.com/docs/en/models/overview) or [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) disagree, those pages win.

## 3. How it actually works

**Model ID, alias, snapshot.** Anthropic's overview states that every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on. For models before that generation, the alias is a convenience pointer that resolves to the dated ID. That is why the Haiku row has two different strings and the others repeat one: from the 4.6 generation on, the dateless ID is itself the snapshot ([models overview](https://platform.claude.com/docs/en/models/overview)).

**Context window vs. max output.** These are two separate limits. The Models API reports the input limit as `max_input_tokens` ("Maximum input context window size in tokens for this model") and the maximum output as `max_tokens` ("Maximum value for the `max_tokens` parameter when using this model"). The overview defines max output as the _synchronous Messages API_ limit. See [Context management](../context/context-management.md) for why a big window is a budget, not a target.

**Tokens are not words, and the ratio changed.** The overview notes that the current tokenizer, introduced with Claude Opus 4.7, fits noticeably fewer words into the same window than models before it did. A token budget measured on an older model does not carry over; count tokens on the model you will actually run.

**Prices are per token, split by direction.** Output tokens cost several times more than input tokens on every current model. Discounts and surcharges stack on the base price: the Batch API discounts both directions, prompt-cache reads are billed at a fraction of base input (with a lower fraction on Claude Fable 5.1 than on the others), and cache writes cost more than base input. The exact multipliers are on the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing); this page deliberately does not copy them.

**The lineup has tiers, and the vendor describes them.** In the overview's own words: Fable 5.1 is "for demanding reasoning and long-horizon agentic work", Opus 5 "for complex agentic coding and enterprise work", Sonnet 5 "the best combination of speed and intelligence", Haiku 4.5 "the fastest model with near-frontier intelligence". Its comparative-latency row runs Slower, Moderate, Fast, Fastest in that order.

## 4. Patterns that hold up

Each recipe carries one evidence label. **Documented** means Anthropic states it in canonical documentation (linked). **Plausible** means it is inferred or practitioner wisdom; test it on your workload. Nothing on this page is **Verified**: no proof in this repository backs these claims.

### 4.1 Start with Opus 5; move up or down only on evidence

Anthropic's own advice is to start with Claude Opus 5 for most workloads, and to use Claude Fable 5.1 for demanding reasoning and long-horizon agentic work, or when evals on Opus 5 at higher effort still fall short.

Evidence: **Documented** — [models overview](https://platform.claude.com/docs/en/models/overview), read 2026-09-16.

### 4.2 Read limits from the Models API, not from a doc page (including this one)

The Models API returns `max_input_tokens`, `max_tokens`, and a `capabilities` object for every available model (section 2 shows how to read them).

Evidence: **Documented** — [models overview: Using the Models API](https://platform.claude.com/docs/en/models/overview) and [List models API](https://platform.claude.com/docs/en/api/models/list), read 2026-09-16.

Why prefer it: a limit copied from a doc page can go stale when a model changes, with nothing in your code to flag it; reading limits at runtime lets a harness size requests from live data. Evidence: **Plausible** — this is inference from the documented fields, not a vendor statement.

### 4.3 Put the model ID in configuration, in exactly one place

Every current ID is a pinned snapshot, so behavior does not shift under you, but new models ship and old ones retire on a schedule. Keeping the ID in one config value makes a migration a one-line change plus an eval run, instead of a search across the codebase.

Evidence: **Plausible** — follows from the documented snapshot and retirement behavior; the practice itself is ordinary configuration hygiene, not a vendor statement.

### 4.4 Compare cost per completed task, not price per token

A model with a lower per-token price can cost more overall if it needs more turns, retries, or output tokens to finish the same job, and a higher-tier model at lower effort may finish in fewer tokens. Measure total spend for a representative set of real tasks on each candidate before switching for cost.

Evidence: **Plausible** — follows from per-token billing and the documented input/output price split; no canonical source publishes a measured comparison you can rely on for your workload.

### 4.5 Re-count tokens when you change models

Because the current tokenizer differs from the one on models before Claude Opus 4.7, the same prompt can cost a different number of tokens after a migration. Run `count_tokens` on the new model rather than reusing old counts or a words-per-token rule of thumb.

Evidence: **Documented** — tokenizer note on the [models overview](https://platform.claude.com/docs/en/models/overview); token counting per [Anthropic token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting), read 2026-09-16.

### 4.6 Don't expect a long-context surcharge on the large-window models

Claude 4.6 and later models include the full large context window at standard per-token pricing; the pricing page's example is that a 900k-token request is billed at the same per-token rate as a 9k-token request. Caching and batch discounts apply across the whole window. This does not make large requests cheap: you still pay for every token.

Evidence: **Documented** — [pricing: long context pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-09-16.

## 5. Edge cases and failure modes

- **Haiku 4.5 is a different API shape.** The overview lists its thinking mode as Extended (the manual `budget_tokens` mode) rather than Adaptive, and effort as "Not supported". Code written for the larger models' adaptive thinking and `effort` does not transfer unchanged ([models overview](https://platform.claude.com/docs/en/models/overview)).
- **Max output is not the same on every API.** The table's output cap is the synchronous Messages API limit. On the Message Batches API some models accept a larger cap behind the `output-300k-2026-03-24` beta header; Haiku 4.5 is not in that list ([models overview](https://platform.claude.com/docs/en/models/overview)).
- **Platform IDs differ from Claude API IDs.** Amazon Bedrock uses its own ID form, Google Cloud writes the dated Haiku snapshot with a different separator, and not every model is on every platform: on the verification date the overview listed no Claude Platform on AWS ID for Claude Opus 5. Copy platform IDs from the overview's per-platform rows, never by transforming a Claude API ID ([models overview](https://platform.claude.com/docs/en/models/overview)).
- **Partner clouds price separately.** Base prices here are Claude API rates. On Amazon Bedrock and Google Cloud the cloud provider sets and invoices the price ([pricing: cloud platform pricing](https://platform.claude.com/docs/en/about-claude/pricing)).
- **"Current" is not "only".** Several earlier models are listed as legacy but still available (for example Claude Fable 5, Claude Opus 4.8, Claude Sonnet 4.6). The Models API returns them, so "take the first model in the list" is not the same as "use the recommended model". Limited-availability models (the Claude Mythos line) appear on the pricing page but not in the overview's comparison, and are omitted here.
- **Prices can change without a new model.** The pricing page records that Claude Sonnet 5's launch pricing was introductory, and that a scheduled increase on 2026-09-01 was cancelled, making the launch price standard. A price you verified last month is not guaranteed this month.
- **Retirement dates are commitments, not end dates.** The overview gives each current model a "not sooner than" retirement date for Anthropic-operated platforms; Bedrock and Google Cloud set their own. Check the [model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations) page before building on an older model.
- **Your training data may be older than the table.** Models and tools that answer from memory routinely cite retired IDs or old prices. Treat any model ID or price that did not come from the API or the live docs as unverified.

## 6. Where this rots

**Nearly all of this page rots**, and faster than any other page in the corpus. Every row of the table is a high-volatility record; the page's derived review cadence is the shortest the ledger allows. Verified 2026-09-16.

| Claim                                      | Record                       | Volatility | Why it moves                                                          |
| ------------------------------------------ | ---------------------------- | ---------- | --------------------------------------------------------------------- |
| Claude Fable 5.1 ID, alias, limits, prices | `anthropic.models.fable-5-1` | high       | New releases, repricing, and lineup changes                           |
| Claude Opus 5 ID, alias, limits, prices    | `anthropic.models.opus-5`    | high       | Same |
| Claude Sonnet 5 ID, alias, limits, prices  | `anthropic.models.sonnet-5`  | high       | Same; its price already changed status once (introductory → standard) |
| Claude Haiku 4.5 ID, alias, limits, prices | `anthropic.models.haiku-4-5` | high       | Oldest model in the lineup, with the nearest retirement commitment    |

Re-check on refresh, against the [models overview](https://platform.claude.com/docs/en/models/overview) and [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) — **those pages are the authority whenever they and this page disagree**:

- which models the overview calls current (a new model means a new record and a new row, and a demoted one means removing its `claude-current` tag);
- every field in every record;
- the untracked claims in sections 3–5: the vendor's tier descriptions and recommendation, the tokenizer note, Haiku 4.5's thinking and effort support, the batch output beta header, platform availability, the long-context pricing rule, and the Sonnet 5 pricing note.

What should not rot: the ID/alias/snapshot model, the window-vs-output distinction, reading limits from the Models API, and comparing cost per completed task.

Deliberately absent: cache, batch, fast-mode, data-residency, and tool-use prices; platform-specific IDs; knowledge cutoffs; retirement dates. All are on the linked pages and would multiply this page's rot surface.

## 7. Proofs

None yet. A useful proof would call the Models API and assert that each record's `api_id` matches the live `id`, and check `context_window` against the input limit (`max_input_tokens`) and `max_output` against the output limit (`max_tokens`). It would first have to establish that the overview's context-window figure and the API's input limit are meant to be the same number, which neither page states. That would turn the limits (not the prices, which the API does not expose) into a mechanically checked claim.

## 8. Sources

Tier 1 — vendor canonical documentation (read 2026-09-16):

- Anthropic, [Models overview](https://platform.claude.com/docs/en/models/overview)
- Anthropic, [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- Anthropic, [List models API](https://platform.claude.com/docs/en/api/models/list)
- Anthropic, [Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)
- Anthropic, [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations)
