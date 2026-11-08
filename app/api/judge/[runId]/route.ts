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
  const run = await store.getRun(params.runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  if (run.status !== "queued") return NextResponse.json({ error: `Run is ${run.status}, not queued` }, { status: 409 });
  const profile = await (await getStore()).getProfileFields();
  const result = await runPhaseTwo(run.id, { store, profile });
  revalidatePath("/", "layout");
  return NextResponse.json({ runId: run.id, status: result.status });
}
