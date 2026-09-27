import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import SmoothScroll from "../components/smooth-scroll";
import {
  repoUrl,
  sharedOpenGraph,
  sharedTwitter,
  siteDescription,
  siteName,
  siteTitle,
  siteUrl,
} from "../lib/site";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteTitle, template: `%s | ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "AI coding agents",
    "multi-agent code delivery",
    "verified code changes",
    "AI software engineering",
    "Git worktrees",
    "code verification",
    "IBM Bob Shell",
  ],
  authors: [{ name: "The Arrow Arch", url: repoUrl }],
  creator: "The Arrow Arch",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    ...sharedOpenGraph,
    url: "/",
    title: siteTitle,
    description: "One prompt. A reviewable branch. A proof trail.",
  },
  twitter: {
    ...sharedTwitter,
    title: siteTitle,
    description: "One prompt. A reviewable branch. A proof trail.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false, email: false, address: false },
};
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: siteName,
      description: siteDescription,
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      url: siteUrl,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Linux",
      description: siteDescription,
      image: `${siteUrl}/opengraph-image.png`,
      sameAs: [repoUrl],
    },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
