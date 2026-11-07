"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wind } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/overview", label: "Overview", match: "/overview" },
  { href: "/risks/wheat-price", label: "Risks", match: "/risks" },
  { href: "/what-if", label: "What-if", match: "/what-if" },
  { href: "/calendar", label: "Calendar", match: "/calendar" },
  { href: "/profile", label: "Profile", match: "/profile" },
];

export function TopNav({ farmName, updatedAt }: { farmName: string; updatedAt: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 lg:px-10">
        <Link
          href="/overview"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Headwind home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-white">
            <Wind className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-[16px] font-bold tracking-tight">Headwind</span>
        </Link>
        <nav aria-label="Main" className="order-3 w-full md:order-none md:w-auto">
          <ul className="flex flex-wrap items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.match);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded-lg px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-hover text-ink" : "text-sub hover:text-ink"
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.06em] text-sub sm:inline-flex">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#16A34A]" />
            Live · Updated {updatedAt}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-[13px] font-medium">
            {farmName}
          </span>
        </div>
      </div>
    </header>
  );
}
