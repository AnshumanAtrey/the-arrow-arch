# IBM Bob 2.0 Hackathon — Idea Analysis

Consolidated notes from the brainstorm across all four team docs.
Status: **no idea committed yet.** Open decisions are listed at the end.

---

## 0. Grounding facts

**Event**

- IBM Bob 2.0 Hackathon, lablab.ai
- **Sept 25–27, 2026 — 48-hour build**
- $10,000 prize pool, online
- Challenge asks for: a specific developer workflow improved (onboarding, debugging, code review, testing, maintenance, release/deploy), a working prototype on a real or sample project, meaningful use of agent mode / parallel tasks / subagents / document understanding, and **demonstrated measurable impact**
- Likely judging weights (from the prior IBM Bob event): depth of Bob usage, relevance of use case, technical execution, presentation clarity

**What Bob 2.0 actually ships** (matters — three of our four docs assume capabilities without checking)

- Unified agent architecture across IDE and Shell
- 270k context window
- Parallel native tool calling
- **Subagents** — isolated context, summarise back to main agent, user approves each spawn
- Three modes: Code / Ask / Plan, plus custom modes (`custom_modes.yaml`)
- `.bob/rules-{mode}/`, `.bobignore`, slash commands, **Skills** (Agent Skills spec)
- MCP (local stdio + remote SSE)
- **Lifecycle hooks** — SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop (Bob Shell 2.0.2, Aug 2026; IDE 2.1.0 added a hooks management UI)
- Bob Shell CLI, `bob acp` (Agent Client Protocol) in 2.1.0
- Bobalytics — usage and cost visibility

**Unclaimed edge: nobody's doc mentions hooks.** Hooks are deterministic, non-LLM enforcement points. Most of our verification ideas are currently implemented as prompts; hooks would make them real. This is the single biggest technical opening available.

**IBM's own framing to borrow:** they cite 2026 GitLab research that 85% of DevSecOps professionals say AI shifted the bottleneck from *writing* code to *reviewing and validating* it.

---

## 1. Per-document findings

### ArrowArch / The Workshop (Anshuman)

**Good finds**

- Sharpest problem diagnosis of the four: context exhaustion, false "done", scope inflation, session amnesia. All four are real and all four are AI-native.
- **The Sizing Question ladder** is genuinely useful and reusable — does this need to exist → do we already have it → does the toolkit do it → can it be one small thing → ask the human.
- **"No receipt, no done."** The Ledger, with receipts marked fresh or stale, is the strongest primitive in any of the docs.
- Correct instinct that a stale receipt is void.
- Correct instinct on ambiguity: *"spots something odd → does NOT decide → writes it down as a question."* This is the right answer to a problem TraceGuard gets wrong (see below).
- Failure classification by reason (retry vs never-retry vs escalate) is more thought-through than most agent harnesses.
- The "five things that are never too much" list (validation, error handling, security, accessibility, tests) is a good guardrail.

**Caveats**

- **The developer's experience is waiting.** The doc's own promise is "you spend two minutes." That means almost nothing is on screen for a judge to watch. No UI story at all.
- **It partially reimplements Bob.** Isolated-context subagents, plan-then-execute, approve-each-spawn all ship in the box. Pitching IBM a harness that fixes Bob's context management reads as "your product is broken and we patched it." Correct problem, wrong owner.
- **Cost is unaddressed.** Recursive planners × builders × re-running every test multiplies tokens. IBM shipped Bobalytics because enterprises are counting. A design whose core move is "spawn more agents" has to answer this.
- **Parallel *writers* are the weakest part.** Fan-out is reliably good for reading and reliably bad for writing (merge conflicts, duplicated work, incoherent design). Highest risk, lowest payoff part of the architecture.
- **Resumption is claimed, never demonstrated.** "A helper can die mid-sentence and nothing is lost" is one of the best demo beats available anywhere in these docs, and it is in nobody's demo plan.
- The Inspector is still an LLM reading test output. Re-running tests is deterministic; *deciding what the result means* is not.

---

### TraceGuard (Ayush)

**Good finds**

- **The single best demo moment across all four docs:** green CI, all tests pass, feature is still wrong (requirement says 30 minutes, code does 60). Visceral, ~20 seconds, judge-memorable.
- Lands directly on IBM's own stated positioning (bottleneck moved from writing to validating).
- Risk-tiered auto-fix (green / yellow / red) is the right mental model for autonomous change.
- "Every fix enters a verification loop — never treat a generated fix as successful until checks re-run."
- The Feature Passport and API completion map are good *artifacts* — concrete, screenshot-able, evidence-backed.
- The self-aware risk table (false positives, unsafe fixes, weak Bob integration, no measurable impact) is honest.

**Caveats**

- **Scope is a six-month product.** Seven agents, evidence graph, API map, DB agent, security agent, tiered auto-fix, dashboard. In 48 hours you ship the slide-deck version.
- **The Feature Contract has a drift problem of its own.** It's a hand-written statement of intent, and hand-written statements of intent rot — which is the premise of Prem's doc. The anti-drift machinery is anchored to an artifact that drifts.
- **Auto-fix assumes the requirement is right and the code is wrong.** Sometimes the code is right and the requirement is two quarters old. Nothing in the design distinguishes *drift* from *deliberate evolution*. ArrowArch's "don't decide, ask" is the fix, and it's a clean cross-pollination point.
- **False positives are an existential risk, not a listed risk.** A drift detector that cries wolf gets uninstalled in a week. "Require evidence" is a hope, not a mitigation.
- Fails the strict "new problem" test as written (features have always been built wrong, CI has always been green on wrong code) — but has a rescue, see §4.

---

### Developer Work Intake Gateway (Sayuj)

**Good finds**

- **The most self-aware doc.** It names ScopeShield and EchoSync from the prior event as prior art and says plainly that the idea isn't automatically a winner. That judgement is worth trusting.
- Clear product boundary: we own "what is the developer being asked to do", Bob owns "how", the developer owns "is this what I want".
- The competitive research (prior winners, participant counts, judging emphasis) is useful to the whole team regardless of which idea wins.
- **The refusal threshold is the salvageable kernel** — "HIGHLY UNCLEAR → do not start development." An agent that declines to proceed is rarer and more valuable than one that asks a clarifying question.
- Good instinct to measure before/after explicitly rather than inventing numbers for the deck.

**Caveats**

- **It's a PM/triage tool, not a developer tool.** The challenge asks for a developer workflow.
- **Fails the "new problem" lens hardest.** Unclear requirements is the oldest problem in software, and AI arguably made it *better* (a model can now read the thread). This is the "what cool thing can AI do" shape.
- **The critical path runs through the least reliable human in the building** — the requester, who is in a meeting and will reply "idk just fix it" three hours later. Unmodelled.
- **Bob does the least interesting work**, at the end, as a black box. Judging weights depth of Bob usage. The doc admits this.
- Crowded category. Slack → ticket is among the most-built AI demos of 2025–26.

---

### Repo Guide (Prem)

**Good finds**

- **Most buildable of the four** and the only one plausibly finishable in 48 hours.
- **Cleanest metric:** time from joining the repo to first meaningful commit.
- **Subagent fan-out used for reading only** — correct by construction, avoids the parallel-writer trap ArrowArch falls into.
- **"Good first task needs live data"** is the one genuinely defensible novelty claim across all four docs. A static file can't know what's a good task *this week*.
- Correct framing that the real cost is *maintenance*, not authoring — "docs go stale the moment the code changes."
- Honest positioning against "just ask Cursor/Claude Code" and against static CLAUDE.md.

**Caveats**

- **Atlas won the previous IBM Bob hackathon doing repo onboarding.** Competing in a category these judges already crowned is a hard sell.
- **The premise is slightly off.** Onboarding doesn't fail because docs are missing — it fails because docs exist and nobody trusts them, so the new dev reads the code anyway. Regenerating untrusted docs faster produces untrusted docs faster. **Trust is the bottleneck, not existence.**
- **The real day-1 blocker is usually "I can't get it to run",** not "I don't understand auth."
- **Weak demo theatre** as planned — "docs regenerate after a refactor" is a diff of a markdown file.
- **Fails the "new problem" lens as written.** "New devs waste days understanding a codebase" is a 1995 problem.
- Unasked question in the doc: **docs for whom?** A new human, or the next agent session? (This turns out to be the whole ballgame — see §4.)

---

## 2. The correlation

**The obvious one** (Sayuj already found it): lifecycle order.

```
Sayuj  →  BEFORE    what should be built?
Anshuman → DURING   how do we execute without losing context or faking done?
Ayush  →  AFTER     did what got built match what was asked?
Prem   →  AROUND    what does this codebase mean, kept current?
```

True, and a trap. "Combine all four in sequence" produces a platform, not a product, and a platform cannot be demoed in five minutes.

**The non-obvious one.** All four docs independently invent the *same primitive*: a durable artifact living outside the model's head, whose central property is **freshness**.

| Doc | The artifact | The freshness rule |
|---|---|---|
| ArrowArch | The Map, The Ledger, The Library | "a receipt older than the code it describes is stale and void" |
| TraceGuard | Feature Contract, Evidence Graph, Feature Passport | intent drift detection |
| Intake Gateway | confirmed task package + source evidence + timestamp | human confirmation at a point in time |
| Repo Guide | auto-regenerated doc set | docs rot the moment code changes |

Four people, four problems, one answer.

**The shared enemy is not context loss, or unclear tickets, or intent drift. It is that every shared source of truth between humans and agents goes stale silently, and nobody can tell which part went stale.**

---

## 3. Agentic experience gaps — nobody closes these

1. **Verification is performed by the thing being verified.** ArrowArch's Inspector is another LLM reading test output. Bob's hooks (PostToolUse, Stop) are deterministic gates. Anshuman writes *"judgement sits on top of counted facts"* and then implements it in a prompt. Hooks would make it true.

2. **Human attention is spent at the wrong moment.** Every design gates *before* work (approve plan) or *after* (read report). The dangerous moment is minute 15, when the agent makes a silent assumption nobody asked for. An **assumption log** — every choice made that wasn't in the spec, with the file it landed in — is cheap, unclaimed, and directly answers "why is this code like this."

3. **Staleness is claimed by everyone, implemented by nobody.** All four treat it as "regenerate everything." The interesting question is *which 5% went stale* — answerable deterministically via git diff → touched files → invalidate only claims anchored to those files.

4. **Trust is binary and per-run.** No idea models an agent's track record by area ("reliable at test generation, unreliable at migrations").

5. **Interruption and resumption are promised, never shown.** Killing the process live on stage and watching it resume from disk is a top-tier demo beat sitting unused.

6. **Cost is absent from all four docs.** "We revalidated 6 claims for $0.40 instead of 80 for $6" is a measurable-impact slide in IBM's own language.

7. **Multi-agent ≠ better.** Fan-out helps for read-only investigation (exactly what Bob's subagents do) and hurts for writes. ArrowArch's parallel Builders are the riskiest design choice in any of the docs.

---

## 4. The winner lens

The stated pattern: don't ask "what cool thing can AI do", ask **"what new developer problem exists because software development is becoming more AI-driven?"**

**One correction.** Two of the three winners pass strictly; Atlas doesn't. "How do I understand a massive codebase" predates AI by decades. It won because the problem became *newly urgent* and *newly solvable*. So the real shape is: **a problem that either didn't exist before AI, or existed harmlessly before AI and now bites.** Category two is fine — but you must say out loud why it bites *now*, or you get filed under "nice tool."

**Also worth copying:** all three winners named a **noun**. A record, a map, a place. Not "an AI that helps you do X." And each can be stated with AI as the *cause*, never as the solution.

**Scoring our four**

| Doc | Verdict |
|---|---|
| Intake Gateway | **Fails.** Unclear requirements predates AI; AI arguably improved it. |
| TraceGuard | **Fails as written, rescuable.** See reframe below. |
| ArrowArch | **Passes on problem selection, fails on ownership.** The problem belongs to the agent vendor, not the developer. |
| Repo Guide | **Fails as written** — and fails in Atlas's lane specifically, which is the worst place to fail. |

**TraceGuard's rescue:** what's new isn't that features get built wrong. It's *who holds the intent*. When a human wrote the code, a human held the requirement and could be asked. Now neither party holds it — the requester wrote one sentence, the agent inferred the rest, and nobody can reconstruct which parts were specified and which were guessed. Framed that way it passes. Framed as "intent drift detection," it's a 2018 problem with a 2026 implementation.

**Repo Guide's reframe — the strongest thing on the table**

Documentation used to be *reference material*. A stale README misled one human, who got confused, asked a colleague, lost twenty minutes. Contained.

In an AI-driven repo, `AGENTS.md`, `.bob/rules`, skills files and `CLAUDE.md` are not reference material. **They are instructions.** The agent doesn't read them and get confused — it reads them and *acts*. A stale line doesn't cost twenty minutes. It propagates into code, silently, at machine speed, in every session, for every developer on the team, until someone notices.

> **Documentation stopped being documentation and became untested, unversioned, unowned production configuration.**

Why this passes hard:

- Didn't exist before AI. Direct consequence of AI-driven development.
- Every team that adopted agentic coding in the last year accidentally created a new class of critical file, with no tests, no CI, no owner, no staleness signal.
- **IBM will feel it immediately** — Bob's entire extension surface *is* these files (rules, skills, modes, AGENTS.md). We'd be solving a problem their product *creates*, which is a far better position than solving a problem their product *has*.
- It gives a 20-second existence proof, which the winners all had and our docs mostly don't: show a stale line → show Bob confidently doing the wrong thing → show it happen again in a fresh session, identically.
- The noun is sitting right there: a ledger, a passport, a lockfile for context.

**How the other three docs fold in under this framing** (each becomes a *consequence* of one root problem — a much easier five-minute pitch than a four-stage pipeline):

- ArrowArch's "starts from zero every session" = the cost of having no trustworthy context layer
- TraceGuard's drift = intent in the context file and intent in the code diverging
- Sayuj's refusal threshold = "don't write a claim you can't anchor"

---

## 5. The two other untaken problems

**A. Code with no author-memory.** Every AI-written function embeds decisions nobody made consciously. Git tells you who committed, not why it's 30 and not 60. Before AI there was always a human who remembered; now there isn't, and the gap compounds every sprint.
*Catch:* the pain is delayed by six months. A problem the judge can't feel today is a weak hackathon problem even when it's a strong product problem.

**B. Self-certifying tests.** The thing writing the tests is the thing being tested. "All tests pass" used to be evidence because a semi-adversarial human wrote them; now the prover writes its own proof, and the classic failure is an agent quietly relaxing an assertion to go green. Anshuman is the only one who spotted this ("checks no existing test was made easier").
*Catch:* hardest to demo without looking contrived, and edges into Pedigree's territory.

**Read:** the instruction-file reframe is the best *hackathon* problem (new, visible, instantly felt, IBM-native). A is the best *product* problem. B is the most intellectually interesting and the riskiest demo.

---

## 6. Unsolved developer pain points nobody's doc touches

- **Review fatigue.** Reviewing a 40-file AI PR is worse than writing it. None of the four make review cheaper *for a human*; reports get skimmed.
- **Environment and setup.** The actual day-1 onboarding blocker.
- **Flaky tests.** Every verification scheme here assumes tests are a trustworthy signal.
- **The hand-maintained stack of AGENTS.md / CLAUDE.md / rules files** — a brand-new 2026 chore. We invented a new doc to rot.

---

## 7. Current bottlenecks

**B1 — No existence proof for the strongest framing, and it hasn't actually been checked.**
One personal data point so far (Prem: no repo with a rotted `AGENTS.md` or rules file to hand). The other three haven't been asked. So we can't currently screenshot the problem we want to lead with — but we also don't yet know whether that's a real finding or just a sample of one.
*First, cheapest step:* ask the other three whether they have one. Five minutes, and it changes how much weight the scan has to carry.
*Resolution path:* don't use our own repo. Scan a population. `AGENTS.md`, `CLAUDE.md`, `.cursorrules` and `.bob/rules` have been in public repos for over a year. Take ~200 repos containing an agent instruction file and check mechanically whether what the file claims still holds:
- commands the file tells the agent to run vs. what exists (`npm test` in AGENTS.md, no test script in package.json)
- file and directory paths referenced vs. what's on disk
- env vars, config keys, CI workflow names mentioned
- instruction file untouched for N commits while the area it describes churned

Headline becomes: *we scanned N repos with agent instruction files; X% contain at least one instruction that is no longer true.* A population, not an anecdote, and spot-checkable live.
Two bonuses: **the scanner IS the product** (200 repos → problem slide; 1 repo → the tool), and the strongest checks are **deterministic**, keeping the core off the LLM and on the "counted facts" thread.
*Watch:* check lablab rules on pre-existing work. Research and data gathering are normally fine, pre-written code usually isn't. Treat the scan as throwaway research, keep the numbers, rebuild the engine during the 48 hours.

**B2 — Bob 2.0 is unverified on our machines.**
Nobody has confirmed hooks fire, or that Bob Shell works as documented. If hooks don't behave as assumed, a large part of the design collapses. **Must be known by Monday, not Friday night.**

**B3 — Demo repo undecided.** Real repo vs. purpose-seeded. A seeded repo guarantees the drama; a real one makes the impact number credible. Probably can't have both in 48 hours.
*Partial resolution:* rot created *live* beats rot that happened three weeks ago. Take a clean OSS repo, have Bob do a real refactor during the demo, watch the instruction file go stale while everyone's looking. Nobody can claim it was planted — they watched the mechanism run.

**B4 — Judging mode unknown.** Do judges run the project or watch a video? Changes the build-vs-polish ratio significantly.

**B5 — Four specs, four authors, six days.** Expected to resolve well — the stated intent is to pick the best set of features over defending individual docs — though that's one member's read of the team rather than a conversation that's happened yet. Still needs an explicit owner for the spine and explicit owners for demo / repo / metrics.

**B6 — Timeline.** Six days to the 25th. Every one of these is cheaper to resolve today than on the 24th.

---

## 8. The part worth being nervous about

**One of us, asked "do you have a rotted instruction file?", said no. That is weak evidence against the direction — a sample of one — but it points at a real risk and shouldn't be argued away.**

The risk is that the problem is more **anticipated** than **felt**. Six months from now it's obviously real. Next Friday, in front of a judge, "real" is the only thing that counts.

Note what would change the picture in either direction. If the other three also come back empty, a team that builds with agentic tools daily has zero first-hand instances, and that's a genuine warning. If two of them immediately produce one, the framing is already validated from inside the room and the scan becomes supporting evidence rather than the whole foundation. Right now we're reasoning from one answer, so treat the concern as live but unproven.

This is exactly the failure mode the winner lens is supposed to catch, applied to *our own* reframe: a problem that is intellectually correct and emotionally flat. Pedigree, Atlas and Sandbox all led with something the judge had personally suffered.

**Secondary risks in the same direction:**

- If the scan comes back thin, manufacturing the evidence will *look* manufactured — and a judge who smells a planted problem discounts everything after it.
- The reframe is one sentence from being profound and one sentence from being pedantic ("you're telling me to keep my README updated"). The pitch has to make the *acting on it* part land in the first fifteen seconds, or it collapses into doc hygiene.
- Solving a problem IBM's product creates is a strong position **if** framed as ecosystem maturity, and a weak one if it reads as criticism.

**Mitigation:** the scan settles the argument in an afternoon and is the single highest-value thing we can do before the 25th. Run it small first (~50 repos) before anyone commits.

**Pre-commitment required:** pick the kill number *before* seeing the result, so we're not negotiating with ourselves at 2am on the 24th. If drift shows up in most repos, the direction locks. If it barely shows up, we've learned cheaply that the problem is early and we fall back to **A (author-memory)** or **B (self-certifying tests)** with five days still on the clock.
