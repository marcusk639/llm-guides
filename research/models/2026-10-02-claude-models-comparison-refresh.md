---
kind: refresh
unit:
  - guides/models/claude-models.md
  - guides/models/comparison.md
entry: guides/models/claude-models.md
topic: models
topics:
  - models
slug: claude-models-comparison
path: research/models/2026-10-02-claude-models-comparison-refresh.md
fetched: '2026-10-02'
verdict: blocked
key_scoped: false
unit_keys:
  - anthropic.models.fable-5-1
  - anthropic.models.haiku-4-5
  - anthropic.models.opus-5
  - anthropic.models.sonnet-5
  - google.models.gemini-3-1-pro-preview
  - google.models.gemini-3-5-flash-lite
  - google.models.gemini-3-8-flash
  - meta.models.llama-4-maverick
  - meta.models.llama-4-scout
  - openai.models.gpt-5-6-luna
  - openai.models.gpt-5-6-terra
  - openai.models.gpt6-astra
  - qwen.models.qwen3-8-2-4t-a95b
  - qwen.models.qwen3-8-27b
unit_was:
  guides/models/claude-models.md: '2026-09-16'
  guides/models/comparison.md: '2026-09-16'
records:
  - key: anthropic.models.fable-5-1
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/overview
    stated: 'claude-fable-5-1; $10 input / $50 output per MTok; context 1M; max output 128K; default effort high; thinking Adaptive (always on); training cutoff Jun 2026; retirement not sooner than 2027-09-01'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: anthropic.models.haiku-4-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/overview
    stated: 'claude-haiku-4-5-20251001 (alias claude-haiku-4-5); $1 input / $5 output per MTok; context 200K; max output 64K; thinking Extended; default effort Not supported; training cutoff Jul 2025; retirement not sooner than 2026-10-15'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: anthropic.models.opus-5
    file: data/models.yaml
    verdict: unreachable
    url: https://platform.claude.com/docs/en/models/overview
    stated: 'ABSENT. The live overview''s current lineup is Claude Fable 5.1 (claude-fable-5-1), Claude Opus 5.5 (claude-opus-5-5), Claude Sonnet 5.5 (claude-sonnet-5-5), Claude Haiku 4.5 (claude-haiku-4-5-20251001). The string claude-opus-5 is not documented as a current model; the vendor publishes no value to repoint to.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: anthropic.models.sonnet-5
    file: data/models.yaml
    verdict: unreachable
    url: https://platform.claude.com/docs/en/models/overview
    stated: 'ABSENT. Superseded by Claude Sonnet 5.5 (claude-sonnet-5-5) in the live overview''s current lineup. The string claude-sonnet-5 is not documented as a current model; the vendor publishes no value to repoint to.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: google.models.gemini-3-1-pro-preview
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
    stated: 'Model card: model code gemini-3.1-pro-preview; input token limit 1,048,576; output token limit 65,536. Prices read from price_source https://ai.google.dev/gemini-api/docs/pricing, table ''Free Tier / Paid Tier, per 1M tokens in USD'': Input price $2.00 (text/image); Output price $12.00 (text and thinking).'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: google.models.gemini-3-5-flash-lite
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
    stated: 'Model card: model code gemini-3.5-flash-lite; input token limit 1,048,576; output token limit 65,536. Prices read from price_source https://ai.google.dev/gemini-api/docs/pricing, Standard tier: ''Input price | Free of charge | $0.30 (text / image / video / audio)''; ''Output price (including thinking tokens) | Free of charge | $2.50''.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: google.models.gemini-3-8-flash
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
    stated: 'Model card: model code gemini-3.8-flash; input token limit 1,048,576; output token limit 65,536. Prices read from price_source https://ai.google.dev/gemini-api/docs/pricing, Standard tier: ''Input price | Free of charge | $0.75 through December 31, 2026. $1.50 starting January 1, 2027.''; ''Output price (including thinking tokens) | Free of charge | $3.75 through December 31, 2026. $7.50 starting January 1, 2027.'' The record''s dated 2027 note matches.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: meta.models.llama-4-maverick
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct
    stated: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct; ''17B (Activated), 400B (Total)''; context length ''1M''; licence ''Llama 4 Community License Agreement''. Page footer''s ''Model size 402B params'' is a safetensors stat, a different metric from the 400B prose figure.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: meta.models.llama-4-scout
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct
    stated: 'meta-llama/Llama-4-Scout-17B-16E-Instruct; ''17B (Activated), 109B (Total)''; context length ''10M''; licence ''Llama 4 Community License Agreement''.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: openai.models.gpt-5-6-luna
    file: data/models-other.yaml
    verdict: unreachable
    url: https://developers.openai.com/api/docs/models/gpt-5.6-luna
    stated: 'gpt-5.6-luna; input $0.20, cached input $0.02, output $1.20 per 1M; context window 1,050,000; max output 128,000. The record''s max_input: 922,000 tokens is NOT STATED: the page publishes a context window and a max output but no separate max-input figure, and there is nothing to repoint to.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: openai.models.gpt-5-6-terra
    file: data/models-other.yaml
    verdict: unreachable
    url: https://developers.openai.com/api/docs/models/gpt-5.6-terra
    stated: 'gpt-5.6-terra; input $2.00, cached input $0.20, output $12.00 per 1M; context window 1,050,000; max output 128,000. The record''s max_input: 922,000 tokens is NOT STATED, same as gpt-5.6-luna, and there is nothing to repoint to.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: openai.models.gpt6-astra
    file: data/models-other.yaml
    verdict: confirmed
    url: https://developers.openai.com/api/docs/models/gpt-6-astra
    stated: 'gpt-6-astra; input $10.00, cached input $1.00, cache writes $12.50, output $50.00 per 1M; context 1,050,000 (not a round 1M); max output 128,000; knowledge cutoff Apr 30 2026; >272K input priced 2x input, 1.5x output.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: qwen.models.qwen3-8-2-4t-a95b
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
    stated: 'Model card: Qwen/Qwen3.8-2.4T-A95B; ''Number of Parameters: 2.4T in total and 95B activated''; ''Context Length: 262,144 natively and extensible up to 1,010,000 tokens''. Licence read from the newly added licence_source https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE: ''Qwen3.8-Max License'', ''Copyright (c) 2026 Qwen''. The model card itself states no licence; that is why licence_source was added.'
    read: '2026-10-02'
    was: '2026-09-16'
  - key: qwen.models.qwen3-8-27b
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/Qwen/Qwen3.8-27B
    stated: 'Model card: Qwen/Qwen3.8-27B; ''Number of Parameters: 27B''; ''Context Length: 262,144 natively and extensible up to 1,000,000 tokens''. Licence read from the newly added licence_source https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/LICENSE: ''Apache License'', ''Version 2.0, January 2004''. The model card itself states no licence; that is why licence_source was added.'
    read: '2026-10-02'
    was: '2026-09-16'
---
# Refresh: claude-models-comparison (2026-10-02)

Verdicts, URLs and the figures the sources actually stated live in the front-matter above. Narrative belongs in the pull request body, not here.

## guides/models/claude-models.md

Section 6 as executed:

````

**Nearly all of this page rots**, and faster than any other page in the corpus. Every row of the table is a high-volatility record; the page's derived review cadence is the shortest the ledger allows. Verified 2026-09-16.

| Claim                                      | Record                       | Volatility | Why it moves                                                          |
| ------------------------------------------ | ---------------------------- | ---------- | --------------------------------------------------------------------- |
| Claude Fable 5.1 ID, alias, limits, prices | `anthropic.models.fable-5-1` | high       | New releases, repricing, and lineup changes                           |
| Claude Opus 5 ID, alias, limits, prices    | `anthropic.models.opus-5`    | high       | Same                                                                  |
| Claude Sonnet 5 ID, alias, limits, prices  | `anthropic.models.sonnet-5`  | high       | Same; its price already changed status once (introductory → standard) |
| Claude Haiku 4.5 ID, alias, limits, prices | `anthropic.models.haiku-4-5` | high       | Oldest model in the lineup, with the nearest retirement commitment    |

Re-check on refresh, against the [models overview](https://platform.claude.com/docs/en/models/overview) and [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) — **those pages are the authority whenever they and this page disagree**:

- which models the overview calls current (a new model means a new record and a new row, and a demoted one means removing its `claude-current` tag);
- every field in every record;
- the untracked claims in sections 3–5: the vendor's tier descriptions and recommendation, the tokenizer note, Haiku 4.5's thinking and effort support, the batch output beta header, platform availability, the long-context pricing rule, and the Sonnet 5 pricing note.

What should not rot: the ID/alias/snapshot model, the window-vs-output distinction, reading limits from the Models API, and comparing cost per completed task.

Deliberately absent: cache, batch, fast-mode, data-residency, and tool-use prices; platform-specific IDs; knowledge cutoffs; retirement dates. All are on the linked pages and would multiply this page's rot surface.

````

- Identifiers re-checked against `applies_to`, safety-relevant first:
- Values lint cannot guard, checked by hand:
- Dated studies, citation still resolves:

## guides/models/comparison.md

Section 6 as executed:

````

**Almost all of this page rots.** Every row in both tables is a high-volatility record, so the page takes the shortest review cadence the ledger allows. Verified 2026-09-16.

| Claim                      | Record                                                                                | Volatility | Why it moves                                                |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| GPT-6 Astra row            | `openai.models.gpt6-astra`                                                            | high       | Releases, repricing, lineup changes                         |
| GPT-5.6 Terra row          | `openai.models.gpt-5-6-terra`                                                         | high       | Same                                                        |
| GPT-5.6 Luna row           | `openai.models.gpt-5-6-luna`                                                          | high       | Same                                                        |
| Gemini 3.8 Flash row       | `google.models.gemini-3-8-flash`                                                      | high       | Scheduled price change; new Flash releases                  |
| Gemini 3.1 Pro Preview row | `google.models.gemini-3-1-pro-preview`                                                | high       | Preview status; a stable Pro may replace it                 |
| Gemini 3.5 Flash-Lite row  | `google.models.gemini-3-5-flash-lite`                                                 | high       | Newer Flash-Lite generations                                |
| Llama 4 Maverick row       | `meta.models.llama-4-maverick`                                                        | high       | A new Llama generation would supersede it                   |
| Llama 4 Scout row          | `meta.models.llama-4-scout`                                                           | high       | Same                                                        |
| Qwen3.8-2.4T-A95B row      | `qwen.models.qwen3-8-2-4t-a95b`                                                       | high       | Fast Qwen release cadence; licence terms                    |
| Qwen3.8-27B row            | `qwen.models.qwen3-8-27b`                                                             | high       | Same                                                        |
| Claude rows                | `anthropic.models.fable-5-1`, `anthropic.models.opus-5`, `anthropic.models.haiku-4-5` | high       | Owned by [Claude models](claude-models.md); refreshed there |

Re-check on refresh, against the pages in section 8, **which win whenever they and this page disagree**:

- which models each vendor currently features (a new flagship or cheap tier means a new record; a demoted one means removing its `comparison-hosted` or `comparison-open-weight` tag);
- every field in every record, including the `notes` thresholds and dates;
- the untracked claims in sections 3–5: vendor self-descriptions, which limit each vendor states, Google's thinking-token and free-tier notes, OpenAI's whole-request threshold rule, Qwen's native-versus-extended context wording, and the licence summaries;
- the leaderboard links in 4.3 (still live, still measuring what the page says).

What should not rot: comparing cost per completed task, keeping separate columns for differently defined limits, checking licence before capability, and budgeting open weights by host.

Values lint cannot guard: the Llama context-length cells are two characters, below the lint's minimum literal length, so they are not indexed and rely on author discipline to stay correct; the Qwen dense model's parameter count is a substring of its own model name (`Qwen3.8-27B`) and was deliberately left out of `lint_literals` to avoid flagging every mention of the model. Re-check both by hand on refresh.

````

- Identifiers re-checked against `applies_to`, safety-relevant first:
- Values lint cannot guard, checked by hand:
- Dated studies, citation still resolves:
