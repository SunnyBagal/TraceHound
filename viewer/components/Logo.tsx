/** TraceHound mark: a trail of scent dots converging on a node. */
export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="4" cy="18" r="1.4" fill="var(--accent)" opacity="0.35" />
      <circle cx="8" cy="14.5" r="1.6" fill="var(--accent)" opacity="0.55" />
      <circle cx="12" cy="11.5" r="1.8" fill="var(--accent)" opacity="0.8" />
      <rect x="14.5" y="3.5" width="7" height="7" rx="2" fill="none" stroke="var(--accent)" strokeWidth="1.8" />
    </svg>
  );
}
