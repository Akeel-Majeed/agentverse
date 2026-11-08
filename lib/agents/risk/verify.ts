import { checkFigures } from "../checker";
import type { Judgement } from "./schema";

/** Every number in the judgement's prose must appear in a function result. Hard block: untraced → blocked. */
export function verifyOutput(out: Judgement, toolOutputs: string[]) {
  const prose = [
    ...out.ranked_options.map((o) => o.reason),
    ...out.risks.map((r) => r.explanation),
    ...out.change_my_mind.map((c) => c.statement),
    ...out.conflicts.map((c) => c.explanation),
    out.hold_reason ?? "",
  ].join("\n");
  return checkFigures(prose, toolOutputs);
}
