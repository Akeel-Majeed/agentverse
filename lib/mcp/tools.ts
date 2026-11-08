import "server-only";
import { getAssessmentMeta, getRisks, getTrace } from "../data";

export async function riskProfileTool() {
  const [meta, risks] = await Promise.all([getAssessmentMeta(), getRisks()]);
  return {
    farm: "Fenland Ridge Farm Ltd (fictional demo farm)",
    runId: meta.runId ?? null,
    headHash: meta.headHash ?? null,
    risks: risks.map((r) => ({ id: r.id, name: r.name, score: r.score, badYear: r.badYear, simulation: r.simulation ?? null })),
    note: "Synthetic farm, real Defra and Bank of England history. Options are for discussion with the farmer, not advice.",
  };
}

export async function covenantViewTool() {
  const trace = await getTrace();
  if (!trace) return { available: false as const, reason: "No run yet" };
  const engine = trace.events.find((e) => e.type === "engine.result");
  if (!engine) return { available: false as const, reason: "Run has no engine result" };
  const { sim } = JSON.parse(engine.body);
  return {
    available: true as const,
    runId: trace.run.id,
    headHash: trace.verify.head,
    chainIntact: trace.verify.ok,
    dscrThreshold: sim.dscr.threshold,
    probabilityBelowThreshold: sim.dscr.pBelow,
    mainDriver: sim.dscr.mainDriver,
    traceUrl: `/trace/${trace.run.id}#dscr.p_below`,
  };
}
