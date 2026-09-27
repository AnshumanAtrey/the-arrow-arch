import Link from "next/link";
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
export function DemoLink({
  className = "",
  children = "Open Demo",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href="/demo" className={`button ${className}`}>
      {children}
      <Icon name="arrow" />
    </Link>
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
