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

const DESCRIPTION =
  "Headwind brings crop prices, input costs, weather exposure and finance into one farm-specific view, so UK arable farmers and their advisers can compare risks and test the next decision. Explore the demo farm with sample data.";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentverse-green.vercel.app"),
  title: { default: "Headwind · Farm risk for UK arable farms", template: "%s · Headwind" },
  description: DESCRIPTION,
  applicationName: "Headwind",
  openGraph: {
    type: "website",
    siteName: "Headwind",
    title: "Headwind · See what could hit your farm's profit",
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Headwind · See what could hit your farm's profit",
    description: DESCRIPTION,
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [farm, meta, pending] = await Promise.all([getFarm(), getAssessmentMeta(), getPendingChanges()]);
  return (
    <html lang="en-GB">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-white font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-ink px-4 py-3 text-[14px] font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to content
        </a>
        <ApprovalProvider initial={pending} assessedAt={meta.updatedAt}>
          <TopNav farmName={farm.name} />
          {children}
        </ApprovalProvider>
      </body>
    </html>
  );
}
