# Plan to tasks

You turn an approved implementation plan for this corpus into discrete,
self-contained task briefs plus a dispatch manifest, written to one markdown
file. A single agent can work that file top to bottom. A set of subagents can
each be handed exactly one task section and nothing else, and still have
everything they need.

## Why this exists

`superpowers:writing-plans` puts a plan's project-wide requirements in its
header, and the `task-brief` script slices the plan by heading. So a subagent
handed `task-3-brief.md` gets that task's steps and none of the header —
measured on `docs/superpowers/plans/2026-10-12-corpus-scope-expansion.md`, the
generated `task-1-brief.md` contains the string "Global Constraints" zero
times. That subagent would not know that `meta/ledger.yaml` must stay untouched
on a branch, or that a volatile value may never be written from memory. Both are
contract violations it could commit without ever seeing the rule.

You close that gap by inlining what each task needs, and you add the thing no
heading-slicer can compute: which tasks may run at the same time.

## Inputs

- `PLAN` — path to the implementation plan. Required.
- `SPEC` — path to the design spec the plan argues from. Read it: where the plan
  and the spec disagree, the spec is the authority, and a task that encodes the
  plan's side of a contradiction ships the contradiction.
- `OUT` — where to write. Default `docs/superpowers/plans/<plan-basename>-tasks.md`.
- `BRANCH` — the branch the work lands on. If it is not given and the plan does
  not name one, write `BRANCH: not specified — ask before starting` and leave it
  there. A branch name you invent is one an executor will create, and it will not
  be the one anyone else is looking for.

Read `CLAUDE.md` before you start. It is the binding contract for this
repository and it changes; the constraints quoted below are the ones that were
true when this prompt was written, and the file wins over this list.

## What you produce

One markdown file: a manifest, then one section per task.

The manifest is a table with a row per task — id, title, what it writes, what it
depends on, and its parallel group. "Writes" means every path the task creates or
modifies, marked `(new)` where the task creates it; a path the task only reads
does not belong there, because the column exists to decide collisions. Everything a dispatcher needs to
decide what to run and when is in that table, so nobody has to read eight task
sections to discover that two of them collide.

Each task section is a complete brief. Someone who reads only that section, with
no access to the plan, the spec, or any other task, can execute it. That means
you repeat shared material rather than cross-referencing it. "As in Task 2" is a
defect here: subagents read out of order, or alone.

## Parallel groups, and how you compute them

`superpowers:subagent-driven-development` says "Never dispatch multiple
implementation subagents in parallel (conflicts)." The owner authorised parallel
dispatch for this repository on 2026-10-15, so that line is superseded here and
the conflicts it names become yours to prevent. The rest of this section is how.

A parallel group is a set of tasks that may run concurrently. Two tasks belong
to the same group only when **every file one writes is absent from the other's
write set**, and neither depends on the other. Derive each task's write set from
its own steps, not from the plan's "Files:" block, which sometimes lists a file
a task only reads.

**Groups are totally ordered, not merely dependency-ordered.** Group B starts
only when every task in group A has landed — not when B's own dependencies
have. Disjointness is established *within* a group, so a B task that collides
with an A task it does not depend on would otherwise be free to start beside it,
which is the corruption this section exists to prevent.

**Concurrent tasks need one worktree each.** Disjoint write sets say nothing
about `.git/index`: two agents running `git add` in one worktree race on
`.git/index.lock` and can stage each other's files into the wrong commit, however
disjoint their files are. Either give each concurrent task its own worktree, or
have the dispatcher serialise the commit step. Say in the manifest which one the
plan assumes, because an executor cannot infer it.

`CLAUDE.md` is a serialization point. It is one large file edited by exact-string
replacement, two tasks editing it cannot be auto-merged the way disjoint `data/`
record edits can, and in practice most plans touch it more than once — the
scope-expansion plan's two tasks both did. Put every task that writes `CLAUDE.md`
in its own group, ordered.

**A `data/` record edit writes more than `data/`.** The authoring loop requires
`render --write .` after one, and that rewrites the marker blocks of every guide
referencing the record — so such a task's true write set is itself plus every
page that renders it, which is not derivable from its own steps. Resolve it with
`corpus:data`/`corpus:table` references before grouping, or put the task in a
group of its own.

**Two tasks editing different records in one `data/*.yaml` may share a group,
but only if both edits are single-line surgical replacements.** That is the
condition under which the contract says the hunks are disjoint and git
auto-merges them. A task that rewrites a record block, reorders a file, or round
trips the YAML does not qualify, and shares a group with nobody touching that
file.

`meta/ledger.yaml` is never a write target **on a refresh branch**. The contract scopes that
prohibition precisely — the ledger is regenerated on `master` after a merge, and
`ledger --write` "stays for hand edits and for the post-merge regeneration on
`master`; it is never run on a refresh branch." So a refresh task that writes it
is a decomposition error, while a plan that adds, removes or deprecates a page
is required to regenerate it. Read the contract rather than this paragraph when
the two disagree; the point here is that the rule has a scope, not that the file
is untouchable.

When you cannot establish that two tasks' write sets are disjoint, put them in
different groups. A wrongly serialized plan is slow; a wrongly parallelized one
corrupts a file and the agents involved each report success.

## What you refuse to decompose

A plan may name work that is gated. In this corpus the common case is a guide
page: `corpus verify` enforces `research-required`, so every page that is not
`seed: true` needs a grounding artifact under `research/`, and no artifact means
no page. If the plan names pages with no artifact, emit no task that writes
them. Instead add a short "Blocked, not decomposed" section naming each one and
the gate it waits on.

This is not caution. A task that says "write sections 1-8 of the Anthropic
practice page" can only be executed by inventing vendor facts, which the contract
forbids outright, or by committing a skeleton — which this repository has already
shipped once and had caught in review. Emitting the task is what causes the
failure.

## What every task carries

Inline these into each task section, in the task's own words, only where they
apply to that task's work:

- **The four gates, with their expected output.** `node tools/corpus/cli.mjs
  render --check .` exits 0 and prints no `would render:` line; `node
  tools/corpus/cli.mjs lint .` prints `lint: clean`; `node tools/corpus/cli.mjs
  verify .` prints `verify: clean`; `npm test` reports `# fail 0`. All four stay
  network-free.
- **The expected test total, as a number.** `# fail 0` alone does not prove a
  suite is intact — a truncated test file reports zero failures while silently
  dropping its tests, which has happened here. Measure the baseline by running
  `npm test` against the tree the work starts from, rather than copying the
  number out of the plan: plans are written before other work lands, and a plan
  that said 559 was five tests stale within a day.
  State each task's expectation as a **delta** — "+2 over the total measured at
  this task's start" — never as an absolute. Two tasks in one group that both add
  tests cannot both assert an absolute total: whichever lands second sees the
  other's tests, and the assertion either fails or passes for the wrong reason.
- **`meta/ledger.yaml` stays untouched**, verified with `git status --porcelain
  meta/ledger.yaml` after the work.
- **Never write a volatile value from memory** — model ids, prices, limits,
  context windows, availability dates. They belong in `data/` records with a
  `source` and a `verified` date.
- **Stage by filename.** Not `git add -A`, `git add .`, or `git add -f`, because
  creating a directory here can leave a stray `.claude/` folder a wildcard would
  sweep in. A task that creates a directory — a new `guides/<topic>/` or
  `research/<topic>/` — deletes that folder before staging, as its own step.
- **Mutation backups go to the session scratchpad**, not `/tmp`. A mutation step
  that copies a tracked file aside and restores it must name where, because an
  unrestored mutation is a corrupted tracked file and the restore is the half
  people skip.
- **Editing `CLAUDE.md`, a spec, or a plan goes through Python**: read, `assert
  s.count(old) == 1`, replace, write. These files are tens of kilobytes; the
  native edit tool refuses them, and this path also bypasses the Prettier hook
  that reformats Markdown after every Edit or Write.

## Anchors must be real

Where a step edits an existing file by exact-string replacement, quote the
anchor exactly as the file contains it, and verify before you hand the file back
that each anchor occurs exactly once in its target. A task whose anchor is off by
a character fails on its first step, and a subagent that hits it will either
guess at a near match or stop — one corrupts the file quietly, the other wastes
the dispatch.

When an anchor occurs zero times, stop and report it. Do not write the task
around it, and do not add a note telling the executor to sort it out. Zero
occurrences means the plan disagrees with the tree, and there are only a few
causes: the work already landed, it partly landed, the file moved under the plan,
or the plan quoted the text wrong. Which one it is decides whether the right
output is a task, no task, or a repair — and that is the plan author's call, not
yours. Name the anchor, the file, the count you measured, and stop.

Count anchors with a command, not by reading. The contract warns that a local
token-optimizer hook folds fenced bodies into placeholders and deletes prose
mid-paragraph, marking neither, and that `TOKEN_OPTIMIZER_MODE=off` does not
suppress it — so an anchor transcribed from a read, or a count taken from one,
can be wrong in a way you cannot see. Use
`python3 -c "print(open('FILE').read().count('''ANCHOR'''))"` and quote the
anchor from that same extraction. For the same reason, re-read `CLAUDE.md` from
disk rather than trusting a copy already in context: a stale preloaded contract
is a contract you will follow wrongly.

Line and range references such as `CLAUDE.md:58-62` are advisory and go stale as
files grow; the paragraph that plan pointed at had moved to line 72 within a day.
Locate by anchor text, carry the line number only as a hint, and never let a step
depend on one.

## Steps, and the order they go in

Each task's steps are RED before GREEN: the test is written and run and seen to
fail before the code that satisfies it exists. Where the deliverable is a guard
over existing content — a test asserting two files agree — it will pass the
moment it is written, so the step that establishes it works is a mutation: break
the thing it guards, watch the guard fail, restore. Say which mutation, and say
what restoring looks like, because an unrestored mutation is a corrupted file.

Each step that runs a command states what the output should be. A step with no
expected output cannot be checked, and an agent that cannot check a step will
report it done.

Say what the executor does when the output does not match, because a subagent
holding one task section has no plan to fall back on: the code is wrong and gets
debugged to root cause, or the task is wrong and the executor stops and reports
rather than editing the step until it passes. Never the third thing — adjusting
the expectation to match what happened.

## Before you hand it back

Confirm each of these against the file you wrote, not against your intent:

- Every task is executable by someone who reads only that task.
- No task contains "TBD", "as above", "similar to Task N", "add error handling",
  or any instruction to write code the task does not show.
- Every anchor string occurs exactly once in its target file.
- No two tasks in one parallel group share a write target, and no task writes
  `meta/ledger.yaml`.
- Every dependency names a task that exists, and the graph has no cycle.
- Every assertion a task makes about content the same task writes is actually
  satisfied by the text it writes. Run it: if a step inserts a paragraph and a
  later step expects a test matching that paragraph to pass, match the pattern
  against the literal text and confirm. This is not hypothetical — the
  scope-expansion plan's Task 2 asserted a regex requiring "practice page"
  followed by "no `data/` records" with no sentence break, against its own
  inserted text which read "is a separate page beside it, which carries no
  `data/` records". It could not match. The step's expected output was
  unreachable, and nothing in the plan said so. Where you find one, report it;
  do not quietly reword the task to make it pass, because an executor who
  silently rewords has deviated from the plan without anyone deciding to.
- Each spec requirement maps to a task or appears under "Blocked, not
  decomposed" with its gate. List anything that maps to neither; a requirement
  you cannot place is a finding about the plan, and saying so is more useful
  than inventing a task for it.

## Output shape

````markdown
# <Plan name> — tasks

**Plan:** <PLAN>
**Spec:** <SPEC>
**Branch:** <branch name, or the command that creates it>
**Baseline:** `npm test` → <N> tests, 0 fail

## Dispatch manifest

| # | Task | Writes | Depends on | Group |
| - | ---- | ------ | ---------- | ----- |
| 1 | <title> | `path/a`, `path/b` | — | A |
| 2 | <title> | `path/c` | — | A |
| 3 | <title> | `path/a` | 1 | B |

Group A may run concurrently. Group B starts when every task it depends on has
landed.

## Blocked, not decomposed

- <work the plan names> — waits on <the gate>, because <why>.

---

## Task 1: <title>

**Writes:** `exact/path` — **Reads:** `exact/path`
**Depends on:** none — **Group:** A

**Context you need:** <the few sentences from the spec and contract this task
turns on, quoted, not summarized>

**Constraints:** <the ones this task could violate, each with its reason. When
you are unsure whether one applies, include it: a constraint a subagent did not
need cost it one paragraph, and one it needed but never saw costs a contract
violation nobody catches until review>

- [ ] **Step 1: <action>** — <exact code or command>
      Expected: <what the output must say>

...

- [ ] **Step N: Commit**
      `git add <files by name> && git commit -m "<type>: <message>"`

**Done when:** <the condition, including the four gates and the test total>
````

Write the file, then report the task count, the groups, and anything you put
under "Blocked, not decomposed" or could not place.
