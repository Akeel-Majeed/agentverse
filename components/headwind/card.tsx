import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  label,
}: {
  className?: string;
  children: ReactNode;
  /** Accessible name for the region. */
  label?: string;
}) {
  return (
    <section aria-label={label} className={cn("min-w-0 rounded-card border border-line bg-white", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  leading,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-6 py-4", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-sub">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

export function SectionLabel({ className, children, as: Tag = "p" }: { className?: string; children: ReactNode; as?: "p" | "span" | "h2" | "h3" | "dt" }) {
  return <Tag className={cn("font-mono text-label uppercase text-sub", className)}>{children}</Tag>;
}

export function Counter({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span
      aria-label={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-[11px] font-semibold text-white tabular"
    >
      {children}
    </span>
  );
}

export function SourceTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10.5px] uppercase leading-4 tracking-[0.06em] text-sub",
        className
      )}
    >
      {children}
    </span>
  );
}
