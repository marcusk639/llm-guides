---
title: Open-weight models
summary: >-
  Open-weight models from Meta Llama and Alibaba Qwen as stated in each official
  model card on the verification date: model ids, parameter counts, context
  lengths and licences. There is no price column, because what you pay depends
  on where and how you run the weights.
topic: providers
verified: "2026-10-06"
applies_to:
  - "Hugging Face model cards in the meta-llama and Qwen organisations as published on 2026-10-06"
  - "Rows: Llama 4 Maverick, Llama 4 Scout; Qwen3.8-2.4T-A95B, Qwen3.8-27B"
sources:
  - https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct
  - https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct
  - https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B
  - https://huggingface.co/Qwen/Qwen3.8-27B
  - https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE
  - https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/LICENSE
related:
  - guides/models/comparison.md
research: research/models/2026-10-06-claude-models-comparison-refresh.md
---

# Open-weight models

## 1. What this covers / who it's for

The current open-weight model families this corpus tracks, as each vendor states
them on its own model card. For anyone choosing weights to run themselves, or
comparing an open-weight option against a hosted API.

## 2. The 60-second version

Open-weight models, as stated in each official model card on the verification date. There is no price column: what you pay depends on where and how you run the weights.

<!-- corpus:table fields=vendor,name,model_id,parameters,context_length,licence,notes headers="Vendor,Model,Model ID,Parameters,Context length,Licence,Notes" sort=vendor tag=comparison-open-weight -->
| Vendor | Model | Model ID | Parameters | Context length | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Alibaba Qwen | Qwen3.8-2.4T-A95B | Qwen/Qwen3.8-2.4T-A95B | 2.4T in total and 95B activated | 262,144 natively and extensible up to 1,010,000 tokens | Qwen3.8-Max License |  |
| Alibaba Qwen | Qwen3.8-27B | Qwen/Qwen3.8-27B | 27B | 262,144 natively and extensible up to 1,000,000 tokens | Apache License 2.0 | Hugging Face lists this repository's pipeline_tag as image-text-to-text rather than text-generation, and the model card carries a VL Performance section beside its Text Performance section. Whether the vendor states a text-only output modality is not established by the pages read on 2026-10-06. |
| Meta | Llama 4 Maverick | meta-llama/Llama-4-Maverick-17B-128E-Instruct | 17B (Activated), 400B (Total) | 1M | Llama 4 Community License Agreement |  |
| Meta | Llama 4 Scout | meta-llama/Llama-4-Scout-17B-16E-Instruct | 17B (Activated), 109B (Total) | 10M | Llama 4 Community License Agreement |  |
<!-- /corpus:table -->

Cards are published per model and are the authority for these figures. To check
a row, open the card linked in section 8 and read the figure there rather than
trusting this table.

## 3. How it actually works

A model card describes **weights**, not a service. Parameter counts, context
length and licence are properties of the released checkpoint; latency, uptime
and price are properties of whoever serves it. A host running these weights may
configure a shorter context than the card's maximum, so the card states a
ceiling rather than what any given endpoint offers.

This is why the table has no price column at all. What an open-weight model
costs is a function of your hardware or your host, and no figure the vendor
publishes answers it.

## 4. Patterns that hold up

**Read the licence before the benchmark.** Open-weight licences differ
materially from one another and several carry conditions on commercial use that
depend on your revenue or user count. The licence column records which licence
applies; the card is the authority on its terms.

Evidence: **Documented** — licence names from each card's metadata and, for the
Qwen models, its linked licence file, read 2026-09-16. The Llama licence text
is distributed with the weights rather than linked from the card.

**Treat a released checkpoint as immutable.** A given model id names a fixed set
of weights. What changes is the lineup around it: new generations arrive and
older ones stop being recommended. That is why these records refresh on a slower
cadence than hosted API pricing.

Evidence: **Plausible** — practitioner inference from how these families have
been versioned; no vendor states it as a guarantee.

## 5. Edge cases and failure modes

**A mixture-of-experts card gives two parameter counts.** Activated and total
parameters measure different things, and quoting the wrong one misstates both
capability and hardware requirements. The table records what the card states.

**A blank cell means the card does not state that value.** It does not mean
zero, unlimited, or derivable from another column.

**A host's context is not the card's context.** Serving configuration can be
lower; check the endpoint, not this page.

Evidence: **Documented** — the mixture-of-experts parameter counts and the
native-versus-extended context wording come from the four cards, read
2026-09-16. The inference that a host may serve a shorter context than the card
states is **Plausible**: the cards say hosted versions differ in defaults, but
none states a floor.

## 6. Where this rots

| Claim                      | Record                            | Volatility | Why it moves                                        |
| -------------------------- | --------------------------------- | ---------- | --------------------------------------------------- |
| Llama 4 Maverick row       | `meta.models.llama-4-maverick`                                                        | medium       | A new Llama generation would supersede it                   |
| Llama 4 Scout row          | `meta.models.llama-4-scout`                                                           | medium       | Same                                                        |
| Qwen3.8-2.4T-A95B row      | `qwen.models.qwen3-8-2-4t-a95b`                                                       | medium       | Fast Qwen release cadence; licence terms                    |
| Qwen3.8-27B row            | `qwen.models.qwen3-8-27b`                                                             | medium       | Same                                                        |

Not lint-guarded, so re-check it by hand: the Qwen3.8-27B parameter count. Its
value is embedded in the model id, so the record omits it from `lint_literals`
(see the header comment in `data/models-other.yaml`) and the bare-value scan
cannot catch it drifting.

Identifiers to re-check against `applies_to`: the model card URLs themselves,
which move when a vendor reorganises its Hugging Face organisation, and the
licence names, which change only when a vendor relicenses a release.

These records sit at `medium` volatility rather than `high` because a released
checkpoint's weights are immutable and carry no price, so the repricing that
drives the hosted pages' 30-day cadence cannot happen here. What does move is
the lineup, on a release cadence — and, as the table above says, licence terms,
which a vendor can revise on an already-published model. If a licence revision
is ever missed by more than a few weeks, that is the signal these records belong
back at `high`.

Deliberately absent: benchmark scores, which this corpus links but never
transcribes; and any figure about serving cost, which depends on the host.

## 7. Proofs

None ships. A proof could read each card's metadata and assert the parameter
count and context length match this table, which would make those two columns
Verified rather than Documented.

## 8. Sources

- [Llama 4 Maverick model card](https://huggingface.co/meta-llama/Llama-4-Maverick-17B-128E-Instruct)
- [Llama 4 Scout model card](https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct)
- [Qwen3.8-2.4T-A95B model card](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B)
- [Qwen3.8-27B model card](https://huggingface.co/Qwen/Qwen3.8-27B)
- [Qwen3.8-2.4T-A95B licence](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B/blob/main/LICENSE)
- [Qwen3.8-27B licence](https://huggingface.co/Qwen/Qwen3.8-27B/blob/main/LICENSE)

Related: [Comparing models across vendors](../models/comparison.md).
