/**
 * Local runner: phase 1 then phase 2 against the memory store, with real Gemini calls.
 *   bun run agent:demo                                              numbers + judgement
 *   bun run agent:demo --doc data/demo/fertiliser-contract.txt      text document → Jev → judge
 *   bun run agent:demo --file data/demo/forward-contract.png        photo or PDF → Gemini 3.8 Flash → Jev → judge
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { extractorFromEnv } from "../lib/agents/documents/extract";
import { runPhaseTwo } from "../lib/agents/risk/run";
import { runPhaseOne } from "../lib/assess/phase-one";
import { createMemoryAgentStore } from "../lib/server/agent-store";
import { jevFromEnv } from "../lib/screen/screen";
import { verifyChain } from "../lib/trace/chain";
import * as demo from "../lib/profile/fenland-ridge";

const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : undefined; };
const MIME: Record<string, string> = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const docPath = arg("--doc");
const filePath = arg("--file");
const document = docPath
  ? { name: docPath.split("/").pop()!, text: readFileSync(docPath, "utf8") }
  : filePath
    ? { name: filePath.split("/").pop()!, file: { data: readFileSync(filePath).toString("base64"), mimeType: MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream" } }
    : undefined;

async function main() {
  const store = createMemoryAgentStore(async (p) => console.log("PROPOSAL →", p));
  const t0 = performance.now();
  const one = await runPhaseOne({
    store, farmId: demo.FARM_ID, trigger: document ? "document" : "demo", fields: demo.profileFields, market: demo.market, now: new Date(),
    document, jev: jevFromEnv(), extract: extractorFromEnv(), geminiAvailable: Boolean(process.env.GEMINI_API_KEY),
  });
  console.log(`phase 1: ${Math.round(performance.now() - t0)} ms, status ${one.run.status}`, one.run.timings);
  if (one.run.status === "queued") {
    const t1 = performance.now();
    const two = await runPhaseTwo(one.run.id, { store, profile: demo.profileFields });
    console.log(`phase 2: ${Math.round(performance.now() - t1)} ms, status ${two.status}`);
    console.log(JSON.stringify(two.output, null, 2));
  }
  const run = await store.getRun(one.run.id);
  console.log("run:", { status: run?.status, cost: run?.totalCostUsd, turns: run?.turns, timings: run?.timings, error: run?.error });
  console.log("chain:", verifyChain(await store.getEvents(one.run.id)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
