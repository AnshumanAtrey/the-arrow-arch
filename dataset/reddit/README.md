# Reddit problem dataset

`problems.csv` contains 138 curated problem records linked to 24 Reddit threads, collected on 2026-09-26. It covers AI coding workflows, coding agents, agent development and operations, persistent memory, and business/customer-support operations. `sources.csv` is the de-duplicated thread index. `build_dataset.py` reproduces the curated CSV from the reviewed source notes embedded in the script; it is a dataset builder, not an automated Reddit API scraper.

## Schema

The first 18 columns follow `data/x/problems.csv` in the same order. Reddit adds `subreddit`, `source_item_type`, `source_item_permalink`, and `source_score` for source tracking. There is no solution field. Records describe reported problems, not fixes.

A thread may support multiple rows only when the source describes distinct failure modes or costs. The dataset aims to preserve specific outcomes (for example, a skipped tool call, a silent missing-key failure, or a context-loss incident) rather than repeat the same generic complaint under several labels. IDs are stable within this snapshot (`R-0001` onward).

## Collection and limits

This is a curated search-index collection, not a complete Reddit scrape. Reddit's public JSON endpoint returned HTTP 403 from this environment. Search-indexed Reddit pages exposed the post text and, for some threads, excerpts from replies; direct author names, comment permalinks, and complete comment trees were not consistently exposed. The CSV marks those limits. A thread URL is supplied where a comment-specific URL was not available, and no unavailable reply is represented as fully reviewed.

Post dates reflect the calendar date shown in the indexed Reddit result. Profile and prominence fields use only information stated in a post or indexed snippet; no external identity verification or follower/popularity ranking was performed. The dataset is English-language and focuses on concrete developer, AI-agent, and business-operation pain, including common-language descriptions as well as technical terminology.

Confidence indicates how directly the indexed source text supports the problem statement. It does not independently verify that the event occurred. Many reports are self-reported anecdotes, and a handful of threads include discussions or benchmark claims rather than a confirmed production incident. Revisit the original thread and its full comments before using these records for training or public claims.
