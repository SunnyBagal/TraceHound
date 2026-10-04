/** The wolf head's outline (evenodd: the eyes, ears and muzzle are cut-outs the background shows through). */
export const WOLF_PATH =
  "M474.8,372 L430.2,387.1 L408.2,430 L456.1,415.5 Z M235.2,372 L253.9,415.5 L301.8,430 L279.8,387.1 Z M188.7,60.4 L157.4,253.1 L80.6,407.4 L293.1,650.1 L416.9,650.1 L629.4,407.4 L552.6,253.1 L521.3,60.4 L370.2,165.8 L355,167 L339.8,165.8 Z M126.8,400.9 L143.4,362 L247.6,298 L337.4,381.6 L355,420 L372.6,381.6 L462.4,298 L566.6,362 L583.2,400.9 L521.5,473.8 L488.8,437.6 L472.9,524.8 L402,606.1 L366.5,617.2 L366.8,605.1 L410.5,562 L379.5,550.2 L330.5,550.2 L299.5,562 L343.2,605.1 L343.5,617.2 L308,606.1 L237.2,524.8 L221.2,437.6 L188.5,473.8 Z M494.2,127.8 L515,254 L442,220.9 Z M215.8,127.8 L268,220.9 L195,254 Z";
/** The path's bounds (80.6–629.4 × 60.4–650.1) in a square with a small margin. */
export const WOLF_VIEWBOX = "55 55 600 600";

/** TraceHound mark: the wolf head in --logo, the mark alone (no tile or frame behind it). */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox={WOLF_VIEWBOX} className={className} aria-hidden>
      <path fill="var(--logo)" fillRule="evenodd" d={WOLF_PATH} />
    </svg>
  );
}

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The mark as a link to the default canvas view (no selection, no impact report). */
export function LogoLink({ className = "" }: { className?: string }) {
  return (
    <a href={`${base}/`} title="TraceHound: back to the full canvas" aria-label="TraceHound home" data-testid="home-link" className={`grid shrink-0 place-items-center transition-opacity hover:opacity-80 ${className}`}>
      <Logo className="size-7" />
    </a>
  );
}
