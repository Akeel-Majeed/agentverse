import type { Metadata } from "next";
import localFont from "next/font/local";
import { ApprovalProvider } from "@/components/headwind/approvals";
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

export const metadata: Metadata = {
  title: "Headwind · Farm risk agent",
  description: "AI risk agent for UK arable farms. Demo data.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [farm, meta, pending] = await Promise.all([getFarm(), getAssessmentMeta(), getPendingChanges()]);
  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}>
        <ApprovalProvider initial={pending}>
          <TopNav farmName={farm.name} updatedAt={meta.updatedAt} />
          <div className="lg:pl-[264px]">{children}</div>
        </ApprovalProvider>
      </body>
    </html>
  );
}
