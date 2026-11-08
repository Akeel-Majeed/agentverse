import { normalCdf } from "../sim";

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Wilson score interval for k successes in n trials. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const xlogy = (x: number, y: number) => (x === 0 ? 0 : x * Math.log(y));
/** p-value of a chi-square(1) statistic. */
const chi1 = (lr: number) => 2 * (1 - normalCdf(Math.sqrt(Math.max(0, lr))));

/** Kupiec proportion-of-failures test: p-value that the breach rate equals `p`. */
export function kupiec(k: number, n: number, p: number): number {
  const phat = k / n;
  const l0 = xlogy(n - k, 1 - p) + xlogy(k, p);
  const l1 = xlogy(n - k, 1 - phat) + xlogy(k, phat);
  return chi1(-2 * (l0 - l1));
}

/** Christoffersen independence test: p-value that breaches are not clustered. */
export function christoffersen(breaches: boolean[]): number {
  let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
  for (let i = 1; i < breaches.length; i++) {
    const a = breaches[i - 1], b = breaches[i];
    if (!a && !b) n00++;
    else if (!a && b) n01++;
    else if (a && !b) n10++;
    else n11++;
  }
  const p01 = n01 / Math.max(1, n00 + n01);
  const p11 = n11 / Math.max(1, n10 + n11);
  const p = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
  const l0 = xlogy(n00 + n10, 1 - p) + xlogy(n01 + n11, p);
  const l1 = xlogy(n00, 1 - p01) + xlogy(n01, p01) + xlogy(n10, 1 - p11) + xlogy(n11, p11);
  return chi1(-2 * (l0 - l1));
}

/** Pinball (quantile) loss of predicting `pred` for quantile `q` when `y` happened. */
export function pinball(y: number, q: number, pred: number): number {
  const d = y - pred;
  return d >= 0 ? q * d : (q - 1) * d;
}
