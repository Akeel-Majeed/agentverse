import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
    <section aria-label={label} className={cn("min-w-0 rounded-card border border-line bg-white shadow-card", className)}>
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
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-sub">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/** Native, closed-by-default section. Wrap in `Card` and stack with `divide-y divide-line`. */
export function Disclosure({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <details className="group min-w-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-sub">{description}</p> : null}
        </div>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-sub transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

export function SectionLabel({ className, children, as: Tag = "p" }: { className?: string; children: ReactNode; as?: "p" | "span" | "h2" | "h3" | "dt" }) {
  return <Tag className={cn("text-label font-medium text-sub", className)}>{children}</Tag>;
}

export function Counter({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <span
      aria-label={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-hover px-1.5 text-[11.5px] font-semibold text-ink tabular"
    >
      {children}
    </span>
  );
}

export function SourceTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-panel px-1.5 py-0.5 text-[11.5px] font-medium leading-4 text-sub", className)}>
      {children}
    </span>
  );
}
