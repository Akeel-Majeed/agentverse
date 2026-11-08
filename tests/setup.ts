import { beforeEach } from "vitest";

// The demo store lives on globalThis (see lib/server/store.ts); give every test a fresh farm.
beforeEach(() => {
  delete (globalThis as { __hedgedMockStore?: unknown }).__hedgedMockStore;
});
