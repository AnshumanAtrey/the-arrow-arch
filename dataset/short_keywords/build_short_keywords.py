#!/usr/bin/env python3
"""
Convert problem records from X, Reddit, and Stack Overflow into a flat index of
short keyword tags (2–6 words each). One row per source record; one output CSV.

Output: data/short_keywords/short_keywords.csv
"""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT  = Path(__file__).resolve().parent

INPUTS = [
    ROOT / 'data/x/problems.csv',
    ROOT / 'data/reddit/problems.csv',
    ROOT / 'data/stackoverflow/problems.csv',
]

# --------------------------------------------------------------------------- #
# Word-level filters
# --------------------------------------------------------------------------- #
STOP = set(
    'a an and are as at be been being by can could did do does doing done '
    'for from had has have he her here hers him his how i if in into is it '
    'its may me might more most my of on or our ours she should so than that '
    'the their theirs them then there these they this those to too under up us '
    'was we were what when where which who why will with would you your yours '
    'also just now one long while after before then each other same new old '
    'even very only already instead every'.split()
)

# Generic catch-all words that are too broad to be useful keyword tags alone
GENERIC = set(
    'ai llm model assistant agent tool code coding developer developers '
    'problem problems issue issues error errors question questions system '
    'app application software using use used make made get getting work '
    'works working fix fixing solve solution solutions help want need try '
    'tried data platform building building'.split()
)

# Excerpt fragments that are artefacts: numbers, URLs, vague sentiments, bare adjectives
_ARTEFACT = re.compile(
    r'^(\d[\d\s\w]*$'           # starts with a digit (counts, versions by themselves)
    r'|https?://\S+'             # URLs
    r'|live\s+demo.*'            # "live demo …"
    r'|\.\.\.'                   # trailing ellipsis fragments
    r'|.*\.com.*'                # contains a domain
    r'|is\s+(not|very|really|quite|still|already)\s+.*'  # vague sentiment openers
    r'|beautiful\s.*'            # "beautiful architecture …"
    r'|comprehensive\s.*'        # "comprehensive intelligence …"
    r'|zero\s+actual\s+sales.*'  # very specific one-off observation
    r')$',
    re.I | re.DOTALL
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _tok(s: str) -> str:
    """Lowercase, strip non-alphanumeric (keep spaces and dots), collapse spaces."""
    s = s.strip().lower()
    s = re.sub(r'[^a-z0-9 ._]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def _has_substance(phrase: str, min_meaningful: int = 1, max_words: int = 6) -> bool:
    """True if the phrase has at least min_meaningful non-stop/non-generic words."""
    words = phrase.split()
    if not words or len(words) > max_words:
        return False
    meaningful = [
        w for w in words
        if w not in STOP and w not in GENERIC and len(w) >= 2
    ]
    return len(meaningful) >= min_meaningful and len(phrase) >= 3


def _append(result: list, phrase: str, seen: set, max_len: int = 6) -> bool:
    """Append phrase to result if it passes quality and uniqueness checks."""
    p = phrase.strip()
    if not p or p in seen:
        return False
    if _ARTEFACT.match(p):
        return False
    if not _has_substance(p):
        return False
    if len(result) >= max_len:
        return False
    seen.add(p)
    result.append(p)
    return True


def _split_area(raw: str) -> list[str]:
    """Split affected_area / tags into individual clean phrases."""
    parts = []
    for chunk in re.split(r'[;,|]', raw):
        # Slash means alternatives — split those too
        for sub in re.split(r'\s*/\s*', chunk):
            p = _tok(sub.replace('-', ' '))
            if p:
                parts.append(p)
    return parts


# --------------------------------------------------------------------------- #
# Core tag extractor
# --------------------------------------------------------------------------- #
def make_tags(row: dict) -> list[str]:
    """
    Return 2–6 short keyword phrases for one source row.

    Priority order:
      1. Stack Overflow semicolon tags  (precise technical terms)
      2. Affected-area / area field tokens (1-4 word tech terms)
      3. Evidence excerpt chunks         (author's own short description)
      4. Problem-category noun phrase    (category label stripped of stop words)
    """
    seen: set  = set()
    result: list = []

    # ── 1. SO tags ───────────────────────────────────────────────────────── #
    for raw_tag in row.get('tags', '').split(';'):
        tag = _tok(raw_tag.replace('-', ' '))
        _append(result, tag, seen)
        if len(result) >= 6:
            return result

    # ── 2. Affected area ─────────────────────────────────────────────────── #
    for phrase in _split_area(row.get('affected_area', '')):
        if not _has_substance(phrase):
            # Phrase is too long — trim to first 4 meaningful content words
            words = phrase.split()
            short = [w for w in words if w not in STOP and len(w) >= 2][:4]
            if short:
                phrase = ' '.join(short)
        _append(result, phrase, seen)
        if len(result) >= 6:
            return result

    # ── 3. Evidence excerpt ───────────────────────────────────────────────── #
    raw_exc = _tok(row.get('evidence_excerpt', ''))
    for part in re.split(r'[.;]', raw_exc):
        part = part.strip()
        words = part.split()
        # Keep only short, non-artefact, meaningful snippets
        if 2 <= len(words) <= 5 and not _ARTEFACT.match(part):
            # Require at least one word that isn't a stop/generic word
            if _has_substance(part, min_meaningful=1):
                _append(result, part, seen)

    # ── 4. Problem category ───────────────────────────────────────────────── #
    cat = _tok(row.get('problem_category', ''))
    # Pre-normalize: known verbose phrase → shorter equivalent
    cat = re.sub(r'build,?\s*runtime,?\s*and\s+environment\s+failures?', 'build runtime environment', cat)
    cat_words = [
        w for w in cat.split()
        if w not in STOP and w not in GENERIC and len(w) >= 3
    ]
    if cat_words:
        # Emit as a single phrase (max 4 words) rather than individual tokens
        phrase = ' '.join(cat_words[:4])
        _append(result, phrase, seen)

    # Fallback: if still empty, just use the raw category truncated
    if not result:
        result.append(_tok(row.get('problem_category', row.get('problem_statement', 'unknown')))[:50])

    return result[:6]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
# Columns that appear in the output (in order). All original source columns are
# preserved; the three new columns are appended at the end.
_ADDED_COLS = ['short_tags', 'short_tag_count', 'short_tag_source_url']

# Canonical column order: common columns first, then platform-specific ones,
# then the generated tag columns.
_COMMON_COLS = [
    'record_id', 'platform', 'post_date', 'author_name', 'author_handle',
    'person_profile_as_stated', 'prominence_basis', 'problem_category',
    'affected_area', 'problem_statement', 'evidence_excerpt', 'post_url',
    'post_type', 'language', 'reply_count_visible', 'reply_review_notes',
    'evidence_type', 'confidence',
]
_PLATFORM_EXTRA = {
    'reddit':         ['subreddit', 'source_item_type', 'source_item_permalink', 'source_score'],
    'stackoverflow':  ['tags', 'question_id', 'author_profile_url', 'question_score',
                       'answer_count', 'is_answered', 'content_license', 'question_body_excerpt'],
    'x':              [],
}


def _all_fieldnames(rows: list[dict]) -> list[str]:
    """Return a stable, deduplicated column order across all rows."""
    seen: set = set()
    result: list = []
    for col in _COMMON_COLS:
        if col not in seen:
            seen.add(col)
            result.append(col)
    # Add any platform-specific extras that actually appear in the data
    for extras in _PLATFORM_EXTRA.values():
        for col in extras:
            if col not in seen:
                seen.add(col)
                result.append(col)
    # Catch any remaining columns from the source files not listed above
    for row in rows:
        for col in row:
            if col not in seen:
                seen.add(col)
                result.append(col)
    # Always put the generated columns last
    for col in _ADDED_COLS:
        if col not in seen:
            seen.add(col)
            result.append(col)
    return result


def main():
    OUT.mkdir(exist_ok=True)

    all_rows: list[dict] = []
    platform_counts: dict[str, int] = {}

    for path in INPUTS:
        with path.open(newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                platform = (row.get('platform') or path.parent.name).strip()
                record_id = (row.get('record_id') or '').strip()
                if not record_id:
                    qid = row.get('question_id', '').strip()
                    if qid:
                        record_id = f'SO-{qid}'
                if not record_id:
                    continue

                tags = make_tags(row)

                # Keep every original field, then append the generated columns
                out_row = dict(row)
                out_row['record_id']          = record_id   # normalised SO id
                out_row['short_tags']         = ' | '.join(tags)
                out_row['short_tag_count']    = str(len(tags))
                out_row['short_tag_source_url'] = (row.get('post_url') or '').strip()
                all_rows.append(out_row)
                platform_counts[platform] = platform_counts.get(platform, 0) + 1

    # Sort deterministically: platform alphabetically, then record_id
    all_rows.sort(key=lambda r: (r['platform'].lower(), r['record_id']))

    fieldnames = _all_fieldnames(all_rows)

    out_path = OUT / 'short_keywords.csv'
    with out_path.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore',
                           lineterminator='\n')
        w.writeheader()
        w.writerows(all_rows)

    total = len(all_rows)
    print(f'Wrote {total} rows × {len(fieldnames)} columns to {out_path}')
    for platform, count in sorted(platform_counts.items()):
        print(f'  {platform}: {count}')


if __name__ == '__main__':
    main()
