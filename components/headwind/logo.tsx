/** Hedged mark: a small ink square, as on every slide of the deck. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="8" y="8" width="16" height="16" rx="3" fill="currentColor" />
    </svg>
  );
}

/** Mark plus wordmark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-medium tracking-[-0.03em] text-ink ${className}`}>
      <span aria-hidden className="h-[0.62em] w-[0.62em] rounded-[3px] bg-current" />
      Hedged
    </span>
  );
}
