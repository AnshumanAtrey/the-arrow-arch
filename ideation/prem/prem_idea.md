# Repo Guide — Auto-Maintained, Always-Current Onboarding Docs

**Built with IBM Bob 2.0 — IBM TechXchange 2026 Pre-conference Dev Day Hackathon**

## The Problem

New developers waste days figuring out how a codebase works — where auth lives, how to add a feature, what the test conventions are. Teams try to solve this with hand-written docs (README, CONTRIBUTING.md, CLAUDE.md), but those docs go stale the moment the code changes, because nobody has time to keep them updated. That's the real cost: not a lack of documentation tooling, but a lack of maintenance.

## The Idea

Use IBM Bob 2.0's subagents to continuously scan the repo and auto-generate/refresh a structured onboarding doc set — instead of relying on a human to hand-write and maintain it.

- **Subagent A** — maps the auth/data flow
- **Subagent B** — maps the API layer and routing patterns
- **Subagent C** — maps the test suite and CI conventions
- **Subagent D** — scans for live "good first tasks" (open TODOs, small recent bugs, low-risk files)

These run in parallel, grounded in the project's own docs and conventions (document understanding), and follow a team-level rules file (custom rules) so output stays consistent no matter who's onboarding.

## Why It's Different

- **Not just "ask Cursor/Claude Code a question."** Any IDE agent can answer a one-off question in one developer's session. Repo Guide produces a standing, team-shared artifact committed to the repo — it exists *before* anyone asks.
- **Not just a static CLAUDE.md / AGENTS.md file.** A hand-written doc rots as the code changes. Repo Guide re-scans and regenerates the doc set automatically — after a refactor, the docs update themselves.
- **"Good first task" needs live data.** A static file can't know what's a good task *this week* — that requires an actual current scan of the codebase.

## Demo Plan

1. Show Bob regenerate the doc set after a refactor (docs update automatically, no human edit).
2. Have a "new developer" ask Repo Guide for a starter task, and get a real, current, file-specific answer with a suggested first PR.

## Impact Metric

Time from "joins the repo" to "first meaningful commit" — measured once manually, once with Repo Guide, on the same defined task. Target: cut ramp-to-first-PR time from ~2-3 days to under an hour.
