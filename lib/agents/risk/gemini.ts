/**
 * Gemini client and model ids for the risk agent. Code computes every number; Gemini only reads,
 * ranks and explains. The iMessage chat agent (lib/agents/chat) stays on Claude and is untouched.
 */
import { GoogleGenAI } from "@google/genai";

export const JUDGE_MODEL = () => process.env.RISK_AGENT_MODEL || "gemini-4-argon";

/** Introductory Gemini 4 Argon price (to 30 Nov 2026): $2 per 1M input, $10 per 1M output including thinking. */
export const ARGON_USD_PER_TOKEN = { input: 2 / 1e6, output: 10 / 1e6 };

export interface Usage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_tokens?: number;
}

/** A type alias, not an interface, so it is assignable to the step index signature below (type predicates need that). */
export type FunctionCallStep = {
  type: "function_call";
  id: string;
  name: string;
  arguments?: Record<string, unknown> | string;
};

export interface InteractionLike {
  id: string;
  status: string;
  steps?: Array<{ type: string } & Record<string, unknown>>;
  usage?: Usage;
  output_text?: string | null;
}

/** The slice of the SDK the agent loop uses. Tests pass a fake. SDK 3.0.0 request options take `signal` and `timeout_ms`. */
export interface InteractionsClient {
  interactions: {
    create(req: Record<string, unknown>, options?: { signal?: AbortSignal; timeout_ms?: number }): Promise<InteractionLike>;
  };
}

export function geminiFromEnv(): InteractionsClient | null {
  if (!process.env.GEMINI_API_KEY) return null;
  // @google/genai 3.0.0 defaults to /v1; the Interactions API shapes used here are verified on v1beta.
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } }) as unknown as InteractionsClient;
}

/** Dollars for one interaction's usage at the Argon price. Thought tokens are billed as output. */
export const usageCostUsd = (u: Usage | undefined): number =>
  (u?.total_input_tokens ?? 0) * ARGON_USD_PER_TOKEN.input +
  ((u?.total_output_tokens ?? 0) + (u?.total_thought_tokens ?? 0)) * ARGON_USD_PER_TOKEN.output;
