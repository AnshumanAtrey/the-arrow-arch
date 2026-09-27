# Problem categories

Every problem record from X, Reddit and Stack Overflow (313) is assigned to exactly
one category, and each category gets the default Arrow takes against it and what a
company's onboarding may change. Derived from the platform files; nothing upstream
is modified.

## Files

- `category_map.csv` — one row per source record: `record_id`, `platform`,
  `category_id`, `category`, `in_scope`, the original `problem_statement` and
  `source_url`.
- `categories.csv` — one row per category: record counts by platform, the problem
  in plain words, Arrow's default, how it is enforced, what onboarding can change,
  whether the default is `critical` (changing it needs a person at the rules check)
  or `normal` (a company rule replaces it and the check stays green), whether the
  scaffold implements it today, and every record id in the category.

## Snapshot (2026-09-27)

| Category | Records | Share of in-scope |
|---|---:|---:|
| C11 Environment and setup failures | 85 | 34% |
| C03 Invented code and out-of-date APIs | 41 | 16% |
| C02 Memory loss across sessions | 19 | 8% |
| C05 Repair loops that don't converge | 19 | 8% |
| C14 Agent orchestration reliability | 17 | 7% |
| C12 Review load and ownership | 15 | 6% |
| C04 Fake "done" and silent failure | 13 | 5% |
| C07 Drift from the company's conventions | 9 | 4% |
| C13 Trust in what agents are given | 9 | 4% |
| C01 Context overload in big files | 8 | 3% |
| C06 Collateral damage | 7 | 3% |
| C09 Parallel agents collide | 5 | 2% |
| C10 Wrong thing built | 4 | 2% |
| C08 Documentation sprawl | 0 | — |
| **In scope** | **251** | |
| Out of scope: business and support automation | 28 | |
| Out of scope: general programming questions | 30 | |
| Out of scope: people and organisations | 4 | |

Stack Overflow supplies 78 of C11's 85 and 32 of C03's 41 (API changes between
library versions — the errors an agent trained on older versions reproduces). Of the
141 in-scope X and Reddit records, memory loss and repair loops lead with 19 each.

## Method and limits

- One primary category per record, assigned by one reader from the problem
  statement and evidence excerpt. Records that touch two categories sit in the one
  that best names the failure; `categories.csv` lists every id so a reassignment is
  a one-line change.
- **Counts are not prevalence.** They reflect what the collectors searched for and
  what the indexes exposed (see the platform READMEs). Use them to see which
  problems are real and recurring, not to rank how common each one is.
- **C08 has no records.** Documentation sprawl comes from Arrow's own earlier run
  (per-step markdown files piling up in the product repo), not from this dataset.
- **The numbers in Arrow's defaults are choices, not findings.** The data supports
  "big files hurt agents" (C01); the 300-line target and 500-line cap are Arrow's
  opinion, which is exactly why onboarding can change them.
