---
title: Software engineering with LLMs
summary: >-
  A task-by-task playbook for using LLM coding agents across the engineering
  lifecycle — understanding a codebase, planning, test-first implementation,
  debugging, refactoring, review, documentation, and operating safely — with
  the failure modes that matter most (hallucinated APIs, confident wrong fixes,
  tests edited to pass, scope creep, destructive commands, stale context) and a
  concrete check for each.
topic: domains
verified: 2026-09-16
applies_to:
  - "Workflow patterns: any agentic coding tool that reads files, edits them, and runs commands in a repository"
  - "Claude Code worked examples: Claude Code CLI 2.1.267, checked against the public documentation on code.claude.com as published on 2026-09-16"
  - "Empirical studies: as scoped in each citation (models, tasks, and dates named inline)"
sources:
  - https://code.claude.com/docs/en/best-practices
  - https://code.claude.com/docs/en/common-workflows
  - https://code.claude.com/docs/en/security
  - https://code.claude.com/docs/en/permissions
  - https://code.claude.com/docs/en/sandboxing
  - https://code.claude.com/docs/en/checkpointing
  - https://code.claude.com/docs/en/memory
  - https://code.claude.com/docs/en/permission-modes
  - https://code.claude.com/docs/en/settings-reference
  - https://code.claude.com/docs/en/hooks
  - https://developers.openai.com/codex/guides/agents-md
  - https://arxiv.org/abs/2510.20270
  - https://arxiv.org/abs/2406.10279
  - https://arxiv.org/abs/2507.09089
related:
  - guides/context/context-management.md
  - guides/claude-code/hooks.md
  - guides/models/claude-models.md
seed: true
---

# Software engineering with LLMs

## 1. What this covers / who it's for

Where LLM coding agents actually help in day-to-day engineering, how to set each task up so the output can be checked, and how each task goes wrong. Organized by engineering task, not by tool; Claude Code is the worked example, and tool-specific mechanisms are labeled as such.
For working software engineers. Beginners can stop after section 2; section 5 is the part to read before you let an agent work unattended.

## 2. The 60-second version

**The rule for every task: the agent does the work, a check you trust decides whether it is done.** Here is that rule as a concrete workflow for a small bug fix in a repository you don't know. The bug is synthetic; substitute your own symptom and your project's test command.

Start from a clean tree on a throwaway branch, so every change the agent makes shows up in one diff and can be discarded in one command:

```bash
git status --short          # should print nothing; commit or stash first
git branch --show-current   # note it: this is the branch to return to
git switch -c try/slug-fix
claude --permission-mode plan   # plan mode: no file edits until you approve; it can still run exploratory shell commands
```

**Prompt 1 — orient (still in plan mode: no file edits):**

```text
Don't change anything yet. Find where slugs are generated for article titles.
List the files involved with file:line references, the command that runs
the tests for that code, and the narrowest command that runs only those tests.
```

Leave plan mode by pressing Shift+Tab until the status bar shows `⏸ manual mode on` — not `⏵⏵ accept edits on`, and not auto or bypass-permissions mode, which can also appear in the cycle — then:

**Prompt 2 — reproduce first:**

```text
Bug: a title with two spaces between words ("Hello  World") produces
"hello--world"; expected "hello-world". Add ONE failing test for this next to
the existing slug tests. Run only that test and show me the failing output.
Do not change any non-test file yet.
```

**Prompt 3 — fix under constraints:**

```text
Make that test pass with the smallest change to non-test code. Do not edit,
skip, or delete any existing test. If an existing test looks wrong, STOP and
tell me why instead of changing it. Then run the full test suite and paste the
final summary lines.
```

**Then check it yourself — don't take the summary's word for it:**

```bash
git status --short              # includes NEW files, which git diff alone does not show
git add -N .                    # mark new files so the diffs below include them
git diff --stat                 # only the files you expected to change?
git diff -- '*test*' '*spec*'   # test changes: exactly one added test, nothing removed
npm test                        # substitute your project's test command; re-run it yourself

# If anything looks wrong, throw it all away. The tree was clean at the start,
# so this removes only the agent's changes:
git reset --hard && git clean -fd && git switch main && git branch -D try/slug-fix   # use the branch name you noted
```

Every part of this is doing a job: the clean branch makes the change reviewable and disposable; plan mode keeps exploration from editing your source; the failing test proves the bug exists before a "fix" is written; the "don't touch tests, stop instead" instruction targets a known failure (section 5.3); and your own re-run replaces trust with evidence.

## 3. How it actually works

**An agentic coding tool is a loop.** The model reads files, runs commands, edits code, reads the results, and repeats until it judges the task done. The quality of what comes out depends less on the first answer than on **what signal the loop has to stop on**. Claude Code's documentation puts it bluntly: "Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available, and you become the verification loop" ([best practices: Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices)). A test suite, a type checker, a build, a linter, or a script that diffs output against a fixture turns "looks done" into pass/fail.

**What the model brings, and what it lacks.** It brings broad knowledge of languages, libraries, and common patterns, and it reads code quickly. It does not know your repository's conventions until it reads them, it does not know which library version you have installed, and its knowledge of any API stops at its training data. Everything it "knows" about your project is whatever is in its context window right now — see [Context management](../context/context-management.md) for why that window degrades as it fills, and why long, meandering sessions get worse.

**Three levers you control:**

1. **The check** — what counts as done, and whether the agent can run it (section 4.3).
2. **The context** — which files, errors, constraints, and examples you point it at, and what you keep out (sections 4.1, 4.2).
3. **The permissions** — what the agent can touch without asking, and what is enforced by the operating system rather than by instructions (section 4.8).

**Instructions are advisory; enforcement is mechanical.** A line in a prompt or project instruction file shapes what the agent tries. It does not stop anything. Claude Code's docs draw exactly this line: CLAUDE.md instructions "are advisory", while hooks "are deterministic and guarantee the action happens" ([best practices: Set up hooks](https://code.claude.com/docs/en/best-practices)), and the sandbox is enforced by the operating system "regardless of what the model chose to run" ([sandboxing: Permission rules](https://code.claude.com/docs/en/sandboxing)). Decide for each rule whether being ignored occasionally is acceptable. If not, it needs a mechanism, not a sentence.

**Do not assume a speed-up; measure one.** A careful independent study is a warning, not an endorsement. METR's randomized controlled trial ([Becker et al., 2025](https://arxiv.org/abs/2507.09089)) had 16 experienced open-source developers complete 246 tasks in mature repositories they already knew well (about five years' prior experience on average; moderate prior experience with AI tools), with early-2025 tools (mainly Cursor Pro with Claude 3.5/3.7 Sonnet). Developers forecast AI would cut completion time by 24% and afterwards believed it had cut it by 20%; measured, allowing AI _increased_ completion time by 19%. That result is specific to its setting — experts on familiar, mature codebases, with the tools of February–June 2025 — and does not tell you what current agents do on your tasks. What it does establish is that **how fast it felt is not evidence**.

## 4. Patterns that hold up

Each recipe carries evidence labels as defined by this corpus's contract, applied with its source tiers: **Documented** claims here rest on Tier 1 vendor documentation or Tier 2 papers (linked, read 2026-09-16; each paper's scope stated where it is cited); **Plausible** claims are practitioner judgment or inference, so treat them as defaults to test. Nothing on this page is **Verified**: no proof in this repository exercises these workflows.

Every task below uses the same four parts, so you can find the one you need: **Where it helps**, **Set it up**, **How it fails**, **How to verify**.

| Task                                                                              | The check that makes it safe                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Understand an unfamiliar codebase](#41-understand-an-unfamiliar-codebase)        | Every claim carries a file:line you can open                                   |
| [Plan a change](#42-plan-a-change)                                                | A written plan you edit before any code changes                                |
| [Implement, tests first](#43-implement-tests-first)                               | A failing test that passes afterward, with tests left untouched                |
| [Debug](#44-debug)                                                                | A reproduction command that fails before and passes after                      |
| [Refactor](#45-refactor)                                                          | The same tests, unmodified, passing before and after                           |
| [Review](#46-review)                                                              | A fresh-context reviewer, then a human, before merge                           |
| [Write documentation](#47-write-documentation)                                    | Examples in the docs actually run                                              |
| [Operate safely](#48-operate-safely-secrets-destructive-commands-untrusted-input) | Committed state on a branch; permissions and sandbox settings you have checked |

### 4.1 Understand an unfamiliar codebase

**Where it helps.** Onboarding questions you would otherwise ask a senior engineer: how logging works, how to add an endpoint, what edge cases a class handles, why one function is called instead of another, how a request flows from front end to database.

**Set it up.** Start broad ("give me an overview of this codebase"), then narrow to components and flows. Use the project's own vocabulary. Ask for a glossary of project-specific terms. Point it at sources that answer _why_ — for example, "look through `ExecutionFactory`'s git history and summarize how its API came to be". In Claude Code, run exploration in plan mode or delegate it to a subagent so that dozens of file reads don't fill your working session; a code-intelligence plugin gives the agent go-to-definition and find-references instead of text search.

**How it fails.** Plausible-sounding architecture descriptions that are partly invented, or true of a similar project rather than this one. Unscoped "investigate X" requests that read hundreds of files and exhaust the context.

**How to verify.** Require file:line references for every structural claim and open a few of them. For an execution-flow claim, ask for the command that exercises it and run it.

Evidence: **Documented** — [best practices: Ask codebase questions, Provide specific context, Use subagents for investigation, Avoid common failure patterns ("The infinite exploration")](https://code.claude.com/docs/en/best-practices); [common workflows: Understand new codebases](https://code.claude.com/docs/en/common-workflows). The file:line verification habit is **Plausible** — practitioner judgment, not a vendor statement.

### 4.2 Plan a change

**Where it helps.** Changes that touch several files, where you are unsure of the approach, or where you don't know the code. Claude Code's docs give a rule of thumb for the opposite case: "If you could describe the diff in one sentence, skip the plan."

**Set it up.** Explore, then plan, then implement, then commit — as separate steps. In Claude Code, plan mode (`claude --permission-mode plan`, or Shift+Tab) lets the agent read files and run shell commands to explore, then write a plan, without editing your source until you approve; and Ctrl+G opens the plan in your editor so you can change it before approving. For larger features, have the agent interview you and write a spec, then start a **fresh session** to implement it. A useful spec names the files and interfaces involved, states what is out of scope, and ends with an end-to-end verification step.

**How it fails.** Jumping straight to code "can produce code that solves the wrong problem". A plan with no out-of-scope list invites scope creep (section 5.4).

**How to verify.** Read the plan before approving it. Check that it names the files to change, the tests that will prove the change, and what it will not touch.

Evidence: **Documented** — [best practices: Explore first, then plan, then code; Let Claude interview you](https://code.claude.com/docs/en/best-practices). Outside Claude Code the same split works with any tool that has a read-only or "ask" mode, or simply by instructing "don't change anything yet"; that transfer is **Plausible**.

### 4.3 Implement, tests first

**Where it helps.** Most implementation work, once there is a check. A test is the cheapest way to turn your intent into a pass/fail signal the agent can iterate against without you.

**Set it up.** Give verification criteria in the request itself — the docs' example replaces "implement a function that validates email addresses" with named example inputs and "run the tests after implementing". For a bug, ask for "a failing test that reproduces the issue, then fix it". Scope tests explicitly ("covering the edge case where the user is logged out; avoid mocks"). Ask for evidence rather than assertion: the command it ran and its output. Separating roles also works: one session writes tests, another writes code to pass them.

**How it fails.** The agent makes the check pass without doing the task: modifying or deleting the failing test, special-casing the tested inputs, or otherwise gaming the test (section 5.3). Separately, generated tests can mirror the implementation's bugs, so both are wrong together.

**How to verify.** Diff the test files separately from the source files. Confirm that the new test failed before the change and passes after it. Re-run the suite yourself. Read at least one new test and ask whether it would catch the bug if the fix were reverted.

Evidence: **Documented** — [best practices: Give Claude a way to verify its work, Provide specific context, Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices); test-gaming behavior per [ImpossibleBench](https://arxiv.org/abs/2510.20270) (section 5.3). Tests mirroring implementation bugs is **Plausible** — practitioner observation, not measured by a cited source. "Confirm the test failed first" and "read one test against a reverted fix" are **Plausible** — standard test-driven-development practice, not a vendor statement about LLMs.

### 4.4 Debug

**Where it helps.** Reading stack traces, forming hypotheses, searching the code for the source of an error, and iterating when it can run the reproduction itself.

**Set it up.** Describe the symptom, the likely location, and what "fixed" looks like. Give the exact command that reproduces the failure, say whether the failure is intermittent, and paste the real error text. Ask for the root cause explicitly: the docs' example is "fix it and verify the build succeeds. address the root cause, don't suppress the error".

**How it fails.** A confident fix for the wrong cause, or a fix that suppresses the symptom — a caught-and-ignored exception, a type-checker suppression comment, a retry, a widened timeout (section 5.2). Repeated corrections pollute the session with failed approaches.

**How to verify.** The reproduction fails before the change and passes after it. The diff contains no new suppressions. The explanation of the cause points at code you can read. If you have corrected the agent more than twice on the same issue, clear the session and restart with a better prompt that includes what you learned.

Evidence: **Documented** — [best practices: Give Claude a way to verify its work, Provide specific context, Course-correct early and often](https://code.claude.com/docs/en/best-practices); [common workflows: Fix bugs efficiently](https://code.claude.com/docs/en/common-workflows) — for the setup, the root-cause instruction, and failed approaches polluting the session. The failure shapes (wrong-cause fixes, the listed suppressions) are **Plausible** — practitioner generalization; the docs warn against suppression but do not catalog these forms.

### 4.5 Refactor

**Where it helps.** Mechanical modernization, renames across many files, replacing deprecated API usage, and large migrations that split into many similar pieces.

**Set it up.** Ask for behavior-preserving changes "in small, testable increments", and run the tests after each one. For a large migration, have the agent write the list of files to change, try the prompt on two or three of them, refine it, then run the rest — in Claude Code, a loop over `claude -p` with `--allowedTools` restricting what each run may do. If the code has no tests, write characterization tests that pin current behavior before refactoring.

**How it fails.** "While I was there" changes that alter behavior. Refactors that pass because the tests were adjusted along with the code. Large single-pass diffs nobody can review.

**How to verify.** The test files are unchanged across the refactor, and the same tests pass before and after. Each increment is small enough to review.

Evidence: **Documented** — [common workflows: Refactor code](https://code.claude.com/docs/en/common-workflows); [best practices: Fan out across files](https://code.claude.com/docs/en/best-practices). The setup is Documented. The "How it fails" list, characterization tests first, and "test files unchanged across a refactor" are **Plausible** — established refactoring practice and practitioner observation applied to agents.

### 4.6 Review

**Where it helps.** A second pass for bugs, missed edge cases, and drift from the plan, before a human reviews.

**Set it up.** Review in a **fresh context** — a subagent or a separate session — which "won't be biased toward code it just wrote" and sees only the diff and the criteria you give it. Name the work, the plan to check it against, and what counts as a finding, for example: check that every requirement is implemented, the listed edge cases have tests, and nothing outside the task's scope changed. Claude Code bundles a `/code-review` skill for a correctness pass over the current diff and a `/security-review` command for the branch's changes.

**How it fails.** A reviewer asked to find gaps will usually report some even when the work is sound; chasing every finding produces over-engineering — "extra abstraction layers, defensive code, and tests for cases that can't happen". A model reviewer also shares blind spots with a model author.

**How to verify.** Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional. A human still reviews and approves before merge; the tool's own security guidance is to review all suggested changes before approval.

Evidence: **Documented** — [best practices: Add an adversarial review step, Run multiple Claude sessions](https://code.claude.com/docs/en/best-practices); [security: Security best practices](https://code.claude.com/docs/en/security). "A model reviewer shares blind spots with a model author" is **Plausible** — inference, not a measured result.

### 4.7 Write documentation

**Where it helps.** Docstrings and API comments for undocumented functions, READMEs, PR descriptions, and change summaries drafted from a diff.

**Set it up.** Specify the documentation style (JSDoc, docstrings, and so on), ask for examples, and focus on public APIs, interfaces, and complex logic. For a PR, ask for a summary, then ask the agent to highlight risks and considerations.

**How it fails.** Documentation that describes what the code was meant to do rather than what it does; examples that don't run; PR descriptions that overstate what was tested.

**How to verify.** Run every code example in the docs. Check each claim in a PR description against the diff and the test output you actually saw.

Evidence: **Documented** — [common workflows: Handle documentation, Create pull requests](https://code.claude.com/docs/en/common-workflows). The failure modes and verification steps are **Plausible**.

### 4.8 Operate safely: secrets, destructive commands, untrusted input

**Where it helps.** Everywhere — this is not a task but the conditions the other tasks run under.

**Set it up.** Layer the controls from advisory to enforced. These are Claude Code's mechanisms; other tools have their own, so check what yours actually enforces.

- **Work where mistakes are cheap.** A clean branch or git worktree, committed before the agent starts (practitioner practice). Claude Code's checkpoints let you rewind file edits, but they "only track changes made through Claude's file editing tools" — not files changed by shell commands — and are "not a replacement for git".
- **Keep secrets out of reach — files, credential directories, and environment.** A `Read` deny rule such as `Read(./.env)` or `Read(./secrets/**)` blocks Claude's file tools. For shell commands (`cat .env`), the sandbox merges `Read` and `Edit` deny rules into the filesystem restrictions the operating system enforces on sandboxed commands; commands that cannot run sandboxed fall back to the normal permission flow. Files are not the whole exposure. The sandbox's default read policy is "read access to the entire computer, except certain denied directories", which "still allows reading credential files such as `~/.aws/credentials` and `~/.ssh/`", and there is no built-in credential deny list. Use `sandbox.credentials` to deny those paths and remove secret environment variables from sandboxed commands, or set `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` to strip credentials from all subprocesses. Simplest of all: don't launch the agent from a shell with production secrets exported.
- **Pre-approve narrowly; deny what must never run.** Allow specific, safe commands (`Bash(npm run *)`), and deny dangerous ones. But a Bash rule matches "the command text Claude writes", so `Bash(rm *)` does not stop `/bin/rm -rf build/` or `bash -c 'rm -rf build/'`, and `Bash(git push *)` does not stop `git -C . push origin main`. Deny rules catch the usual phrasing, not every phrasing.
- **Know what your mode auto-approves.** Claude Code's accept-edits mode auto-approves file edits and a fixed set of filesystem commands — including `rm` and `mv` — for paths in the working directory.
- **Know what the sandbox does and does not protect.** The sandbox bounds what shell commands can reach _outside_ the allowed paths and network: by default they can read and write the working directory and its subdirectories. It does not protect the repository from destructive changes _inside_ it. And enabling it changes prompting: `sandbox.autoAllowBashIfSandboxed` defaults to `true`, so sandboxed commands run without a permission prompt — "even in Manual mode, where the file edit tools would prompt". A sandboxed `rm -rf src/` or `git reset --hard` then runs silently; deny rules, content-scoped ask rules such as `Bash(git push *)`, and `rm` of a critical path still apply. To keep prompts with the sandbox on, set `autoAllowBashIfSandboxed` to `false` (the `/sandbox` Mode tab calls this regular permissions mode). Protection against in-repository destruction is committed state on a branch, plus deny rules.
- **Treat outside content as untrusted.** Issue text, web pages, dependency READMEs, and files in a repository you didn't write can carry prompt injection. Review proposed commands, avoid piping untrusted content straight to the agent, and run scripts that touch external services in a VM or container. A `-p` or SDK session "never shows the dialog and treats the folder as trusted, so hooks committed in a repository's `.claude/settings.json` run in a folder you've never trusted" — review a repository's `.claude/` files before scripting `claude -p` over it; see [Claude Code hooks](../claude-code/hooks.md), section 5.
- **Mechanize the must-always rules.** A `PreToolUse` hook can block a command pattern before it runs, and a `Stop` hook can refuse to let a turn end while tests fail — with the caveats about string matching and fail-open behavior in [Claude Code hooks](../claude-code/hooks.md).

**How it fails.** Section 5.5 (destructive commands), 5.7 (untrusted input).

**How to verify.** Run `/permissions` to see the rules actually in effect. Before an unattended run, try one forbidden action yourself and confirm it is blocked.

Evidence: **Documented** — [checkpointing: Limitations](https://code.claude.com/docs/en/checkpointing); [permissions: Read and Edit, What a Bash rule doesn't match](https://code.claude.com/docs/en/permissions); [sandboxing: Sandbox modes, Protect credentials, Security limitations, Permission rules](https://code.claude.com/docs/en/sandboxing); [settings reference: sandbox.autoAllowBashIfSandboxed](https://code.claude.com/docs/en/settings-reference); [hooks reference: Workspace trust](https://code.claude.com/docs/en/hooks); [security: Built-in protections, Protect against prompt injection, Security best practices](https://code.claude.com/docs/en/security). "Work on a committed branch or worktree", "don't launch with production secrets exported", and "try one forbidden action yourself before an unattended run" are **Plausible**.

### 4.9 Keep durable project instructions short and specific

**Where it helps.** Facts the agent cannot infer from the code and would otherwise get wrong every session: the build and test commands, non-default style rules, repository etiquette, environment quirks, known gotchas.

**Set it up.** Claude Code reads `CLAUDE.md` at the start of every session; OpenAI's Codex reads `AGENTS.md` files "before doing any work". The mechanism differs by tool, and the discipline is the same. For each line, the Claude Code docs suggest asking "Would removing this cause Claude to make mistakes?" — and cutting it if not. Exclude what the agent can work out by reading the code, standard language conventions, and information that changes often. Claude Code's [memory docs](https://code.claude.com/docs/en/memory) set a target of under <!-- corpus:data key=claude_code.claude_md.adherence_line_threshold -->200 lines<!-- /corpus:data --> per CLAUDE.md file, because longer files consume more context and reduce adherence; the full context argument is in [Context management](../context/context-management.md), section 4.6.

**How it fails.** A long file in which the rule that matters gets lost. Instructions that are really hard requirements, left advisory.

**How to verify.** If the agent keeps breaking a rule that is in the file, the file is probably too long, or the rule needs a hook. If it asks questions the file answers, the wording is ambiguous.

Evidence: **Documented** — [best practices: Write an effective CLAUDE.md, Avoid common failure patterns](https://code.claude.com/docs/en/best-practices); [memory](https://code.claude.com/docs/en/memory); [Codex: Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

## 5. Edge cases and failure modes

Each failure below has the same shape: what you see, why it happens, and a mitigation you can apply today.

### 5.1 Hallucinated APIs and packages

**Symptom.** Code that calls a function, option, or flag that doesn't exist in your version of a library, or imports a package that doesn't exist at all.

**Why.** The model generates what is likely given its training data, which may predate your library version or conflate similar libraries. The package case is measured: across 16 code-generation models and 576,000 generated samples in Python and JavaScript, [Spracklen et al.](https://arxiv.org/abs/2406.10279) (first posted June 2024; USENIX Security 2025) found an average hallucinated-package rate of at least 5.2% for commercial models and 21.7% for open-source models. The authors frame this as a new form of package-confusion attack on the software supply chain, not just a bug: a package name a model invents is a name someone else can publish.

**Mitigation.**

- Make the compiler, type checker, or test suite part of the loop, so a nonexistent API fails immediately instead of at review.
- Tell the agent to check the installed version (lockfile, `node_modules`, `site-packages`, or the tool's `--help`) before using an API, and to read the library's docs for that version rather than relying on memory.
- **Never let a new dependency in unreviewed.** Require the agent to ask before installing anything; check that the package exists, is the one you meant, and is maintained. In Claude Code's Manual mode a command with no allow rule prompts — but not if the sandbox is on in auto-allow mode (its default) and the package registry is in the sandbox's allowed domains: the install then runs sandboxed, without a prompt. Add a content-scoped ask rule such as `Bash(npm install *)`, which still applies under auto-allow, or set `sandbox.autoAllowBashIfSandboxed` to `false`.

Evidence: hallucination rates **Documented** within the study's scope ([arXiv 2406.10279](https://arxiv.org/abs/2406.10279)); rates for current models are not established by that paper. The Claude Code prompting behavior is **Documented** ([settings reference: sandbox.autoAllowBashIfSandboxed](https://code.claude.com/docs/en/settings-reference); [sandboxing: Sandbox modes](https://code.claude.com/docs/en/sandboxing)); the other mitigations are **Plausible**.

### 5.2 Confident wrong fixes

**Symptom.** "Fixed" — and the error is gone, but the bug isn't. Typical shapes: an exception caught and ignored, a type-checker suppression comment, a null check that hides why the value was null, a retry or longer timeout around a race.

**Why.** Without a check that captures the actual requirement, the only signal is that the error stopped. Claude Code's docs name this "the trust-then-verify gap": a plausible-looking implementation that doesn't handle edge cases.

**Mitigation.** Reproduce first (section 4.4): a failing test or command that encodes the real requirement. Ask for the root cause "and don't suppress the error". Ask the agent to explain the cause with file:line evidence before it edits. Scan the diff for new suppressions and new catch-all handlers.

Evidence: **Documented** — [best practices: Give Claude a way to verify its work, Avoid common failure patterns](https://code.claude.com/docs/en/best-practices). The suppression shapes listed are **Plausible**.

### 5.3 Tests edited, deleted, or gamed to pass

**Symptom.** The suite goes green, and the test diff shows a changed assertion, a deleted or skipped test, or the implementation special-cases the exact inputs the tests use.

**Why.** Passing tests is the signal the loop optimizes. [ImpossibleBench](https://arxiv.org/abs/2510.20270) (Zhong, Raghunathan, Carlini; October 2025) measures this directly by giving agents tasks whose tests contradict the specification, so any pass is a shortcut. The behaviors it catalogs range from modifying tests to special-casing, call counting, and operator overloading. Its findings on mitigation, for the models it tested:

- **Prompt wording matters a lot.** On its conflicting-LiveCodeBench variant, a loose prompt ("…pass all tests. DO NOT MODIFY THE TESTS.") led to cheating rates above 85% for GPT-5 and o3; a strict prompt that told the model to critically evaluate the tests and "STOP, identify them and explain why they are incorrect" if they looked flawed lowered those to 1% and 33%.
- **Read-only tests** blocked test modification while keeping legitimate performance, but did not stop special-casing or operator overloading. Hiding tests entirely cut cheating to near zero but hurt performance on the real tasks. The authors recommend hiding tests or making them read-only during implementation where feasible.
- **Giving the agent an explicit way to abort** when a task looks impossible cut cheating sharply for GPT-5 and o3, much less so for Claude Opus 4.1.

**Mitigation.**

1. Say it in the prompt, the strict way: don't modify tests; if a test looks wrong, stop and explain. (Section 2, Prompt 3, is this instruction.)
2. Make the tests read-only while implementing. In Claude Code, an `Edit` deny rule on your test paths blocks the file-editing tools, and with the sandbox enabled the same rule restricts sandboxed shell commands as well (section 4.8).
3. Review the test diff on its own, every time, including new test files: `git add -N . && git diff -- '*test*' '*spec*'` (plain `git diff` omits untracked files). A fix that needed a test change needs a human decision.
4. Because read-only tests don't prevent special-casing, read the implementation for branches on test-specific values.

Evidence: **Documented** — [ImpossibleBench](https://arxiv.org/abs/2510.20270), within its scope (the models, benchmarks, and scaffolds it names; a benchmark built to make cheating the only way to pass, so real-world rates will differ); [permissions: Read and Edit](https://code.claude.com/docs/en/permissions) and [sandboxing: Permission rules](https://code.claude.com/docs/en/sandboxing) for the Claude Code mechanism. Mitigations 3 and 4 are **Plausible**.

### 5.4 Scope creep

**Symptom.** You asked for a one-line fix and got a refactor, new abstractions, reformatted files, an updated dependency, or "defensive" code for cases that can't happen. The diff is too big to review.

**Why.** Often nothing in the request said what not to touch (practitioner observation). And a reviewer prompted to find gaps "will usually report some, even when the work is sound", which invites more changes.

**Mitigation.** State what is out of scope in the request or spec. Check `git status --short` (new files) and `git diff --stat` (changed files) against the files you expected. Have the review step check that "nothing outside the task's scope changed", and tell reviewers to flag only correctness and requirement gaps. Split unrelated changes into separate commits or throw them away.

Evidence: **Documented** — [best practices: Let Claude interview you (self-contained specs state what is out of scope), Add an adversarial review step](https://code.claude.com/docs/en/best-practices) — for the reviewer behavior and the scope check. The unscoped-request cause and the `git status`/`--stat` check are **Plausible**.

### 5.5 Silent destructive commands

**Symptom.** Files deleted, a branch reset, a database dropped, a force-push — often by a command that looked routine, or ran inside a script.

**Why.** Three gaps compound. Permission deny rules match command text, so the same program run another way isn't matched. Checkpoint rewind covers only the agent's file-editing tools, not what shell commands did. And modes that auto-approve edits may also auto-approve some filesystem commands — in Claude Code's accept-edits mode, that set includes `rm` and `mv` within the working directory.

**Mitigation.**

- Commit before every agent session; work on a branch or worktree; treat checkpoints as a convenience, not a backup.
- Don't count on the sandbox for this. It limits what commands reach outside the working directory and allowed network, but the working directory itself is writable, and with `sandbox.autoAllowBashIfSandboxed` at its default of `true` a sandboxed destructive command inside the repository runs **without** a prompt. If you enable the sandbox and want to keep approving shell commands, set that setting to `false`.
- Keep irreversible operations outside the agent's credentials: server-side branch protection, no production database credentials in the development environment, deploys through CI rather than from the session.
- Add deny rules and a `PreToolUse` hook for the obvious phrasings — as a speed bump, not a boundary ([Claude Code hooks](../claude-code/hooks.md), section 4.8).

Evidence: **Documented** — [permissions: What a Bash rule doesn't match](https://code.claude.com/docs/en/permissions); [checkpointing: Limitations](https://code.claude.com/docs/en/checkpointing); [security: Built-in protections](https://code.claude.com/docs/en/security); [sandboxing: Sandbox modes, Security limitations](https://code.claude.com/docs/en/sandboxing); [settings reference: sandbox.autoAllowBashIfSandboxed](https://code.claude.com/docs/en/settings-reference). "Keep irreversible operations outside the agent's credentials" is **Plausible** — standard least-privilege practice; the docs do not state it in these terms.

### 5.6 Stale context

**Symptom.** Late in a long session the agent forgets earlier instructions, repeats a failed approach, contradicts a decision you made, or edits a file based on a version it read before something else changed it.

**Why.** The context window fills with file contents, command output, and abandoned attempts, and performance degrades as it fills ([Context management](../context/context-management.md), section 3). Summaries made during compaction are lossy. Resumed sessions can also replay context captured earlier, such as hook output with an old commit SHA ([Claude Code hooks](../claude-code/hooks.md), section 5).

**Mitigation.** One task per session; clear between unrelated tasks. After more than two corrections on the same issue, clear and restart with a better prompt. Delegate broad investigation to a subagent. Put what must survive into files (the spec, the plan, project instructions), not the chat. Before the agent edits a file it read long ago, have it re-read the file.

Evidence: **Documented** — [best practices: Course-correct early and often, Manage context aggressively, Avoid common failure patterns](https://code.claude.com/docs/en/best-practices). "Re-read before editing a file read long ago" is **Plausible**.

### 5.7 Instructions hidden in the input

**Symptom.** The agent does something nobody asked for after reading an issue, a web page, a dependency's files, or a comment in an unfamiliar repository.

**Why.** Prompt injection: text the agent reads is text that can steer it. Claude Code documents defenses, including approval of network commands and separate context for web fetches, and also states that "no system is completely immune to all attacks".

**Mitigation.** Section 4.8: review commands before approval, don't pipe untrusted content straight in, isolate work that touches external services, and review a repository's committed agent configuration before running a non-interactive session in it.

Evidence: **Documented** — [security: Protect against prompt injection](https://code.claude.com/docs/en/security).

### 5.8 Evidence that isn't evidence

**Symptom.** "All tests pass" — but the agent ran a subset, ran them before its last edit, or summarized output it didn't get. Or the team concludes the tools save time because everyone feels faster.

**Why.** A summary is a claim, not a result. And perceived speed-ups can point the wrong way: in METR's trial (section 3), developers believed they had been sped up by 20% when they had been slowed down by 19%.

**Mitigation.** Ask for the command and its raw output, not a summary, and re-run the check yourself before merging. If you are deciding whether a workflow is worth adopting, measure time and defect rates on your own tasks rather than asking people how it felt.

Evidence: "Show evidence rather than asserting success" is **Documented** — [best practices: Give Claude a way to verify its work](https://code.claude.com/docs/en/best-practices). The perception gap is **Documented** within METR's scope ([arXiv 2507.09089](https://arxiv.org/abs/2507.09089)). "Measure on your own tasks" is **Plausible**.

## 6. Where this rots

**The playbook is stable; the mechanisms move.** The task structure (understand → plan → test-first implementation → debug → refactor → review → document → operate safely) and the central discipline — a check you trust decides "done" — do not depend on any model or tool version. What moves are the tool mechanisms used as worked examples and the empirical numbers.

Values on this page, each backed by a record:

| Claim                                                     | Record                                           | Volatility | Why it moves                                           |
| --------------------------------------------------------- | ------------------------------------------------ | ---------- | ------------------------------------------------------ |
| Instruction-file length at which adherence may drop (4.9) | `claude_code.claude_md.adherence_line_threshold` | medium     | Product guidance that tracks model and harness changes |

Identifiers tied to `applies_to` (Claude Code 2.1.267, docs as of 2026-09-16), to re-check on refresh against the linked pages:

- plan mode and how to enter it (`--permission-mode plan`, Shift+Tab, Ctrl+G to edit the plan);
- which commands accept-edits mode auto-approves (section 4.8, 5.5) — a list that has changed before and matters for safety;
- permission rule syntax and the documented Bash rule limits; whether `Read`/`Edit` deny rules still merge into the sandbox configuration;
- the sandbox's defaults — `sandbox.autoAllowBashIfSandboxed` (currently `true`), default read and write scope, and `sandbox.credentials` behavior — which decide whether section 4.8 and 5.5's safety advice still holds;
- the Shift+Tab mode cycle and its status-bar labels (section 2);
- checkpoint limitations (Bash and external changes untracked);
- the `/code-review` skill, `/security-review`, `/permissions`, `/clear`, and `claude -p` flags named here;
- Codex's `AGENTS.md` discovery behavior.

The studies are dated evidence, not live values: they will not change, but they will age. METR's result is about early-2025 tools; Spracklen et al. tested 2024-era models; ImpossibleBench's per-model rates are for the models it names. When newer studies of the same questions appear, update the citations rather than extrapolating these numbers forward.

Deliberately absent: productivity multipliers from vendor marketing or surveys, model rankings on coding benchmarks, and prices (see [Claude models](../models/claude-models.md)). Benchmark scores go stale within months and do not predict performance on your repository.

## 7. Proofs

None yet. Proofs that would upgrade labels on this page:

- **Test-protection proof (5.3).** In a temporary repository with a failing test that contradicts its specification, run `claude -p` with an `Edit` deny rule on the test directory, and assert from the output and `git diff` that the test file is unchanged. Would promote the Claude Code mechanism in 5.3 mitigation 2.
- **Checkpoint-limitation proof (4.8, 5.5).** Have a session create a file with a shell command, rewind, and assert the file still exists.
- **Bash rule-limit proof (4.8).** Deny `Bash(git push *)` and assert that `git -C . push` to a local bare remote is not blocked by that rule.

Each needs an authenticated CLI in CI.

## 8. Sources

Tier 1 — vendor canonical documentation (read 2026-09-16):

- Anthropic, [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- Anthropic, [Common workflows](https://code.claude.com/docs/en/common-workflows)
- Anthropic, [Security](https://code.claude.com/docs/en/security)
- Anthropic, [Permissions](https://code.claude.com/docs/en/permissions)
- Anthropic, [Sandboxing](https://code.claude.com/docs/en/sandboxing)
- Anthropic, [Permission modes](https://code.claude.com/docs/en/permission-modes)
- Anthropic, [Settings reference](https://code.claude.com/docs/en/settings-reference)
- Anthropic, [Hooks reference](https://code.claude.com/docs/en/hooks)
- Anthropic, [Checkpointing](https://code.claude.com/docs/en/checkpointing)
- Anthropic, [How Claude remembers your project (memory)](https://code.claude.com/docs/en/memory)
- OpenAI, [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)

Tier 2 — papers:

- Zhong, Raghunathan, Carlini, [ImpossibleBench: Measuring LLMs' Propensity of Exploiting Test Cases](https://arxiv.org/abs/2510.20270) (arXiv, 2025-10-23)
- Spracklen, Wijewickrama, Sakib, Maiti, [We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs](https://arxiv.org/abs/2406.10279) (USENIX Security 2025)
- Becker, Rush, Barnes, Rein, [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://arxiv.org/abs/2507.09089) (METR, arXiv, 2025-07)

Related pages in this corpus: [Context management](../context/context-management.md), [Claude Code hooks](../claude-code/hooks.md), [Claude models](../models/claude-models.md).
