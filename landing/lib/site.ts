// Single source of truth for the canonical URL. Set NEXT_PUBLIC_SITE_URL
// (e.g. https://arrow.atrey.dev) once the custom domain is live.
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://arrow-arch-landing.vercel.app"
).replace(/\/$/, "");
export const siteName = "The Arrow Arch";
export const siteTitle = "The Arrow Arch — Aim once. Land once.";
export const siteDescription =
  "One clear request in. A bounded AI crew plans, builds and independently verifies the change, then lands a reviewable branch with a proof trail. Powered by IBM Bob Shell.";
export const repoUrl = "https://github.com/AnshumanAtrey/the-arrow-arch";
// Child routes replace (not merge) openGraph/twitter, so they spread these.
export const ogImage = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "The Arrow Arch — Aim once. Land once.",
};
export const sharedOpenGraph = {
  type: "website" as const,
  siteName,
  locale: "en_US",
  images: [ogImage],
};
export const sharedTwitter = {
  card: "summary_large_image" as const,
  images: [ogImage],
};
