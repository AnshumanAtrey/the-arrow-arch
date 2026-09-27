# Arrow Arch

Aim once, land once. Give Arrow a repository and the rules your team codes by,
then send tasks in plain words. A project manager writes the spec, an architect
splits it into small packets, workers build them in parallel — each in its own
git worktree — and nothing lands until Arrow has re-run the proof itself.
Everything runs on IBM Bob Shell by default.

## Run it

Needs: [Bun](https://bun.sh) 1.3+, Node 20+, git, and
[IBM Bob Shell](https://bob.ibm.com/docs/shell) 2.0.5+ with an API key.

```sh
bun install
bun run dev            # the UI and the background orchestrator, together
```

Open **http://localhost:7777**:

1. **Settings** — paste your Bob API key (stored on this machine only, owner-read-only).
   Every role runs on Bob Shell; switch a role to *Mock* to try the flow without a model.
2. **Onboard a repository** — a GitHub URL or a local path, plus your team's rules.
   Arrow learns the repo and checks it against the rules: all green → approve;
   a critical rule at stake → Arrow's call (continue / stop) and what to do.
3. **Send a task.** Answer the project manager's questions if it has any, approve
   the plan check, and watch it land on `arrow/<task>` — never pushed.

## How it works

| Part | Job |
|---|---|
| Onboarder | Learns the repo (stack, commands, versions, env var names) and tunes Arrow's 13 house rules to the company's: keep, replace, don't grow, or conflict |
| Project manager | Task → spec: acceptance in your words, method (one shot / phased / iterative), questions only if needed |
| Architect | Spec → packets: files it may change, commands that prove it, what runs beside it |
| Workers | One packet each, own worktree, own ports, told who else is working |
| Orchestrator | Runs in the background. Holds the event log (the only state), decides every next step in code, re-runs every check itself, bounds every retry, and keeps the **ledger** |

**The ledger** — who is running, which worktree each owns, which files it may
change, which process holds which port. Only the orchestrator writes it,
rebuilding it every few seconds from the event log and what the machine really
runs (`ps`, `lsof`, `git worktree`). Anything a finished agent left behind is
reaped. Agents read it; they never edit it.

**You stay in the loop** at every check: approve, stop, or send it back to the
agent with a note (it re-runs in the same session and a new check opens). A
phased task stops after each phase for you to look before the next is planned.
A paused step resumes with your instructions. Each task page is one tree —
project manager, architect, every packet, every run — and any run opens to the
exact prompt it was given and each step it took.

**House rules** (defaults, changeable per company at onboarding): files 300 lines,
cap 500 · no new markdown files · no TODO placeholders · no secrets · new
dependencies need approval · 400 changed lines per packet · typecheck and lint on
every packet · one retry, one re-plan, then you · existing tests never weakened ·
nothing pushed. The research behind them: `../dataset/problem_categories/`.

## Code

```
engine/    orchestrator, loop manager (decide.ts), ledger, checks, git, agent adapters
prompts/   the six role prompts
app/       Next.js UI + API routes     components/  UI pieces
tests/     bun test — unit + end-to-end on a throwaway repo
```

Data lives in `.arrow-data/` (git-ignored): one event log per repo, the clone,
worktrees, agent transcripts, `settings.json`.

```sh
bun test               # 96 tests
bunx tsc --noEmit      # typecheck
```
