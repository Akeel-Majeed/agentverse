/**
 * Phase 1: gather → read → screen → compute → publish numbers. Pure code, about 2 s, plus two
 * bounded model calls on a new document: Gemini 3.8 Flash reads a PDF or photo into text and
 * fields with verbatim quotes, and Jev screens the text. Queues phase 2 (Gemini 4 Argon) when allowed.
 */
import type { ExtractDocument, ExtractedField } from "../agents/documents/extract";
import { farmFromProfile } from "../engine/farm";
import { loadHistory } from "../engine/history";
import { configHash, simulate } from "../engine/simulate";
import { DEFAULT_CONFIG, ENGINE_VERSION, type SimResult } from "../engine/types";
import type { AgentStore } from "../server/agent-store";
import { screenNumber, screenText, type JevAsk, type ScreenResult } from "../screen/screen";
import { canonical, sha256, TraceWriter } from "../trace/chain";
import type { AgentRun, EngineResultEvent } from "../trace/types";
import type { MarketBaseline, ProfileFieldValue } from "../types";
import { valuesOf } from "../profile/risk-profile";

export interface PhaseOneInput {
  store: AgentStore;
  farmId: string;
  trigger: AgentRun["trigger"];
  fields: ProfileFieldValue[];
  market: MarketBaseline;
  now: Date;
  /** A pasted text, or an uploaded PDF or photo (base64). */
  document?: { name: string; text?: string; file?: { data: string; mimeType: string } };
  jev: JevAsk | null;
  /** Gemini 3.8 Flash reader (lib/agents/documents/extract.ts), or null without a key. */
  extract: ExtractDocument | null;
  /** GEMINI_API_KEY present: phase 2 may be queued. */
  geminiAvailable: boolean;
}

export async function runPhaseOne(input: PhaseOneInput): Promise<{ run: AgentRun; sim: SimResult; headHash: string }> {
  const { store } = input;
  const asOf = input.now.toISOString().slice(0, 10);
  const controls = await store.getControls();
  const run = await store.createRun({ farmId: input.farmId, trigger: input.trigger, asOf, seed: DEFAULT_CONFIG.seed, engineVersion: ENGINE_VERSION, configHash: configHash(DEFAULT_CONFIG) });
  const trace = new TraceWriter(run.id, store);
  const timings: Record<string, number> = {};
  const lap = (k: string, t0: number) => (timings[k] = Math.round(performance.now() - t0));
  await trace.append("run.start", "code", { trigger: input.trigger, asOf, controls });

  // 1 Gather
  let t0 = performance.now();
  const history = loadHistory();
  const observe = async (o: Parameters<AgentStore["insertObservation"]>[0]) => {
    const obs = await store.insertObservation(o);
    await trace.append("observation", "code", { id: obs.id, kind: obs.kind, source: obs.source, url: obs.url, sha256: obs.sha256, screenStatus: obs.screenStatus });
    return obs;
  };
  const base = { runId: run.id, farmId: input.farmId, fetchedAt: input.now.toISOString(), screen: null };
  const ids: string[] = [];
  const profileValue = valuesOf(input.fields);
  ids.push((await observe({ ...base, kind: "profile", source: "profile_fields", url: null, value: profileValue, sha256: sha256(canonical(profileValue)), screenStatus: "passed" })).id);
  for (const s of Object.values(history)) {
    ids.push((await observe({ ...base, kind: "market", source: s.source, url: s.url, value: { id: s.id, last: s.points.at(-1), n: s.points.length }, sha256: s.sha256, screenStatus: "passed" })).id);
  }
  lap("gather", t0);

  // 2 Read (Gemini 3.8 Flash, only for an uploaded file) and screen
  t0 = performance.now();
  let held = false;
  const wheat = input.market.wheat_feed_gbp_t?.value;
  if (wheat) {
    const recent = history.wheat.points.slice(-13).map((p) => p.value);
    const scaled = recent.map((v) => (v * wheat) / recent.at(-1)!);
    const check = screenNumber(wheat, scaled.slice(0, -1), controls.zThreshold);
    await trace.append("screen.number", "code", { metric: "wheat_feed_gbp_t", ...check });
    if (check.status !== "passed") held = true; // |z| over the threshold: the farmer checks the figure
  }
  if (input.document) {
    const doc = input.document;
    const fileSha = doc.file ? sha256(doc.file.data) : null;
    let text: string | null = doc.text ?? null;
    let fields: ExtractedField[] = [];
    let readerNote = "Document reader unavailable (GEMINI_API_KEY not set): held for the farmer";
    if (doc.file && input.extract) {
      const tRead = performance.now();
      try {
        const ex = await input.extract({ name: doc.name, data: doc.file.data, mimeType: doc.file.mimeType });
        text = ex.text;
        fields = ex.fields;
        await trace.append("extract.result", "gemini", { model: ex.model, interactionId: ex.interactionId, fields, textSha256: sha256(text), fileSha256: fileSha });
      } catch (e) {
        readerNote = `Document reader unavailable: ${e instanceof Error ? e.message : String(e)}: held for the farmer`;
        await trace.append("extract.error", "code", { fileSha256: fileSha, error: readerNote });
      }
      lap("read", tRead);
    }
    // No text to screen (a file but no reader, or the read failed): fail closed, the farmer decides.
    // Otherwise one Jev call screens everything the judge can read: the file name (from the client),
    // the text, and the field values Flash extracted. Any of them can quarantine the document.
    const result: ScreenResult = text === null
      ? { status: "review", checks: [{ name: "reader", actor: "code", value: NaN, threshold: 0, fired: true, note: readerNote }] }
      : await screenText([doc.name, text, ...fields.map((f) => `${f.key}: ${f.value}`)].join("\n"), { threshold: controls.jevThreshold, ask: input.jev });
    const obs = await observe({
      ...base, kind: "document", source: doc.name, url: null,
      value: { name: doc.name, mimeType: doc.file?.mimeType ?? "text/plain", text, fields },
      sha256: fileSha ?? sha256(text ?? ""), screenStatus: result.status, screen: result.checks,
    });
    await trace.append("screen.text", text === null ? "code" : "jev", { observationId: obs.id, ...result });
    if (result.status === "passed") ids.push(obs.id);
    else held = true;
  }
  lap("screen", t0);

  // 3 Compute
  t0 = performance.now();
  const { farm, missing } = farmFromProfile(profileValue, input.market);
  const sim = simulate(history, farm, asOf, DEFAULT_CONFIG);
  lap("compute", t0);
  const engineEvent: EngineResultEvent = { sim, observationIds: ids };
  await trace.append("engine.result", "code", { ...engineEvent, missing });

  // 4 Publish numbers and decide on phase 2
  const status: AgentRun["status"] = held ? "held" : controls.paused || !input.geminiAvailable ? "numbers_only" : "queued";
  await trace.append("run.numbers_published", "code", { status, timings });
  await store.updateRun(run.id, { status, timings });
  return { run: { ...run, status, timings }, sim, headHash: trace.head() };
}
