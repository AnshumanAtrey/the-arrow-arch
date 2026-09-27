import Link from "next/link";
import { repoUrl, submissionUrl } from "../lib/site";
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <use href={`/assets/icons-sprite.svg#icon-${name}`} />
    </svg>
  );
}
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="The Arrow Arch home">
      <img src="/assets/arrow-mark.svg" alt="" width="31" height="31" />
      <span>THE ARROW ARCH</span>
    </Link>
  );
}
/** The main call to action: the project's lablab.ai page, in a new tab. */
export function SubmissionLink({
  className = "",
  children = "View on lablab.ai",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a href={submissionUrl} target="_blank" rel="noreferrer" className={`button ${className}`}>
      {children}
      <Icon name="arrow" />
    </a>
  );
}
/** The source, beside the main call to action in the header. */
export function GitHubLink({ className = "" }: { className?: string }) {
  return (
    <a href={repoUrl} target="_blank" rel="noreferrer" className={`header-repo ${className}`} aria-label="GitHub repository">
      <Icon name="code" />
      <span className="header-repo-label">GitHub</span>
    </a>
  );
}
export function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <div className="section-label">
      <span>{number} /</span>
      {children}
    </div>
  );
}
