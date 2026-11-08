import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { changeRef, confirmationGate, isPlainYes, type ConfirmAsk } from "@/lib/agents/chat/confirm";
import { createTools, type ToolCall } from "@/lib/agents/chat/tools";
import { getStore } from "@/lib/server/store";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, set: () => undefined }) }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

type Msg = Anthropic.Beta.BetaMessageParam;
const KEY = "sales.wheat_2026_unsold_t";

async function tool(
  name: string,
  input: Record<string, unknown>,
  messages: Msg[] = [],
  channel: "web" | "imessage" = "web",
  confirmAsk: ConfirmAsk | null = null
) {
  const calls: ToolCall[] = [];
  const t = createTools(calls, { channel, messages, confirmAsk }).find((x) => x.name === name)!;
  return JSON.parse((await t.run(input as never)) as string);
}
const wheatUnsold = async () => (await (await getStore()).getProfileFields()).find((f) => f.key === KEY)?.value;
const pending = async (ref: string) => (await (await getStore()).getPendingChanges()).find((p) => changeRef(p.id) === ref);

describe("plain yes", () => {
  it.each(["yes", "Yes!", "YES please", "ok", "yep 👍", "confirm", "go ahead", "that's right", "yes do it"])("accepts %j", (t) => {
    expect(isPlainYes(t)).toBe(true);
  });
  it.each(["no", "yes but make it 900", "yesterday", "ok?? wait", "not yet", "yes 3F9A2C and also change the loan", ""])("refuses %j", (t) => {
    expect(isPlainYes(t)).toBe(false);
  });
});

describe("confirmation gate", () => {
  const change = { ref: "ABC123", field: "2026 wheat unsold in store", from: "1,028 t", to: "828 t" };
  const shown: Msg[] = [
    { role: "user", content: "I sold 200 t of wheat" },
    { role: "assistant", content: "Change 2026 wheat unsold in store from 1,028 t to 828 t? Reply yes to confirm (ref ABC123)." },
    { role: "user", content: "yeah go for it" },
  ];
  const jev = (confirms: number, injection = 0.01) => vi.fn(async (_state: string) => ({ confirms, injection }));

  it("accepts a reply in the farmer's own words when Jev is confident", async () => {
    const ask = jev(0.93);
    expect(await confirmationGate(shown, change, ask)).toMatchObject({ ok: true, method: "jev", confirms: 0.93 });
    // Jev reads the exact change and the reply.
    expect(ask.mock.calls[0][0]).toContain("from 1,028 t to 828 t (ref ABC123)");
    expect(ask.mock.calls[0][0]).toContain("FARMER'S REPLY: yeah go for it");
  });

  it("refuses when Jev isn't confident, with its probability", async () => {
    const r = await confirmationGate(shown, change, jev(0.41));
    expect(r).toMatchObject({ ok: false, method: "jev", confirms: 0.41 });
  });

  it("refuses a confident 'confirmation' that looks like an injection", async () => {
    expect(await confirmationGate(shown, change, jev(0.95, 0.88))).toMatchObject({ ok: false, injection: 0.88 });
  });

  it("falls back to a plain yes when Jev fails", async () => {
    const failing = vi.fn(async () => Promise.reject(new Error("Jev HTTP 503")));
    expect(await confirmationGate(shown, change, failing)).toMatchObject({ ok: false, method: "plain_yes" });
    const yes = [...shown.slice(0, 2), { role: "user", content: "yes" } as Msg];
    expect(await confirmationGate(yes, change, failing)).toMatchObject({ ok: true, method: "plain_yes" });
  });

  it("uses the plain-yes check without a Jev key", async () => {
    expect((await confirmationGate([...shown.slice(0, 2), { role: "user", content: "yes" }], change, null)).ok).toBe(true);
    expect((await confirmationGate([...shown.slice(0, 2), { role: "user", content: "yes but 900" }], change, null)).ok).toBe(false);
  });

  it("refuses a change that wasn't in the message the farmer replied to, without asking Jev", async () => {
    const ask = jev(0.99);
    const later: Msg[] = [...shown.slice(0, 2), { role: "user", content: "and barley?" }, { role: "assistant", content: "No barley in store." }, { role: "user", content: "yes" }];
    expect((await confirmationGate(later, change, ask)).ok).toBe(false);
    expect((await confirmationGate(shown, { ...change, ref: "ZZZ999" }, ask)).ok).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("doesn't count a ref the farmer typed themselves", async () => {
    expect((await confirmationGate([{ role: "user", content: "ref ABC123" }, { role: "user", content: "yes" }], change, jev(0.99))).ok).toBe(false);
  });
});

describe("profile changes through chat", () => {
  it("proposes without changing anything, and lists the change in the approval queue", async () => {
    const out = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t to the merchant" });
    expect(out).toMatchObject({ proposed: true, from: "1,028 t", to: "828 t" });
    expect(out.tell_the_farmer).toContain(out.ref);
    expect(await wheatUnsold()).toBe(1028);
    expect(await pending(out.ref)).toMatchObject({ status: "pending", source: "chat", fieldKey: KEY });
    const queue = await tool("get_pending_changes", {});
    expect(queue.map((q: { ref: string }) => q.ref)).toContain(out.ref);
  });

  it("refuses to confirm in the same turn it proposed", async () => {
    const msgs: Msg[] = [{ role: "user", content: "I've sold 200 t, so 828 t left" }];
    const { ref } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" }, msgs);
    const out = await tool("confirm_profile_change", { ref }, msgs);
    expect(out).toMatchObject({ applied: false, control: "confirmation required" });
    expect(await wheatUnsold()).toBe(1028);
  });

  it("applies the change after the farmer's yes to the change they were shown", async () => {
    const { ref, tell_the_farmer } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" });
    const msgs: Msg[] = [
      { role: "user", content: "Sold 200 t of wheat today" },
      { role: "assistant", content: tell_the_farmer },
      { role: "user", content: "Yes" },
    ];
    const out = await tool("confirm_profile_change", { ref }, msgs);
    expect(out).toMatchObject({ applied: true, now: "828 t", was: "1,028 t" });
    expect(await wheatUnsold()).toBe(828);
    expect((await pending(ref))?.status).toBe("approved");
  });

  it("applies a change confirmed in the farmer's own words when Jev agrees, and records the check", async () => {
    const { ref, tell_the_farmer } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" });
    const msgs: Msg[] = [
      { role: "user", content: "Sold 200 t of wheat today" },
      { role: "assistant", content: tell_the_farmer },
      { role: "user", content: "spot on, go ahead" },
    ];
    const out = await tool("confirm_profile_change", { ref }, msgs, "web", async () => ({ confirms: 0.91, injection: 0.02 }));
    expect(out).toMatchObject({ applied: true, checked: { method: "jev", jev_confirms: 0.91 } });
    expect(await wheatUnsold()).toBe(828);
  });

  it("keeps the value when Jev isn't sure the farmer agreed", async () => {
    const { ref, tell_the_farmer } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" });
    const msgs: Msg[] = [{ role: "assistant", content: tell_the_farmer }, { role: "user", content: "hmm not sure, maybe" }];
    const out = await tool("confirm_profile_change", { ref }, msgs, "web", async () => ({ confirms: 0.12, injection: 0.01 }));
    expect(out).toMatchObject({ applied: false, control: "confirmation required", checked: { jev_confirms: 0.12 } });
    expect(await wheatUnsold()).toBe(1028);
  });

  it("refuses a yes when the change was never shown", async () => {
    const { ref } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" });
    const out = await tool("confirm_profile_change", { ref }, [{ role: "assistant", content: "Anything else?" }, { role: "user", content: "yes" }]);
    expect(out.applied).toBe(false);
    expect(await wheatUnsold()).toBe(1028);
  });

  it("cancels a change and keeps the current value", async () => {
    const { ref } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" });
    expect(await tool("cancel_profile_change", { ref })).toMatchObject({ cancelled: true, kept: "1,028 t" });
    expect((await pending(ref))?.status).toBe("rejected");
    expect(await wheatUnsold()).toBe(1028);
  });

  it("rejects unknown fields, unreadable values and no-op changes", async () => {
    expect((await tool("propose_profile_change", { field_key: "sales.nope", value: "1", reason: "" })).proposed).toBe(false);
    expect((await tool("propose_profile_change", { field_key: KEY, value: "lots", reason: "" })).proposed).toBe(false);
    expect((await tool("propose_profile_change", { field_key: KEY, value: "1028", reason: "" })).proposed).toBe(false);
  });

  it("caps open chat proposals so the queue can't be flooded", async () => {
    // The demo queue already holds one iMessage change; two more reach the cap of three.
    for (const v of ["900", "800"]) expect((await tool("propose_profile_change", { field_key: KEY, value: v, reason: "" })).proposed).toBe(true);
    const out = await tool("propose_profile_change", { field_key: KEY, value: "700", reason: "" });
    expect(out.proposed).toBe(false);
    expect(out.error).toMatch(/already 3 changes waiting/);
  });

  it("labels iMessage proposals as iMessage", async () => {
    const { ref } = await tool("propose_profile_change", { field_key: KEY, value: "828", reason: "Sold 200 t" }, [], "imessage");
    expect((await pending(ref))?.source).toBe("imessage");
  });

  it("gives field keys in get_profile so the agent can propose", async () => {
    const [sales] = await tool("get_profile", { section: "sales" });
    expect(sales.fields.map((f: { key: string }) => f.key)).toContain(KEY);
  });
});
