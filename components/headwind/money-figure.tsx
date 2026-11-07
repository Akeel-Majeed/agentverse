"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { FigureDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./card";
import { Disclaimer, SourcesList, WorkingPanel } from "./working";

/** A £ figure that opens a side sheet with its working and sources. */
export function MoneyFigure({
  detail,
  children,
  className,
}: {
  detail: FigureDetail;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`${detail.title}: ${detail.value}. Show working`}
          className={cn(
            "rounded-sm font-mono tabular underline decoration-line-strong decoration-dotted underline-offset-[5px] transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
          )}
        >
          {children ?? detail.value}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="space-y-2 border-b border-line px-6 pb-5 pt-6 text-left">
          <SectionLabel>The working · Demo data</SectionLabel>
          <SheetTitle className="pr-6 text-[17px] font-semibold tracking-tight">{detail.title}</SheetTitle>
          <p className="font-mono text-[34px] font-semibold leading-none tracking-tight tabular">{detail.value}</p>
          <SheetDescription className="text-[13px] leading-relaxed text-sub">
            {detail.description ?? "How Headwind worked this figure out, and where each input came from."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-6 py-6">
          {detail.working.length > 0 ? (
            <div className="flex flex-col gap-3">
              <SectionLabel as="h3">Working</SectionLabel>
              <WorkingPanel steps={detail.working} />
            </div>
          ) : null}
          {detail.sources.length > 0 ? (
            <div className="flex flex-col gap-3">
              <SectionLabel as="h3">Inputs and sources</SectionLabel>
              <SourcesList sources={detail.sources} />
            </div>
          ) : null}
          <Disclaimer />
        </div>
      </SheetContent>
    </Sheet>
  );
}
