import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./card";

export function PageHeader({
  label,
  title,
  subtitle,
  actions,
  leading,
}: {
  label?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 items-center gap-6">
        {leading}
        <div className="min-w-0">
          {label ? <SectionLabel>{label}</SectionLabel> : null}
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.025em] sm:text-[30px]">{title}</h1>
          {subtitle ? <div className="mt-1.5 max-w-3xl text-[14.5px] text-sub">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main id="main" tabIndex={-1} className={cn("mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-10", className)}>
      {children}
    </main>
  );
}
