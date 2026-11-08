"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Gauge, LayoutGrid, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Tractor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";
import { NAV_COOKIE } from "./nav-state";

const LINKS = [
  { href: "/overview", label: "Overview", match: "/overview", icon: LayoutGrid },
  { href: "/risks", label: "Risks", match: "/risks", icon: Gauge },
  { href: "/what-if", label: "What-if", match: "/what-if", icon: SlidersHorizontal },
  { href: "/calendar", label: "Calendar", match: "/calendar", icon: CalendarDays },
  { href: "/profile", label: "Profile", match: "/profile", icon: Tractor },
];

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Left sidebar on large screens, compact top bar below that. The sidebar collapses to an icon
 * rail; its width is the CSS variable --nav-w (app/globals.css), which the page padding follows.
 */
export function TopNav({ farmName, updatedAt, initialCollapsed = false }: { farmName: string; updatedAt: string; initialCollapsed?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.dataset.nav = "collapsed";
    else delete document.documentElement.dataset.nav;
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-[var(--nav-w)] flex-col overflow-hidden border-r border-line bg-paper/80 py-6 backdrop-blur-sm transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
          collapsed ? "px-3" : "px-4"
        )}
      >
        <Link
          href="/overview"
          className={cn("flex h-9 items-center rounded-md text-ink", collapsed ? "justify-center" : "gap-3 px-2", focus)}
          aria-label="Hedged home"
          title={collapsed ? "Hedged" : undefined}
        >
          {collapsed ? <span aria-hidden className="h-3.5 w-3.5 rounded-[3px] bg-current" /> : <Wordmark className="text-[20px]" />}
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
                    title={collapsed ? label : undefined}
                    className={cn(
                      "flex h-10 items-center whitespace-nowrap rounded-full text-[15px] font-medium transition-colors",
                      collapsed ? "justify-center" : "gap-3 px-3.5",
                      focus,
                      active ? "bg-hover text-ink" : "text-sub hover:bg-hover/70 hover:text-ink"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className={cn(collapsed && "sr-only")}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
          className={cn(
            "mt-auto flex h-10 items-center whitespace-nowrap rounded-full text-[14px] font-medium text-sub transition-colors hover:bg-hover/70 hover:text-ink",
            collapsed ? "justify-center" : "gap-3 px-3.5",
            focus
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              Collapse
            </>
          )}
        </button>
        <div
          className={cn("mt-3 border-t border-line pt-4 text-[13px] leading-relaxed", collapsed ? "flex justify-center" : "px-3")}
          title={collapsed ? `${farmName} · demo data · updated ${updatedAt}` : undefined}
        >
          <p className="flex items-center gap-2 whitespace-nowrap font-medium text-ink">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px] bg-farmers" />
            <span className={cn(collapsed && "sr-only")}>{farmName}</span>
          </p>
          <p className={cn("text-sub", collapsed && "sr-only")}>Demo data · updated {updatedAt}</p>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur-sm lg:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/overview" className={cn("flex items-center gap-2 rounded-md text-ink", focus)} aria-label="Hedged home">
            <Wordmark className="text-[17px]" />
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
                        "inline-flex h-8 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-medium transition-colors",
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
