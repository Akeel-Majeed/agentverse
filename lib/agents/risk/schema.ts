import { z } from "zod";

/** The judgement Gemini submits through the terminal submit_judgement function. Validated in code. */
export const JudgementSchema = z.object({
  ranked_options: z.array(z.object({
    option_id: z.string().describe("An option id from get_engine_results"),
    rank: z.number().int().describe("1 = best"),
    reason: z.string(),
    cites: z.array(z.string()).describe("Figure ids this reason relies on"),
  })),
  risks: z.array(z.object({ risk_id: z.string(), explanation: z.string(), cites: z.array(z.string()) })),
  change_my_mind: z.array(z.object({ threshold_id: z.string(), statement: z.string() })),
  conflicts: z.array(z.object({
    observation_id: z.string(),
    field_key: z.string(),
    document_value: z.string(),
    profile_value: z.string(),
    explanation: z.string(),
  })),
  hold_for_human: z.boolean(),
  hold_reason: z.string().nullable(),
});
export type Judgement = z.infer<typeof JudgementSchema>;

/** JSON Schema for the function declaration. zod 4 emits "$schema", which the API does not want. */
export const JUDGEMENT_JSON_SCHEMA: Record<string, unknown> = (() => {
  const s = z.toJSONSchema(JudgementSchema) as Record<string, unknown>;
  delete s.$schema;
  return s;
})();
