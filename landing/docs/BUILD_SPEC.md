# THE ARROW ARCH — Landing Page Build Spec

> **Use this as the single source of truth for the landing page.**  
> The page must feel like the Arrow Arch pitch deck: white space, bold charcoal typography, bright orange energy, thin technical lines, soft 3D objects, and almost no visual noise.

---

## 0. What we are building

Build a **sleek, non-traditional product landing page** for **The Arrow Arch**.

The product idea:

> One plain-language request goes in.  
> A bounded AI crew understands, plans, builds, verifies and lands a reviewable code branch.  
> **Aim once. Land once.**

The landing page should explain the product in **6 sections**, without looking like a normal SaaS template.

### Do not make this look like

- a generic "hero + three cards + testimonials + pricing" template
- a startup dashboard
- an AI neon-purple website
- a page made from dozens of identical rounded cards
- a technical documentation page
- a cyberpunk / hacker terminal
- a wall of jargon

### It should feel like

- an editorial product story
- an engineering system visualized simply
- a premium launch page
- the same world as the Arrow Arch slides
- precise, quiet, sharp, confident

---

# 1. GLOBAL DESIGN SYSTEM

## Colors

```css
:root {
  --arrow-orange: #FF5A00;
  --arrow-orange-2: #FF7A2F;
  --ink: #121820;
  --muted: #68717F;
  --line: #DADDE2;
  --soft: #F5F6F7;
  --paper: #FFFFFF;
  --glow: rgba(255, 90, 0, 0.18);
}
```

Use orange sparingly. Orange should represent:

- direction
- active flow
- accepted/proven state
- the Arrow trajectory
- selected information

Everything else should remain white, charcoal, or light gray.

## Typography

Preferred:

- **Inter**
- **Satoshi**
- **Geist** as fallback

Headlines:

- 700–800 weight
- tight tracking
- large editorial scale
- black text with only the important phrase in orange

Example:

> **One prompt in.**  
> **Verified code out.**

Body:

- 17–20px desktop
- 15–17px mobile
- maximum readable width: 620–700px

## Shapes

Use:

- circles
- thin paths
- small technical markers
- floating labels
- transparent planes
- subtle 3D objects

Avoid repeating rectangular cards everywhere.

Rounded panels are allowed only when they make information easier to scan.

## Grid / background

Use a near-invisible technical grid in selected areas:

```css
background-image:
  linear-gradient(rgba(18,24,32,.035) 1px, transparent 1px),
  linear-gradient(90deg, rgba(18,24,32,.035) 1px, transparent 1px);
background-size: 64px 64px;
```

Fade the grid with a mask so it never covers the whole page.

---

# 2. MOTION SYSTEM — USE ONLY GSAP

Use **GSAP 3 + ScrollTrigger** across the entire landing page.

Do **not** install Framer Motion, Motion One, or another animation library.

```bash
pnpm add gsap
```

Register:

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
```

## Motion rules

The page should feel alive, not animated for decoration.

Use:

- 0.6–1.1 second transitions
- `power3.out`
- 24–60px movement
- opacity + mask/clip reveals
- SVG path drawing
- subtle 1–3 degree object drift
- orange glow pulses only for important states

Never:

- bounce everything
- spin icons constantly
- use particle explosions
- parallax every object
- autoplay huge 3D scenes

### Reduced motion

Always respect:

```css
@media (prefers-reduced-motion: reduce) {
  /* disable timeline motion and show final states immediately */
}
```

---

# 3. ASSET RULES

Use the files in `/assets`.

## Core assets

| File | Use |
|---|---|
| `assets/arrow-mark.svg` | Header, footer, small brand lockup |
| `assets/icons-sprite.svg` | Preferred single-file icon source |
| `assets/icons/*.svg` | Individual icon files when convenient |
| `assets/illustrations/hero-trajectory.png` | Hero visual only |
| `assets/illustrations/onboarding-memory.png` | Onboarding section visual |
| `assets/references/design-system-board-light.png` | Visual reference, not production UI |
| `assets/references/section-system-board.png` | Visual reference, not production UI |

### Using the sprite

```html
<svg class="icon">
  <use href="/assets/icons-sprite.svg#icon-verifier" />
</svg>
```

---

# 4. HEADER — NOT A FULL SECTION

Keep it tiny.

Left:

- Arrow mark
- `THE ARROW ARCH`

Right:

- `Why Arrow`
- `How it works`
- `Onboarding`
- `Demo`

Final button:

- **Open Demo →**

No giant navigation bar.

On scroll:

- background becomes `rgba(255,255,255,.86)`
- 12px blur
- very thin bottom line

---

# 5. SECTION 01 — HERO

## Copy

Small eyebrow:

**VERIFIED MULTI-AGENT DELIVERY**

Headline:

# Aim once.
# **Land once.**

Subline:

**One clear request in. A bounded AI crew plans, builds and proves the change before it lands.**

Support line:

`Powered by IBM Bob Shell for the model roles.`

CTAs:

- **Open Demo →**
- `See how it works`

Do not use "AI-powered development platform" language.

## Layout

Do not center everything.

Use a strong **55/45 editorial split**.

### Left

- eyebrow
- huge headline
- 2-line explanation
- CTA row
- tiny proof chips under CTA:
  - `Isolated workers`
  - `Independent checks`
  - `Reviewable branch`

### Right

Use:

`assets/illustrations/hero-trajectory.png`

Crop the illustration so the trajectory clearly reads left → right and the target sits toward the far right.

The right visual should slightly overflow the viewport.

## GSAP

On load:

1. headline reveals upward using a masked clip
2. orange trajectory draws left → right
3. final target glows once
4. CTA appears last

No looping animation.

## AI coding prompt

> Build an asymmetric full-viewport hero for The Arrow Arch using the supplied `hero-trajectory.png`. Use the existing Arrow design system: white paper background, charcoal typography, bright orange only for direction and emphasis, subtle technical grid, no generic SaaS gradient. Headline: “Aim once. Land once.” Subline: “One clear request in. A bounded AI crew plans, builds and proves the change before it lands.” Add Open Demo and See how it works CTAs. Use GSAP for a one-time masked headline reveal and a left-to-right trajectory reveal. Keep the section premium, sparse, editorial, and highly legible.

---

# 6. SECTION 02 — WHY ARROW EXISTS

## Goal

Show that Arrow was designed from **real failure reports**, not invented product marketing.

Do not display dataset counts.

## Source language

The underlying Arrow dataset contains problem reports from:

- **X**
- **Reddit**
- **Stack Overflow**

The X dataset includes first-hand accounts from people described in source context as:

- founders / operators
- senior engineering leaders
- startup founders
- technical practitioners
- AI builders
- developer educators

Do not make unsupported claims about people.

## Exact real problem themes to show

Use these, because they map directly to the project dataset:

1. **Context overload**
   - Large files/projects exceed what an agent can reliably hold.

2. **Memory disappears**
   - Long sessions drop decisions and people have to re-explain work.

3. **Invented code / wrong APIs**
   - Agents use symbols or library behavior that does not match the installed version.

4. **Fake “done”**
   - The agent reports success while checks fail, do nothing, or were never run.

5. **Repair loops**
   - One fix creates another regression and retries stop converging.

6. **Collateral damage**
   - Working code gets rewritten or unrelated behavior breaks.

7. **Drift from company conventions**
   - Wrong folder, wrong naming, unnecessary dependencies, overengineering.

8. **Parallel collisions**
   - Multiple agents duplicate work or touch the same files and ports.

9. **Wrong thing built**
   - Code runs, but does not match the actual request.

10. **Environment/setup failure**
   - Toolchains, credentials or dependency setup fail before useful work begins.

11. **Review overload**
   - Humans still have to inspect too much generated work before trusting it.

12. **Agent orchestration failure**
   - Agents skip tool calls, use the wrong arguments, repeat actions, or fail silently.

## Layout

This section must **not** be a row of cards.

Create a **research field / signal map**.

### Left edge

Three large source marks arranged vertically but offset:

- X
- Reddit
- Stack Overflow

Use:

- `icon-x_source`
- `icon-reddit_source`
- `icon-stackoverflow_source`

Between them, place small labels such as:

- `Founder / operator`
- `Engineering leader`
- `Developer`
- `Technical practitioner`

### Center

A glowing Arrow mark / memory point.

Around it use thin flowing orange/gray paths.

Small quote fragments drift toward the center:

- `"It forgot the earlier decision."`
- `"Two agents changed the same thing."`
- `"It said done. The test still failed."`
- `"The fix broke another part."`
- `"It ignored our project structure."`

### Right

Do not use boxes.

Place 5–6 **large problem phrases** in a loose vertical constellation:

- **Context disappears**
- **Workers collide**
- **“Done” is not proof**
- **Project conventions drift**
- **Fixes create collateral damage**
- **Humans still babysit the output**

Smaller text can explain each in one line.

At the bottom:

> **Real complaints → repeatable rules → safer execution**

## GSAP

As the section enters:

- source nodes fade in at different Y positions
- paths draw toward the center
- problem phrases reveal on the right one at a time

Scroll progression should visually show raw reports becoming product rules.

## AI coding prompt

> Create a research-signal section for The Arrow Arch. Do not use a card grid. Use X, Reddit and Stack Overflow source icons on the left with role labels such as founder/operator, engineering leader, developer and technical practitioner. Flow short real-problem fragments through thin orange paths into a glowing Arrow memory point at center. On the right, reveal the problems Arrow is designed around: context disappears, parallel workers collide, “done” is not proof, project conventions drift, fixes create collateral damage, and humans still babysit generated work. Keep the white/orange/charcoal Arrow design system. Use GSAP ScrollTrigger so the data paths draw as the user scrolls.

---

# 7. SECTION 03 — ONE CREW BEHIND ONE PROMPT

Headline:

# One prompt.
# **A whole engineering crew behind it.**

Subline:

**Each role exists to stop a different type of mistake.**

## Roles

Use these exact roles:

### PM

Icon: `icon-pm`

**Understands the ask.**

Turns the plain-language request into clear acceptance criteria.

---

### Architect

Icon: `icon-architect`

**Chooses the way.**

Decides the right structure, file scope, dependency order and proof commands before coding starts.

---

### Workers

Icon: `icon-workers`

**Build small pieces.**

Each worker receives one bounded packet and its own isolated Git worktree.

---

### Orchestrator

Icon: `icon-orchestrator`

**Keeps control.**

Owns state, order, processes, file ownership, retries and the ledger.

---

### Verifier

Icon: `icon-verifier`

**Proves the result.**

Re-reads the actual diff and independently re-runs the required checks.

## Layout

Do not create five equal cards.

Make this a **single continuous orange trajectory** crossing the viewport.

Each role should appear as a circular node attached to the trajectory.

Alternate labels:

- node 1 text above line
- node 2 text below line
- node 3 above
- etc.

The orange arrow itself should move through:

**PM → Architect → Workers → Orchestrator → Verifier**

Final object:

A clean local Git branch / check state.

Label:

**Reviewable branch + proof trail**

## GSAP

Use one ScrollTrigger timeline:

- draw path
- activate one node at a time
- current node gets orange glow
- previous nodes remain solid
- final verifier tick draws

No horizontal scrolling.

## AI coding prompt

> Build a full-width process scene called “One prompt. A whole engineering crew behind it.” Do not use five cards. Draw one continuous orange Arrow trajectory across the page, with five circular role nodes attached to it: PM, Architect, Workers, Orchestrator, Verifier. Alternate role descriptions above and below the trajectory. Use the supplied SVG icons. PM understands the ask; Architect chooses the structure; Workers build bounded pieces in isolated worktrees; Orchestrator owns state and order; Verifier independently proves the result. Animate the line and role activation with one GSAP ScrollTrigger timeline.

---

# 8. SECTION 04 — ONBOARD ONCE

## Core message

Headline:

# Onboard once.
# **Run with your rules every time.**

Body:

**Arrow does not force every company into one coding style. It learns the repository, your rules and the way your team works — then keeps that project context available for future tasks.**

## What a company gives Arrow

Use small free-floating labels, not cards:

- Repository
- Company/team rules
- Folder structure
- Commands
- Tech stack + versions
- Coding conventions
- Approval rules
- Existing workflows

## What Arrow remembers

- Repo profile
- Commands and versions
- Allowed structure
- Team conventions
- Rules that are fixed
- Rules the team intentionally overrides

## Developer onboarding angle

Add a separate callout:

### New developer joins?

**The same project memory that guides the agents can explain the repo to a human too.**

Small bullets:

- where things live
- how the project is run
- which commands matter
- what the team considers safe
- which conventions are deliberate

## Visual

Use:

`assets/illustrations/onboarding-memory.png`

Do not use it as a full background.

Place it right-of-center.

Inputs should visually enter from left.

Stored project memory exits toward:

- future Arrow tasks
- new developer

## Copy line

> **Teach the system once. Stop re-explaining the project forever.**

## GSAP

Scroll interaction:

1. labels enter toward the vault
2. vault pulses
3. two paths leave:
   - `Future tasks`
   - `New developer`

## AI coding prompt

> Build an onboarding section titled “Onboard once. Run with your rules every time.” Use `onboarding-memory.png` as the main visual. Surround it with floating labels for repository, team rules, folder structure, commands, tech stack, coding conventions and approvals. Visually show these becoming durable project memory, then splitting into two outputs: “Future Arrow tasks” and “New developer onboarding.” Explain that Arrow adapts to an existing company structure instead of replacing it. Use GSAP to animate inputs entering the memory vault and two output paths leaving it.

---

# 9. SECTION 05 — TRUST THE LANDING

## Headline

# Workers can say “done.”
# **Arrow still checks.**

Body:

**The model's summary is never the final verdict. The control plane reads the actual diff and re-runs the proof.**

## Four proof ideas

These should be displayed as a **large central diff/proof canvas**, with the ideas attached around it.

### Isolated work

Icon: `icon-worktree`

Each worker edits its own Git worktree.

### File scope

Icon: `icon-project_structure`

Changed files must stay inside the packet's allowed scope.

### Live ledger

Icon: `icon-git_branch`

The system tracks workers, worktrees, processes, ports and ownership.

### Independent proof

Icon: `icon-shield` or `icon-verifier`

Arrow re-runs the required commands itself before the packet can land.

## Secondary use-case ribbon

Under the proof scene, create a minimal row:

- Web apps — `icon-code`
- Mobile — `icon-mobile`
- Backend/internal systems — `icon-server`
- Game development — `icon-game`
- Any codebase — `icon-architect`

Text:

> **Small fix or large feature. Same control system.**

Do not claim support for a domain merely because of the icon. Phrase this as the system being repository/rule driven rather than framework-specific.

## GSAP

The proof scene should behave like:

1. worker result arrives
2. diff appears
3. scope line lights up
4. verification checks run
5. result changes from gray to orange checked state

## AI coding prompt

> Create a proof-focused section titled “Workers can say done. Arrow still checks.” Center the design around a large diff/proof canvas instead of a card grid. Connect four ideas around it: isolated Git worktrees, file-scope enforcement, live ledger, independent verification. Animate a worker result arriving, the actual diff being inspected, scope validation running, then proof commands completing before the state turns orange/verified. Add a restrained bottom ribbon showing web apps, mobile, backend/internal systems, game development and any codebase. Keep it framework-agnostic and grounded in repository rules.

---

# 10. SECTION 06 — FAQ + CLOSING

Do not build a generic huge FAQ list.

Use only 4 questions.

## Questions

### Does Arrow replace developers?

No. Arrow handles bounded implementation work and proof. Humans still own product decisions, critical rule conflicts and review of what lands.

### Does it change how our company structures code?

No. Onboarding exists specifically so Arrow can learn your existing repository rules and team conventions.

### What happens when a worker fails?

Arrow makes bounded recovery attempts. The current design is intentionally finite: retry, re-plan, then escalate rather than looping forever.

### Does Arrow push code automatically?

The current product produces a local reviewable task branch. It does not automatically push production changes.

## FAQ interaction

Use an editorial two-column layout:

Left:

Huge copy:

# Questions are cheap.
# **Unproven code is expensive.**

Right:

Four FAQ rows.

No enclosing FAQ card.

Use thin separators.

GSAP:

- animate height
- rotate tiny plus icon
- fade body text
- only one answer open at a time

## Closing visual

Immediately after the FAQ:

Large white section with:

# Aim once.
# **Land once.**

Subline:

**Give Arrow a clear request. Get back a reviewable branch with a proof trail.**

Buttons:

- **Open Demo →**
- `View repository`

A small footer line:

`Built with IBM Bob Shell for model execution.`

Use `arrow-mark.svg` as a watermark.

## AI coding prompt

> Build a restrained FAQ and closing section in the Arrow design system. Do not place the FAQ inside a giant rounded card. Use a two-column editorial composition: left side says “Questions are cheap. Unproven code is expensive.” Right side has four accordion rows with thin separators. Animate the accordion using GSAP only. Follow immediately with a large closing statement: “Aim once. Land once.” and “Give Arrow a clear request. Get back a reviewable branch with a proof trail.” Add Open Demo and View repository actions.

---

# 11. PAGE-WIDE MICRO-INTERACTIONS

Use only these.

## Cursor / hover

No custom cursor.

Links:

- orange underline grows from left
- 180–220ms

Buttons:

- 1–2px upward movement
- glow slightly stronger
- arrow icon shifts 4px right

## Icons

On section entry:

- opacity 0 → 1
- scale .94 → 1
- never bounce

## Orange path

The path is a recurring visual language.

It should appear differently in multiple sections:

- Hero: trajectory
- Problems: evidence flow
- Crew: role progression
- Onboarding: memory ingestion
- Proof: validation flow

This makes the entire site feel like one system.

---

# 12. RESPONSIVE BEHAVIOR

## Desktop

Use large negative space.

Max content width:

`1440px`

Hero may exceed this visually.

## Tablet

Reduce headline scale but preserve asymmetric layout.

## Mobile

Do not attempt to preserve complex desktop diagrams.

Instead:

- convert flow paths into vertical paths
- one role at a time
- visuals above explanatory text
- no horizontal scroll
- keep the orange path as a thin vertical trajectory
- disable decorative connector lines that become noisy

---

# 13. ACCESSIBILITY

Required:

- semantic headings
- keyboard-accessible FAQ
- visible focus rings
- decorative SVGs `aria-hidden="true"`
- meaningful images have alt text
- color is never the only state indicator
- respect reduced motion

---

# 14. ASSET MANIFEST

## Branding

- `arrow-mark.svg`

## Role icons

- `prompt.svg`
- `pm.svg`
- `architect.svg`
- `workers.svg`
- `orchestrator.svg`
- `verifier.svg`

## Onboarding icons

- `rules.svg`
- `project_structure.svg`
- `memory.svg`

## Proof icons

- `git_branch.svg`
- `worktree.svg`
- `shield.svg`

## Source icons

- `x_source.svg`
- `reddit_source.svg`
- `stackoverflow_source.svg`

## Use-case icons

- `code.svg`
- `mobile.svg`
- `game.svg`
- `server.svg`

## Shared

- `arrow.svg`

---

# 15. MASTER PROMPT — PASTE THIS INTO YOUR CODING AI

> Build the complete landing page for **The Arrow Arch** from this specification. Treat this Markdown as the source of truth. Do not convert it into a generic SaaS template.
>
> Use React/Next.js and the project's existing styling system. Use **GSAP + ScrollTrigger as the only animation library**. Do not install Framer Motion.
>
> The visual language is the same as the supplied Arrow pitch slides: bright white paper, charcoal-black typography, one vivid orange accent, thin technical grid/connector lines, subtle 3D illustrations, strong negative space, oversized editorial headlines, and minimal text.
>
> The recurring visual motif is one **orange trajectory** moving through the whole site. It becomes a flight path in the hero, evidence flow in research, role progression in the crew section, memory ingestion in onboarding and verification flow in the proof section.
>
> Build these six sections in this order:
>
> 1. Hero — Aim once. Land once.
> 2. Why Arrow exists — real problem themes from X, Reddit and Stack Overflow
> 3. One crew behind one prompt — PM, Architect, Workers, Orchestrator, Verifier
> 4. Onboard once — repository + company rules → permanent project memory → future tasks + developer onboarding
> 5. Trust the landing — isolated worktrees, scope enforcement, live ledger, independent proof + minimal use-case ribbon
> 6. FAQ + closing CTA
>
> Use the supplied SVG icons and raster illustrations exactly where the spec names them.
>
> Keep interactions deliberate. No constant animation, no particle background, no full-screen WebGL, no glassmorphism everywhere, no repeated three-card sections.
>
> Desktop should feel cinematic and editorial; mobile should simplify diagrams into vertical flows.
>
> Respect reduced-motion preferences and keyboard accessibility.
>
> Before finishing, compare every section against this spec and remove anything that feels like a generic landing-page template.

---

# 16. FINAL DESIGN CHECK

Before shipping, ask:

- Can a judge understand Arrow in 15 seconds?
- Does every section communicate one idea?
- Is the orange trajectory visible without becoming decoration?
- Did we avoid generic SaaS card grids?
- Is "verified work" clearer than "multi-agent architecture"?
- Is onboarding clearly both company onboarding **and** developer onboarding?
- Is the real-problem research connected to why the product behaves this way?
- Does the page still work with animations disabled?
- Are the same design rules used from first viewport to footer?

If yes, ship it.
