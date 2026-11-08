import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/headwind/page-header";

export default function NotFound() {
  return (
    <PageShell>
      <PageHeader title="Page not found" subtitle="That page doesn't exist, or the risk it pointed to has moved." />
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/overview">Back to the overview</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/risks">See your risks</Link>
        </Button>
      </div>
    </PageShell>
  );
}
