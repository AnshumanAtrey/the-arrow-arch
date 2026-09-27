# Problem keyword index

This folder contains a searchable keyword view over the project's X, Reddit, and Stack Overflow problem records. It is a derived index; the original platform datasets remain unchanged.

## Files

- `keywords.csv` — one row per retained problem concept, with a compact set of search keywords, representative report, source IDs, URLs, dates, and license metadata.
- `source_map.csv` — all input rows mapped to a keyword ID, including authors, original text evidence, source URLs, evidence type, confidence, and license. Use this file to inspect merges and recover every contributing source.
- `build_keyword_dataset.py` — deterministic local builder. Its explicit semantic-merge groups are listed in `DUPLICATE_GROUPS`; uncertain similarities are not auto-merged. X-source keyword overrides are in `X_CUSTOM_KEYWORDS`; multi-word category normalization is in `CATEGORY_PHRASE_MAP`.
- `BOB_PROMPT.md` — ready-to-paste IBM Bob prompt for reviewing and improving this dataset.

## Snapshot

Built 2026-09-27 from the local platform files:

| Platform | Input records |
|---|---:|
| X | 35 |
| Reddit | 138 |
| Stack Overflow | 140 |
| **Total source records** | **313** |

The keyword index has **301 rows** after 12 source rows were grouped into seven manually specified same-meaning concepts. The 313 original rows are all preserved in `source_map.csv`. A keyword record is a problem concept assembled from the available source problem statements; it is not a claim that separate authors experienced one shared incident.

## Merge policy

Merges require clear same-meaning evidence from the source text. Uncertain similarities are kept as separate rows. The seven current merge groups are:

| Canonical ID | Merged source IDs | Basis |
|---|---|---|
| `KW-REVIEW-BOTTLENECK` | X-0003, R-0020, R-0058 | Same complaint: AI code generation creates a review-capacity bottleneck |
| `KW-COMPACTION-MEMORY-LOSS` | X-0009, R-0107 | Same complaint: agent loses work after context compaction |
| `KW-CODE-HALLUCINATION` | X-0011, R-0033 | Same complaint: AI invents or hallucinates code logic |
| `KW-CONTEXT-WINDOW-LIMIT` | R-0005, SO-75396481 | Same complaint: context/token limit reached on large files or prompts |
| `KW-CONTEXT-NOT-RETAINED` | R-0015, R-0043, R-0109 | Same complaint: agent fails to retain earlier instructions across a session |
| `KW-REPAIR-LOOP-REGRESSION` | R-0012, R-0013, R-0041, R-0052, R-0093 | Same complaint: repeated repair attempts fail to converge or cause regressions |
| `KW-REPEATED-DEBUGGING-ADVICE` | R-0069, R-0070 | Same complaint: assistant repeats checks already answered by supplied code |

## Unresolved possible duplicates

The following concept pairs were reviewed and kept separate; they describe related but distinguishable failure modes:

- **KW-0003** (developer depends on AI to debug unfamiliar generated code) vs **KW-0034** (developer lacks understanding of already-generated code when it fails at runtime): the first describes reliance as a consequence of unfamiliarity; the second describes comprehension failure when debugging. Different stage, different mechanism — kept separate.
- **KW-0279** (Claude ignores repo-structure instructions in a repeated loop) vs **KW-REPAIR-LOOP-REGRESSION** (repeated repair prompts diverge over many iterations): KW-0279 is a single-session structural-instruction failure; KW-REPAIR-LOOP-REGRESSION is multi-attempt convergence failure during debugging. Different triggers and scope — kept separate.

## Keyword quality improvements (2026-09-27 revision)

Four issues were corrected in this revision:

1. **Category fragment split fixed.** The SO problem category `"Build, runtime, and environment failures"` was previously split on its internal commas, producing the meaningless fragments `"build"`, `"runtime"`, and `"and environment failures"`. The builder now maps this phrase to `"build runtime environment failure"` before splitting. Affects 26 keyword rows.

2. **Spurious hallucination keyword removed.** The phrase-detection pattern for `AI hallucination` previously fired on KW-0098 (*Reliability methods add latency*) because that row's problem statement mentions `"hallucination errors"` as a concern the developer is trying to mitigate — not as the failure being reported. The pattern now uses a negative lookahead to exclude the phrase `"hallucination errors"`. The keyword was removed from KW-0098 only; all genuine hallucination records retain it.

3. **X-source keyword depth improved.** Thirty-four X-source rows (X-0001, X-0004–X-0039 where not already covered by `CUSTOM_THEMES`) previously relied solely on problem-category and affected-area fields for their keywords, producing shallow and sometimes verbatim-theme entries. Each row now has 2–4 focused phrases grounded in its evidence excerpt and problem statement, added via the new `X_CUSTOM_KEYWORDS` table in the builder.

4. **Hyphen/space duplicate tags eliminated.** The affected-area field for some SO rows contained hyphenated terms (e.g. `openai-api`), which appeared alongside the space-normalized tag form (`openai api`) produced by tag processing. The `_split_category_field` helper now normalizes hyphens to spaces in all category/area phrases, eliminating within-row duplicates. Affects 7+ rows.

## Method and limits

Keywords combine the source's curated problem category and affected area, technical tags where available, narrowly matched symptom phrases, and — for X-source records — curated phrases grounded in each record's evidence excerpt and problem statement. This is a search index, not a new source of evidence. Review each linked original record before treating a phrase as a verified claim. Do not interpret a person's job or expertise beyond what the source dataset states.

The three source README files document the platform-specific collection methods and access limits. In particular, X and Reddit may expose only indexed snippets or partial thread/reply text; Stack Overflow rows are API question records and do not represent a full review of answers/comments. Upstream access limits therefore carry through to this index. Stack Overflow content remains attributed and marked CC BY-SA 4.0 in the mapping.

Rebuild from the workspace root with:

```sh
python3 data/problem_keywords/build_keyword_dataset.py
```
