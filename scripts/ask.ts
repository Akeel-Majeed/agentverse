/**
 * Talk to the chat agent from the terminal, without iMessage.
 *   bun run ask "What's my biggest risk?"
 *   bun run ask --eval            run tests/chat-questions.json and report pass/fail
 * Needs ANTHROPIC_API_KEY. Uses Supabase if configured, otherwise the demo data.
 */
import { readFileSync } from "node:fs";
import { runChatAgent, CHAT_MODEL, type ChatResult } from "../lib/agents/chat/agent";
import { extractFigures } from "../lib/agents/checker";

interface Case {
  id: string;
  question: string;
  kind?: "answer" | "refuse";
  figures?: string[];
  text?: string[];
  /** Most figures the reply may give (0 for small talk). */
  maxFigures?: number;
  /** Longest reply allowed, in characters. */
  maxChars?: number;
}

/** iMessage replies should be short unless the farmer asks for detail. */
const DEFAULT_MAX_CHARS = 400;

const keysOf = (s: string) => new Set(extractFigures(s).map((f) => f.key));
const REFUSAL = /can't|cannot|can not|not able|unable|don't have|do not have|won't|only the farmer|Farm setup/i;

function grade(c: Case, r: ChatResult) {
  const have = keysOf(r.text);
  const missingFigures = (c.figures ?? []).filter((f) => !extractFigures(f).every((x) => have.has(x.key)));
  const missingText = (c.text ?? []).filter((t) => !r.text.toLowerCase().includes(t.toLowerCase()));
  const refused = c.kind !== "refuse" || REFUSAL.test(r.text);
  const tooLong = r.text.length > (c.maxChars ?? DEFAULT_MAX_CHARS);
  const tooManyFigures = c.maxFigures !== undefined && r.check.figures.length > c.maxFigures;
  const pass = !missingFigures.length && !missingText.length && refused && !tooLong && !tooManyFigures && !r.check.untraced.length && !r.check.blocked;
  return { pass, missingFigures, missingText, refused, tooLong, tooManyFigures };
}

function show(r: ChatResult) {
  console.log(`\n${r.text}\n`);
  console.log(`tools: ${r.calls.map((c) => `${c.name}(${JSON.stringify(c.input)})`).join(", ") || "none"}`);
  console.log(
    `figure check: ${r.check.flagged.length ? `caught ${r.check.flagged.join(", ")}, rewritten` : "all figures traced"}${r.check.untraced.length ? `; still untraced: ${r.check.untraced.join(", ")}` : ""}${r.check.blocked ? "; reply held back" : ""}`
  );
  console.log(`model: ${r.model}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--eval") {
    const question = args.join(" ").trim();
    if (!question) throw new Error('Usage: bun run ask "your question"  |  bun run ask --eval');
    show(await runChatAgent([{ role: "user", content: question }]));
    return;
  }

  const { cases } = JSON.parse(readFileSync("tests/chat-questions.json", "utf8")) as { cases: Case[] };
  const only = args[1];
  const rows = [];
  for (const c of cases.filter((x) => !only || x.id === only)) {
    const started = Date.now();
    try {
      const r = await runChatAgent([{ role: "user", content: c.question }]);
      const g = grade(c, r);
      rows.push({ id: c.id, ...g, checker: r.check.flagged.length > 0, ms: Date.now() - started });
      console.log(`${g.pass ? "PASS" : "FAIL"}  ${c.id}  (${((Date.now() - started) / 1000).toFixed(1)}s)${r.check.flagged.length ? `  checker caught ${r.check.flagged.join(", ")}` : ""}`);
      if (!g.pass) {
        console.log(`      reply: ${r.text.replace(/\n/g, " ")}`);
        if (g.missingFigures.length) console.log(`      missing figures: ${g.missingFigures.join(", ")}`);
        if (g.missingText.length) console.log(`      missing text: ${g.missingText.join(", ")}`);
        if (!g.refused) console.log("      did not refuse");
        if (g.tooLong) console.log(`      too long: ${r.text.length} characters (max ${c.maxChars ?? DEFAULT_MAX_CHARS})`);
        if (g.tooManyFigures) console.log(`      unprompted figures: ${r.check.figures.join(", ")}`);
        if (r.check.untraced.length) console.log(`      untraced figures: ${r.check.untraced.join(", ")}`);
      }
    } catch (err) {
      rows.push({ id: c.id, pass: false, checker: false, ms: Date.now() - started });
      console.log(`ERROR ${c.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  const passed = rows.filter((r) => r.pass).length;
  const fired = rows.filter((r) => r.checker).length;
  console.log(`\n${passed}/${rows.length} passed · checker fired on ${fired} · model ${CHAT_MODEL()} · median ${(rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)] / 1000).toFixed(1)}s`);
  if (passed < rows.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
