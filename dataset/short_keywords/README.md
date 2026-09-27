# Short keyword index

This folder converts every problem record from X, Reddit, and Stack Overflow into
**2–6 short keyword tags** — one row per source record, no prose.

Use it to scan and filter problems quickly without reading long sentences.

## Files

| File | Description |
|---|---|
| `short_keywords.csv` | One row per source record; each row has 2–6 pipe-separated keyword tags |
| `build_short_keywords.py` | Deterministic builder — run it to regenerate `short_keywords.csv` |

## Output format (`short_keywords.csv`)

The file has **33 columns** and **313 rows** (one per source record).
All original columns from each platform source are kept; three generated columns are appended at the end.

### Generated columns (always present)

| Column | Example |
|---|---|
| `short_tags` | `refactoring \| loss in functionality \| unsafe refactoring across files` |
| `short_tag_count` | `3` |
| `short_tag_source_url` | original post / question URL |

Each entry in `short_tags` is a 1–6 word phrase separated by ` | `.

### Original columns (always present)

`record_id`, `platform`, `post_date`, `author_name`, `author_handle`, `person_profile_as_stated`, `prominence_basis`, `problem_category`, `affected_area`, `problem_statement`, `evidence_excerpt`, `post_url`, `post_type`, `language`, `reply_count_visible`, `reply_review_notes`, `evidence_type`, `confidence`

### Platform-specific columns (blank for other platforms)

| Column | Platform |
|---|---|
| `subreddit`, `source_item_type`, `source_item_permalink`, `source_score` | Reddit only |
| `tags`, `question_id`, `author_profile_url`, `question_score`, `answer_count`, `is_answered`, `content_license`, `question_body_excerpt` | Stack Overflow only |

## How tags are generated

The builder pulls from the cleanest, shortest fields first — no prose sentences,
no hallucinated phrases, no inference beyond what the source field contains:

1. **Stack Overflow tags** (`tags` column) — most precise technical terms; used verbatim after hyphen → space normalization.
2. **Affected-area tokens** (`affected_area` column) — comma/slash-separated terms; trimmed to 4 meaningful words if longer than 6.
3. **Evidence excerpt** (`evidence_excerpt` column) — the author's own short phrase; kept only if 2–5 words and not an artefact (numbers, URLs, vague sentiment).
4. **Category noun phrase** (`problem_category` column) — stop words removed, kept to 4 content words.

At most 6 tags are emitted per row.

## Counts

| Platform | Records |
|---|---|
| Reddit | 138 |
| Stack Overflow | 140 |
| X | 35 |
| **Total** | **313** |

## Rebuild

```sh
python3 data/short_keywords/build_short_keywords.py
```

## Relation to other indexes

- **`data/problem_keywords/`** — a semantically deduplicated keyword index with
  source traceability, merge annotations, and full evidence excerpts. Use that
  when you need to know *why* two records describe the same complaint, trace a
  keyword back to an original URL, or check license metadata.
- **`data/short_keywords/`** (this folder) — a flat, one-row-per-source-record
  tag list. Use this when you want to scan all 313 problems quickly, filter by
  topic or platform, or build a search UI without reading prose.

The original platform CSVs (`data/x/`, `data/reddit/`, `data/stackoverflow/`)
are not modified by either builder.
