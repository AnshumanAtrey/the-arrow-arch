import type { Metadata } from "next";
import Walkthrough from "../../components/walkthrough";
import { sharedOpenGraph, sharedTwitter } from "../../lib/site";
const title = "How Arrow works — Interactive walkthrough";
const description =
  "Explore a sample request through planning, isolated work, independent verification and a local reviewable branch. Includes local setup instructions.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/demo" },
  openGraph: { ...sharedOpenGraph, title, description, url: "/demo" },
  twitter: { ...sharedTwitter, title, description },
};
export default function Demo() {
  return <Walkthrough />;
}
