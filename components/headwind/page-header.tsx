import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  leading,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Quiet context line under the subtitle, e.g. the assessment date. */
  meta?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex min-w-0 items-center gap-5">
        {leading}
        <div className="min-w-0">
          <h1 className="text-[32px] font-medium leading-[1.05] tracking-[-0.04em]">{title}</h1>
          {subtitle ? <div className="mt-1.5 max-w-[70ch] text-[14.5px] leading-relaxed text-sub">{subtitle}</div> : null}
          {meta ? <div className="mt-2 text-[13px] text-sub">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pt-9">{children}</main>;
}
