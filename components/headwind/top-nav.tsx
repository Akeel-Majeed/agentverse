"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CalendarDays, Info, LayoutDashboard, ListChecks, Menu, SlidersHorizontal, Tractor, TriangleAlert, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePendingCount } from "./approvals";

const LINKS = [
  { href: "/overview", label: "Dashboard", match: ["/overview"], icon: LayoutDashboard },
  { href: "/risks", label: "Risks", match: ["/risks"], icon: TriangleAlert },
  { href: "/what-if", label: "Scenarios", match: ["/what-if"], icon: SlidersHorizontal },
  { href: "/calendar", label: "Calendar", match: ["/calendar"], icon: CalendarDays },
  { href: "/actions", label: "Actions", match: ["/actions"], icon: ListChecks, badge: true },
  { href: "/profile", label: "Farm setup", match: ["/profile"], icon: Tractor },
];

const isActive = (pathname: string, match: string[]) => match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

function Logo({ href = "/", label = "Headwind home" }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-white">
        <Wind className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="text-[16px] font-bold tracking-tight max-[359px]:sr-only">Headwind</span>
    </Link>
  );
}

/** Persistent, non-interactive demo status. Only a real data source and update mechanism could justify "Live". */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1 text-[12px] font-medium leading-none text-[#92400E]",
        className
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
      Demo farm — sample data
    </span>
  );
}

function PendingBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-ink px-1.5 font-mono text-[11px] font-semibold text-white tabular",
        className
      )}
    >
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

function NavLinks({ pending, onNavigate }: { pending: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.match);
        const Icon = link.icon;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:h-11 max-lg:text-[15px]",
                active ? "bg-hover text-ink" : "text-sub hover:bg-hover hover:text-ink"
              )}
            >
              <Icon aria-hidden className={cn("h-[18px] w-[18px] shrink-0", active ? "text-ink" : "text-sub")} strokeWidth={2} />
              <span className="flex-1 truncate">{link.label}</span>
              {link.badge ? <PendingBadge count={pending} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function AboutLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-[13.5px] text-sub hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:h-11"
    >
      <Info aria-hidden className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      About Headwind
    </Link>
  );
}

/** Desktop: fixed left sidebar. Mobile and tablet: slim top bar whose menu opens the same links in a left drawer. */
function AppNav({ farmName }: { farmName: string }) {
  const pathname = usePathname();
  const pending = usePendingCount();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-14 shrink-0 items-center px-4">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks pending={pending} />
        </nav>
        <div className="flex shrink-0 flex-col gap-3 border-t border-line px-3 py-3">
          <AboutLink />
          <div className="flex flex-col gap-2 px-3 pb-1">
            <span className="truncate text-[13px] font-medium text-ink" title={farmName}>
              {farmName}
            </span>
            <DemoBadge className="self-start" />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b border-line bg-white lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" className="relative h-11 w-11" aria-label={`Menu${pending ? `, ${pending} actions waiting` : ""}`}>
                <Menu aria-hidden />
                {pending ? (
                  <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] font-semibold text-white">
                    {pending}
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[min(17rem,85vw)] flex-col gap-0 bg-panel p-0 sm:max-w-xs">
              <div className="border-b border-line px-5 pb-4 pt-5">
                <SheetTitle className="text-[15px] font-semibold">Menu</SheetTitle>
                <SheetDescription className="mt-1 text-[12.5px] text-sub">{farmName} · sample data</SheetDescription>
              </div>
              <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
                <NavLinks pending={pending} onNavigate={() => setOpen(false)} />
              </nav>
              <div className="border-t border-line px-3 py-3">
                <AboutLink onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Logo />
          <DemoBadge className="ml-auto" />
        </div>
      </header>
    </>
  );
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-auto">
          <ul className="flex items-center gap-1">
            <li className="hidden md:block">
              <a href="#how-it-works" className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-sub hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                How it works
              </a>
            </li>
            <li className="hidden md:block">
              <a href="#explore" className="inline-flex h-9 items-center rounded-lg px-3 text-[13.5px] font-medium text-sub hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                What you can explore
              </a>
            </li>
            <li className="ml-1">
              <Button asChild>
                <Link href="/overview">
                  Open demo <ArrowRight aria-hidden />
                </Link>
              </Button>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

/**
 * Site chrome. The public landing page keeps a top header; the app pages get a left sidebar
 * (top bar + drawer below the lg breakpoint) and their content is offset to clear it.
 */
export function AppShell({ farmName, children }: { farmName: string; children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") {
    return (
      <>
        <PublicHeader />
        {children}
      </>
    );
  }
  return (
    <>
      <AppNav farmName={farmName} />
      <div data-app-content className="lg:pl-60">
        {children}
      </div>
    </>
  );
}
