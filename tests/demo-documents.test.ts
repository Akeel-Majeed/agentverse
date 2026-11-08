import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// DEMO_DOCUMENTS lives in a "use server" module (no const exports), so read the allowlist from source.
const source = readFileSync(path.join(__dirname, "..", "lib", "data.ts"), "utf8");
const block = source.match(/const DEMO_DOCUMENTS = \{([\s\S]*?)\} as const;/)![1];
const entries = Array.from(block.matchAll(/"([^"]+)": "([^"]+)"/g)).map((m) => [m[1], m[2]] as const);

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString() === "%PDF-",
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "text/plain": (b) => !b.includes(0),
};

describe("demo documents", () => {
  it("lists the files", () => expect(entries.length).toBeGreaterThanOrEqual(12));

  it.each(entries)("%s exists, is %s and under 300 KB", (name, type) => {
    const file = path.join(__dirname, "..", "data", "demo", name);
    expect(statSync(file).size).toBeLessThan(300 * 1024);
    expect(MAGIC[type]?.(readFileSync(file))).toBe(true);
  });

  it("every demo button names an allowlisted file", () => {
    const form = readFileSync(path.join(__dirname, "..", "components", "headwind", "document-form.tsx"), "utf8");
    const names = Array.from(form.matchAll(/name: "([^"]+)"/g)).map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(entries.map(([e]) => e)).toContain(n);
  });
});
