import type { SimResult } from "../../engine/types";
import { fieldDef } from "../../profile/catalogue";
import { checkFiguresStrict } from "../checker";
import type { Judgement } from "./schema";

/** Fields that hold ids, checked against the engine and this run's documents instead of as prose. */
const ID_KEYS = new Set(["option_id", "risk_id", "threshold_id", "cites", "observation_id", "field_key"]);

/** Every string in the judgement outside the id fields, so a new prose field is checked by default. */
const prose = (v: unknown): string[] =>
  typeof v === "string" ? [v]
  : Array.isArray(v) ? v.flatMap(prose)
  : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => (ID_KEYS.has(k) ? [] : prose(x)))
  : [];

/**
 * Hard block: every number in the judgement's prose must appear, written the same way, in a function
 * result (strict checker), and every id it uses must exist in this run. Untraced or unknown → blocked.
 */
export function verifyOutput(out: Judgement, toolOutputs: string[], sim: SimResult, documentIds: string[]) {
  const check = checkFiguresStrict(prose(out).join("\n"), toolOutputs);
  const options = new Set(sim.options.map((o) => o.id as string));
  const risks = new Set(sim.risks.map((r) => r.riskId as string));
  const thresholds = new Set(sim.thresholds.map((t) => t.id));
  const docs = new Set(documentIds);
  const unknown = [
    ...out.ranked_options.flatMap((o) => [...(options.has(o.option_id) ? [] : [o.option_id]), ...o.cites.filter((c) => !sim.figures[c])]),
    ...out.risks.flatMap((r) => [...(risks.has(r.risk_id) ? [] : [r.risk_id]), ...r.cites.filter((c) => !sim.figures[c])]),
    ...out.change_my_mind.filter((c) => !thresholds.has(c.threshold_id)).map((c) => c.threshold_id),
    ...out.conflicts.flatMap((c) => [...(docs.has(c.observation_id) ? [] : [c.observation_id]), ...(fieldDef(c.field_key) ? [] : [c.field_key])]),
  ].map((id) => `unknown id: ${id}`);
  return { figures: check.figures, untraced: [...check.untraced, ...unknown] };
}
