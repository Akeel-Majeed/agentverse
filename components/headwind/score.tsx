import { bandFor } from "@/lib/score";
import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 140,
  name,
  className,
}: {
  score: number;
  size?: number;
  /** Risk name used in the accessible label. */
  name?: string;
  className?: string;
}) {
  const band = bandFor(score);
  const stroke = Math.max(5, Math.round(size * 0.075));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(Math.max(score, 0), 10) / 10);
  return (
    <div
      role="img"
      aria-label={`${name ? `${name} risk score` : "Risk score"} ${score} out of 10, ${band.level}`}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFEFEF" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={band.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms ease, stroke 500ms ease" }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-semibold leading-none tracking-tight text-ink tabular" style={{ fontSize: Math.round(size * 0.3) }}>
          {score}
        </span>
        <span className="mt-1 font-mono leading-none text-sub" style={{ fontSize: Math.max(10, Math.round(size * 0.08)) }}>
          / 10
        </span>
      </div>
    </div>
  );
}

export function LevelDot({ score, size = 8 }: { score: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: bandFor(score).color }}
    />
  );
}

export function LevelLabel({ score, className }: { score: number; className?: string }) {
  const band = bandFor(score);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", className)} style={{ color: band.text }}>
      <LevelDot score={score} />
      {band.level}
    </span>
  );
}

export function ScoreChip({ score, className }: { score: number; className?: string }) {
  const band = bandFor(score);
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 font-mono text-[13px] font-semibold tabular",
        className
      )}
      style={{ color: band.text }}
    >
      <LevelDot score={score} size={7} />
      {score}
      <span className="sr-only"> out of 10, {band.level}</span>
    </span>
  );
}
