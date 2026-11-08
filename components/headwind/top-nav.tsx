"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileText, FlaskConical, Gauge, LayoutGrid, ScrollText, SlidersHorizontal, Tractor } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

const LINKS = [
  { href: "/overview", label: "Overview", match: "/overview", icon: LayoutGrid },
  { href: "/risks", label: "Risks", match: "/risks", icon: Gauge },
  { href: "/what-if", label: "What-if", match: "/what-if", icon: SlidersHorizontal },
  { href: "/calendar", label: "Calendar", match: "/calendar", icon: CalendarDays },
  { href: "/profile", label: "Profile", match: "/profile", icon: Tractor },
  { href: "/documents", label: "Documents", match: "/documents", icon: FileText },
  { href: "/trace", label: "Trace", match: "/trace", icon: ScrollText },
  { href: "/evidence", label: "Evidence", match: "/evidence", icon: FlaskConical },
];

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Left sidebar on large screens, compact top bar below that. */
export function TopNav({ farmName, updatedAt }: { farmName: string; updatedAt: string }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-background px-4 py-5 lg:flex">
        <Link href="/overview" className={cn("flex items-center gap-3 rounded-md px-2 py-1.5 text-ink", focus)} aria-label="Headwind home">
          <LogoMark className="h-8 w-8" />
          <span className="text-[18px] font-semibold tracking-tight">Headwind</span>
        </Link>
        <nav aria-label="Main" className="mt-8">
          <ul className="flex flex-col gap-1">
            {LINKS.map(({ href, label, match, icon: Icon }) => {
              const active = pathname.startsWith(match);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors",
                      focus,
                      active ? "bg-hover text-ink" : "text-sub hover:bg-hover/70 hover:text-ink"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto border-t border-line px-3 pt-4 text-[13px] leading-relaxed">
          <p className="font-medium text-ink">{farmName}</p>
          <p className="text-sub">Demo data · updated {updatedAt}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur-sm lg:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/overview" className={cn("flex items-center gap-2 rounded-md text-ink", focus)} aria-label="Headwind home">
            <LogoMark className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">Headwind</span>
          </Link>
          <span className="ml-auto text-[13px] font-medium text-ink">{farmName}</span>
          <nav aria-label="Main" className="-mx-1 w-full overflow-x-auto">
            <ul className="flex items-center gap-0.5">
              {LINKS.map(({ href, label, match }) => {
                const active = pathname.startsWith(match);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex h-8 items-center whitespace-nowrap rounded-md px-2.5 text-[13.5px] font-medium transition-colors",
                        focus,
                        active ? "bg-hover text-ink" : "text-sub hover:text-ink"
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
    </>
  );
}
