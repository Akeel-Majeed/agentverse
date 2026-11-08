import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password for a deployed demo. When HEDGED_PASSWORD is set, every page, server action
 * and API route asks for it (HTTP Basic auth, any username), so a stranger with the URL can't
 * approve changes, update the risk profile or read the chat log. Two routes are left to their own
 * checks: the Inkbox webhook (signature) and /api/mcp (Bearer MCP_TOKEN, which uses the same
 * Authorization header Basic auth would). Unset, the app is open, as for local development.
 */
export function middleware(req: NextRequest) {
  const password = process.env.HEDGED_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (same(given, password)) return NextResponse.next();
    } catch {
      // Malformed header: ask again.
    }
  }
  return new NextResponse("Password required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Hedged", charset="UTF-8"' } });
}

/** Compare without stopping at the first difference. */
function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!api/inkbox/webhook|api/mcp|_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
