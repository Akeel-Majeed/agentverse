/**
 * One-off setup for the iMessage chat agent on Inkbox:
 *   bun run inkbox:setup https://your-app.vercel.app
 * Creates (or reuses) the agent identity with iMessage switched on, subscribes the app's webhook
 * to inbound iMessages, rotates the webhook signing key and prints how a person connects.
 * Needs INKBOX_API_KEY. Prints the signing key once: put it in INKBOX_WEBHOOK_SECRET.
 */
import { Inkbox, InkboxAPIError, type AgentIdentity } from "@inkbox/sdk";

const base = process.argv[2]?.replace(/\/+$/, "");
if (!base || !/^https:\/\//.test(base)) {
  console.error("Usage: bun run inkbox:setup https://your-app.example.com");
  process.exit(1);
}
const handle = process.env.INKBOX_AGENT_HANDLE || "fenland-ridge-risk";
const url = `${base}/api/inkbox/webhook`;
const inkbox = new Inkbox();

async function main() {
  let identity: AgentIdentity;
  try {
    identity = await inkbox.getIdentity(handle);
    console.log(`Using identity @${handle}`);
  } catch (err) {
    if (!(err instanceof InkboxAPIError) || err.statusCode !== 404) throw err;
    identity = await inkbox.createIdentity(handle, { displayName: "Fenland Ridge risk assistant", imessageEnabled: true });
    console.log(`Created identity @${handle}`);
  }
  if (!identity.imessageEnabled) {
    await identity.update({ imessageEnabled: true });
    console.log("Switched iMessage on");
  }

  const existing = await inkbox.webhooks.subscriptions.list({ agentIdentityId: identity.id, url, eventType: "imessage.received" });
  if (existing.length) console.log(`Webhook already subscribed: ${url}`);
  else {
    await inkbox.webhooks.subscriptions.create({ agentIdentityId: identity.id, url, eventTypes: ["imessage.received"] });
    console.log(`Subscribed ${url} to imessage.received`);
  }

  const key = await inkbox.signingKeys.createOrRotate(handle);
  const router = await inkbox.imessages.getTriageNumber();

  console.log(`
  Signing key (shown once; any earlier key stops working):
    INKBOX_WEBHOOK_SECRET=${key.signingKey}

  Set it, INKBOX_API_KEY, INKBOX_AGENT_HANDLE=${handle}, ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the
  app's environment and redeploy. Then, from your phone, iMessage ${router.number} with:
    ${router.connectCommand}
  and ask a question, e.g. "What's my biggest risk?"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
