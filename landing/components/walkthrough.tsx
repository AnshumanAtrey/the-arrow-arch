"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { Brand, Icon } from "./ui";
const steps = [
  {
    name: "Understand",
    icon: "pm",
    heading: "Make the ask testable.",
    body: "The PM turns a plain-language request into acceptance criteria. Open questions return to the human before implementation starts.",
    artifact:
      "Acceptance\n• Apply a valid discount to the subtotal.\n• Reject expired codes.\n• Keep existing checkout behavior unchanged.",
  },
  {
    name: "Plan",
    icon: "architect",
    heading: "Bound the work before it begins.",
    body: "The architect defines file ownership, dependency order and proof commands. A human approves the plan before workers begin.",
    artifact:
      "Packet 01 → src/checkout/total.ts\nPacket 02 → tests/checkout/discount.test.ts\nProof → project typecheck + checkout tests\nGate → human plan approval",
  },
  {
    name: "Build",
    icon: "workers",
    heading: "Separate work. Shared direction.",
    body: "Workers get scoped packets and isolated worktrees. The orchestrator records file and process ownership in its live ledger.",
    artifact:
      "worker-01 → worktree/discount-logic\nworker-02 → worktree/discount-tests\nAllowed files → attached to each packet\nOwnership → recorded in the ledger",
  },
  {
    name: "Verify",
    icon: "verifier",
    heading: "Check what actually changed.",
    body: "The control plane reads the diff, enforces scope and re-runs the proof itself. A failing packet gets one retry, one re-plan, then human escalation.",
    artifact:
      "✓ Diff stays inside allowed scope\n✓ Protected files remain untouched\n✓ Required commands independently re-run\n✓ Acceptance evidence attached",
  },
  {
    name: "Land",
    icon: "git_branch",
    heading: "A branch you can review.",
    body: "Accepted changes land on a local task branch with their proof trail. The human owns the review and decides what happens next.",
    artifact:
      "Branch → arrow/checkout-discount\nEvidence → diff + check outputs\nNext → human review\nAutomatic push → disabled",
  },
];
const cloneCommand =
  "git clone https://github.com/AnshumanAtrey/the-arrow-arch.git\ncd the-arrow-arch/the-arrow-arch\nbun install\nbun run dev";
export default function Walkthrough() {
  const [step, setStep] = useState(0),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        panel.current,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
      );
    });
    return () => ctx.revert();
  }, [step]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(cloneCommand);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  const current = steps[step];
  return (
    <div className="demo-page">
      <a className="skip-link" href="#demo-main">
        Skip to walkthrough
      </a>
      <header className="demo-header section-shell">
        <Brand />
        <Link href="/" className="text-link">
          Back to the story <span>↗</span>
        </Link>
      </header>
      <main id="demo-main" className="demo-main section-shell">
        <div className="demo-intro">
          <div className="eyebrow">
            <span className="status-dot" /> INTERACTIVE WALKTHROUGH
          </div>
          <h1>
            From a clear ask.
            <br />
            <span className="accent">To a proven change.</span>
          </h1>
          <p>
            Follow one example through Arrow’s control system. This is an
            illustrative walkthrough; the actual product runs locally after
            cloning.
          </p>
        </div>
        <div className="walkthrough">
          <div className="walkthrough-top">
            <span className="mono">EXAMPLE / CHECKOUT DISCOUNT</span>
            <span className="mono">NO LIVE AGENTS RUNNING</span>
          </div>
          <div className="demo-request">
            <Icon name="prompt" />
            <span>
              “Add discount codes to checkout. Keep the existing payment flow
              intact.”
            </span>
          </div>
          <div className="demo-stage-layout">
            <nav className="demo-steps" aria-label="Walkthrough stages">
              {steps.map((s, i) => (
                <button
                  key={s.name}
                  className={`demo-step ${i === step ? "active" : ""}`}
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`Stage ${i + 1}: ${s.name}`}
                >
                  <Icon name={s.icon} />
                  <span>{s.name}</span>
                  <span aria-hidden="true">{i < step ? "✓" : `0${i + 1}`}</span>
                </button>
              ))}
            </nav>
            <div className="demo-content">
              <div ref={panel} aria-live="polite" aria-atomic="true">
                <span className="mono">
                  0{step + 1} / {current.name.toUpperCase()}
                </span>
                <h2>{current.heading}</h2>
                <p>{current.body}</p>
                <pre className="artifact">{current.artifact}</pre>
              </div>
              <div className="demo-controls">
                <button
                  className="button button-secondary"
                  disabled={step === 0}
                  onClick={() => setStep((s) => s - 1)}
                >
                  Previous
                </button>
                <button
                  className="button"
                  onClick={() => setStep((s) => (s === 4 ? 0 : s + 1))}
                >
                  {step === 4 ? "Replay" : "Next stage"}
                  <Icon name="arrow" />
                </button>
                <span className="mono">
                  {step + 1} OF {steps.length}
                </span>
              </div>
            </div>
          </div>
        </div>
        <section
          id="setup"
          className="local-setup"
          aria-labelledby="setup-title"
        >
          <div>
            <span className="mono accent">RUN THE REAL THING</span>
            <h2 id="setup-title">
              Your machine.
              <br />
              Your repository.
            </h2>
            <p>
              Requires Bun 1.3+, Node.js 20+, Git and IBM Bob Shell 2.0.5+.
              Configure your Bob API key in the app’s Settings.
            </p>
            <a
              className="text-link"
              href="https://github.com/AnshumanAtrey/the-arrow-arch"
              target="_blank"
              rel="noreferrer"
            >
              Open the product repository <span>↗</span>
            </a>
            <p className="demo-notice">
              Repository access may be required. Use Mock mode in the local app
              to explore its flow without a model.
            </p>
          </div>
          <div>
            <pre className="setup-code">{cloneCommand}</pre>
            <button className="copy-button" onClick={copy}>
              {copied ? "Copied ✓" : "Copy setup commands ↗"}
            </button>
            <p aria-live="polite">
              {copyError
                ? "Copy unavailable in this browser. Select the commands above to copy them manually."
                : copied
                  ? "Commands copied to clipboard."
                  : "Then open http://localhost:7777. Onboard your repo, approve the plan and send a task."}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
