# The Arrow Arch

**Aim once. Land once.**

[Live preview](https://arrow-arch-landing.vercel.app) · [Interactive walkthrough](https://arrow-arch-landing.vercel.app/demo)

A white, editorial launch experience for The Arrow Arch: a bounded AI crew that plans, builds and independently verifies code before landing a reviewable local branch.

## What is here

- Six product-story sections, built from the supplied Arrow landing pack and specification.
- GSAP + ScrollTrigger motion: masked hero reveal, evidence paths, crew progression, project-memory flow, proof sequence and FAQ transitions.
- An interactive `/demo` walkthrough. It is explicitly an illustrative example, not a live model run.
- Mobile layouts, keyboard navigation, visible focus states and reduced-motion support.
- Self-hosted Inter font and optimized WebP illustrations, with original PNG/SVG assets retained.
- Automated browser and WCAG AA checks with Playwright and axe.

The product itself lives in this repository's `the-arrow-arch/` folder. It runs locally. This website never asks for an IBM Bob API key and does not execute agents.

## Run locally

Requires Node.js 22 or newer (CI uses Node.js 24).

```sh
cd landing
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npm run build
npm run typecheck
npm run test:e2e
```

Browser tests use installed Google Chrome on macOS; CI installs Playwright Chromium. To run tests elsewhere, set `CI=1` after `npx playwright install chromium`. Set `BASE_URL` to test an existing deployment.

## Structure

```text
app/                  Routes, metadata and responsive design system
components/           Landing story, walkthrough and shared UI
public/assets/        Supplied icons, illustrations and reference boards
public/assets/illustrations/*.webp  Optimized production images
docs/BUILD_SPEC.md    Original user-provided build specification
tests/                Browser, responsive, link and accessibility checks
```

## Deploy (Vercel)

This site lives in the `landing/` folder of the Arrow repository.

1. In Vercel: **Add New → Project → Import** this GitHub repository.
2. Set **Root Directory** to `landing`. Framework preset: **Next.js** (auto-detected). No other build settings are needed.
3. Add the environment variable `NEXT_PUBLIC_SITE_URL` = `https://arrow.atrey.dev` (or whichever domain you use). It drives canonical links, social-card URLs, `robots.txt`, `sitemap.xml` and JSON-LD (see `lib/site.ts`). There are no secrets.
4. Deploy, then **Settings → Domains → Add** `arrow.atrey.dev`. Vercel shows the DNS records to create. Typically:
   - `CNAME` `arrow` → `cname.vercel-dns.com` (on Cloudflare: **DNS only**, grey cloud)
   - a `TXT` record on `_vercel` if Vercel asks you to verify ownership

Optional: under **Settings → Git → Ignored Build Step**, use `git diff HEAD^ HEAD --quiet -- .` so pushes that don't touch `landing/` skip the rebuild.

Brand assets: `app/favicon.ico` (16/32/48), `app/icon.svg`, `app/apple-icon.png`, `public/icons/*` (PWA manifest icons) and `public/opengraph-image.png` (1200×630 social card).

## Content and evidence

The landing copy follows `docs/BUILD_SPEC.md`. Research fragments are explicitly identified as paraphrased themes, not attributed quotations, testimonials or prevalence estimates. The diff canvas and walkthrough are labeled illustrative. No dataset counts, invented endorsements, automatic production-push claims or live-demo claims are used.

Illustrations and icon artwork are the user-supplied Arrow landing-pack assets. GSAP is the only animation dependency; there is no custom cursor, continuous decorative animation or WebGL scene.
