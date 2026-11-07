/** Headwind mark: three strokes pushing right-to-left, the way a headwind meets you. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M13 10h13M7 16h19M16 22h10" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
