# Stack Overflow developer problem dataset

`problems.csv` contains **140 distinct problem questions** from **140 unique Stack Overflow question IDs** and **139 question authors**, collected on **2026-09-27**. The questions cover installation and dependency failures, build and deployment errors, API integration, databases, language and framework behavior, Git, mobile tooling, and AI API integration. A question appears once even if it has several relevant tags. Repeated Git ownership failures, duplicate missing-module and library errors, duplicate SQLAlchemy reports, and conceptual or curiosity-only questions were removed during curation. The dataset contains **0 answer-derived problems**; answers are not included as solutions.

## Source and collection method

Questions were fetched from the public Stack Exchange API v2.3 using its `/search/advanced` question method for Stack Overflow. The query set covered these tags: `python`, `javascript`, `typescript`, `java`, `c#`, `c++`, `reactjs`, `node.js`, `sql`, `git`, `docker`, `linux`, `android`, `ios`, `php`, `django`, `pandas`, `postgresql`, `mysql`, and `openai-api`. Queries selected open questions created on or after 2022-01-01 with a positive score, sorted by votes; up to seven distinct problem questions per tag were retained. Titles and short body excerpts were reviewed for concrete troubleshooting or workflow issues, and records were deduplicated by question ID and meaning. The question endpoint supports tag, sort, score, and date constraints; the API limits page size and applies request throttles, so this is a curated sample rather than a complete Stack Overflow scrape. See the [API question search documentation](https://api.stackexchange.com/docs/advanced-search) and [API usage and paging notes](https://api.stackexchange.com/docs).

The dataset uses the question author’s public display name and profile URL when provided by the API. It does not infer a person’s job, experience, or prominence from reputation, votes, or username. `question_score` is retained only as source context and a discovery signal. Question answers and comments were not used to create problem records; `answer_count` is metadata and does not mean the answers were reviewed.

## Attribution and access

Each row links to the original question and records its author, tags, and the API-provided `content_license`. Stack Overflow publicly contributed content is licensed under Creative Commons Attribution-ShareAlike, with the applicable version depending on contribution date; see the [Stack Overflow licensing help page](https://stackoverflow.com/help/licensing). The sampled questions are from 2022 onward and the API reports `CC BY-SA 4.0` for the records in this snapshot. Preserve the author attribution, source link, and license information if redistributing excerpts or adapted material.

The API returned 140 selected question records in this snapshot from 20 tag searches. Search ranking and the one-page-per-tag sample favor higher-scored questions, while older questions may describe versions or policies that have since changed. Questions and accounts can also be edited, deleted, or made inaccessible after collection. This dataset records reports as posted; it does not independently validate an asker’s circumstances or reproduce their fixes.

## Files

- `problems.csv`: analysis-ready problem database. It retains the common 18-column problem schema and adds Stack Overflow question metadata.
- `api_snapshot.json`: the collected question metadata and short excerpts used to reproduce the CSV; full question bodies and answers are not stored here.
- `build_dataset.py`: fetches a fresh snapshot with `--fetch`, or rebuilds the CSV from the saved snapshot without network access.

To refresh the current snapshot, run `python3 data/stackoverflow/build_dataset.py --fetch`. To rebuild from the saved snapshot, run `python3 data/stackoverflow/build_dataset.py`.

## Columns

The first 18 fields match the project’s common problem schema: record ID, platform, date, author, profile/context, issue category and area, problem statement, evidence excerpt, source URL, item type, language, answer count/review note, evidence type, and confidence. Stack Overflow adds `tags`, `question_id`, `author_profile_url`, `question_score`, `answer_count`, `is_answered`, `content_license`, and `question_body_excerpt`.

`record_id` is based on the Stack Overflow question ID (`SO-<question_id>`), so it remains stable across refreshes. Dates are UTC. Problem statements retain the question’s concise issue phrasing; evidence excerpts are short extracts from its body. No answers or solutions are copied into the dataset. Confidence reflects how directly the question text states a concrete failure, not whether the report was independently verified.
