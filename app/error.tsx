"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/headwind/page-header";

/** Shown when a page can't load its data (for example the database is unreachable). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <PageShell>
      <PageHeader
        title="Couldn't load this page"
        subtitle="Hedged couldn't reach the farm's data just now. Nothing has been changed. Try again in a moment."
        meta={error.digest ? `Reference ${error.digest}` : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/overview">Back to the overview</Link>
        </Button>
      </div>
    </PageShell>
  );
}
