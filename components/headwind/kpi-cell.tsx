import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./card";

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card md:grid-cols-4 [&>*]:bg-white",
        className
      )}
    >
      {children}
    </div>
  );
}

export function KpiCell({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 px-5 py-4", className)}>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="text-[24px] font-semibold leading-none tracking-tight tabular">{value}</div>
        {sub ? <div className="text-[12.5px] text-sub tabular">{sub}</div> : null}
      </div>
    </div>
  );
}
