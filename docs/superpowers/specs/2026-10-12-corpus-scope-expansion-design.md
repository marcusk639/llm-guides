---
title: Corpus Scope Expansion — Design
date: 2026-10-12
status: draft
---

# Corpus Scope Expansion — Design

Three additions to what the corpus covers: a `security` topic, per-provider
_practice_ pages held separate from the per-provider _facts_ pages, and a home
for skills. Each is chosen to fit inside the maintenance budget the roadmap
already commits to, which is the binding constraint on everything here.

This is a scope spec. It decides what the corpus should cover and where each
subject lives. It does not plan the writing: every page it names is still
gated by `research-required`, and the research cycle is a separate piece of
work that must land first.

## The problem, stated precisely

Measured on 2026-10-12:

- The taxonomy carries 15 topics. **10 of them have zero pages.**
- Six pages exist, across five topics: `claude-code`, `context`, `domains`,
  `models`, and two under `providers`.
- `research/` holds two artifacts, and both are refreshes of the **same**
  models unit. Nothing in the repository grounds a page that does not yet
  exist.
- The roadmap projects **~44 h/yr against a 48 h budget** after Stage 4.

So the gap is not that the corpus lacks ambition about scope. Stages 2 through
4 already name `prompting`, `context`, `agents`, `tools`, `evals`, `harness`,
`multimodal` and `orchestration`. Two things are actually missing, and one
thing is actually blocking:

1. **Per-provider practice has no page anywhere.** Stage 1 is the provider
   _facts_ layer — ids, prices, limits. How a reader should work differently
   against one vendor than another is a different subject and appears in no
   stage.
2. **Security has no topic at all.** Prompt injection, tool-use blast radius
   and sandboxing are absent from `meta/taxonomy.yaml`. `harness` is the
   nearest neighbour and covers something else (see Decision 1).
3. **The research gate, not scope, is what stops pages being written.** Any
   plan written before a research cycle produces either vendor facts from
   memory — which the contract forbids outright — or "author sections 1-8"
   placeholders, which is what Stage 0's Task 3 shipped and a review caught.

## The budget is the design constraint

Every page added costs maintenance for as long as it exists, and the roadmap
has already spent most of the allowance. Using the roadmap's own figure of
~0.3 h/yr for an evergreen page:

| Addition              | Pages | Cost          |
| --------------------- | ----- | ------------- |
| `security`            | ~3    | ~0.9 h/yr     |
| Per-provider practice | ~4    | ~1.2 h/yr     |
| Skills                | 1     | ~0.3 h/yr     |
| **Total**             | ~8    | **~2.4 h/yr** |

Headroom after Stage 4 is 48 − 44 = **4 h/yr**. This fits, with ~1.6 h/yr
left. It only fits because every page below is evergreen and carries **no
`data/` records**. The moment one of them carries a high-volatility value it
moves onto the 30-day clock and the arithmetic collapses — that is finding F2,
and it is the reason each decision below states its record posture explicitly.

## What not to copy from the reference example

`cc.bruniaux.com` was offered as the model. It ships 25K+ lines, 278
templates, 184 tracked CVE records and a 473-question quiz, maintained by one
person. That is possible because it carries **no per-value verification
contract**: no record behind each figure, no `verified` date, no cadence clock,
no refresh unit.

This corpus pays a tax that site does not. Copying its breadth would exhaust
the 48 h budget before the content landed, and the first stale price would
falsify the one promise the corpus makes that the reference site never made.

What _is_ worth taking from it is the half that costs no cadence: artifacts
**derived** from content that already exists — a cheat sheet, recap cards, an
MCP server over the corpus. Those carry no records, so they add no clock.
They are out of scope here and specified separately.

## Decision 1: `security` is its own topic, not part of `harness`

Add `security` to `meta/taxonomy.yaml`.

**Why not fold it into `harness`.** `harness` covers guardrails, long-running
automation, trust and observability — the problem of _operating_ an agent you
already trust, over time, without watching it. Security is the problem of
_adversarial_ input: a tool result that contains instructions, a prompt that
exfiltrates context, a blast radius larger than the task. The failure model is
different, and so is the reader: one arrives asking "how do I leave this
running overnight", the other asking "what can this do to me if the page it
read is hostile".

**The alternative, stated.** Folding it into `harness` keeps the taxonomy at 15
and avoids a boundary dispute between two adjacent topics. The cost is that
"guardrails" would have to mean both continuity controls and adversarial
controls, and a reader searching for injection would land on a page mostly
about long-running loops.

**Record posture: no records.** Concept pages only — the mechanics of
injection, the control surfaces, the blast-radius model. See "Deliberately
absent" for why an advisory database is excluded.

**This is a contract change.** `CLAUDE.md` states that adding a topic is a
contract change, so this decision needs the owner's sign-off before any page
is written, independently of the rest of this spec.

## Decision 2: provider practice is a separate page from provider facts

For each vendor the corpus covers in depth, a practice page sits beside the
facts page and carries no records.

**Why separate pages rather than a section.** The facts page references
high-volatility model rows, so it sits on the 30-day clock permanently. A
practice section inside it would inherit that cadence and be re-verified
twelve times a year to confirm that advice which has not changed still has not
changed. Split out, the same material is evergreen and costs ~0.3 h/yr. This
is the quarantine principle applied one level up: not just values off concept
pages, but _cadence_ off evergreen prose.

**The asymmetry worth naming.** Per-provider _facts_ are the most expensive
pages in the corpus. Per-provider _practice_ is among the cheapest. They look
like the same subject and have opposite maintenance profiles.

**Placement.** Beside the facts page under `providers`, because a reader
looking for "how do I work with this vendor" goes to that vendor, not to a
cross-cutting topic. The facts page links to it; it links back and states no
figures itself.

## Decision 3: where skills live depends on an answer the corpus does not have

Skills need a home. Which home is correct depends on whether they are a
portable cross-vendor concept or one vendor's product feature — and this spec
does not assert the answer, because asserting it would be writing a volatile
availability fact from memory, which the contract forbids.

- **If portable**: `agents`, as a concept page, alongside the agent vocabulary
  Stage 2 establishes.
- **If one vendor's feature**: `claude-code`, as a tool reference, in the
  archetype `claude-code/hooks.md` already demonstrates.

The research cycle resolves this, and the page is written wherever the answer
puts it. Treating the placement as open is cheaper than placing it twice.

## Deliberately absent

- **A template library.** The reference site's 278 templates are its best
  asset and the worst fit here: each would need per-vendor verification and a
  cadence, which is exactly the cost the budget cannot absorb.
- **A CVE or advisory database.** Tracking 184 advisory records implies a
  re-check cadence far shorter than 30 days. It is a different product with a
  different funding model, and pretending otherwise would put the whole corpus
  on a clock it cannot meet.
- **A quiz, and diagram galleries.** Presentation layers over content that
  does not exist yet.
- **Derived artifacts** — cheat sheet, recap cards, MCP server over
  `search-index.json`. Genuinely valuable and genuinely cheap, but they are
  distribution, not scope, and they need no research cycle. Separate spec.
- **Writing any of these pages.** This spec adds topics and names subjects.
  `research-required` still gates every page, and no artifact grounds any of
  them today.

## Risks

- **The budget arithmetic holds only while these pages stay record-free.** One
  model id on a practice page moves it to the 30-day clock and costs ~12× its
  projected maintenance. The quarantine principle already forbids it; this is
  the first set of pages where the temptation is strong, because practice
  advice naturally reaches for a concrete model name.
- **`security` and `harness` will argue over a boundary.** Sandboxing and
  permissions can be read as either. Whichever topic a page lands in, the other
  should link rather than restate.
- **Per-provider practice is the hardest material in the corpus to source
  well.** Vendors publish facts; they rarely publish honest comparative
  practice. Much of this will be tier 3 and cap at **Plausible**, and a page
  that is mostly Plausible is worth less than its page count suggests.
- **Scope added now is scope unwritten for a long time.** Ten topics are
  already empty. Adding an eleventh and a twelfth makes the gap between the
  taxonomy's promise and the corpus's contents wider, not narrower, until the
  research cycle runs.

## Open questions

1. Does `security` earn its own topic, or does `harness` absorb it? Decision 1
   argues for separate on a different-failure-model basis; the counter-argument
   is a smaller taxonomy and no boundary to police. Taxonomy changes are
   contract changes, so this one is the owner's.
2. Which vendors get practice pages? The facts layer covers four. Practice for
   all four doubles that page count; practice for the two largest keeps the
   budget headroom closer to 2.5 h/yr.
3. Should per-provider practice instead live under `prompting` as one
   comparative page rather than one page per vendor? A single page compares
   better and costs less; per-vendor pages are easier to find and easier to
   refresh independently.
4. Does anything here outrank the remaining roadmap stages? This spec assumes
   it is additive to Stages 2-4, not a reordering of them.
