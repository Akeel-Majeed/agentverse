export type Matrix = number[][];

export const mean = (xs: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
};

/** Sample standard deviation (n − 1). */
export function sd(xs: ArrayLike<number>): number {
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function cholesky(a: Matrix): Matrix {
  const n = a.length;
  const l: Matrix = a.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (s <= 0) throw new Error(`Matrix not positive definite at row ${i}`);
        l[i][j] = Math.sqrt(s);
      } else {
        l[i][j] = s / l[j][j];
      }
    }
  }
  return l;
}

/**
 * Correlation of `rows` (n observations × p variables), shrunk towards the identity with the
 * Ledoit-Wolf (2004) intensity. Works when n < p, where the sample matrix is singular.
 */
export function shrunkCorrelation(rows: Matrix): { corr: Matrix; intensity: number } {
  const n = rows.length;
  const p = rows[0].length;
  const cols = Array.from({ length: p }, (_, j) => rows.map((r) => r[j]));
  const mu = cols.map(mean);
  const sigma = cols.map(sd);
  const z = rows.map((r) => r.map((v, j) => (sigma[j] > 0 ? (v - mu[j]) / sigma[j] : 0)));
  const s: Matrix = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const zk of z) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s[i][j] += (zk[i] * zk[j]) / n;
  const target = s.reduce((t, row, i) => t + row[i], 0) / p;
  let d2 = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) d2 += (s[i][j] - (i === j ? target : 0)) ** 2;
  let b2 = 0;
  for (const zk of z) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) b2 += (zk[i] * zk[j] - s[i][j]) ** 2;
  b2 /= n * n;
  const intensity = d2 > 0 ? Math.min(1, Math.min(b2, d2) / d2) : 1;
  const shrunk = s.map((row, i) => row.map((v, j) => intensity * (i === j ? target : 0) + (1 - intensity) * v));
  const corr = shrunk.map((row, i) => row.map((v, j) => v / Math.sqrt(shrunk[i][i] * shrunk[j][j])));
  return { corr, intensity };
}
