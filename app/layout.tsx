import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import { ApprovalProvider } from "@/components/headwind/approvals";
import { Assistant } from "@/components/headwind/assistant";
import { NAV_COOKIE } from "@/components/headwind/nav-state";
import { TopNav } from "@/components/headwind/top-nav";
import { getAssessmentMeta, getFarm, getPendingChanges } from "@/lib/data";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

/** Pages read the latest profile and assessment on every request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hedged · Risk intelligence for UK farmers",
  description: "Every risk on one screen, scored in pounds. Demo farm, demo data.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [farm, meta, pending] = await Promise.all([getFarm(), getAssessmentMeta(), getPendingChanges()]);
  const navCollapsed = cookies().get(NAV_COOKIE)?.value === "collapsed";
  return (
    <html lang="en-GB" data-nav={navCollapsed ? "collapsed" : undefined}>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <ApprovalProvider initial={pending}>
          <TopNav farmName={farm.name} updatedAt={meta.updatedAt} initialCollapsed={navCollapsed} />
          <div className="transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:pl-[var(--nav-w)]">{children}</div>
          <Assistant />
        </ApprovalProvider>
      </body>
    </html>
  );
}
