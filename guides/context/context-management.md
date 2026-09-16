---
title: Context management
summary: >-
  Why the context window is the scarce resource in LLM work, what actually fills
  it, how quality degrades as it grows, and the strategies that keep it lean:
  selection and retrieval, compaction, caching, subagent isolation, and small
  durable instructions.
topic: context
verified: 2026-09-16
applies_to:
  - "Concept: model-agnostic (any transformer LLM with a finite context window)"
  - "Claude examples: Claude API and Claude Code documentation as published on 2026-09-16"
sources:
  - https://docs.claude.com/en/docs/build-with-claude/context-windows
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://docs.claude.com/en/docs/build-with-claude/prompt-caching
  - https://docs.claude.com/en/docs/build-with-claude/context-editing
  - https://docs.claude.com/en/docs/build-with-claude/compaction
  - https://docs.claude.com/en/docs/build-with-claude/token-counting
  - https://docs.claude.com/en/api/messages-count-tokens
  - https://docs.claude.com/en/api/models-list
  - https://code.claude.com/docs/en/sub-agents
  - https://code.claude.com/docs/en/memory
  - https://code.claude.com/docs/en/context-window
  - https://arxiv.org/abs/2307.03172
  - https://research.trychroma.com/context-rot
  - https://platform.openai.com/docs/guides/prompt-caching
  - https://ai.google.dev/gemini-api/docs/caching
related: []
seed: true
---

# Context management

## 1. What this covers / who it's for

What the context window is, why it — not model intelligence — is usually the binding constraint, and the handful of strategies that keep it working for you.
For anyone building on or working with an LLM; beginners can stop after section 2, experts can skip to section 5.

## 2. The 60-second version

The context window is everything the model can see when it generates a response: system prompt, tool definitions, the whole conversation so far, anything you retrieved, every tool result — and the response itself ([Anthropic: context windows](https://docs.claude.com/en/docs/build-with-claude/context-windows)).
It is finite, you pay for every token in it on every request, and **more is not automatically better**: as it fills, accuracy and recall degrade ("context rot").

The one habit that matters: **measure what you are putting in before you put it in.** This script asks the Claude API for a current model and its input limit (no hard-coded model id or limit to go stale), then counts how many tokens a short system prompt costs versus a whole file. Token counting is free to call, though rate-limited ([token counting](https://docs.claude.com/en/docs/build-with-claude/token-counting)).

```bash
#!/usr/bin/env bash
# Requires: bash, curl, jq 1.6+, and ANTHROPIC_API_KEY in the environment.
# Usage: ./measure.sh path/to/any/large/text/file
set -euo pipefail
API=https://api.anthropic.com/v1
H=(-H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01")

# The Models API lists the most recent models first; each carries its input limit.
# -f makes curl exit non-zero on an HTTP error instead of passing the error body on.
curl -sSf "$API/models" "${H[@]}" | jq '.data[0] | {id, max_input_tokens}'
MODEL=$(curl -sSf "$API/models" "${H[@]}" | jq -r '.data[0].id')

# Reads the system prompt from a FILE (--rawfile), never from argv,
# so large files don't hit the OS argument-size limit.
count() {
  jq -n --arg m "$MODEL" --rawfile s "$1" \
    '{model: $m, system: $s, messages: [{role: "user", content: "Summarize this."}]}' |
    curl -sSf "$API/messages/count_tokens" "${H[@]}" \
      -H 'content-type: application/json' -d @- | jq -e .input_tokens
}

short=$(mktemp)
trap 'rm -f "$short"' EXIT
printf '%s' 'You are a helpful assistant.' > "$short"

short_tokens=$(count "$short")
file_tokens=$(count "$1")
echo "short system prompt: $short_tokens tokens"
echo "with $1 pasted in:    $file_tokens tokens"
```

Run it on a log file or a big source file and compare the second number to `max_input_tokens`. That ratio — how much of the window one careless paste consumes — is the whole subject of this page.

## 3. How it actually works

**The window is working memory, not knowledge.** Training data is what the model learned; the context window is what it can reference _right now_. Anthropic's docs describe it in exactly those terms ([context windows](https://docs.claude.com/en/docs/build-with-claude/context-windows)). Nothing persists between API calls except what you send again.

**It only grows unless you intervene.** In a standard API conversation each user message and assistant response accumulates, and previous turns are preserved completely. The client resends the full history on every request. Chat products may trim on a rolling basis; the raw API does not.

**What fills it, in practice.** In roughly the order a request is assembled:

| Occupant                             | Why it matters                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool definitions                     | Present on every request whether or not a tool is used. Many tools with long descriptions are a fixed tax.                                                                                                                                                                                                                                  |
| System prompt / durable instructions | Also on every request. In Claude Code, CLAUDE.md files above the working directory load at launch, and `@path` imports load with them ([memory](https://code.claude.com/docs/en/memory)).                                                                                                                                                   |
| Conversation history                 | Every prior turn, verbatim, unless cleared or compacted.                                                                                                                                                                                                                                                                                    |
| Retrieved content                    | Documents, search results, file contents you chose to include.                                                                                                                                                                                                                                                                              |
| Tool results                         | Can dwarf everything else: Claude Code's docs single out test runs, documentation fetches, and log files as operations that consume significant context ([subagents: isolate high-volume operations](https://code.claude.com/docs/en/sub-agents#isolate-high-volume-operations)).                                                           |
| Reasoning tokens                     | With thinking enabled, thinking tokens count toward the window. Whether _previous_ turns' thinking stays in context is model-dependent: newer Claude models keep it by default, earlier ones strip it ([context windows](https://docs.claude.com/en/docs/build-with-claude/context-windows)). Check the per-model table rather than assume. |
| The response being generated         | Output counts too, so a nearly full window also limits how much the model can say.                                                                                                                                                                                                                                                          |

**Why more context hurts, not just costs.** Anthropic's engineering team frames it as an "attention budget": transformers relate every token to every other token (n² pairwise relationships for n tokens), models are trained mostly on shorter sequences, and each added token draws down the budget. Their conclusion is that degradation "emerges across all models", some more gently than others ([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Independent evidence points the same way:

- _Lost in the Middle_ (Liu et al., 2023) found performance is often highest when relevant information sits at the beginning or end of the input and degrades significantly when it sits in the middle, even for long-context models ([arXiv 2307.03172](https://arxiv.org/abs/2307.03172)).
- Chroma's _Context Rot_ report held task difficulty constant and still found performance degrading with input length across the models it tested ([Chroma](https://research.trychroma.com/context-rot)). Chroma sells retrieval infrastructure, so it has an interest in this conclusion; its method is published and checkable.

The mental model: **the window is a budget, the goal is the smallest set of high-signal tokens that gets the job done** (Anthropic's own phrasing of the principle).

## 4. Patterns that hold up

Each recipe carries one evidence label, applied as defined in the corpus contract's [evidence labels](../../CLAUDE.md#evidence-labels) and [source tiers](../../CLAUDE.md#source-tiers). Nothing on this page is **Verified** — no proof in this repository backs these claims yet.

### 4.1 Retrieve just in time; keep references, not payloads

Instead of loading everything up front, keep lightweight identifiers (file paths, stored queries, links) in context and load the actual content with tools when needed. Anthropic describes a hybrid as often most effective: retrieve a little up front for speed, explore the rest on demand. Claude Code is its example — CLAUDE.md loads up front, while glob and grep pull in files just in time.

Evidence: **Documented** — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Anthropic engineering, published 2025-09-29; read 2026-09-16).

### 4.2 Put stable content first so it can be cached

Prompt caching reuses a previously processed prompt _prefix_. On the Claude API the prefix order is `tools` → `system` → `messages`, a change at any level invalidates that level and everything after it, and hits require the cached segment to be identical. So: frozen tool list, frozen system prompt, then history, with anything volatile (timestamps, per-request IDs) after the last `cache_control` breakpoint. The default cache lifetime is <!-- corpus:data key=anthropic.prompt_caching.default_ttl -->5 minutes<!-- /corpus:data -->, refreshed on each use, with an optional <!-- corpus:data key=anthropic.prompt_caching.extended_ttl -->1 hour<!-- /corpus:data --> lifetime. Check `usage.cache_read_input_tokens` to confirm hits.

Caching reduces cost and latency of carrying context; it does **not** reduce how much context the model has to attend to. It is a cost strategy, not a quality strategy.

The prefix principle is model-agnostic: OpenAI's and Google's caching docs both reward identical, common content at the start of the prompt, though their lifetimes, minimum lengths, and implicit-versus-explicit modes differ from Anthropic's and from each other ([OpenAI](https://platform.openai.com/docs/guides/prompt-caching), [Gemini](https://ai.google.dev/gemini-api/docs/caching)).

Evidence: **Documented** — [Anthropic prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching), read 2026-09-16.

### 4.3 Clear stale tool results before summarizing anything

Old tool results are usually the cheapest thing to drop: the model already acted on them. On the Claude API, context editing (beta) clears the oldest tool results automatically once the prompt passes a configurable threshold, keeping the most recent ones; you can exclude specific tools. Clearing breaks the prompt cache at the clearing point, so the docs recommend clearing enough at once (`clear_at_least`) to make the cache write worthwhile.

Evidence: **Documented** — [Anthropic context editing](https://docs.claude.com/en/docs/build-with-claude/context-editing), read 2026-09-16.

### 4.4 Compact long-running work into a structured summary

When history itself is the problem, replace it with a summary and continue. Claude API compaction (beta) does this server-side at a trigger threshold and returns a `compaction` block that you must send back; content before it is dropped. The SDK's default summary prompt asks for task overview, current state, discoveries (including failed approaches), next steps, and context to preserve — a good checklist even for hand-rolled compaction. Claude Code's `/compact` does the same for a session.

Evidence: **Documented** — [Anthropic compaction](https://docs.claude.com/en/docs/build-with-claude/compaction) and [context editing: client-side compaction](https://docs.claude.com/en/docs/build-with-claude/context-editing), read 2026-09-16.

### 4.5 Delegate high-volume work to a subagent with its own context

A subagent starts with a fresh, isolated context window, does the noisy work (running tests, reading logs, fetching documentation), and returns only a summary to the parent. The verbose output never enters the main conversation. The trade: the subagent does not see your conversation history, so the delegation message has to carry the task. Independent research paths can run as parallel subagents.

Evidence: **Documented** — [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and [Explore the context window](https://code.claude.com/docs/en/context-window), read 2026-09-16. The general architecture (clean-context sub-agents returning condensed summaries) is also described in [Anthropic's engineering post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

### 4.6 Keep always-loaded instructions small and specific

Anything loaded on every request is paid for on every request. Claude Code's docs say CLAUDE.md files over <!-- corpus:data key=claude_code.claude_md.adherence_line_threshold -->200 lines<!-- /corpus:data --> consume more context and may reduce adherence, and recommend path-scoped rules that load only for matching files. Note that splitting into `@path` imports helps organization but does **not** reduce context, since imports load at launch. Prefer instructions the model cannot derive from the code (pitfalls, rationale, non-default conventions) over things it can (directory layouts, dependency lists).

Evidence: **Documented** — [Claude Code memory](https://code.claude.com/docs/en/memory), read 2026-09-16.

### 4.7 Put the question and critical facts at the edges, not the middle

Given position effects, place the instruction or question after long material, and avoid burying the one fact that matters in the middle of a large paste.

Evidence: **Plausible** — inferred from _Lost in the Middle_ ([arXiv 2307.03172](https://arxiv.org/abs/2307.03172)), which tested 2023-era models on two retrieval tasks. Whether the effect holds with the same strength on current models is not established by that paper; test on your own model and task.

### 4.8 Start a fresh context when the task changes

When you switch to an unrelated task, carrying the old history forward spends budget on irrelevant tokens and, per the degradation evidence above, may make the new task worse. A new session (with durable facts in instruction files or notes) is often better than compaction.

Evidence: **Plausible** — follows from the documented accumulation and context-rot behavior, and is widely repeated by practitioners, but no canonical source states it as a measured result.

## 5. Edge cases and failure modes

- **Silent cache invalidators.** A timestamp in the system prompt, a varying tool set, or unstable key order in `tool_use` content blocks makes every request a cache miss with no error. Anthropic's troubleshooting list notes that some languages (Swift and Go are its examples) randomize key order during JSON conversion. Symptom: `cache_read_input_tokens` stays zero ([prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)).
- **Clearing and caching fight each other.** Every context edit or compaction rewrites the prefix, so the next request pays a cache write. Frequent small clears can cost more than they save.
- **Compaction loses what the summary omits.** A summary is lossy by construction; Anthropic warns that overly aggressive compaction can drop subtle context whose importance only shows up later ([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Instructions given only in conversation can vanish; Claude Code re-injects project-root CLAUDE.md after `/compact`, but nested CLAUDE.md files and path-scoped rules reload only when matching files are read again ([memory](https://code.claude.com/docs/en/memory)). Durable instructions belong in files, not chat.
- **Compaction can itself fail.** The Claude API documents cases where no summary comes back (for example, no room left for the summarization prompt), returning empty content with the reason in `stop_reason` ([compaction](https://docs.claude.com/en/docs/build-with-claude/compaction)). Compact before the window is completely full, not at the last moment.
- **Subagent summaries are a trust boundary.** The parent sees only what the subagent reports. A subagent that misreads a log returns a confident, wrong summary with no raw evidence attached.
- **Thinking and history editing.** On some newer Claude models, client-side edits to earlier turns can invalidate thinking blocks in later assistant turns, and for some accounts the API rejects a replayed invalidated block; server-side context management is documented not to have this problem on at least one current model. Check the per-model rules before building a harness that rewrites history ([context editing](https://docs.claude.com/en/docs/build-with-claude/context-editing)).
- **"Fits" is not "works".** A prompt under the model's input limit can still perform badly. The limit tells you what the API accepts, not what the model uses well.
- **Imports are not savings.** Moving instructions into imported files changes where they live, not whether they load.

## 6. Where this rots

Most of this page should not rot: the window as working memory, accumulation, degradation with length, and the strategy families (select, clear, compact, cache, isolate, keep instructions small) are properties of how current LLMs work and have held across model generations.

What does rot, and what to re-check:

| Claim                                      | Record                                           | Volatility | Why it moves                                                  |
| ------------------------------------------ | ------------------------------------------------ | ---------- | ------------------------------------------------------------- |
| Default prompt-cache lifetime              | `anthropic.prompt_caching.default_ttl`           | medium     | Pricing/infrastructure decision; other vendors already differ |
| Extended prompt-cache lifetime             | `anthropic.prompt_caching.extended_ttl`          | medium     | Same                                                          |
| CLAUDE.md size at which adherence may drop | `claude_code.claude_md.adherence_line_threshold` | medium     | Product guidance that tracks model and harness changes        |

Identifiers on this page that are tied to the version in `applies_to` and should be re-checked on refresh, but are not tracked as records: the beta status, parameter names, and defaults of context editing and compaction, `cache_control`, `cache_read_input_tokens`, `max_input_tokens`, the `/compact` command, and per-model thinking-block preservation. The runnable example deliberately fetches the model id and input limit live so it does not rot.

Deliberately absent: context-window sizes and prices. They change with every model release and belong on a models page, not a concept page.

## 7. Proofs

None yet. Candidate proofs that would upgrade labels on this page: a cache-hit check (identical prefix twice, assert `cache_read_input_tokens > 0`) for 4.2, and a count-tokens check that `@path`-style inclusion does not reduce input tokens for 4.6.

## 8. Sources

Tier 1 — vendor canonical documentation:

- Anthropic, [Context windows](https://docs.claude.com/en/docs/build-with-claude/context-windows)
- Anthropic, [Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
- Anthropic, [Context editing](https://docs.claude.com/en/docs/build-with-claude/context-editing)
- Anthropic, [Compaction](https://docs.claude.com/en/docs/build-with-claude/compaction)
- Anthropic, [Token counting](https://docs.claude.com/en/docs/build-with-claude/token-counting), [Count tokens API](https://docs.claude.com/en/api/messages-count-tokens), [List models API](https://docs.claude.com/en/api/models-list)
- Claude Code, [Subagents](https://code.claude.com/docs/en/sub-agents), [Memory](https://code.claude.com/docs/en/memory), [Explore the context window](https://code.claude.com/docs/en/context-window)
- OpenAI, [Prompt caching](https://platform.openai.com/docs/guides/prompt-caching)
- Google, [Gemini context caching](https://ai.google.dev/gemini-api/docs/caching)

Tier 2 — papers and engineering blogs:

- Anthropic engineering, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09-29)
- Liu et al., [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) (2023)
- Chroma, [Context Rot: How Increasing Input Tokens Impacts LLM Performance](https://research.trychroma.com/context-rot) (vendor technical report)
