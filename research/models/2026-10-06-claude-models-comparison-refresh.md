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
path: research/models/2026-10-06-claude-models-comparison-refresh.md
fetched: '2026-10-06'
verdict: changed
key_scoped: false
unit_keys:
  - anthropic.models.fable-5-1
  - anthropic.models.haiku-4-5
  - anthropic.models.opus-5
  - anthropic.models.opus-5-5
  - anthropic.models.sonnet-5
  - anthropic.models.sonnet-5-5
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
    stated: >-
      overview: Claude API ID claude-fable-5-1, Claude API alias
      claude-fable-5-1, Context window 1M tokens, Max output 128K tokens;
      pricing: $10 / MTok input, $50 / MTok output; deprecations table: Active,
      tentative retirement Not sooner than September 1, 2027
    read: '2026-10-06'
    was: '2026-09-16'
  - key: anthropic.models.haiku-4-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/overview
    stated: >-
      overview: Claude API ID claude-haiku-4-5-20251001, Claude API alias
      claude-haiku-4-5, Context window 200K tokens, Max output 64K tokens;
      pricing: $1 / MTok input, $5 / MTok output; deprecations table: Active,
      tentative retirement Not sooner than October 15, 2026
    read: '2026-10-06'
    was: '2026-09-16'
  - key: anthropic.models.opus-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/opus-5/overview
    stated: >-
      opus-5 page: Claude API claude-opus-5, no separate alias stated, Context
      window 1M tokens, Max output 128K tokens, heading badge Legacy, Status
      Active (legacy); pricing: $5 / MTok input, $25 / MTok output; deprecations
      table: Active, tentative retirement Not sooner than July 24, 2027
    read: '2026-10-06'
    was: '2026-10-02'
  - key: anthropic.models.opus-5-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/overview
    stated: >-
      overview: Claude API ID claude-opus-5-5, Claude API alias claude-opus-5-5,
      Context window 1M tokens, Max output 128K tokens; pricing: $4 / MTok
      input, $20 / MTok output; deprecations table: Active, tentative retirement
      Not sooner than September 22, 2027
    read: '2026-10-06'
    was: '2026-10-02'
  - key: anthropic.models.sonnet-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/sonnet-5/overview
    stated: >-
      sonnet-5 page: Claude API claude-sonnet-5, no separate alias stated,
      Context window 1M tokens, Max output 128K tokens, heading badge Legacy,
      Status Active (legacy); pricing: $2 / MTok input, $10 / MTok output;
      deprecations table: Active, tentative retirement Not sooner than June 30,
      2027
    read: '2026-10-06'
    was: '2026-10-02'
  - key: anthropic.models.sonnet-5-5
    file: data/models.yaml
    verdict: confirmed
    url: https://platform.claude.com/docs/en/models/overview
    stated: >-
      overview: Claude API ID claude-sonnet-5-5, Claude API alias
      claude-sonnet-5-5, Context window 1M tokens, Max output 128K tokens;
      pricing: $2 / MTok input, $10 / MTok output; deprecations table: Active,
      tentative retirement Not sooner than September 28, 2027
    read: '2026-10-06'
    was: '2026-10-02'
  - key: google.models.gemini-3-1-pro-preview
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview
    stated: >-
      Model code gemini-3.1-pro-preview, Input token limit 1,048,576, Output
      token limit 65,536; no input maximum stated separately from the window.
      Pricing (Paid Tier, per 1M): input $2.00 prompts <= 200k tokens and $4.00
      prompts > 200k tokens; output including thinking tokens $12.00 and $18.00;
      Free Tier Not available. Index: card under the gemini-3 section, badge
      Preview.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: google.models.gemini-3-5-flash-lite
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
    stated: >-
      Model code gemini-3.5-flash-lite, Input token limit 1,048,576, Output
      token limit 65,536; no input maximum stated separately from the window.
      Pricing (Paid Tier, per 1M): input $0.30 text / image / video / audio;
      output including thinking tokens $2.50; Free Tier Free of charge. Index:
      card under the gemini-3 section, badge Stable.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: google.models.gemini-3-8-flash
    file: data/models-other.yaml
    verdict: confirmed
    url: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
    stated: >-
      Model code gemini-3.8-flash, Input token limit 1,048,576, Output token
      limit 65,536; no input maximum stated separately from the window. Pricing
      (Paid Tier, per 1M): input $0.75 through December 31, 2026 then $1.50
      starting January 1, 2027; output including thinking tokens $3.75 then
      $7.50; Free Tier Free of charge. Index: card under the gemini-3 section,
      badge New Stable.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: meta.models.llama-4-maverick
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct
    stated: >-
      Card table: Context length 1M, stated as a single figure with no
      native/extended distinction; parameters 400B Total and 17B Activated;
      licence Llama 4 Community License Agreement. Maximum output tokens NOT
      STATED. API pipeline_tag image-text-to-text; card states Input modalities
      Multilingual text and image, Output modalities Multilingual text and code.
      Repo exists, gated (manual).
    read: '2026-10-06'
    was: '2026-09-16'
  - key: meta.models.llama-4-scout
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct
    stated: >-
      Card table: Context length 10M, single figure, no native/extended
      distinction; parameters 109B Total and 17B Activated; licence Llama 4
      Community License Agreement, identical to Maverick. Maximum output tokens
      NOT STATED. API pipeline_tag image-text-to-text. Repo exists, gated
      (manual).
    read: '2026-10-06'
    was: '2026-09-16'
  - key: openai.models.gpt-5-6-luna
    file: data/models-other.yaml
    verdict: corrected
    url: https://developers.openai.com/api/docs/models/gpt-5.6-luna
    stated: >-
      Model page: gpt-5.6-luna, 1,050,000 context window, 128,000 max output
      tokens; no separate maximum input stated. Pricing per 1M: input $0.20,
      cached input $0.02, output $1.20. Page note, verbatim: Prompts with >272K
      input tokens are priced at 2x input and 1.5x output for the full request.
      Absent from the models index while its own page returns 200 and it appears
      on pricing.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: openai.models.gpt-5-6-terra
    file: data/models-other.yaml
    verdict: corrected
    url: https://developers.openai.com/api/docs/models/gpt-5.6-terra
    stated: >-
      Model page: gpt-5.6-terra, 1,050,000 context window, 128,000 max output
      tokens; no separate maximum input stated. Pricing per 1M: input $2.00,
      cached input $0.20, output $12.00. Page note, verbatim: Prompts with >272K
      input tokens are priced at 2x input and 1.5x output for the full request.
      Absent from the models index while its own page returns 200 and it appears
      on pricing.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: openai.models.gpt6-astra
    file: data/models-other.yaml
    verdict: corrected
    url: https://developers.openai.com/api/docs/models/gpt-6-astra
    stated: >-
      Model page: gpt-6-astra, 1,050,000 context window, 128,000 max output
      tokens; no separate maximum input stated. Pricing per 1M: input $10.00,
      cached input $1.00, cache writes $12.50, output $50.00. Page note,
      verbatim: Prompts with more than 272K input tokens are priced at 2x input
      and cache rates and 1.5x output for the full request. Present on the
      models index under Flagship models.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: qwen.models.qwen3-8-2-4t-a95b
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
    stated: >-
      Spec list, verbatim: Context Length: 262,144 natively and extensible up to
      1,010,000 tokens. Parameters 2.4T in total and 95B activated; 512 experts,
      10 Routed plus 1 Shared activated. Licence Qwen3.8-Max License (LICENSE
      file first line). Maximum output tokens NOT STATED as a limit. API
      pipeline_tag text-generation. Repo public.
    read: '2026-10-06'
    was: '2026-09-16'
  - key: qwen.models.qwen3-8-27b
    file: data/models-other.yaml
    verdict: confirmed
    url: https://huggingface.co/Qwen/Qwen3.8-27B
    stated: >-
      Spec line, verbatim: Context Length: 262,144 natively and extensible up to
      1,000,000 tokens. Parameters 27B. Licence Apache-2.0 (API and LICENSE
      file). Maximum output tokens NOT STATED as a limit. API pipeline_tag
      image-text-to-text, not text-generation, and the card carries a VL
      Performance section beside Text Performance; output modality not
      established by these bytes. Repo public.
    read: '2026-10-06'
    was: '2026-09-16'
stamped:
  at: '2026-10-06'
  pages:
    - path: guides/models/claude-models.md
      previous_verified: '2026-09-16'
      research_added: true
      previous_research: null
    - path: guides/models/comparison.md
      previous_verified: '2026-09-16'
      research_added: true
      previous_research: null
  records:
    - key: anthropic.models.fable-5-1
      file: data/models.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: anthropic.models.haiku-4-5
      file: data/models.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: anthropic.models.opus-5
      file: data/models.yaml
      previous_verified: '2026-10-02'
      new_verified: '2026-10-06'
    - key: anthropic.models.opus-5-5
      file: data/models.yaml
      previous_verified: '2026-10-02'
      new_verified: '2026-10-06'
    - key: anthropic.models.sonnet-5
      file: data/models.yaml
      previous_verified: '2026-10-02'
      new_verified: '2026-10-06'
    - key: anthropic.models.sonnet-5-5
      file: data/models.yaml
      previous_verified: '2026-10-02'
      new_verified: '2026-10-06'
    - key: google.models.gemini-3-1-pro-preview
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: google.models.gemini-3-5-flash-lite
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: google.models.gemini-3-8-flash
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: meta.models.llama-4-maverick
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: meta.models.llama-4-scout
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: openai.models.gpt-5-6-luna
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: openai.models.gpt-5-6-terra
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: openai.models.gpt6-astra
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: qwen.models.qwen3-8-2-4t-a95b
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
    - key: qwen.models.qwen3-8-27b
      file: data/models-other.yaml
      previous_verified: '2026-09-16'
      new_verified: '2026-10-06'
---
# Refresh: claude-models-comparison (2026-10-06)

Verdicts, URLs and the figures the sources actually stated live in the front-matter above. Narrative belongs in the pull request body, not here.

## guides/models/claude-models.md

Section 6 as executed:

````

**Nearly all of this page rots**, and faster than any other page in the corpus. Every row of both tables is a high-volatility record; the page's derived review cadence is the shortest the ledger allows. Verified 2026-09-16; the lineup, both legacy rows, section 3's vendor tier descriptions and section 4.1's recommendation were re-read 2026-10-02. The page date is deliberately not moved, because the rest of the untracked list below — the tokenizer note, Haiku 4.5's thinking and effort support, the batch output beta header, platform availability, the long-context pricing rule and the Sonnet 5 pricing note — was not re-worked.

| Claim                                      | Record                       | Volatility | Why it moves                                                          |
| ------------------------------------------ | ---------------------------- | ---------- | --------------------------------------------------------------------- |
| Claude Fable 5.1 ID, alias, limits, prices | `anthropic.models.fable-5-1` | high       | New releases, repricing, and lineup changes                           |
| Claude Opus 5.5 ID, alias, limits, prices  | `anthropic.models.opus-5-5`  | high       | Current Opus; replaced Opus 5 in the overview's lineup                |
| Claude Sonnet 5.5 ID, alias, limits, prices | `anthropic.models.sonnet-5-5` | high      | Current Sonnet; replaced Sonnet 5 in the overview's lineup            |
| Claude Opus 5 ID, limits, prices, retirement | `anthropic.models.opus-5`  | high       | Legacy but still served; retirement date is a commitment that can move |
| Claude Sonnet 5 ID, limits, prices, retirement | `anthropic.models.sonnet-5` | high    | Same; its price already changed status once (introductory → standard)  |
| Claude Haiku 4.5 ID, alias, limits, prices | `anthropic.models.haiku-4-5` | high       | Oldest model in the lineup, with the nearest retirement commitment    |

Re-check on refresh, against the [models overview](https://platform.claude.com/docs/en/models/overview) and [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) — **those pages are the authority whenever they and this page disagree**:

- which models the overview calls current (a new model means a new record and a new row, and a demoted one means moving it from the `claude-current` tag to `claude-legacy`, not deleting it — a legacy model is still served and readers may be pinned to it);
- whether either legacy row has moved from Active to Deprecated or Retired on the [deprecations page](https://platform.claude.com/docs/en/about-claude/model-deprecations), and whether its retirement date moved;
- whether the vendor's legacy group has grown or shrunk. It holds more models than the two tracked here, so a new entry does not automatically earn a row — but a tracked row leaving Active does need one;
- the legacy rows' `Active (legacy)` status, which is prose and not lint-guarded, so nothing fails if it drifts;
- every field in every record;
- the untracked claims in sections 3–5: the vendor's tier descriptions and recommendation, the tokenizer note, Haiku 4.5's thinking and effort support, the batch output beta header, platform availability, the long-context pricing rule, and the Sonnet 5 pricing note.

What should not rot: the ID/alias/snapshot model, the window-vs-output distinction, reading limits from the Models API, and comparing cost per completed task.

Deliberately absent: cache, batch, fast-mode, data-residency, and tool-use prices; platform-specific IDs; knowledge cutoffs; and the retirement dates of the four current models. Retirement is carried only for the two legacy rows, where it is the fact that decides whether to migrate. **Also absent: the rest of the vendor's legacy group.** Only the two models this page once listed as current are tracked, because those are the two a reader of an earlier version of this page may have pinned; the others have never appeared here and are reachable from the overview's legacy navigation. All the rest are on the linked pages and would multiply this page's rot surface.

````

- Identifiers re-checked against `applies_to`, safety-relevant first:
  - Batch output beta header `output-300k-2026-03-24` — still stated, on the Opus 5 and
    Sonnet 5 pages only; NOT STATED for the four current models.
  - Platform availability — the overview states a platform ID per current model for Amazon
    Bedrock, Google Cloud, Microsoft Foundry and Claude Platform on AWS; the Opus 5 and
    Sonnet 5 pages each list five platforms.
  - Overview lineup — four current models; Opus 5 and Sonnet 5 are absent from it and sit
    in a nine-member Legacy group.
  - `Active (legacy)` — present on both legacy model pages as those pages' own Status
    string. It is NOT a state in the deprecations table, which lists both as `Active`;
    the table's `Legacy` state has zero members.
  - Tokenizer note, Haiku 4.5 thinking (`Extended`) and default effort (`Not supported`),
    the long-context standard-pricing rule, and the Models API `max_input_tokens` /
    `max_tokens` / `line` fields — all still stated.
- Values lint cannot guard, checked by hand: section 6 names none for this page. The
  `Active (legacy)` status string is prose and not lint-guarded; confirmed present on both
  legacy pages this run.
- Dated studies, citation still resolves: none cited on this page.

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
| Claude rows                | `anthropic.models.fable-5-1`, `anthropic.models.opus-5-5`, `anthropic.models.haiku-4-5` | high       | Owned by [Claude models](claude-models.md); refreshed there. The hosted row tracks the current Opus; Opus 5 is now legacy and is listed on that page, not here |

Re-check on refresh, against the pages in section 8, **which win whenever they and this page disagree**:

- which models each vendor currently features (a new flagship or cheap tier means a new record; a demoted one means removing its `comparison-hosted` or `comparison-open-weight` tag);
- every field in every record, including the `notes` thresholds and dates;
- the untracked claims in sections 3–5: vendor self-descriptions, which limit each vendor states, Google's thinking-token and free-tier notes, OpenAI's whole-request threshold rule, Qwen's native-versus-extended context wording, and the licence summaries;
- the leaderboard links in 4.3 (still live, still measuring what the page says).

What should not rot: comparing cost per completed task, keeping separate columns for differently defined limits, checking licence before capability, and budgeting open weights by host.

A blank cell is a claim too: the claim that the vendor states nothing there. On refresh, re-check that the OpenAI and Anthropic rows still state no separate input limit **on the documentation pages they cite**, rather than filling the cell by arithmetic. Anthropic's Models API does expose `max_input_tokens`; that is a runtime lookup, not a page value, and section 7 describes the proof that would use it. Values lint cannot guard: the Llama context-length cells are two characters, below the lint's minimum literal length, so they are not indexed and rely on author discipline to stay correct; the Qwen dense model's parameter count is a substring of its own model name (`Qwen3.8-27B`) and was deliberately left out of `lint_literals` to avoid flagging every mention of the model. Re-check both by hand on refresh.

````

- Identifiers re-checked against `applies_to`, safety-relevant first:
  - Vendor lineup membership — all three Gemini models are served, cards under the
    `gemini-3` section with badges `Preview`, `Stable` and `New Stable`. `gpt-6-astra` is
    on the OpenAI models index under `Flagship models`; `gpt-5.6-luna` and `gpt-5.6-terra`
    are ABSENT from that index, while their own pages return 200 with full content and both
    appear on the pricing page. Both Meta repos exist but are gated (`manual`); both Qwen
    repos are public.
  - Blank-cell claim re-checked on the pages the rows cite: all three OpenAI pages state a
    context window and a max output and NO separate maximum input; all three Gemini pages
    label 1,048,576 the `Input token limit` and state no second, smaller input maximum.
- Values lint cannot guard, checked by hand:
  - Llama context-length cells `1M` (Maverick) and `10M` (Scout) are below
    `MIN_LITERAL_LENGTH` and so unindexed — both checked by hand against the card table.
  - `Qwen3.8-27B`'s `27B` parameter count is a substring of its own model name and is
    deliberately absent from `lint_literals` — checked by hand against the HTML labelled
    field.
- Leaderboard links in section 4.3, checked 2026-10-06, all three live with no redirect:
  - `https://arena.ai/leaderboard` — HTTP 200, final URL same, 801,884 bytes, title
    `Arena Leaderboard: Official AI Model Rankings & Benchmarks`. States "for text, code,
    image, video, and vision, powered by millions of human votes". Prose claim
    (vote-based ratings split by text, image, vision and other arenas) HOLDS. A `captcha`
    string match is a Google reCAPTCHA Enterprise script shim on a fully rendered page,
    not a challenge wall.
  - `https://www.swebench.com/` — HTTP 200, final URL same, 2,392,125 bytes, title
    `SWE-bench Leaderboards`. Prose claim (software-engineering tasks) HOLDS.
  - `https://artificialanalysis.ai/leaderboards/models` — HTTP 200, final URL same,
    2,433,852 bytes, title `LLM Leaderboard - Comparison of AI models from OpenAI,
    Anthropic, Google, SpaceXAI & others | Artificial Analysis`. All four claimed
    dimensions present in the body: intelligence, price, speed, context. Prose claim HOLDS.
- No score is transcribed from any leaderboard onto the page, as section 4.3 states.
