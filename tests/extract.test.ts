import { describe, expect, it } from "vitest";
import { extractWith } from "@/lib/agents/documents/extract";

const fake = (output: unknown) => {
  const requests: Record<string, unknown>[] = [];
  return {
    requests,
    interactions: { async create(req: Record<string, unknown>) { requests.push(req); return { id: "ix-flash-1", status: "completed", output_text: JSON.stringify(output) }; } },
  };
};
const png = { name: "contract.png", data: "aGVsbG8=", mimeType: "image/png" };

describe("extractWith", () => {
  it("returns the text and keeps only fields whose quote is verbatim in the text", async () => {
    const client = fake({
      text: "Quantity: 200 tonnes\nPrice: £185.00 per tonne",
      fields: [
        { key: "sales.wheat_2027_forward_t", value: "200", quote: "Quantity: 200 tonnes" },
        { key: "inputs.n_bought_t", value: "120", quote: "120 tonnes AN" },
      ],
    });
    const r = await extractWith(client, png);
    expect(r.text).toMatch(/200 tonnes/);
    expect(r.fields).toEqual([{ key: "sales.wheat_2027_forward_t", value: "200", quote: "Quantity: 200 tonnes" }]);
    expect(r.interactionId).toBe("ix-flash-1");
    expect(r.model).toBe("gemini-3.8-flash");
  });
  it("sends an image part after the prompt and a document part before it", async () => {
    const client = fake({ text: "", fields: [] });
    await extractWith(client, png);
    const input = client.requests[0].input as { type: string }[];
    expect(input.map((p) => p.type)).toEqual(["text", "image"]);
    await extractWith(client, { ...png, name: "c.pdf", mimeType: "application/pdf" });
    expect((client.requests[1].input as { type: string }[]).map((p) => p.type)).toEqual(["document", "text"]);
    expect((client.requests[1].response_format as { mime_type: string }).mime_type).toBe("application/json");
  });
  it("rejects unknown field keys and unsupported files", async () => {
    await expect(extractWith(fake({ text: "x", fields: [{ key: "not.a.key", value: "1", quote: "x" }] }), png)).rejects.toThrow();
    await expect(extractWith(fake({ text: "", fields: [] }), { ...png, mimeType: "text/csv" })).rejects.toThrow(/Unsupported/);
  });
});
