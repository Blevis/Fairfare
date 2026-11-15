export const usd = (x: number, d = 2) => `${x < 0 ? "−" : ""}$${Math.abs(x).toFixed(d)}`;
export const signedUsd = (x: number, d = 2) => `${x > 0 ? "+" : x < 0 ? "−" : ""}$${Math.abs(x).toFixed(d)}`;
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const int = (x: number) => Math.round(x).toLocaleString("en-US");
export const fix = (x: number, d = 3) => x.toFixed(d);
export const ci = (lo: number, hi: number, d = 2) => `${usd(lo, d)} to ${usd(hi, d)}`;
