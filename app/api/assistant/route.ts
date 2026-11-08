/**
 * In-app assistant. GET: the shared conversation (iMessage and app). POST { question }: ask.
 */
import { waitUntil } from "@vercel/functions";
import { ChatUnavailableError, runChatAgent } from "@/lib/agents/chat/agent";
import { nextMemory } from "@/lib/agents/chat/memory";
import { AssistantInputError, AssistantRateLimitError, askFromWeb } from "@/lib/agents/chat/web";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Whether the chat agent can answer on this deployment. */
const available = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const NOT_SET_UP = "The assistant isn't set up on this deployment yet (no Anthropic API key).";

export async function GET() {
  try {
    const turns = await (await getStore()).listChatTurns(30);
    return Response.json({ turns, available: available() });
  } catch (err) {
    console.warn("[assistant] couldn't load the conversation", err);
    return Response.json({ turns: [], available: available() });
  }
}

export async function POST(req: Request) {
  let question = "";
  try {
    const body = (await req.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question : "";
  } catch {
    return Response.json({ error: "Send JSON with a question." }, { status: 400 });
  }
  // Say so before logging anything: a question that can't be answered shouldn't fill the shared history.
  if (!available()) return Response.json({ error: NOT_SET_UP }, { status: 503 });
  const store = await getStore();
  try {
    const turn = await askFromWeb(question, {
      claim: (t) => store.claimChatTurn(t),
      finish: (id, r) => store.finishChatTurn(id, r),
      turns: (n) => store.listChatTurns(n),
      recall: () => store.getChatMemory(),
      answer: (messages, context) => runChatAgent(messages, { context }),
      // After the response: updating the notes is another model call the farmer shouldn't wait for.
      remember: async (previous, exchange) =>
        waitUntil(
          nextMemory(previous, exchange)
            .then((m) => store.saveChatMemory(m))
            .catch((err) => console.warn("[assistant] couldn't update the memory", err))
        ),
    });
    return Response.json({ turn });
  } catch (err) {
    if (err instanceof AssistantInputError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof AssistantRateLimitError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof ChatUnavailableError) {
      return Response.json({ error: NOT_SET_UP }, { status: 503 });
    }
    console.error("[assistant] failed to answer", err);
    return Response.json({ error: "Sorry, something went wrong working that out. Try again in a minute." }, { status: 500 });
  }
}
