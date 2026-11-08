import raw from "@/data/history.json";
import type { History } from "./types";

/** The committed history (data/history.json), refreshed with `bun run history:load`. */
export function loadHistory(): History {
  return raw as History;
}
