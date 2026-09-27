# Does ARROWARCH fit the IBM Bob 2.0 problem statement?

Assessed 2026-09-17 against `given/03-challenge.md`, `given/07-what-to-submit.md`, `given/08-judging-criteria.md`.
Subject: `~/Desktop/code/work/jobs/molecule-ventures/arrow-arch` (git: `anshuman-moleculeventures/the-arrow-arch`).

**Verdict: yes on the brief, yes on the judging rubric, with three real blockers — one unknowable until Sep 25.**

---

## 1. The brief, clause by clause

> "Create a solution that improves a specific developer workflow, such as onboarding, debugging, code review, testing, application maintenance, or release and deployment processes."

ARROWARCH is that solution, and it hits **five of the six named workflows** — onboarding (`arrow learn` → `knowledge.yaml`, so a session never re-learns the repo), debugging, code review (the risk:high diff read), testing (verification re-run by the orchestrator, baseline-aware), application maintenance (the whole pipeline). Only release/deploy is out of scope by design.

> "Start by clearly defining a problem where time, effort, or errors are too high today."

Already written. `ARROWARCH.md` § "The problem" is an **11-item numbered list** of exactly this — bad decomposition, context burn, shallow investigation, guessed intent, "done" meaning the agent said so, re-learning every session, parallel agents colliding, 30-task plans nobody reads, planner context overflow, ceremony on tiny changes. That section is the hackathon's "clearly defined problem" requirement, pre-answered.

> "build a working prototype on a real or sample project that demonstrates a full solution"

Not a prototype — it **ran on a real production repo**. See §3.

> "Leverage features like Agent mode, parallel tasks, subagents, and document understanding to manage and improve multiple steps, not just assist with coding."

This is the uncanny part. The four features the brief names map 1:1 onto ARROWARCH's four load-bearing mechanisms:

| Brief's named Bob 2.0 feature | ARROWARCH mechanism | Where |
|---|---|---|
| **Agent mode** | `spawn_agent()` — headless, streamed, one code path per role | `arrowlib/agents.py` |
| **Parallel tasks** | `PARALLEL=3` file-disjoint tasks, one git worktree each, serial merge queue with post-rebase re-verify | `arrowlib/run.py`, `merge.py` |
| **Subagents** | Architect (called scoped, exits, never holds the whole job) + Workers (one packet, own repo copy, gone when done) | `arrowlib/stages.py`, `prompts/` |
| **Document understanding** | Recon over `.arrow/resources/` — PDF teardowns, authenticated API captures, tech-stack notes → `knowledge.yaml` | `prompts/RECON.md`, `LEARN.md` |

> "not just assist with coding"

This is ARROWARCH's entire thesis. *"The orchestrator never trusts a worker: when a worker says 'done' it re-runs every verification command itself, checks which files actually changed, and checks no existing test was weakened."* Four checks every time, typed failures (`CODE_ERROR` / `ENVIRONMENT_ERROR` / `SCOPE_ERROR` / `ARCHITECTURE_ERROR` / `TIMEOUT`), and a repair ladder that stops at two guesses. That is management of multiple steps, not coding assistance.

> "Clearly demonstrate impact…"

See §3. The numbers exist and are real.

---

## 2. The judging rubric

| Criterion | Fit | Why |
|---|---|---|
| **Application of Technology** | ⚠️ the one gap | "clear application of IBM Bob 2.0" — today the engine is Claude Code + Opus. See §4, blocker 1. |
| **Presentation** | ✅ strong | `ARROWARCH.md` is already written twice (plain English, then exact mechanics), and § "The whole run, on one page" is a ready-made 3-minute demo script with a real bug carried end to end. A Next.js dashboard already exists (`arrow.py ui` → :7777). |
| **Business Value** | ✅ strong | Provable, not asserted — §3. |
| **Originality** | ✅ strong | The field is saturated with "agent writes code." Verification-first orchestration — *nothing counts as done until it is proven, and the orchestrator computes from numbers code worked out, never from its own judgment* — is a genuinely differentiated thesis. |

---

## 3. The impact evidence (already collected, from the real run)

From `data/retailligence-agent/.arrow/` — `state.yaml` + `runs/events.jsonl`:

| Metric | Value |
|---|---|
| Tasks planned | **93** |
| Tasks **merged to green main** | **85** |
| Landed on **attempt 1** | **84 of 93** |
| Needed attempt 2 | 1 |
| Never started (deferred/pending/split) | 8 |
| Modules | **16** (ARW-001: M1–M12, ARW-002: P1–P4) |
| Metered agent sessions | **108** |
| **Total cost** | **$202.79** |
| Events logged | **5,138** |
| Run span | 2026-08-24 → 2026-09-02 (**8d 16h**) |
| Target | a real production repo, not a toy |

A **~90% first-pass merge rate on a production codebase for ~$203** is the headline. That single number answers "increases productivity, reduces manual effort, errors, and rework" better than any before/after mockup.

`runs/*.log` + `*.prompt.md` + `events.jsonl` also *are* per-task session records — which lines up directly with the submission requirement for **"screenshots of IBM Bob task session summaries."**

---

## 4. The three blockers, named raw

### Blocker 1 — Bob 2.0's headless surface is unknown until Sep 25 (technical, unresolvable today)

`given/04-technology-and-access.md`: **"⏳ Access details TBA"**, access granted at the start of the hackathon.

**But the seam already exists.** `arrowlib/config.py`:

```python
ROLE_CMD = {
    "orchestrator": os.environ.get("ARROW_ORCHESTRATOR_CMD", "claudeor"),
    "architect":    os.environ.get("ARROW_ARCHITECT_CMD", "claude1"),
    "worker":       os.environ.get("ARROW_WORKER_CMD", "claude1"),
}
# "One wrapper per role. Each is a shell script that points Claude Code at a
#  different model, so the role/model split is config, not code."
```

The engine is **already an env-var-swappable shell command**, and it has already been swapped once in anger (DeepSeek → Opus, comment still in the file). `spawn_agent()` is one code path for all three roles; the only thing that knows the event schema is `_summarise()` — about 20 lines parsing `assistant` / `tool_use` / `text` / `result`.

So the port is **one adapter**: a `bobw` wrapper taking `-p` / `--resume` and emitting that stream shape. Whether that adapter can exist depends entirely on whether Bob 2.0 ships a CLI / headless / streaming mode. Unknown. Build the adapter behind the existing seam and both readings of the rules stay open.

Fallback if Bob is IDE-only: the submission becomes "Bob 2.0 built ARROWARCH," which still satisfies the two **Important Requirements** verbatim — but scores weaker on "clear application of IBM Bob 2.0." Worth deciding on kick-off night, not before.

### Blocker 2 — provenance (a rule question, your call)

Facts, unfiltered:
- `arrow-arch` sits under `work/jobs/molecule-ventures/` and pushes to the **work** GitHub account (`anshuman-moleculeventures/the-arrow-arch`).
- `data/retailligence-agent/.arrow/resources/` contains **`molecule-pipeline-key.json`** (a live credential) and authenticated API captures of a third-party product (Retalp) — ~90 JSON files including RBAC, users, domains, API keys.
- No `LICENSE` file in the repo.
- The hackathon requires a public repo and submissions that are "original and MIT-compliant."

A public push of this tree as-is would ship an employer credential and a competitor's authenticated data. The clean path is obvious and cheap: a fresh MIT repo, `arrowlib/` + `prompts/` + `arrow.py` + the UI, **`data/` excluded entirely** — and the §3 metrics cited as prior-run evidence in the writeup and video without shipping the data behind them. Whether the IP itself is yours to submit is a Molecule Ventures question, not a technical one.

### Blocker 3 — 48 hours vs. the real thing (scope)

ARROWARCH is 1,687 lines of `arrowlib/`, a 65KB design doc, 4 role prompts and a Next.js UI, built over ~2 weeks and proven over an 8-day run. Not portable wholesale into Sep 25–27.

It doesn't need to be. The brief asks for "a working prototype on a real or sample project." The 48h deliverable is the Bob-native adapter + a full loop on a sample repo, with the production run as the evidence exhibit.

---

## 5. What is *not* a blocker

- **Pre-existing code.** The event page's only originality rule is *"Submissions must be original and MIT-compliant."* There is **no** published "repo must be created during the contest period" rule — I checked both `lablab.ai/ai-articles/hackathon-guidelines` and the event page. (Contrast: the Devpost hackathon in `hackathons/rapid-agent-hackathon/given/02-rules.md` *does* carry that rule. lablab does not.)
- **Team size.** 4 members, limit is 6.
- **Cost.** Entry is $0.

---

## 6. Bottom line

The brief reads like it was written against this repo — five of six named workflows, all four named Bob features already load-bearing mechanisms, the "clearly defined problem" section already written, and an impact number (~90% first-pass merge, 85/93 tasks, $202.79, production repo) that most submissions will only be able to mock up.

The work is: **one adapter, one clean-room MIT repo, one demo run.** The only thing that can't be decided before kick-off is whether Bob 2.0 exposes a headless surface to adapt to.
