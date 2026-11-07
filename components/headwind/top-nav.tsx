"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePendingCount } from "./approvals";

const LINKS = [
  { href: "/overview", label: "Dashboard", match: ["/overview"] },
  { href: "/risks", label: "Risks", match: ["/risks"] },
  { href: "/what-if", label: "Scenarios", match: ["/what-if"] },
  { href: "/calendar", label: "Calendar", match: ["/calendar"] },
  { href: "/actions", label: "Actions", match: ["/actions"], badge: true },
  { href: "/profile", label: "Farm setup", match: ["/profile"] },
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

function AppHeader({ farmName }: { farmName: string }) {
  const pathname = usePathname();
  const pending = usePendingCount();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-10">
        <Logo />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {LINKS.map((link) => {
              const active = isActive(pathname, link.match);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-hover text-ink" : "text-sub hover:text-ink"
                    )}
                  >
                    {link.label}
                    {link.badge ? <PendingBadge count={pending} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <DemoBadge />
          <span className="hidden truncate text-[13px] text-sub xl:inline">{farmName}</span>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" className="relative h-11 w-11 lg:hidden" aria-label={`Menu${pending ? `, ${pending} actions waiting` : ""}`}>
                <Menu aria-hidden />
                {pending ? (
                  <span aria-hidden className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] font-semibold text-white">
                    {pending}
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[min(20rem,88vw)] flex-col gap-0 p-0 sm:max-w-xs">
              <div className="border-b border-line px-5 pb-4 pt-5">
                <SheetTitle className="text-[15px] font-semibold">Menu</SheetTitle>
                <SheetDescription className="mt-1 text-[12.5px] text-sub">{farmName} · sample data</SheetDescription>
              </div>
              <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
                <ul className="flex flex-col gap-0.5">
                  {LINKS.map((link) => {
                    const active = isActive(pathname, link.match);
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex h-11 items-center justify-between gap-2 rounded-lg px-3 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "bg-hover text-ink" : "text-ink hover:bg-hover"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {active ? <span aria-hidden className="h-4 w-0.5 rounded-full bg-ink" /> : <span aria-hidden className="w-0.5" />}
                            {link.label}
                          </span>
                          {link.badge ? <PendingBadge count={pending} /> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 border-t border-line pt-3">
                  <Link
                    href="/"
                    onClick={() => setOpen(false)}
                    className="flex h-11 items-center gap-2 rounded-lg px-3 text-[14px] text-sub hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    About Headwind (home)
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
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

export function TopNav({ farmName }: { farmName: string }) {
  const pathname = usePathname();
  return pathname === "/" ? <PublicHeader /> : <AppHeader farmName={farmName} />;
}
