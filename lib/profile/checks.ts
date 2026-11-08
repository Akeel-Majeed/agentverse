/**
 * Checks across profile fields, in code: values that can't all be true at once (more crop than
 * land, more sold forward than will be grown). They block saving a section, approving a proposed
 * change and updating the risk profile, so a bad document read, a mistyped figure or a
 * manipulative message can't reach the risk figures.
 */
import { num } from "../format";
import type { ProfileValue } from "../types";
import { fieldDef } from "./catalogue";

export interface ProfileProblem {
  /** Every field involved; the message is shown against each. */
  keys: string[];
  message: string;
}

type Values = Record<string, ProfileValue>;

const CROPS = [
  { id: "wheat", name: "wheat" },
  { id: "barley", name: "barley" },
  { id: "osr", name: "rape" },
];

const has = (v: Values, key: string) => v[key] !== null && v[key] !== undefined && v[key] !== "" && Number.isFinite(Number(v[key]));
const n = (v: Values, key: string) => Number(v[key]);
const ha = (x: number) => `${num(Math.round(x * 10) / 10, x % 1 ? 1 : 0)} ha`;
const t = (x: number) => `${num(Math.round(x))} t`;

export function profileProblems(v: Values): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  const farmed = has(v, "land.area_ha") ? n(v, "land.area_ha") : null;

  if (farmed !== null) {
    const cropKeys = CROPS.map((c) => `crop.${c.id}.area_ha`).filter((k) => has(v, k));
    const cropped = cropKeys.reduce((s, k) => s + n(v, k), 0);
    if (cropped > farmed * 1.001) {
      out.push({ keys: [...cropKeys, "land.area_ha"], message: `Crop areas add up to ${ha(cropped)}, more than the ${ha(farmed)} farmed.` });
    }
    const tenure = ["land.owned_ha", "land.rented_ha"].filter((k) => has(v, k));
    const held = tenure.reduce((s, k) => s + n(v, k), 0);
    if (held > farmed * 1.001) {
      out.push({ keys: [...tenure, "land.area_ha"], message: `Owned and rented land add up to ${ha(held)}, more than the ${ha(farmed)} farmed.` });
    }
    if (has(v, "reg.glyphosate_ha") && n(v, "reg.glyphosate_ha") > farmed * 1.001) {
      out.push({ keys: ["reg.glyphosate_ha", "land.area_ha"], message: `${ha(n(v, "reg.glyphosate_ha"))} relying on glyphosate is more than the ${ha(farmed)} farmed.` });
    }
  }

  for (const c of CROPS) {
    const area = `crop.${c.id}.area_ha`;
    const yieldKey = `crop.${c.id}.yield_t_ha`;
    const sd = `crop.${c.id}.yield_sd_t_ha`;
    const forward = `sales.${c.id}_2027_forward_t`;
    if (has(v, sd) && has(v, yieldKey) && n(v, sd) > n(v, yieldKey)) {
      out.push({ keys: [sd, yieldKey], message: `The ${c.name} yield swing is bigger than the yield itself.` });
    }
    if (has(v, forward) && has(v, area) && has(v, yieldKey)) {
      const crop = n(v, area) * n(v, yieldKey);
      // Allow a fifth over the expected crop: a good year can beat the average.
      if (n(v, forward) > crop * 1.2) {
        out.push({ keys: [forward, area, yieldKey], message: `${t(n(v, forward))} of ${c.name} sold forward is more than the 2027 crop of about ${t(crop)}.` });
      }
    }
  }
  return out;
}

/** Problems that involve `key`, as one message, or null. */
export function problemFor(problems: ProfileProblem[], key: string): string | null {
  const mine = problems.filter((p) => p.keys.includes(key));
  return mine.length ? mine.map((p) => p.message).join(" ") : null;
}

/** "Crop areas add up to …" for the fields named, in the catalogue's words. */
export function describeProblems(problems: ProfileProblem[]): string {
  return problems
    .map((p) => `${p.message} (${p.keys.map((k) => fieldDef(k)?.label ?? k).join(", ")})`)
    .join(" ");
}
