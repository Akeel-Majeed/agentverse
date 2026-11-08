import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { config, middleware } from "@/middleware";

const req = (auth?: string) => new NextRequest("http://localhost/overview", { headers: auth ? { authorization: auth } : {} });
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("optional demo password", () => {
  afterEach(() => {
    delete process.env.HEDGED_PASSWORD;
  });

  it("lets everything through when no password is set", () => {
    expect(middleware(req()).status).toBe(200);
  });

  it("asks for the password when one is set, and accepts it with any username", () => {
    process.env.HEDGED_PASSWORD = "barley";
    expect(middleware(req()).status).toBe(401);
    expect(middleware(req(basic("judge", "wrong"))).status).toBe(401);
    expect(middleware(req("Basic !!!")).status).toBe(401);
    expect(middleware(req(basic("judge", "barley"))).status).toBe(200);
  });

  it("leaves the webhook and MCP routes to their own checks", () => {
    const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(guarded("/overview")).toBe(true);
    expect(guarded("/api/judge/run-1")).toBe(true);
    expect(guarded("/api/mcp")).toBe(false);
    expect(guarded("/api/inkbox/webhook")).toBe(false);
  });
});
