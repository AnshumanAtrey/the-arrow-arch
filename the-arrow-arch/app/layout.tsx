import type { Metadata } from "next";
import { Azeret_Mono, Host_Grotesk } from "next/font/google";
import Link from "next/link";
import { EngineStatus } from "@/components/engine-status";
import "./globals.css";

const host = Host_Grotesk({ subsets: ["latin"], variable: "--font-host", display: "swap" });
const azeret = Azeret_Mono({ subsets: ["latin"], variable: "--font-azeret", display: "swap" });

export const metadata: Metadata = {
  title: "Arrow Arch",
  description: "Aim once, land once: onboard a repo and its rules, then send tasks through a project manager, an architect and workers — proven before they land.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${host.variable} ${azeret.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-rule bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2.5 text-ink">
                <Mark />
                <span className="display text-[19px] tracking-[-0.03em]">Arrow Arch</span>
              </Link>
              <nav className="flex gap-5 text-[14px] text-ink-2">
                <Link href="/" className="hover:text-ink">Repositories</Link>
                <Link href="/settings" className="hover:text-ink">Settings</Link>
              </nav>
            </div>
            <EngineStatus />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">{children}</main>
      </body>
    </html>
  );
}

/** An ink target; the arrow that hits it is the only orange. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="11" cy="15" r="9.5" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="11" cy="15" r="5" fill="none" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="11" cy="15" r="1.6" fill="var(--ink)" />
      <path d="M11 15 L23 3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" />
      <path d="M18.5 3 L23 3 L23 7.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}
