import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { EngineStatus } from "@/components/engine-status";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: "Arrow Arch",
  description: "Aim once, land once: onboard a repo and its rules, then send tasks through a project manager, an architect and workers — proven before they land.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen">
        <header className="border-b border-rule bg-panel">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5 text-ink">
                <Mark />
                <span className="display text-[19px]">Arrow Arch</span>
              </Link>
              <nav className="flex gap-4 text-[14px] text-ink-2">
                <Link href="/" className="hover:text-ink">Repositories</Link>
                <Link href="/settings" className="hover:text-ink">Settings</Link>
              </nav>
            </div>
            <EngineStatus />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}

/** A target with an arrow in the gold. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="11" cy="15" r="10" fill="none" stroke="var(--blue)" strokeWidth="2" />
      <circle cx="11" cy="15" r="5.5" fill="none" stroke="var(--red)" strokeWidth="2" />
      <circle cx="11" cy="15" r="2" fill="var(--gold)" />
      <path d="M11 15 L23 3" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19.5 2.5 L23.5 2.5 L23.5 6.5" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
