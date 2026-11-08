/**
 * In-app assistant. GET: the shared conversation (iMessage and app). POST { question }: ask.
 */
import { ChatUnavailableError, runChatAgent } from "@/lib/agents/chat/agent";
import { AssistantInputError, AssistantRateLimitError, askFromWeb } from "@/lib/agents/chat/web";
import { getStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const turns = await (await getStore()).listChatTurns(30);
    return Response.json({ turns });
  } catch (err) {
    console.warn("[assistant] couldn't load the conversation", err);
    return Response.json({ turns: [] });
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
  const store = await getStore();
  try {
    const turn = await askFromWeb(question, {
      claim: (t) => store.claimChatTurn(t),
      finish: (id, r) => store.finishChatTurn(id, r),
      turns: (n) => store.listChatTurns(n),
      answer: (messages) => runChatAgent(messages),
    });
    return Response.json({ turn });
  } catch (err) {
    if (err instanceof AssistantInputError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof AssistantRateLimitError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof ChatUnavailableError) {
      return Response.json({ error: "The assistant isn't set up on this deployment yet (no Anthropic API key)." }, { status: 503 });
    }
    console.error("[assistant] failed to answer", err);
    return Response.json({ error: "Sorry, something went wrong working that out. Try again in a minute." }, { status: 500 });
  }
}
