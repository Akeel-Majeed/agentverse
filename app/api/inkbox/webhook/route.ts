/**
 * Inkbox webhook for the iMessage chat agent. Verifies the signature, answers 200 at once and
 * does the work after the response (waitUntil), so Inkbox doesn't time out and retry.
 */
import { verifyWebhook, type IMessageWebhookPayload } from "@inkbox/sdk";
import { waitUntil } from "@vercel/functions";
import { handleIMessage, inboundText } from "@/lib/agents/chat/imessage";
import { liveDeps } from "@/lib/agents/chat/inkbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.INKBOX_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 });

  const body = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  if (!verifyWebhook({ payload: body, headers, secret })) return Response.json({ error: "Bad signature" }, { status: 401 });

  let payload: IMessageWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (!inboundText(payload)) return new Response(null, { status: 204 });

  waitUntil(handleIMessage(payload, liveDeps).catch((err) => console.error("[chat] webhook handler crashed", err)));
  return Response.json({ ok: true }, { status: 202 });
}
