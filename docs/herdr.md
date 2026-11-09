---
name: herdr
description: "Drive other agents' terminals in Herdr with the hc CLI (herdr-core): list terminals, send a prompt, read a screen, wait for a turn to end, collect results through .done files. Use when running inside Herdr (HC_TERMINAL_ID is set) and the task is to coordinate or check on another agent."
---

# Herdr (`hc`, herdr-core 0.1.18)

Checked on 2026-11-09 against `hc --help`, `hc <cmd> --help` for ls, get, send, read, wait, and `hc --skill`.
The official skill (github.com/ogulcancelik/herdr, `skills/herdr/SKILL.md`) is for the older `herdr` binary
(`herdr agent prompt`, `herdr pane …`, `herdr integration …`, `HERDR_ENV=1`). **None of those exist here**:
`herdr` is not installed, `hc agent` and `hc integration` are unknown subcommands, and `herdr-app` has no
integration command. Use only the commands below. For the full, current manual: `hc --skill`.

## Am I in Herdr? Who am I?
```sh
echo "$HC_TERMINAL_ID"          # your own address, e.g. t9; empty = not inside hc
```

## Addresses
A terminal is addressed as `t9`, `t1g` (t + base-36), a `--name` given at launch, or `machine/t7`.
Labels set with `hc label` are not addresses. Get the current ones from `hc ls`; they change when a
terminal is recreated.
```sh
hc ls                  # live terminals: address, agent kind, cwd, status (idle|working|done|blocked|error), turn
hc ls --all            # include finished ones
hc get t15             # one terminal's state, status and current folder
```
Output is JSON when piped (`hc ls | jq -r '.terminals[] | "\(.address) \(.agent) \(.status)"'`).

## Send a one-line prompt
```sh
hc send t15 "Read run/briefs/bunny.x.md and do it. Write run/out/bunny.x.md, then touch run/out/bunny.x.done."
hc send --if idle t1h "…"       # type only if its status is exactly idle (else exit 10, status_mismatch)
hc send --wait t14 "…"          # send, then wait for the turn it started (--timeout S, default 180)
```
`send` pastes the text and presses Enter. It refuses a `blocked` terminal (a permission dialog or question);
do not use `--force` to answer someone else's dialog. Keep prompts to one line that points at a brief file;
put long instructions in the file.

## Read the last N lines
```sh
hc read t15                     # visible screen only (--lines 0 is the default)
hc read t15 --lines 80          # screen plus 80 lines of history
```
While the target is `working`, `blocked` or `error`, a history read returns only the screen, marked incomplete.
Read result **files**, not panes, for anything you will act on.

## Wait for idle (end of a turn)
```sh
hc wait t15                     # until it stops working (done/idle), blocks, errors or exits
hc wait t15 --timeout 900       # a timeout is a check-in, not a failure: wait again
```
`reason: message` means someone sent *you* a message; handle it, then wait again. Never `sleep`-poll.

## The .done-file pattern (how this team hands off work)
1. artu1 writes the brief: `run/briefs/<agent>.<task>.md` (scope, paths it may write, output file).
2. `hc send <t> "Read run/briefs/<agent>.<task>.md and do it."`
3. The worker writes `run/out/<agent>.<task>.md`, then creates `run/out/<agent>.<task>.done` **last**.
4. artu1 runs `hc wait <t>`, then `test -f run/out/<agent>.<task>.done && cat run/out/<agent>.<task>.md`.
   No .done file = not finished, whatever the status says; `hc read <t> --lines 60` to see why.
The `.done` marker is the signal, not the pane status.

## Grok shows "idle" while it is still working
Grok (and Antigravity, per the official skill) can report `idle` while background tasks or subagents keep running,
so `hc wait` can return early and `hc ls` can say idle mid-task. For Grok, trust only the `.done` file: after
`hc wait` returns, check the file; if it is missing, `hc read <t> --lines 40`, then wait again.

## Rules
- Only send to terminals you were told to coordinate. Never answer another agent's permission dialog.
- Start helpers with `hc run --bg --name <n> …` and clean up only terminals you started (`hc kill`, `hc rm`).
- Never `hc server stop|restart` unless the owner asks: it affects every terminal.
- Codex must run with `--no-daemon` (`hc --skill`), or its commands run outside hc.
