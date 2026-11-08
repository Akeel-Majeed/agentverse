import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./card";

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4 [&>*]:rounded-card [&>*]:bg-card [&>*]:shadow-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function KpiCell({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-4 px-5 py-5", className)}>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-auto flex flex-col gap-1.5">
        <div className="text-[30px] font-medium leading-none tracking-[-0.04em] tabular">{value}</div>
        {sub ? <div className="text-[12.5px] text-sub tabular">{sub}</div> : null}
      </div>
    </div>
  );
}
