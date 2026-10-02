---
title: Comparing models across vendors
summary: >-
  A dated side-by-side of hosted frontier models from Anthropic, OpenAI and
  Google and open-weight models from Meta Llama and Alibaba Qwen: ids, stated
  limits, list prices, parameter counts and licences, each copied from the
  vendor's own page. Also covers why the columns are less comparable than they
  look, how to pull the live figures from each vendor's API, and how to choose
  without trusting a leaderboard.
topic: models
verified: 2026-09-16
applies_to:
  - "Anthropic Claude API, OpenAI API and Google Gemini API documentation as published on 2026-09-16"
  - "Hugging Face model cards in the meta-llama and Qwen organisations as published on 2026-09-16"
  - "Rows: Claude Fable 5.1, Claude Opus 5.5, Claude Haiku 4.5; GPT-6 Astra, GPT-5.6 Terra, GPT-5.6 Luna; Gemini 3.8 Flash, Gemini 3.1 Pro Preview, Gemini 3.5 Flash-Lite; Llama 4 Maverick, Llama 4 Scout; Qwen3.8-2.4T-A95B, Qwen3.8-27B"
sources:
  - https://platform.claude.com/docs/en/models/overview
  - https://platform.claude.com/docs/en/about-claude/pricing
  - https://developers.openai.com/api/docs/models
  - https://developers.openai.com/api/docs/pricing
  - https://developers.openai.com/api/reference/resources/models/methods/list
  - https://ai.google.dev/gemini-api/docs/models
  - https://ai.google.dev/gemini-api/docs/pricing
  - https://ai.google.dev/api/models
  - https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct
  - https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct
  - https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
  - https://huggingface.co/Qwen/Qwen3.8-27B
related:
  - guides/models/claude-models.md
  - guides/context/context-management.md
seed: true
---

# Comparing models across vendors

## 1. What this covers / who it's for

A small, dated comparison of current models from three hosted APIs (Anthropic, OpenAI, Google) and two open-weight families (Meta Llama, Alibaba Qwen), limited to what each vendor states on its own pages. It is not a ranking and has no benchmark scores.
For anyone shortlisting models for a project or estimating cost across providers. Beginners can stop after section 2; section 5 is for people who will actually switch vendors.

## 2. The 60-second version

**Every number below goes stale, so start by asking each vendor's API what your key can use.** Anthropic's and Google's list endpoints report token limits; OpenAI's list endpoint reports ids but no limits ([Anthropic Models API](https://platform.claude.com/docs/en/api/models/list), [Gemini models.list](https://ai.google.dev/api/models), [OpenAI list models](https://developers.openai.com/api/reference/resources/models/methods/list)). None of the three returns prices.

```bash
#!/usr/bin/env bash
# Requires: bash, curl, jq. Set any of ANTHROPIC_API_KEY, OPENAI_API_KEY,
# GEMINI_API_KEY; vendors without a key are skipped.
set -euo pipefail

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "== Anthropic (id, input limit, output limit)"
  curl -sSf "https://api.anthropic.com/v1/models?limit=100" \
    -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" |
    jq -r '.data[] | [.id, .max_input_tokens, .max_tokens] | @tsv'
fi

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "== OpenAI (id only; limits are on the model pages)"
  curl -sSf "https://api.openai.com/v1/models" \
    -H "Authorization: Bearer $OPENAI_API_KEY" |
    jq -r '.data[].id' | sort
fi

if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  echo "== Google (name, input limit, output limit)"
  curl -sSf "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=$GEMINI_API_KEY" |
    jq -r '.models[] | [.name, .inputTokenLimit, .outputTokenLimit] | @tsv'
fi
```

The output includes many models this page leaves out (older, preview, audio, image and embedding models). Open-weight models have no vendor API to query: their figures live in the model card that ships with the weights.

Hosted models, as published on the verification date. Prices are base paid-tier USD per million tokens (MTok), rewritten into one unit so the rows line up; token counts keep each vendor's own wording. A blank cell means the vendor's page does not state that value, not that it is zero or unlimited.

<!-- corpus:table fields=vendor,name,api_id,context_window,max_input,max_output,input_price,output_price,notes headers="Vendor,Model,API ID,Context window,Max input,Max output,Input price,Output price,Notes" sort=vendor tag=comparison-hosted -->
| Vendor | Model | API ID | Context window | Max input | Max output | Input price | Output price | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anthropic | Claude Fable 5.1 | claude-fable-5-1 | 1M tokens |  | 128K tokens | $10 / MTok | $50 / MTok |  |
| Anthropic | Claude Opus 5.5 | claude-opus-5-5 | 1M tokens |  | 128K tokens | $4 / MTok | $20 / MTok |  |
| Anthropic | Claude Haiku 4.5 | claude-haiku-4-5-20251001 | 200K tokens |  | 64K tokens | $1 / MTok | $5 / MTok |  |
| Google | Gemini 3.8 Flash | gemini-3.8-flash |  | 1,048,576 tokens | 65,536 tokens | $0.75 / MTok | $3.75 / MTok | Paid-tier prices shown apply through 2026-12-31; from 2027-01-01 the listed prices are $1.50 / MTok input and $7.50 / MTok output. Output price includes thinking tokens. |
| Google | Gemini 3.1 Pro Preview | gemini-3.1-pro-preview |  | 1,048,576 tokens | 65,536 tokens | $2 / MTok | $12 / MTok | Preview model. Prices shown are for prompts up to 200k tokens; longer prompts are $4 / MTok input and $18 / MTok output. Output price includes thinking tokens. |
| Google | Gemini 3.5 Flash-Lite | gemini-3.5-flash-lite |  | 1,048,576 tokens | 65,536 tokens | $0.30 / MTok | $2.50 / MTok | Input price covers text, image, video and audio. Output price includes thinking tokens. |
| OpenAI | GPT-6 Astra | gpt-6-astra | 1,050,000 tokens | 922,000 tokens | 128,000 tokens | $10 / MTok | $50 / MTok | Prompts above 272K input tokens are billed at higher rates for the whole request. |
| OpenAI | GPT-5.6 Terra | gpt-5.6-terra | 1,050,000 tokens | 922,000 tokens | 128,000 tokens | $2 / MTok | $12 / MTok | Prompts above 272K input tokens are billed at higher rates for the whole request. |
| OpenAI | GPT-5.6 Luna | gpt-5.6-luna | 1,050,000 tokens | 922,000 tokens | 128,000 tokens | $0.20 / MTok | $1.20 / MTok | Prompts above 272K input tokens are billed at higher rates for the whole request. |
<!-- /corpus:table -->

Open-weight models, as stated in each official model card on the verification date. There is no price column: what you pay depends on where and how you run the weights.

<!-- corpus:table fields=vendor,name,model_id,parameters,context_length,licence headers="Vendor,Model,Model ID,Parameters,Context length,Licence" sort=vendor tag=comparison-open-weight -->
| Vendor | Model | Model ID | Parameters | Context length | Licence |
| --- | --- | --- | --- | --- | --- |
| Alibaba Qwen | Qwen3.8-2.4T-A95B | Qwen/Qwen3.8-2.4T-A95B | 2.4T in total and 95B activated | 262,144 natively and extensible up to 1,010,000 tokens | Qwen3.8-Max License |
| Alibaba Qwen | Qwen3.8-27B | Qwen/Qwen3.8-27B | 27B | 262,144 natively and extensible up to 1,000,000 tokens | Apache License 2.0 |
| Meta | Llama 4 Maverick | meta-llama/Llama-4-Maverick-17B-128E-Instruct | 17B (Activated), 400B (Total) | 1M | Llama 4 Community License Agreement |
| Meta | Llama 4 Scout | meta-llama/Llama-4-Scout-17B-16E-Instruct | 17B (Activated), 109B (Total) | 10M | Llama 4 Community License Agreement |
<!-- /corpus:table -->

If a table and the vendor page it came from disagree, the vendor page wins. Section 8 lists every page.

## 3. How it actually works

**"Context" is not one column across vendors.** Anthropic's overview states a context window. Google's model pages state an input token limit and an output token limit, with no separate window. OpenAI's model pages state all three: a context window, a maximum input, and a maximum output, and the input maximum is smaller than the window. The table keeps these in separate columns rather than forcing one number per model, which is why cells are blank. Do not read Google's input limit and Anthropic's context window as the same measurement.

**Model ids behave differently per vendor.** OpenAI's model pages name a "default snapshot" per model. Google's pages list a version per model labelled Stable or Preview, and document a separate model-version pattern page. Anthropic's overview states that every current Claude id is a pinned snapshot (see [Claude models](claude-models.md)). The id string alone does not tell you whether it will change under you; each vendor's own page does.

**Prices are tiered in different ways.** All three hosted vendors bill input and output tokens separately, and output costs more than input on every row in the table. Beyond that the rules diverge: OpenAI's model pages bill the whole request at higher rates once the prompt crosses a stated size; Google's Pro Preview row has a prompt-size price step and Gemini 3.8 Flash has a dated price change; Anthropic's pricing page states that its current large-window models have no long-context surcharge. Google's pricing page also states that output prices include thinking tokens. The `notes` column carries the thresholds; the vendor pricing pages carry batch, cache and priority-tier rates, which this page deliberately does not copy.

**Open-weight cards describe weights, not a service.** Llama 4's card gives activated and total parameter counts because both models are mixture-of-experts; so does the larger Qwen card, while the Qwen dense model gives one count. Both Qwen cards distinguish a native context length from an extended one; the Qwen3.8-27B card says the extension is reached with RoPE scaling techniques such as YaRN. Both cards also say the hosted Qwen Cloud versions have different defaults and features than the open weights. A host serving these weights may configure a shorter context than the card's maximum.

**The vendors describe their own tiers.** In their own words, on the verification date:

- OpenAI: GPT-6 Astra is "our flagship model for complex reasoning and coding"; choose GPT-5.6 Terra "to balance intelligence and cost", or GPT-5.6 Luna "for cost-sensitive, high-volume workloads" ([OpenAI models](https://developers.openai.com/api/docs/models)).
- Google: Gemini 3.8 Flash is "our most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows"; Gemini 3.1 Pro (listed as Preview) offers "Advanced intelligence, complex problem-solving skills, and powerful agentic and vibe coding capabilities"; Gemini 3.5 Flash-Lite is "Our fastest, most cost-effective 3.5 model for high-throughput execution" ([Gemini models](https://ai.google.dev/gemini-api/docs/models)).
- Anthropic: see [Claude models, section 3](claude-models.md#3-how-it-actually-works) for the overview's tier descriptions.
- Meta: the Llama 4 card introduces Scout and Maverick as "two efficient models in the Llama 4 series", both mixture-of-experts.
- Qwen: the Qwen3.8 cards describe the generation as "the most capable generation in the Qwen open-model family to date", and the largest card says it "brings a Qwen-Max-class model to open release".

## 4. Patterns that hold up

Each recipe carries one evidence label, applied as defined in the corpus contract's [evidence labels](../../CLAUDE.md#evidence-labels) and [source tiers](../../CLAUDE.md#source-tiers). Nothing on this page is **Verified**: no proof in this repository backs these claims. Every cross-vendor comparison below is Plausible by construction, because no vendor documents how it compares with its competitors.

### 4.1 Shortlist from each vendor's own positioning, then decide on your evals

Each hosted vendor publishes a flagship, a balanced tier and a low-cost tier, and says which workloads each is for (section 3). Use those statements to pick one or two candidates per vendor, not to pick a winner.

Evidence: **Documented** for each vendor's description of its own models ([OpenAI models](https://developers.openai.com/api/docs/models), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Claude models overview](https://platform.claude.com/docs/en/models/overview)), read 2026-09-16. That the tiers line up across vendors is **Plausible**: vendors choose their own tier boundaries.

### 4.2 Compare cost per completed task, never price per token across vendors

Tokenizers differ between vendors, and Anthropic documents that its own tokenizer changed between model generations, so the same prompt is a different number of tokens on different models. Reasoning or thinking tokens are billed as output on at least some rows (Google states this explicitly). A lower per-token price can still cost more per finished task. Run a representative task set on each candidate and compare total spend and success rate.

Evidence: **Plausible** — inferred from per-token billing, the tokenizer note on the [Claude models overview](https://platform.claude.com/docs/en/models/overview) and the thinking-token note on the [Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing), read 2026-09-16. No vendor publishes a cross-vendor cost comparison. See also [Claude models, 4.4](claude-models.md#44-compare-cost-per-completed-task-not-price-per-token).

### 4.3 Read benchmark leaderboards for direction, and check the task matches yours

Leaderboards measure different things: user votes between model outputs, resolved software-engineering issues, or composite indices. A model's rank can differ sharply between them. Use a leaderboard whose task is closest to your workload, note the date you read it, and confirm on your own evals. Useful starting points on the verification date: [Arena leaderboard](https://arena.ai/leaderboard) (vote-based ratings, split by text, image, vision and other arenas), [SWE-bench leaderboards](https://www.swebench.com/) (software-engineering tasks), [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models) (third-party measurements of intelligence, price, speed and context window). This page transcribes no scores from them.

Evidence: **Plausible** — tier 3/4 sources, read 2026-09-16; leaderboard methods and rankings change without notice.

### 4.4 Keep a vendor-neutral seam if switching is a real option

Put the vendor, model id and per-vendor request shaping behind one interface in your code, and keep evals vendor-neutral. The APIs differ in more than the model string: the example in section 2 shows three different auth headers, list shapes and limit field names, and the vendors expose reasoning controls under different parameter names (OpenAI's model pages use `reasoning.effort`; Anthropic uses `effort` and thinking settings; Google's pages describe thinking levels).

Evidence: **Plausible** — follows from the documented API differences linked in section 2; the design practice itself is ordinary engineering, not a vendor statement.

### 4.5 For open weights, read the licence before the parameter count

The two families ship under different terms: the Llama 4 models under Meta's own community licence, the larger Qwen model under its own Qwen licence, which permits commercial use but adds two conditions: products above stated user or revenue thresholds must display the model name, and Model-as-a-Service or AI Work Assistant businesses above a stated revenue threshold need a separate licence from Qwen for commercial use (internal use excepted), and the smaller Qwen model under a standard permissive licence (see the licence column). Licence terms can rule a model out regardless of quality.

Evidence: **Documented** — licence names from each card's metadata and linked licence file (the Llama 4 cards in the [meta-llama organisation](https://huggingface.co/meta-llama) and the Qwen3.8 cards in the [Qwen organisation](https://huggingface.co/Qwen)), read 2026-09-16. This page summarises, not interprets, the licences; read them in full.

### 4.6 Budget open-weight models by host, not by the card

A card's context length is what the model supports, not what a given host serves, and cost depends on hardware, quantization and provider. Qwen's card notes that its hosted versions differ from the open weights in defaults and features. Get the served context and price from the host you will actually use.

Evidence: **Plausible** — inferred from the cards' native-versus-extended context wording and the Qwen Cloud notes on the Qwen3.8-27B card ([Qwen organisation](https://huggingface.co/Qwen)), read 2026-09-16.

## 5. Edge cases and failure modes

- **Preview is not stable.** The Gemini Pro row is a Preview model on Google's own page; Google's models page separates Stable from Preview models. Preview models can change or be withdrawn on shorter notice than stable ones. Check status before building on it ([Gemini models](https://ai.google.dev/gemini-api/docs/models)).
- **A dated price change is already scheduled.** Google's pricing page lists Gemini 3.8 Flash at one price through the end of 2026 and a higher one from the start of 2027 (see the `notes` column). A budget built on today's row will be wrong next year.
- **Free-tier data terms differ from paid.** Google's pricing page marks free-tier usage as used to improve Google's products and paid-tier usage as not. A prototype on a free key may be under different data terms than production ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).
- **Prompt-size thresholds bill the whole request.** OpenAI's model pages state that once a prompt crosses the stated input size, the higher rate applies to the full request, not just the tokens above the line. Long-context workloads can cost more than a naive per-token estimate.
- **The newest Llama is not necessarily the newest Meta model.** Meta's developer site also lists proprietary Muse models, which are out of scope here. The Llama rows are the newest Llama generation on Meta's Hugging Face organisation on the verification date; Llama 4's card describes it as a static model trained on an offline dataset.
- **Gated weights.** Meta's Llama repositories on Hugging Face show the model card publicly, but you must log in and review the licence conditions before you can access the model files.
- **A small table hides most of each catalogue.** OpenAI, Google and Anthropic each list many more models (older generations, "pro" and coding variants, realtime, audio, image and embedding models). This page caps rows per vendor on purpose.
- **Your tooling's memory may be older than this table.** Assistants and blog posts routinely cite retired ids, old limits and old prices. Anything not taken from a vendor page or API today is unverified.

## 6. Where this rots

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

Values lint cannot guard: the Llama context-length cells are two characters, below the lint's minimum literal length, so they are not indexed and rely on author discipline to stay correct; the Qwen dense model's parameter count is a substring of its own model name (`Qwen3.8-27B`) and was deliberately left out of `lint_literals` to avoid flagging every mention of the model. Re-check both by hand on refresh.

## 7. Proofs

None yet. A useful proof would call Anthropic's and Google's list endpoints (section 2) and assert each hosted record's `api_id` exists and its limits match `max_input_tokens`/`max_tokens` or `inputTokenLimit`/`outputTokenLimit`, and would check OpenAI ids against its list endpoint. It would need keys for all three vendors and could not check prices, OpenAI's limits, or any open-weight field, which are only on documentation pages and model cards.

## 8. Sources

Tier 1 — vendor canonical documentation and official model cards (read 2026-09-16):

- Anthropic, [Models overview](https://platform.claude.com/docs/en/models/overview), [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [List models API](https://platform.claude.com/docs/en/api/models/list)
- OpenAI, [Models](https://developers.openai.com/api/docs/models) and the per-model pages it links for GPT-6 Astra, GPT-5.6 Terra and GPT-5.6 Luna; [Pricing](https://developers.openai.com/api/docs/pricing); [List models API](https://developers.openai.com/api/reference/resources/models/methods/list)
- Google, [Gemini API models](https://ai.google.dev/gemini-api/docs/models) and the per-model pages it links for Gemini 3.8 Flash, Gemini 3.1 Pro Preview and Gemini 3.5 Flash-Lite; [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing); [models API reference](https://ai.google.dev/api/models)
- Meta, the Llama 4 Maverick and Llama 4 Scout model cards in the [meta-llama organisation on Hugging Face](https://huggingface.co/meta-llama)
- Alibaba Qwen, the Qwen3.8-2.4T-A95B and Qwen3.8-27B model cards in the [Qwen organisation on Hugging Face](https://huggingface.co/Qwen)

The exact per-model URL for every row is the `source` field of its record in `data/`. They are not linked here because each URL contains the model id, which is a tracked value (see "Did the contract hold").

Tier 3/4 — third-party leaderboards, linked for direction only; no values taken (read 2026-09-16):

- [Arena leaderboard](https://arena.ai/leaderboard)
- [SWE-bench leaderboards](https://www.swebench.com/)
- [Artificial Analysis model leaderboards](https://artificialanalysis.ai/leaderboards/models)
