"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Brand, DemoLink, Icon } from "./ui";
import Hero from "./hero";
import "./sections.css";
gsap.registerPlugin(ScrollTrigger);
const REPO = "https://github.com/AnshumanAtrey/the-arrow-arch";
const roles = [
  {
    name: "PM",
    icon: "pm",
    title: "Understands the ask.",
    text: "Turns your request into clear acceptance criteria.",
    artifact: "Acceptance criteria",
  },
  {
    name: "Architect",
    icon: "architect",
    title: "Chooses the way.",
    text: "Sets structure, file scope, dependencies and proof commands.",
    artifact: "Bounded work packets",
  },
  {
    name: "Workers",
    icon: "workers",
    title: "Build small pieces.",
    text: "One bounded packet. One isolated Git worktree per worker.",
    artifact: "Scoped changes",
  },
  {
    name: "Orchestrator",
    icon: "orchestrator",
    title: "Keeps control.",
    text: "Owns state, order, processes, retries and the live ledger.",
    artifact: "Controlled execution",
  },
  {
    name: "Verifier",
    icon: "verifier",
    title: "Proves the result.",
    text: "Reads the actual diff. Independently re-runs the checks.",
    artifact: "Independent proof",
  },
];
const problems = [
  [
    "memory",
    "Context disappears",
    "Earlier decisions get lost. The re-explaining starts again.",
  ],
  [
    "workers",
    "Workers collide",
    "The same files. The same ports. Conflicting changes.",
  ],
  [
    "verifier",
    "“Done” is not proof",
    "A confident summary can still hide a failing test.",
  ],
  [
    "rules",
    "Project conventions drift",
    "Wrong folders, wrong APIs, unnecessary dependencies.",
  ],
  [
    "code",
    "Fixes create collateral damage",
    "A repair breaks working code. The loop continues.",
  ],
  [
    "pm",
    "Humans still babysit the output",
    "Reviewing everything becomes a second full-time job.",
  ],
];
const fragments = [
  "It forgot the earlier decision.",
  "The fix broke another part.",
  "Two agents changed the same thing.",
];
const memoryInputs = [
  "Repository",
  "Company / team rules",
  "Folder structure",
  "Commands + versions",
  "Tech stack",
  "Coding conventions",
  "Approval rules",
  "Existing workflows",
];
const faqs = [
  [
    "Does Arrow replace developers?",
    "No. Arrow handles bounded implementation work and proof. Humans still own product decisions, critical rule conflicts and review of what lands.",
  ],
  [
    "Does it change how our company structures code?",
    "No. Onboarding exists specifically so Arrow can learn your existing repository rules and team conventions.",
  ],
  [
    "What happens when a worker fails?",
    "Arrow makes bounded recovery attempts: one retry, one re-plan, then escalation to a human. It does not loop forever.",
  ],
  [
    "Does Arrow push code automatically?",
    "The current product produces a local reviewable task branch. It does not automatically push production changes.",
  ],
];
function Rails() {
  return (
    <div className="band-rails" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
function Corners() {
  return (
    <>
      <span className="launch-corner corner-tl" aria-hidden="true">
        +
      </span>
      <span className="launch-corner corner-tr" aria-hidden="true">
        +
      </span>
    </>
  );
}
function BandHead({
  tag,
  id,
  title,
  accent,
  muted = false,
  children,
}: {
  tag: string;
  id: string;
  title: string;
  accent: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="band-head" data-reveal>
      <span className="band-tag">[ {tag} ]</span>
      <h2 id={id}>
        {title}
        <br />
        <span className={muted ? "muted-heading" : "accent"}>{accent}</span>
      </h2>
      <p>{children}</p>
    </div>
  );
}
function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  function toggle(i: number) {
    const next = open === i ? null : i;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    panels.current.forEach((el, index) => {
      if (el)
        gsap.to(el, {
          height: index === next ? "auto" : 0,
          opacity: index === next ? 1 : 0,
          duration: reduce ? 0 : 0.45,
          ease: "power3.out",
          overwrite: true,
        });
    });
    setOpen(next);
  }
  return (
    <div className="faq-frame">
      <Corners />
      {faqs.map(([q, a], i) => (
        <div className={`faq-item ${open === i ? "is-open" : ""}`} key={q}>
          <h3>
            <button
              aria-expanded={open === i}
              aria-controls={`faq-panel-${i}`}
              id={`faq-question-${i}`}
              onClick={() => toggle(i)}
            >
              <span className="faq-index" aria-hidden="true">
                0{i + 1}
              </span>
              <span>{q}</span>
              <span className="faq-toggle" aria-hidden="true" />
            </button>
          </h3>
          <div
            id={`faq-panel-${i}`}
            role="region"
            aria-labelledby={`faq-question-${i}`}
            aria-hidden={open !== i}
            ref={(el) => {
              panels.current[i] = el;
            }}
            className="faq-answer"
            style={{ height: i === 0 ? "auto" : 0, opacity: i === 0 ? 1 : 0 }}
          >
            <p>{a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        start: 30,
        onUpdate: (s) =>
          document
            .querySelector(".site-header")
            ?.classList.toggle("scrolled", s.scroll() > 30),
      });
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from(".launch-line > span", {
            yPercent: 110,
            duration: 0.85,
            stagger: 0.1,
          })
          .from(
            ".launch-reveal",
            { opacity: 0, y: 16, duration: 0.65, stagger: 0.07 },
            0.2,
          )
          .from(".launch-console", { opacity: 0, y: 26, duration: 0.9 }, 0.45);
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
          gsap.from(el, {
            y: 24,
            opacity: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          }),
        );
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((group) =>
          gsap.from(group.children, {
            y: 14,
            opacity: 0,
            duration: 0.6,
            stagger: 0.06,
            ease: "power3.out",
            scrollTrigger: { trigger: group, start: "top 85%", once: true },
          }),
        );
        const crew = gsap.timeline({
          scrollTrigger: {
            trigger: ".crew-roles",
            start: "top 78%",
            end: "bottom 60%",
            scrub: 0.7,
          },
        });
        crew.from(".crew-track-fill", {
          scaleX: 0,
          transformOrigin: "left",
          ease: "none",
          duration: 1,
        });
        gsap.utils.toArray<HTMLElement>(".crew-tile").forEach((el, i) =>
          crew.to(
            el,
            {
              borderColor: "#ffb88f",
              backgroundColor: "#fff5ed",
              color: "#c24400",
              duration: 0.12,
            },
            i * 0.2,
          ),
        );
        gsap
          .timeline({
            scrollTrigger: {
              trigger: ".proof-diff",
              start: "top 76%",
              once: true,
            },
          })
          .from(".diff-row", {
            opacity: 0,
            x: -14,
            duration: 0.4,
            stagger: 0.08,
          })
          .from(".proof-check", {
            opacity: 0,
            y: 10,
            duration: 0.4,
            stagger: 0.12,
          })
          .from(".proof-verdict", { opacity: 0, y: 8, duration: 0.5 });
      });
    }, root);
    return () => {
      mm.revert();
      ctx.revert();
    };
  }, []);
  return (
    <div ref={root}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header launch-header">
        <div className="header-inner">
          <Brand />
          <nav
            className={menu ? "nav open" : "nav"}
            aria-label="Main navigation"
          >
            {[
              ["Why Arrow", "#why"],
              ["How it works", "#crew"],
              ["Onboarding", "#onboarding"],
              ["Proof", "#proof"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <Link href={href} key={href} onClick={() => setMenu(false)}>
                {label}
              </Link>
            ))}
          </nav>
          <DemoLink className="button-small header-cta" />
          <button
            className="menu-button"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>
      <main id="main">
        <Hero />

        <section id="why" className="band" aria-labelledby="why-title">
          <Rails />
          <div className="band-inner">
            <BandHead
              tag="01 / THE REASON FOR ARROW"
              id="why-title"
              title="Real problems."
              accent="A more deliberate system."
              muted
            >
              Built around the things developers actually say when AI work goes
              sideways.
            </BandHead>
            <div className="frame" data-reveal>
              <Corners />
              <div className="frame-bar">
                <span className="frame-label">
                  <span className="frame-dot" /> RESEARCH THEMES
                  <span className="frame-sub">/ paraphrased</span>
                </span>
                <span className="source-list">
                  <span>
                    <Icon name="x_source" /> X
                  </span>
                  <span>
                    <Icon name="reddit_source" /> Reddit
                  </span>
                  <span>
                    <Icon name="stackoverflow_source" /> Stack Overflow
                  </span>
                </span>
              </div>
              <div className="fragment-row">
                {fragments.map((f) => (
                  <p key={f}>
                    <span className="fragment-quote" aria-hidden="true">
                      “
                    </span>
                    {f}
                  </p>
                ))}
              </div>
              <div className="problem-grid" data-stagger>
                {problems.map(([icon, title, body], i) => (
                  <div className="problem-cell" key={title}>
                    <div className="cell-top">
                      <span className="cell-icon">
                        <Icon name={icon} />
                      </span>
                      <span className="cell-index">0{i + 1}</span>
                    </div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
              <div className="frame-foot">
                <span className="pattern-flow">
                  Real complaints <b>→</b> repeatable rules <b>→</b> safer
                  execution
                </span>
                <span className="frame-note">
                  Also in the reports: oversized context, invented APIs, the
                  wrong thing built, environment setup failures and skipped or
                  repeated tool calls.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="crew" className="band" aria-labelledby="crew-title">
          <Rails />
          <div className="band-inner">
            <BandHead
              tag="02 / HOW IT WORKS"
              id="crew-title"
              title="One prompt."
              accent="A whole crew behind it."
            >
              Each role exists to stop a different type of mistake. Every
              handoff has a purpose.
            </BandHead>
            <div className="frame" data-reveal>
              <Corners />
              <div className="frame-bar">
                <span className="frame-label">
                  <span className="frame-dot" /> ONE REQUEST
                  <span className="frame-sub">/ shared direction</span>
                </span>
                <span className="frame-label">EXAMPLE REQUEST</span>
              </div>
              <div className="crew-prompt">
                <Icon name="prompt" />
                <span>
                  “Add discount codes to checkout. Keep the existing payment
                  flow intact.”
                </span>
                <span className="crew-prompt-send" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </div>
              <div className="crew-roles">
                <div className="crew-track" aria-hidden="true">
                  <span className="crew-track-fill" />
                </div>
                {roles.map((role, i) => (
                  <div className="crew-role" key={role.name}>
                    <span className="cell-index">
                      0{i + 1} / {role.name.toUpperCase()}
                    </span>
                    <span className="crew-tile">
                      <Icon name={role.icon} />
                    </span>
                    <h3>{role.title}</h3>
                    <p>{role.text}</p>
                    <span className="crew-artifact">
                      <span aria-hidden="true">→</span> {role.artifact}
                    </span>
                  </div>
                ))}
              </div>
              <div className="frame-foot crew-foot">
                <span className="crew-result">
                  <span className="cell-icon">
                    <Icon name="git_branch" />
                  </span>
                  Reviewable branch{" "}
                  <span className="accent">+ proof trail</span>
                </span>
                <span className="frame-label">
                  <span className="frame-dot" /> READY FOR HUMAN REVIEW
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="onboarding"
          className="band"
          aria-labelledby="onboard-title"
        >
          <Rails />
          <div className="band-inner">
            <BandHead
              tag="03 / YOUR REPO. YOUR RULES."
              id="onboard-title"
              title="Onboard once."
              accent="Run with your rules."
            >
              Arrow learns your repository, your rules and the way your team
              works. That project context stays available for future tasks.
            </BandHead>
            <div className="frame" data-reveal>
              <Corners />
              <div className="frame-bar">
                <span className="frame-label">
                  <span className="frame-dot" /> PROJECT MEMORY
                  <span className="frame-sub">/ onboarding</span>
                </span>
                <span className="frame-label">REPO → MEMORY → EVERY TASK</span>
              </div>
              <div className="memory-layout">
                <div className="memory-list">
                  <span className="memory-list-title">WHAT ARROW LEARNS</span>
                  <ul data-stagger>
                    {memoryInputs.map((x, i) => (
                      <li key={x}>
                        <span className="cell-index">0{i + 1}</span>
                        {x}
                        <Icon name="verifier" />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="memory-art">
                  <img
                    src="/assets/illustrations/onboarding-memory.webp"
                    width="1672"
                    height="941"
                    loading="lazy"
                    alt="Repository structure and team rules flow into a durable project memory vault."
                  />
                  <div className="memory-uses">
                    <span>
                      <Icon name="prompt" /> Future Arrow tasks
                    </span>
                    <span>
                      <Icon name="code" /> New developer
                    </span>
                  </div>
                </div>
              </div>
              <div className="memory-notes">
                <div>
                  <span className="cell-icon">
                    <Icon name="memory" />
                  </span>
                  <span className="frame-label">PROJECT MEMORY</span>
                  <h3>Keep the context. Skip the re-explaining.</h3>
                  <p>
                    Repo profile, commands, allowed structure, team conventions
                    — including the rules you deliberately override.
                  </p>
                </div>
                <div>
                  <span className="cell-icon">
                    <Icon name="code" />
                  </span>
                  <span className="frame-label">A NEW DEVELOPER JOINS?</span>
                  <h3>The same memory. A human head start.</h3>
                  <p>
                    The project context that guides agents can also explain
                    where things live, how to run the repo and which conventions
                    matter.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="proof" className="band" aria-labelledby="proof-title">
          <Rails />
          <div className="band-inner">
            <BandHead
              tag="04 / TRUST THE LANDING"
              id="proof-title"
              title="Workers can say “done.”"
              accent="Arrow still checks."
            >
              The model’s summary is never the final verdict. The control plane
              reads the actual diff and re-runs the proof.
            </BandHead>
            <div className="frame proof-frame" data-reveal>
              <Corners />
              <div className="proof-col">
                <div className="proof-point">
                  <span className="cell-icon">
                    <Icon name="worktree" />
                  </span>
                  <h3>Isolated work</h3>
                  <p>Each worker edits its own Git worktree.</p>
                </div>
                <div className="proof-point">
                  <span className="cell-icon">
                    <Icon name="project_structure" />
                  </span>
                  <h3>File scope</h3>
                  <p>Changes stay inside the packet’s allowed files.</p>
                </div>
              </div>
              <div className="proof-diff">
                <div className="frame-bar">
                  <span className="frame-label">
                    <span className="frame-dot" /> CHANGE REVIEW
                  </span>
                  <span className="frame-label">ILLUSTRATIVE RUN</span>
                </div>
                <div className="diff-head">
                  <Icon name="code" /> src / checkout / total.ts
                  <span>
                    <b>+3</b> −1
                  </span>
                </div>
                <div className="diff-body">
                  <div className="diff-row">
                    <span>12</span>export function total(items) {"{"}
                  </div>
                  <div className="diff-row removed">
                    <span>13 −</span>
                    {"  return sum(items);"}
                  </div>
                  <div className="diff-row added">
                    <span>13 +</span>
                    {"  const subtotal = sum(items);"}
                  </div>
                  <div className="diff-row added">
                    <span>14 +</span>
                    {"  return applyDiscount(subtotal);"}
                  </div>
                  <div className="diff-row">
                    <span>15</span>
                    {"}"}
                  </div>
                </div>
                <div className="proof-checks-list">
                  {[
                    "Changed files match allowed scope",
                    "Required checks independently re-run",
                    "Diff and proof attached to branch",
                  ].map((c) => (
                    <div className="proof-check" key={c}>
                      <Icon name="verifier" />
                      <span>{c}</span>
                      <b>PASS</b>
                    </div>
                  ))}
                </div>
                <div className="proof-verdict">
                  <Icon name="shield" />
                  <strong>Proven. Ready for review.</strong>
                  <Icon name="arrow" />
                </div>
              </div>
              <div className="proof-col">
                <div className="proof-point">
                  <span className="cell-icon">
                    <Icon name="git_branch" />
                  </span>
                  <h3>Live ledger</h3>
                  <p>Workers, processes, ports and ownership. Accounted for.</p>
                </div>
                <div className="proof-point">
                  <span className="cell-icon">
                    <Icon name="shield" />
                  </span>
                  <h3>Independent proof</h3>
                  <p>Arrow runs required commands before a packet can land.</p>
                </div>
              </div>
            </div>
            <div className="usecase-strip" data-reveal>
              <span className="usecase-lead">
                Small fix or large feature.
                <strong>Same control system.</strong>
              </span>
              {[
                ["code", "Web apps"],
                ["mobile", "Mobile"],
                ["server", "Backend / internal"],
                ["game", "Game development"],
                ["architect", "Any codebase"],
              ].map(([icon, text]) => (
                <span className="usecase" key={icon}>
                  <Icon name={icon} />
                  {text}
                </span>
              ))}
            </div>
            <p className="band-caption">
              Execution follows your repository’s toolchain and rules.
            </p>
          </div>
        </section>

        <section id="faq" className="band" aria-labelledby="faq-title">
          <Rails />
          <div className="band-inner faq-layout-v2">
            <div className="faq-intro" data-reveal>
              <span className="band-tag">[ 05 / BEFORE YOU ASK ]</span>
              <h2 id="faq-title">
                Questions are cheap.
                <br />
                <span className="muted-heading">
                  Unproven code is expensive.
                </span>
              </h2>
              <p>
                Still curious? Step through a sample request in the interactive
                walkthrough, or read the source.
              </p>
              <div className="faq-links">
                <Link href="/demo">
                  Interactive walkthrough <span aria-hidden="true">→</span>
                </Link>
                <a href={REPO} target="_blank" rel="noreferrer">
                  GitHub repository <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <FAQ />
          </div>
        </section>

        <section className="band cta-band" aria-labelledby="cta-title">
          <Rails />
          <div className="band-inner">
            <div className="cta-panel" data-reveal>
              <Corners />
              <div className="cta-grid" aria-hidden="true" />
              <span className="launch-badge">
                <span className="launch-badge-mark">
                  <Icon name="git_branch" />
                </span>
                Your next change starts here
              </span>
              <h2 id="cta-title">
                Aim once. <span className="accent">Land once.</span>
              </h2>
              <p>
                Give Arrow a clear request. Get back a reviewable branch with a
                proof trail.
              </p>
              <div className="launch-actions">
                <DemoLink />
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer"
                  className="launch-repo"
                >
                  <Icon name="code" /> View repository{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <Rails />
        <div className="band-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <Brand />
              <p>
                A bounded AI crew that plans, builds and proves code changes
                before they land on a branch you review.
              </p>
            </div>
            <nav className="footer-col" aria-label="Product">
              <span>PRODUCT</span>
              <a href="#why">Why Arrow</a>
              <a href="#crew">How it works</a>
              <a href="#onboarding">Onboarding</a>
              <a href="#proof">Proof</a>
              <a href="#faq">FAQ</a>
            </nav>
            <nav className="footer-col" aria-label="Resources">
              <span>RESOURCES</span>
              <Link href="/demo">Interactive walkthrough</Link>
              <Link href="/demo#setup">Run it locally</Link>
              <a href={REPO} target="_blank" rel="noreferrer">
                GitHub repository ↗
              </a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>Built with IBM Bob Shell for model execution.</span>
            <span>
              Examples on this site are illustrative. No agents run here.
            </span>
            <a href="#main" className="footer-top-link">
              BACK TO TOP ↑
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
