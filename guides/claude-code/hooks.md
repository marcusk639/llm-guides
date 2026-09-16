---
title: Claude Code hooks
summary: >-
  How Claude Code hooks work — events, matchers, handlers, the stdin/stdout/exit
  code contract, and JSON decisions — with recipes for formatting after edits,
  blocking commands, injecting context, and gating Stop, plus the failure modes
  that make a guardrail hook silently fail open.
topic: claude-code
verified: 2026-09-16
applies_to:
  - "Claude Code CLI 2.1.267, checked against the public hooks reference and hooks guide as published on code.claude.com on 2026-09-16"
  - "Command hooks on macOS and Linux (bash); Windows and PowerShell specifics are named but not covered"
sources:
  - https://code.claude.com/docs/en/hooks
  - https://code.claude.com/docs/en/hooks-guide
related:
  - guides/context/context-management.md
seed: true
---

# Claude Code hooks

## 1. What this covers / who it's for

Hooks: commands (or HTTP calls, MCP tools, prompts, agents) that Claude Code runs automatically at fixed points in a session — before a tool call, after an edit, at session start, when Claude tries to stop.
For a practitioner who wants something to _always_ happen instead of hoping the model remembers, and for a reader designing guardrails who needs to know exactly when a hook blocks and when it fails open. Beginners can stop after section 2; guardrail designers should read section 5.

## 2. The 60-second version

A hook is a JSON entry in a settings file: **event** → **matcher** → **handler**. This one blocks `git push --force` before it runs. Written against the public hooks documentation as read on 2026-09-16, for Claude Code 2.1.267.

In a scratch git repository, save this as `.claude/hooks/block-force-push.sh`:

```bash
#!/usr/bin/env bash
# PreToolUse hook: refuse `git push --force` / `git push -f`.
# Input: the event's JSON on stdin. Requires jq.
cmd=$(jq -r '.tool_input.command // empty')

if printf '%s\n' "$cmd" |
  grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]+[^;&|]*)?[[:space:]](--force|-f)([[:space:]]|$)'; then
  echo "Blocked by hook: force-push is not allowed. Use --force-with-lease or ask the user." >&2
  exit 2 # exit 2 = block; Claude sees the stderr text as the reason
fi

exit 0 # no decision; the normal permission flow applies
```

Make it executable, and test it by piping in the JSON Claude Code would send — before you register it:

```bash
chmod +x .claude/hooks/block-force-push.sh
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force --dry-run"}}' |
  .claude/hooks/block-force-push.sh; echo "exit=$?"   # expect the Blocked message, exit=2
echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' |
  .claude/hooks/block-force-push.sh; echo "exit=$?"   # expect exit=0
```

Then register it in `.claude/settings.json` in the same repository (if the file already has a `hooks` key, add `PreToolUse` inside it rather than replacing it):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-force-push.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

Start `claude` in that repository, accept the workspace trust dialog, and type `/hooks` to confirm the hook is listed under `PreToolUse`. Then ask Claude to run `git push --force --dry-run`. The call is blocked before it executes, and Claude is shown the `Blocked by hook` text as the reason. (The `--dry-run` means nothing is pushed even if you mistyped something and the hook never fires.)

## 3. How it actually works

**Three levels of nesting.** Under the `hooks` key, each _hook event_ (`PreToolUse`, `Stop`, …) holds a list of _matcher groups_; each group has an optional `matcher` and a `hooks` list of _hook handlers_. When the event fires and the matcher matches, every handler in the group runs ([hooks reference: Configuration](https://code.claude.com/docs/en/hooks)).

**Where hooks live.** `~/.claude/settings.json` (all your projects), `.claude/settings.json` (one project, committable), `.claude/settings.local.json` (one project, not shared), managed policy settings, a plugin's `hooks/hooks.json`, and skill or subagent frontmatter. Entries from different levels merge rather than replace each other ([hooks reference: Hook locations](https://code.claude.com/docs/en/hooks)).

**Events you will reach for first.** The reference documents many more; these cover most automation ([hooks reference: Hook lifecycle](https://code.claude.com/docs/en/hooks)):

| Event                        | Fires                                           | Matcher filters                                            | Can block?                 |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| `SessionStart`               | when a session begins or resumes                | `startup`, `resume`, `clear`, `compact`, `fork`            | no — context only          |
| `UserPromptSubmit`           | when you submit a prompt, before Claude sees it | no matcher support                                         | yes — erases the prompt    |
| `PreToolUse`                 | before a tool call executes                     | tool name                                                  | yes — blocks the call      |
| `PermissionRequest`          | when a tool call needs a permission decision    | tool name                                                  | via JSON `decision` only   |
| `PostToolUse`                | after a tool call succeeds                      | tool name                                                  | no — the tool already ran  |
| `Stop`                       | when Claude finishes responding                 | no matcher support                                         | yes — Claude keeps working |
| `PreCompact` / `PostCompact` | around context compaction                       | `manual`, `auto`                                           | `PreCompact` only          |
| `Notification`               | when Claude Code sends a notification           | notification type, e.g. `permission_prompt`, `idle_prompt` | no                         |
| `SessionEnd`                 | when a session terminates                       | reason, e.g. `clear`, `logout`, `prompt_input_exit`        | no                         |

**Matchers.** `"*"`, `""`, or no matcher matches everything. A matcher made only of letters, digits, `_`, `-`, spaces, `,` and `|` is an exact string or a list of exact strings (`Edit|Write`). Anything else is an unanchored JavaScript regular expression, so `Edit.*` also matches `NotebookEdit`; anchor with `^…$` for a whole-name match. `FileChanged` and `StopFailure` use a narrower exact-match set — letters, digits, `_`, and `|` only — so a hyphen, space, or comma in their matchers puts it on the regular-expression path. MCP tools are named `mcp__<server>__<tool>`, so matching every tool from a server needs `mcp__memory__.*` — a bare `mcp__memory` is an exact string and matches nothing ([hooks reference: Matcher patterns](https://code.claude.com/docs/en/hooks)).

**The `if` field** narrows a single handler further using permission-rule syntax, such as `"Bash(git *)"` or `"Edit(*.ts)"`, so the process is never spawned for non-matching calls. It is evaluated only on tool events and holds exactly one rule ([hooks reference: Common fields](https://code.claude.com/docs/en/hooks)).

**Five handler types.** `command` (a shell command; JSON on stdin), `http` (JSON POSTed to a URL), `mcp_tool` (a tool on an already-connected MCP server), `prompt` (single-turn evaluation by a Claude model), and `agent` (a subagent with tool access; marked experimental). All matching handlers run in parallel, and an identical handler defined in several settings files runs once ([hooks reference: Hook handler fields](https://code.claude.com/docs/en/hooks)).

**Exec form vs. shell form.** With `args` present, `command` is spawned directly with no shell, and placeholders like `${CLAUDE_PROJECT_DIR}` are substituted as plain strings — no quoting problems. Without `args`, the string goes to a shell (`sh -c` on macOS and Linux), which gives you pipes and `&&` but requires double-quoting placeholders. The reference recommends exec form for any hook that references a path placeholder ([hooks reference: Exec form and shell form](https://code.claude.com/docs/en/hooks)).

**The contract: stdin in; exit code, stdout, and stderr out.**

- **Exit 0** — success. For most events stdout goes only to the debug log; for `SessionStart`, `UserPromptSubmit`, `UserPromptExpansion`, and `PostModelSwitch`, plain-text stdout is added to Claude's context.
- **Exit 2** — blocking error, on events that can block. The blocking message is the reason from your JSON's blocking decision if it makes one, and your stderr text otherwise; it goes to Claude for `PreToolUse` and to the user for `UserPromptSubmit`. JSON cannot override an exit-2 block.
- **Any other exit code** — for most events a _non-blocking_ error: the action proceeds and the transcript shows a hook error notice. **This includes exit 1.**

([hooks reference: Exit code output](https://code.claude.com/docs/en/hooks))

**JSON output** gives finer control than exit codes. Stdout that starts with `{` and ends with `}` is parsed as JSON. Universal fields include `continue` (`false` stops Claude entirely), `stopReason`, and `systemMessage` (a warning shown to the user). Event decisions come in three shapes ([hooks reference: Decision control](https://code.claude.com/docs/en/hooks)):

- **Top-level `decision: "block"` plus `reason`** — `UserPromptSubmit`, `PostToolUse`, `Stop`, `SubagentStop`, `PreCompact`, and others.
- **`hookSpecificOutput.permissionDecision`** — `PreToolUse`: `allow`, `deny`, `ask`, or `defer`, with `permissionDecisionReason`, optional `updatedInput` to rewrite the tool's arguments, and `additionalContext`. When several hooks disagree, `deny` > `defer` > `ask` > `allow`.
- **`hookSpecificOutput.decision.behavior`** — `PermissionRequest`: `allow` or `deny`.

`hookSpecificOutput` always needs `hookEventName` set to the event name. `additionalContext` is delivered to Claude as a system reminder; several hooks' values are all passed through.

**Defaults you may need to budget against.** Handler timeouts default to <!-- corpus:data key=claude_code.hooks.timeout_default.command -->600 seconds for command, http, and mcp_tool handlers<!-- /corpus:data -->, <!-- corpus:data key=claude_code.hooks.timeout_default.prompt -->30 seconds for prompt handlers<!-- /corpus:data -->, and <!-- corpus:data key=claude_code.hooks.timeout_default.agent -->60 seconds for agent handlers<!-- /corpus:data -->. The command, http, and mcp_tool default is lowered to <!-- corpus:data key=claude_code.hooks.timeout_default.user_prompt_submit -->30 seconds on UserPromptSubmit, PreModelSwitch, and PostModelSwitch<!-- /corpus:data --> (and lower still on `MessageDisplay`). `SessionEnd` hooks get <!-- corpus:data key=claude_code.hooks.session_end_budget -->a shared 1.5-second budget, raised to match a longer per-hook timeout up to 60 seconds<!-- /corpus:data -->. Override any handler with its `timeout` field, in seconds. Hook output strings — `additionalContext`, `systemMessage`, plain stdout — are capped at <!-- corpus:data key=claude_code.hooks.output_string_cap -->10,000 characters<!-- /corpus:data -->; longer output is saved to a file and replaced with a preview and path ([hooks reference: Common fields, JSON output](https://code.claude.com/docs/en/hooks)).

## 4. Patterns that hold up

Each recipe carries one evidence label. **Documented** means the Claude Code hooks reference or guide states it (linked, read 2026-09-16). **Plausible** means it is inferred or practitioner judgment; test it yourself. Nothing on this page is **Verified**: no proof in this repository exercises a live Claude Code session.

### 4.1 Format every file Claude edits

`PostToolUse` with an `Edit|Write` matcher, reading the edited path from `tool_input.file_path`. The hooks guide's version, for `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

A successful run shows nothing in the conversation; check the file, or the debug log. To reformat a file however it changes — including when a `Bash` command rewrites it — the guide points to a `FileChanged` hook instead.

Evidence: **Documented** — [hooks guide: Auto-format code after edits](https://code.claude.com/docs/en/hooks-guide).

One caveat: `xargs` splits on whitespace, so a path containing spaces reaches Prettier as several arguments. Evidence: **Plausible** — standard `xargs` behavior, not stated in the hooks docs.

### 4.2 Block with exit 2 or a JSON `deny` — never exit 1

To stop a tool call, either exit 2 with the reason on stderr (section 2), or exit 0 and print:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Force-push is not allowed in this repository"
  }
}
```

Either way Claude sees the reason and can adjust. Exit 1, the conventional Unix failure code, is a non-blocking error for most events: the action proceeds. Pick one mechanism per hook.

Evidence: **Documented** — [hooks reference: Exit code 2, JSON output](https://code.claude.com/docs/en/hooks), which warns explicitly: "If your hook is meant to enforce a policy, use `exit 2`."

### 4.3 Inject context at session start — and again after compaction

For `SessionStart`, plain stdout is added to Claude's context, so a hook can simply print. A `compact` matcher re-injects after compaction, when summarization may have dropped details:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'This repository uses pnpm. Integration tests need the local database running.'; git log --oneline -5"
          }
        ]
      }
    ]
  }
}
```

Write the text as factual statements ("This repo uses pnpm"), not imperative system instructions — the reference warns that text framed as out-of-band commands can trigger Claude's prompt-injection defenses. For context that never changes, the docs recommend CLAUDE.md instead of a hook (see [Context management](../context/context-management.md) for keeping that file small). Keep `SessionStart` hooks fast: they run on every session.

Evidence: **Documented** — [hooks guide: Re-inject context after compaction](https://code.claude.com/docs/en/hooks-guide); [hooks reference: SessionStart, Add context for Claude](https://code.claude.com/docs/en/hooks).

### 4.4 Filter cheaply: matcher first, then `if`, then the script

Narrow in layers, so the process spawns only when it has work to do:

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "if": "Bash(git push *)",
      "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-force-push.sh",
      "args": []
    }
  ]
}
```

`if` checks each subcommand, including those inside `$()` and backticks, and strips leading `VAR=value` assignments. When Claude Code cannot tell what a Bash command runs, it runs the hook anyway. Keep the check in the script too: `if` is a performance filter, not the policy.

Evidence: **Documented** — [hooks reference: Common fields and the Bash `if` matching table](https://code.claude.com/docs/en/hooks), which says: "Because the `if` filter is best-effort, use the permission system rather than a hook to enforce a hard allow or deny."

### 4.5 Gate "done" with a Stop hook, guarded against loops

A `Stop` hook that returns `decision: "block"` with a `reason` (or exits 2) makes Claude keep working — useful for "don't finish while tests fail". The input carries `stop_hook_active`, which is `true` when Claude is already continuing because of a stop hook; check it and exit 0, or the hook can block forever on a condition that will not resolve:

```bash
#!/usr/bin/env bash
input=$(cat)
if [ "$(jq -r '.stop_hook_active' <<<"$input")" = "true" ]; then
  exit 0 # already continued once; let Claude stop
fi
if ! npm test >/dev/null 2>&1; then
  jq -n '{decision: "block", reason: "The test suite is failing. Fix it before finishing."}'
fi
exit 0
```

Claude Code overrides the hook and ends the turn after <!-- corpus:data key=claude_code.hooks.stop_block_cap -->8 consecutive blocks<!-- /corpus:data -->; the cap is adjustable with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`. `Stop` fires whenever Claude finishes responding, not only when a task is complete, and not on user interrupts. For guidance that isn't an error, return `hookSpecificOutput.additionalContext` instead of `decision: "block"`. If you write the gate as a prompt-based hook (`type: "prompt"`) instead of a command, its `ok: false` response may also set `"impossible": true` when the condition can never be satisfied; on `Stop` and `SubagentStop` Claude Code then lets the turn end instead of feeding the reason back. Agent hooks don't support that field, and it isn't part of the command-hook output schema (the JSON output and Stop decision control fields).

Evidence: **Documented** — [hooks reference: Stop, Prompt-based hooks: Response schema](https://code.claude.com/docs/en/hooks); [hooks guide: Stop hook hits the block cap, Prompt-based hooks](https://code.claude.com/docs/en/hooks-guide).

### 4.6 Test the script with piped JSON before you register it

`echo '<sample input>' | ./hook.sh; echo $?` catches the common failures — not executable, `jq` missing, wrong exit code, malformed JSON — before they become a silent no-op in a live session. Build JSON output with `jq -n` rather than string concatenation, so quotes and backslashes are escaped. After registering, `/hooks` shows what Claude Code loaded and from which file, and `claude --debug-file <path>` logs every match, exit code, stdout, and stderr.

Evidence: **Documented** — [hooks guide: Hook error in output, Debug techniques](https://code.claude.com/docs/en/hooks-guide); [hooks reference: The /hooks menu, Debug hooks](https://code.claude.com/docs/en/hooks).

### 4.7 Run slow work in the background

`"async": true` on a command hook runs it without blocking Claude — for test suites, deploys, or external calls after an edit. Its `additionalContext` and `systemMessage` are delivered to Claude on the next conversation turn. An async hook cannot block or decide anything: `decision`, `permissionDecision`, and `continue` have no effect. `asyncRewake: true` wakes Claude immediately when the background hook exits 2.

Evidence: **Documented** — [hooks reference: Run hooks in the background](https://code.claude.com/docs/en/hooks).

### 4.8 Design guardrails as tighten-only, and assume they can be walked around

A `PreToolUse` `deny` holds in every permission mode, including `bypassPermissions` and `--dangerously-skip-permissions`. The reverse is not true: a hook's `allow` does not override deny rules from settings. Hooks can tighten what permission rules allow, not loosen it. Put hard allow/deny policy in permission rules and use hooks for what rules cannot express.

Evidence: **Documented** — [hooks guide: Hooks and permission modes](https://code.claude.com/docs/en/hooks-guide); [hooks reference: PreToolUse decision control](https://code.claude.com/docs/en/hooks).

A hook that pattern-matches command text is a speed bump, not a boundary. The section 2 script does not catch `git -C other-dir push --force`, a push run from inside a script file, or an alias — and a model that is blocked and told why will often look for another route to the goal. Treat string-matching hooks as protection against accidents, and put real isolation (sandboxing, credentials the session does not hold, server-side branch protection) where it matters.

Evidence: **Plausible** — inferred from how string matching works and from the documented best-effort `if` behavior; the hooks docs do not claim hooks are, or are not, a security boundary against an adversarial agent.

## 5. Edge cases and failure modes

- **A guardrail that fails to start is a disabled guardrail.** If the script path is wrong or not executable, the shell exits with an error such as 127: a non-blocking error, so for most events the action proceeds. The reference warns that "a mistyped path in `settings.json` leaves the gate silently disabled"; watch for the hook error notice on the first run ([hooks reference: Other exit codes](https://code.claude.com/docs/en/hooks)).
- **Timeouts fail open.** A `command`, `http`, or `mcp_tool` hook that reaches its timeout is cancelled and its output discarded. On `PreToolUse` a timed-out hook does not block; the call continues through the normal permission flow. On `UserPromptSubmit` the prompt reaches Claude without the hook's context ([hooks reference: Timeouts, UserPromptSubmit](https://code.claude.com/docs/en/hooks)).
- **Stray stdout breaks JSON.** Stdout must be only the JSON object. If a shell profile sourced by the hook's shell prints something first, the output no longer starts with `{`, it is treated as plain text, and on exit 0 nothing is reported ([hooks guide: Hook JSON has no effect](https://code.claude.com/docs/en/hooks-guide)).
- **Fields at the wrong level are ignored without an error.** `permissionDecision` or `additionalContext` at the top level instead of inside `hookSpecificOutput` still parses; the debug log records `Hook JSON output had unrecognized keys` ([hooks guide: Hook JSON has no effect](https://code.claude.com/docs/en/hooks-guide)).
- **Silently ignored configuration.** A `matcher` on an event without matcher support is ignored; a handler with `if` on a non-tool event never runs. Matchers are case-sensitive ([hooks reference: Matcher patterns, Common fields](https://code.claude.com/docs/en/hooks); [hooks guide: Hook not firing](https://code.claude.com/docs/en/hooks-guide)).
- **Parallel hooks don't short-circuit.** Every matching hook runs to completion before results merge, so one hook's `deny` does not stop another hook's side effects. When several `PreToolUse` hooks return `updatedInput`, the last to finish wins — non-deterministically ([hooks guide: Combine results from multiple hooks, Limitations](https://code.claude.com/docs/en/hooks-guide)).
- **`PostToolUse` can't undo.** The tool already ran. `updatedToolOutput` changes only what Claude sees; files written, commands run, and requests sent have already taken effect. Intercept at `PreToolUse` to prevent or rewrite ([hooks reference: PostToolUse decision control](https://code.claude.com/docs/en/hooks)).
- **`PermissionRequest` ignores exit 2.** Deny through the JSON `decision` object. In `-p` runs without an Agent SDK `canUseTool` callback there is no permission prompt for it to intercept, so use `PreToolUse` for automated decisions ([hooks reference: Exit code 2 behavior per event](https://code.claude.com/docs/en/hooks); [hooks guide: Limitations](https://code.claude.com/docs/en/hooks-guide)).
- **Headless runs trust the folder.** An interactive session holds back settings-file hooks until you accept the workspace trust dialog. A `-p` or SDK session never shows the dialog and treats the folder as trusted, so hooks committed in a repository's `.claude/settings.json` run. Before scripting `claude -p` over a repository you didn't write, review its `.claude/` files or pass `--settings '{"disableAllHooks": true}'` ([hooks reference: Workspace trust](https://code.claude.com/docs/en/hooks)).
- **Hooks run as you.** Command hooks execute with your full user permissions. The reference's own practices: validate inputs, quote shell variables, check for `..` in paths, use absolute paths, and skip sensitive files such as `.env` and `.git/` ([hooks reference: Security considerations](https://code.claude.com/docs/en/hooks)).
- **Resumed sessions replay stale context.** For mid-session events such as `PostToolUse` and `UserPromptSubmit`, `--continue`/`--resume` replays the saved `additionalContext` instead of re-running the hook, so timestamps and commit SHAs go stale. `SessionStart` runs again with `source: "resume"` and can refresh ([hooks reference: Add context for Claude](https://code.claude.com/docs/en/hooks)).
- **`mcp_tool` hooks miss the launch `SessionStart`.** MCP servers are not yet available, so those handlers are skipped at launch (they do run after `/clear` or compaction). Use a `command` hook for anything the first turn needs ([hooks reference: MCP tool hook fields](https://code.claude.com/docs/en/hooks)).
- **Hooks also fire inside subagents.** Tool events in a subagent fire the same settings, policy, and plugin hooks; the input then carries `agent_id` and `agent_type`. In subagent frontmatter, a `Stop` hook is converted to `SubagentStop` ([hooks reference: Hook locations, Hooks in skills and agents](https://code.claude.com/docs/en/hooks)).
- **Only some events can set environment variables.** `CLAUDE_ENV_FILE`, which persists `export` lines into later Bash commands, is available to `SessionStart`, `Setup`, `CwdChanged`, and `FileChanged` hooks only ([hooks reference: Persist environment variables](https://code.claude.com/docs/en/hooks)).
- **No per-hook off switch.** `"disableAllHooks": true` turns all hooks off (and cannot disable managed hooks from a non-managed level); to disable one hook you remove its entry ([hooks reference: Disable or remove hooks](https://code.claude.com/docs/en/hooks)).

## 6. Where this rots

**The mechanics are stable; the surface keeps growing.** Most of this page is identifiers — event names, matcher values, JSON field names, exit-code meanings — which are pinned by `applies_to` rather than by records: when Claude Code moves on, re-read this page against the current reference. Verified 2026-09-16 against the docs for Claude Code 2.1.267.

The values, each backed by a record:

| Claim                                                 | Record                                                 | Volatility | Why it moves                                      |
| ----------------------------------------------------- | ------------------------------------------------------ | ---------- | ------------------------------------------------- |
| Default timeout, command/http/mcp_tool handlers       | `claude_code.hooks.timeout_default.command`            | medium     | Defaults are tuned between releases               |
| Default timeout, prompt handlers                      | `claude_code.hooks.timeout_default.prompt`             | medium     | Same                                              |
| Default timeout, agent handlers                       | `claude_code.hooks.timeout_default.agent`              | medium     | Same; agent hooks are marked experimental         |
| Lowered default on per-prompt and model-switch events | `claude_code.hooks.timeout_default.user_prompt_submit` | medium     | The set of events with lowered defaults has grown |
| `SessionEnd` shared budget                            | `claude_code.hooks.session_end_budget`                 | medium     | Shutdown behavior is tuned between releases       |
| Stop hook consecutive-block cap                       | `claude_code.hooks.stop_block_cap`                     | medium     | Loop protection; already made configurable        |
| Hook output string cap                                | `claude_code.hooks.output_string_cap`                  | medium     | Output handling is shared with tool output limits |

Re-check on refresh, against the [hooks reference](https://code.claude.com/docs/en/hooks) and [hooks guide](https://code.claude.com/docs/en/hooks-guide) — **those pages are the authority whenever they and this page disagree**:

- the event table in section 3 (new events appear often; renamed or removed ones would break recipes);
- exact-match vs. regular-expression matcher rules, which the reference qualifies with version notes (comma separators and hyphens in the exact-match set each require a minimum Claude Code version);
- exit-code and JSON-parsing behavior, including which events add plain stdout to context;
- the `PreToolUse` decision values and precedence, and the permission-mode interaction in 4.8;
- workspace-trust behavior for `-p` runs;
- the handler types, and whether `agent` hooks are still experimental.

Deliberately absent: the full per-event input schemas, the per-event exit-2 table, the `Notification` and `StopFailure` matcher value lists, HTTP allowlist settings, Windows/PowerShell specifics, and the version gates on individual fields. All are on the reference page and would multiply this page's rot surface.

## 7. Proofs

None yet. A useful proof would run `claude -p` in a temporary git repository with a `--settings` file registering the section 2 hook, prompt it to run `git push --force --dry-run`, and assert from `--output-format stream-json` or the debug log that the `PreToolUse` hook fired and blocked the call. That would promote the section 2 example and the exit-2 claim in 4.2 to **Verified**. It needs an authenticated CLI in CI, and it would exercise `-p` behavior (where the folder is treated as trusted), not the interactive trust dialog.

## 8. Sources

Tier 1 — vendor canonical documentation (read 2026-09-16):

- Anthropic, [Hooks reference](https://code.claude.com/docs/en/hooks)
- Anthropic, [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide) (the hooks guide)
