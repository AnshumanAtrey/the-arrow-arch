# Given — verbatim materials from the lablab.ai IBM Bob 2.0 Hackathon page

Everything here is what the host (IBM), the platform (lablab.ai / NativelyAI) and the team dashboard published directly. No interpretation, no commentary. Source: crawl on **2026-09-17**.

## Files

| File | Source | What's in it |
|---|---|---|
| `01-overview.md` | https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon | Hero copy, snapshot table, the page's own section list, the platform event record (ids, timestamps, limits, flags), the Schema.org `Event` block, page meta tags |
| `02-about-the-technology.md` | …#About | "Back for Another Hack — Meet IBM Bob 2.0" — full repository context, what Bob 2.0 is |
| `03-challenge.md` | …#Challenge | The brief; the 6 named workflows; the 4 named Bob 2.0 features |
| `04-technology-and-access.md` | …#Technology | What IBM Bob 2.0 is; access granted at start of hackathon; **⏳ Access details TBA** |
| `05-prizes.md` | …#Prizes | $10,000 pool — $5,000 / $3,000 / $2,000 — plus the full "Please note" terms paragraph |
| `06-community-and-social-channels.md` | …#Community & Social Channels | Every social/website URL for lablab.ai, NativelyAI and IBM; Discord; Twitch |
| `07-what-to-submit.md` | …#What to submit? | All submission fields + the two **Important Requirements** (Bob-assisted code/files, Bob task session summary screenshots) |
| `08-judging-criteria.md` | …#Judging Criteria | The 4 criteria with verbatim descriptions |
| `09-hackathon-details.md` | …#Hackathon Details | Where/when, who can join, teams, how to participate, get prepared, the closing note |
| `10-speakers-mentors-judges.md` | …#Speakers | Pawel Czech (CEO, NativelyAI), Andrea Marazzi (Founder & CCO, NativelyAI) |
| `11-event-schedule.md` | …#Event Schedule | All 7 schedule items in IST as displayed, plus the raw GMT+0400 timestamps as stored |
| `12-teams.md` | …#Teams | The 4 teams served on the page — description, slug, join mode, members |
| `13-our-team.md` | lablab.ai team dashboard | Our 4 team members, Discord/submission state, the 9-step Team Progress Checklist |
| `ibm-bob-2-hackathon-raw-2026-09-17.html` | — | Raw saved HTML of the event page, for re-verification |

## Key dates

| Date | What |
|---|---|
| **Fri, Sep 25 2026 — 8:30 PM IST** | Hackathon Kick-off (register before the Kick-Off Stream to start building with Bob) |
| Sep 25–27, 2026 | 48-hour build window, online only |
| **Sun, Sep 27 2026 — 8:30 PM IST** | End of Submissions |

## Links referenced on the page (not extracted — upstream platform/policy pages)

- https://lablab.ai/guide — Hackathon Guidelines
- https://lablab.ai/getting-started-guide — Getting Started Guide
- https://lablab.ai/ai-articles/hackathon-guidelines — Submission Guidelines
- https://lablab.ai/terms-of-use#16-participation-terms — Voluntary Participation and Prize Terms
- https://lablab.ai/tech — lablab.ai AI Tech pages
- https://lablab.ai/t — lablab.ai tutorials
- https://discord.gg/lablabai — lablab.ai Discord server
- https://bob.ibm.com/ — IBM Bob

## Unpublished / TBA as of 2026-09-17

- **Access to IBM Bob 2.0** — "⏳ Access details TBA"; participants receive access at the start of the hackathon.
- **IBM-side speakers / mentors / judges** — none named; the event record's `eventRoles` and `externalRolePersons` are empty.
- **Sponsors, prize records, venues, technology list** — all empty on the event record (`sponsors`, `eventPrizes`, `eventVenues`, `techs`, `technologyList` = `[]`); prizes exist only as page copy.
- **Event `status`** is `DRAFT` on the platform record, while `active` and `signupActive` are `true`.

## How this was fetched

```
The event page is Next.js + Builder.io and renders client-side, so a plain fetch returns only
the shell. Content was taken from the page's own RSC flight payload (self.__next_f), which
carries the section HTML, the event record, the Timeline component, the speaker symbols and
the teams array verbatim. Every figure was cross-checked against the rendered page copy.
Team dashboard content is as captured by the user on 2026-09-17.
```
