import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./card";

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4 [&>*]:bg-white",
        className
      )}
    >
      {children}
    </div>
  );
}

export function KpiCell({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 px-5 py-5", className)}>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-auto flex flex-col gap-2">
        <div className="font-mono text-[26px] font-semibold leading-none tracking-tight tabular">{value}</div>
        {sub ? <div className="font-mono text-[12px] text-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
