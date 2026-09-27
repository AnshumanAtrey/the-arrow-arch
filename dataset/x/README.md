# X problem dataset

`problems.csv` contains **35 distinct problem records** from **16 distinct X posts by 15 distinct authors**, collected on **2026-09-26**. The rows describe concrete developer, AI-agent, security, and business-operation failures or bottlenecks. Multi-issue posts have multiple rows only when they describe separate failure modes; repeated labels for the same complaint were collapsed. There are **0 reply-derived problem records**: the indexed X results exposed reply counts for many posts, but did not provide reply text that supported a distinct, attributable problem.

## Sources reviewed

The original X posts and the indexed thread/article text were reviewed for these source posts:

- [Elvis (@elvissun)](https://x.com/elvissun/status/2025044631407468689)
- [Kaxil Naik (@kaxil)](https://x.com/kaxil/status/2037503513350005134)
- [Bobby Hansen Jr. (@bobbyhansenjr)](https://x.com/bobbyhansenjr/status/2023246258438095287)
- [Mohamed ElSeidy (@0xmelseidy)](https://x.com/0xmelseidy/status/1943322572046684669)
- [Eric Weinstein complaint quoted on X](https://x.com/anecdotal/status/2036015085802434860)
- [Matthew Cassinelli (@mattcassinelli)](https://x.com/mattcassinelli/status/2039865090988806215)
- [Andrej Karpathy (@karpathy)](https://x.com/karpathy/status/2024987174077432126)
- [Aaron Levie (@levie)](https://x.com/levie/status/2038468564500537416)
- [Antonio Viggiano (@agfviggiano)](https://x.com/agfviggiano/status/1953059853921824952)
- [AdiiX (@adiix_official)](https://x.com/adiix_official/status/2034730013283512381)
- [Ross Wightman (@wightmanr)](https://x.com/wightmanr/status/2040115036400820308)
- [Jason Lemkin thread post: database deletion](https://x.com/jasonlk/status/1946065483653910889)
- [Jason Lemkin thread post: false test report](https://x.com/jasonlk/status/1946070323285385688)
- [Micah Berkley (@MicahBerkley)](https://x.com/MicahBerkley/status/2021052252710998172)
- [Dickie Bush (@dickiebush)](https://x.com/dickiebush/status/2038597020269568422)
- [Povilas Korop (@PovilasKorop)](https://x.com/PovilasKorop/status/2030975143816618201)

The source audit collapsed Elvis’s review-overload complaint into the same review bottleneck described by Kaxil, and merged Antonio Viggiano’s “60+ invalid findings” example into the broader false-positive problem. It removed an unattributed account of leaked tokens and a news account’s report that lacked a direct first-person source. Kaxil’s separate documentation corruption example is retained as an observed defect, explicitly without attributing its cause to an AI agent. Jason Lemkin’s unauthorized database deletion and false unit-test report remain separate because they describe different failure modes in the same thread.

## Access and evidence limits

Direct X post pages returned 403 or required a login during collection. Source text and reply counts were therefore checked through indexed X copies and search results. This is not a complete scrape of X. Reply counts are the counts exposed by those results; they can change and may omit hidden or ranked-out replies. Reply bodies were not treated as reviewed when they were unavailable. A quoted mitigation or an indexed mention without enough reply text and identity was not turned into a problem record. The CSV notes reply access per source row.

The collection used ordinary-language searches (for example, agents forgetting, making up prospects, repeating posts, deleting data, and getting stuck) alongside technical terms (such as context compaction, false positives, image-token injection, API quota failures, and test coverage). Product pitches, generic opinions, unsupported anecdotes, and unverified news reports were excluded. Observations and benchmark findings are labeled separately from first-person incidents, and confidence reflects the evidence type rather than the author’s prominence.

## Columns

The CSV retains its 18-column schema: `record_id`, `platform`, `post_date`, `author_name`, `author_handle`, `person_profile_as_stated`, `prominence_basis`, `problem_category`, `affected_area`, `problem_statement`, `evidence_excerpt`, `post_url`, `post_type`, `language`, `reply_count_visible`, `reply_review_notes`, `evidence_type`, and `confidence`.

- `record_id` is stable; removed duplicate or unsupported records leave gaps rather than renumbering existing IDs.
- `post_date` is the UTC calendar date derived from the X post ID where available; X may display a different local date.
- `person_profile_as_stated` and `prominence_basis` use stated/profile context and relevant experience; follower counts are not used to infer job or expertise.
- `post_type` is `post`, `thread`, `quote`, or `reply`.
- `evidence_type` separates first-person incidents from professional observations, reports, and benchmarks. Each row remains an author-reported claim, not independently verified proof that an event occurred.
- `reply_count_visible` records the count exposed during collection or says `not exposed`; it does not imply the reply text was available.

Before using this dataset for training or public claims, revisit the original posts, verify the reported events and author context, and expand reply review when X access permits.
