import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runPhaseTwo } from "@/lib/agents/risk/run";
import { getAgentStore } from "@/lib/server/agent-store";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
/** Seconds. Argon with medium thinking and 4–6 turns takes 30–90 s; Vercel Hobby caps at 60 s, Pro at 300 s. */
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { runId: string } }) {
  const store = await getAgentStore();
  // Claim before starting: two clicks (or a click and a cron) must not run two judges on one chain.
  const run = await store.claimRun(params.runId);
  if (!run) {
    const existing = await store.getRun(params.runId);
    if (!existing) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({ error: `Run is ${existing.status}, not queued` }, { status: 409 });
  }
  const profile = await (await getStore()).getProfileFields();
  const result = await runPhaseTwo(run.id, { store, profile });
  revalidatePath("/", "layout");
  return NextResponse.json({ runId: run.id, status: result.status });
}
