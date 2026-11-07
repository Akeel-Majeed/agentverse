/**
 * Preloaded by terminal scripts (bun --preload): stands in for the Next.js-only modules the
 * data layer imports, so scripts can call it outside the Next server.
 */
import { plugin } from "bun";

plugin({
  name: "next-server-shims",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
    build.module("next/cache", () => ({ exports: { revalidatePath: () => undefined, revalidateTag: () => undefined }, loader: "object" }));
  },
});
