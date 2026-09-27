"use client";
import { useRef, useState } from "react";
import gsap from "gsap";
import { DemoLink, Icon } from "./ui";
import "./hero.css";
const stages = [
  {
    name: "Understand",
    icon: "pm",
    title: "A clear definition of done.",
    text: "The PM turns your request into acceptance criteria before a line of code changes.",
    checks: [
      "Intent captured",
      "Acceptance criteria defined",
      "Open questions returned to you",
    ],
    output: "acceptance-spec",
  },
  {
    name: "Plan",
    icon: "architect",
    title: "Give every change a boundary.",
    text: "The architect maps files, dependencies and proof commands. You approve the plan.",
    checks: [
      "File ownership assigned",
      "Proof commands specified",
      "Human approval required",
    ],
    output: "packet-plan",
  },
  {
    name: "Build",
    icon: "workers",
    title: "Parallel work. Separate spaces.",
    text: "Workers build scoped pieces in isolated Git worktrees. The orchestrator keeps them in order.",
    checks: [
      "Isolated Git worktrees",
      "Bounded file scope",
      "Live process ownership",
    ],
    output: "scoped-diff",
  },
  {
    name: "Verify",
    icon: "shield",
    title: "“Done” is a claim. Here’s proof.",
    text: "Arrow reads the diff and independently runs the checks. A worker’s summary is never enough.",
    checks: [
      "Actual diff inspected",
      "File scope validated",
      "Required checks re-run",
    ],
    output: "proof-report",
  },
  {
    name: "Land",
    icon: "git_branch",
    title: "Your branch. Your final call.",
    text: "Accepted work lands locally with its evidence. Review the change and decide what ships.",
    checks: [
      "Reviewable task branch",
      "Check outputs attached",
      "No automatic push",
    ],
    output: "arrow/your-next-feature",
  },
];
export default function Hero() {
  const [active, setActive] = useState(3);
  const detail = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function select(index: number) {
    setActive(index);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(
        detail.current,
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power3.out",
          overwrite: true,
        },
      );
    }
  }
  const stage = stages[active];
  return (
    <section className="launch-hero" aria-labelledby="hero-title">
      <div className="launch-grid" aria-hidden="true" />
      <div className="launch-rails" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="launch-inner">
        <div className="launch-copy">
          <div className="launch-badge launch-reveal">
            <span className="launch-badge-mark">
              <Icon name="orchestrator" />
            </span>
            <span>One request. A whole engineering crew.</span>
            <span className="launch-badge-arrow" aria-hidden="true">
              ↗
            </span>
          </div>
          <h1 id="hero-title">
            <span className="launch-line">
              <span>Aim once.</span>
            </span>{" "}
            <span className="launch-line">
              <span className="accent">Land once.</span>
            </span>
          </h1>
          <p className="launch-description launch-reveal">
            Turn a clear request into a reviewable code branch.
            <br className="desktop-break" /> Arrow plans, builds and{" "}
            <strong>proves the change</strong> before it lands.
          </p>
          <div className="launch-actions launch-reveal">
            <DemoLink />
            <a
              href="https://github.com/AnshumanAtrey/the-arrow-arch"
              target="_blank"
              rel="noreferrer"
              className="launch-repo"
            >
              <Icon name="code" /> Explore the code{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className="launch-powered launch-reveal">
            <span className="launch-powered-rule" />
            MODEL EXECUTION BY <strong>IBM Bob Shell</strong>
            <span className="launch-powered-rule" />
          </p>
        </div>
        <div className="launch-console">
          <span className="launch-corner corner-tl" aria-hidden="true">
            +
          </span>
          <span className="launch-corner corner-tr" aria-hidden="true">
            +
          </span>
          <div className="launch-console-bar">
            <span className="launch-console-name">
              <img src="/assets/arrow-mark.svg" alt="" width="16" height="16" />{" "}
              THE ARROW ARCH <span className="console-divider">/</span>
              <span className="console-project"> your-next-feature</span>
            </span>
            <span className="launch-example">
              <span /> WORKFLOW PREVIEW
            </span>
          </div>
          <div className="launch-scene">
            <div className="launch-artwork">
              <div className="launch-scene-label">
                <span className="scene-number">01 → 05</span> FROM INTENT TO
                EVIDENCE
              </div>
              <img
                src="/assets/illustrations/hero-trajectory.webp"
                width="1672"
                height="941"
                alt="A complete orange trajectory from a request through an AI crew and verification checks to a target."
                fetchPriority="high"
              />
              <span className="launch-art-caption">
                <span /> One direction. Every step accounted for.
              </span>
            </div>
            <div
              className="launch-proof"
              id="launch-stage-panel"
              role="tabpanel"
              aria-labelledby={`launch-tab-${active}`}
            >
              <div ref={detail}>
                <span className="launch-proof-kicker">
                  <Icon name={stage.icon} /> {stage.name.toUpperCase()}{" "}
                  <span>0{active + 1}</span>
                </span>
                <h2>{stage.title}</h2>
                <p>{stage.text}</p>
                <ul>
                  {stage.checks.map((check) => (
                    <li key={check}>
                      <Icon name="verifier" />
                      {check}
                    </li>
                  ))}
                </ul>
                <div className="launch-artifact">
                  <span>OUTPUT</span>
                  <code>{stage.output}</code>
                  <Icon name="arrow" />
                </div>
              </div>
            </div>
          </div>
          <div
            className="launch-stages"
            role="tablist"
            aria-label="Explore the delivery stages"
          >
            {stages.map((item, i) => (
              <button
                key={item.name}
                id={`launch-tab-${i}`}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                aria-selected={i === active}
                aria-controls="launch-stage-panel"
                tabIndex={i === active ? 0 : -1}
                className={i === active ? "is-active" : ""}
                onClick={() => select(i)}
                onKeyDown={(e) => {
                  let next = i;
                  if (e.key === "ArrowRight") next = (i + 1) % 5;
                  else if (e.key === "ArrowLeft") next = (i + 4) % 5;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = 4;
                  else return;
                  e.preventDefault();
                  select(next);
                  tabs.current[next]?.focus();
                }}
              >
                <span className="launch-stage-number">0{i + 1}</span>
                <Icon name={item.icon} />
                <span>{item.name}</span>
                <span className="launch-stage-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="launch-assurances">
          <span>
            <Icon name="worktree" />
            Isolated workers
          </span>
          <i />
          <span>
            <Icon name="shield" />
            Independent checks
          </span>
          <i />
          <span>
            <Icon name="git_branch" />A branch you can review
          </span>
          <a href="#why">
            WHY ARROW EXISTS <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
