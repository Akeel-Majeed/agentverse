import { createHash, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { covenantViewTool, riskProfileTool } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

// Read-only: neither tool writes anything. Proposals from outside agents are out of scope.
function server() {
  const s = new McpServer({ name: "farm-risk", version: "1.0.0" });
  s.registerTool("get_risk_profile", { description: "Read-only risk profile of the demo farm with run id and trace head hash." }, async () => ({ content: [{ type: "text", text: JSON.stringify(await riskProfileTool()) }] }));
  s.registerTool("covenant_view", { description: "Probability the farm's DSCR falls below 1.25 next harvest, its main driver, and the trace head hash." }, async () => ({ content: [{ type: "text", text: JSON.stringify(await covenantViewTool()) }] }));
  return s;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request) {
  const token = process.env.MCP_TOKEN;
  if (!token) return new Response("MCP disabled", { status: 503 });
  if (!timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${token}`))) return new Response("Unauthorized", { status: 401 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server().connect(transport);
  return transport.handleRequest(req);
}
