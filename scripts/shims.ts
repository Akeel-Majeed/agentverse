/**
 * Preloaded by terminal scripts (bun --preload): stands in for the Next.js-only modules the
 * data layer imports, so scripts can call it outside the Next server.
 */
import { plugin } from "bun";
import path from "node:path";

// The real React build, loaded by path so the "react" stand-in below can extend it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require(path.join(process.cwd(), "node_modules/react/index.js"));

plugin({
  name: "next-server-shims",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
    // React's cache() only exists in the Next server runtime; outside it, just call through.
    build.module("react", () => ({ exports: { ...React, default: React, cache: <T>(fn: T) => fn }, loader: "object" }));
    build.module("next/cache", () => ({ exports: { revalidatePath: () => undefined, revalidateTag: () => undefined }, loader: "object" }));
  },
});
