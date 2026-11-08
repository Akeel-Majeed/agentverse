import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next; tests that render a component need the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Always test against the demo data, never a configured database or live API.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", ANTHROPIC_API_KEY: "", INKBOX_API_KEY: "" },
  },
});
