/**
 * A change must come from Arrow's own pages. The finished work Arrow previews
 * runs on another port — another site — so a page there can't send actions here.
 * No Origin header means no browser (curl, the tests): allowed.
 */
export function fromThisSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
