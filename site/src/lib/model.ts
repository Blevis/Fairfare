/**
 * Browser inference for the frozen Fairfare pipeline (site/public/data/model.json).
 *
 * It mirrors src/features.py::add_features and the fitted scikit-learn ColumnTransformer
 * (passthrough numerics -> one-hot -> target encoding) followed by HistGradientBoostingRegressor.
 * `npm run test:parity` checks it against 2 000 Python predictions on June trips.
 */

export interface TreeJSON { f: number[]; t: number[]; l: number[]; r: number[]; v: number[] }
export type Block =
  | { kind: "num"; cols: string[] }
  | { kind: "onehot"; cols: string[]; categories: string[][] }
  | { kind: "target"; cols: string[]; default: number; tables: Record<string, number>[] };

export interface QuoteRule { kind: string; q: number; b: number | Record<string, number>; default?: number; k?: number; floor?: number }

export interface ModelJSON {
  model: string;
  feature_set: string;
  params: Record<string, string | number>;
  features: string[];
  blocks: Block[];
  baseline: number;
  trees: TreeJSON[];
  dist_bins: (number | null)[];
  dist_labels: string[];
  hour_bins: number[];
  airport_zones: number[];
  quote_rule: QuoteRule;
  buffer_q: number;
  tlc: { start: number; per_mile: number };
  trained_on: string;
  routing: Routing;
}

/** Booking-time distance estimate (src/routing.py): straight line between zone centroids x a detour
 *  factor that depends on the straight-line length; same-zone trips use that zone's May median. */
export interface Routing {
  centroids: Record<string, [number, number]>;
  ft_per_mile: number;
  band_edges: number[];
  k_band: number[];
  same_zone: Record<string, number>;
  same_zone_default: number;
  quote_rule_estimated: QuoteRule;
}

export function straightMiles(r: Routing, pu: number, dz: number): number | undefined {
  const a = r.centroids[String(pu)], b = r.centroids[String(dz)];
  if (!a || !b) return undefined;
  return Math.hypot(a[0] - b[0], a[1] - b[1]) / r.ft_per_mile;
}

export function estimateDistance(r: Routing, pu: number, dz: number): { miles: number; straight?: number; k?: number } {
  if (pu === dz) return { miles: r.same_zone[String(pu)] ?? r.same_zone_default };
  const s = straightMiles(r, pu, dz);
  if (s === undefined || !Number.isFinite(s)) return { miles: r.same_zone_default };
  let band = 0;
  while (band + 1 < r.band_edges.length && s >= r.band_edges[band + 1]) band++;   // searchsorted(side="right") - 1
  const k = r.k_band[band];
  return { miles: k * s, straight: s, k };
}

export interface TripInput {
  /** naive local NYC time "YYYY-MM-DDTHH:MM[:SS]" (the data's timestamps are local, no zone) */
  pickup: string;
  pu: number;
  do: number;
  pickupBorough: string;
  dropoffBorough: string;
  /** planned route length in miles, > 0 */
  dist: number;
}

type Value = number | string;

/** pd.cut with right-closed bins; returns the label index or -1 outside the range. */
function cutIndex(x: number, edges: (number | null)[]): number {
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i] ?? -Infinity;
    const hi = edges[i + 1] ?? Infinity;
    if (x > lo && x <= hi) return i;
  }
  return -1;
}

function parseLocal(ts: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  if (!m) throw new Error(`bad pickup time: ${ts}`);
  const [y, mo, d, h] = [m[1], m[2], m[3], m[4]].map(Number);
  const jsDay = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); // 0 = Sunday
  return { hour: h, dow: (jsDay + 6) % 7 }; // pandas: Monday = 0
}

/** Same columns, same values as add_features() for the features the model reads. */
export function featureRow(m: ModelJSON, trip: TripInput): Record<string, Value> {
  const { hour, dow } = parseLocal(trip.pickup);
  const air = new Set(m.airport_zones);
  const weekend = dow >= 5;
  const band = cutIndex(hour, m.hour_bins);
  const pb = trip.pickupBorough || "Unknown";
  const db = trip.dropoffBorough || "Unknown";
  const row: Record<string, Value> = {
    trip_distance: trip.dist,
    hour: String(hour),
    dow: String(dow),
    pickup_borough: pb,
    dropoff_borough: db,
    same_borough: pb === db ? 1 : 0,
    same_zone: trip.pu === trip.do ? 1 : 0,
    pu_airport: air.has(trip.pu) ? 1 : 0,
    do_airport: air.has(trip.do) ? 1 : 0,
    log_distance: Math.log1p(trip.dist),
    dist_band: m.dist_labels[cutIndex(trip.dist, m.dist_bins)] ?? "",
    pu_zone_id: String(trip.pu),
    do_zone_id: String(trip.do),
    zone_pair: `${trip.pu}_${trip.do}`,
    weekend: weekend ? 1 : 0,
    hour_wk: `${weekend ? "we" : "wd"}_${String(hour).padStart(2, "0")}`,
  };
  for (const w of ["wd", "we"]) {
    for (let b = 0; b < m.hour_bins.length - 1; b++) {
      row[`dist_x_${w}_${b}`] = (w === "we") === weekend && band === b ? trip.dist : 0;
    }
  }
  return row;
}

/** ColumnTransformer output, in the fitted column order. */
export function vectorize(m: ModelJSON, row: Record<string, Value>): Float64Array {
  const out: number[] = [];
  for (const blk of m.blocks) {
    if (blk.kind === "num") for (const c of blk.cols) out.push(Number(row[c]));
    else if (blk.kind === "onehot")
      blk.cols.forEach((c, i) => { for (const cat of blk.categories[i]) out.push(String(row[c]) === cat ? 1 : 0); });
    else blk.cols.forEach((c, i) => out.push(blk.tables[i][String(row[c])] ?? blk.default));
  }
  return Float64Array.from(out);
}

function treeValue(t: TreeJSON, x: Float64Array): number {
  let n = 0;
  while (t.l[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n];
  return t.v[n];
}

export interface Prediction {
  fare: number;
  quote: number;
  buffer: number;
  distBand: string;
  /** Official Rate #01 distance-only meter fare, for reference (no time charge). */
  tlcDistanceOnly: number;
  row: Record<string, Value>;
  /** Out-of-vocabulary flags: the zone / pair was never seen in May, so the encoder fell back to the May mean. */
  unseen: { pickupZone: boolean; dropoffZone: boolean; pair: boolean };
}

export function predict(m: ModelJSON, trip: TripInput, distanceSource: "estimated" | "entered" = "entered"): Prediction {
  const row = featureRow(m, trip);
  const x = vectorize(m, row);
  let raw = m.baseline;
  for (const t of m.trees) raw += treeValue(t, x);
  const band = String(row.dist_band);
  // estimated distances are less exact, so they get their own (wider) June-calibrated buffers
  const rule = distanceSource === "estimated" ? m.routing.quote_rule_estimated : m.quote_rule;
  const buffer = typeof rule.b === "number" ? rule.b : rule.b[band] ?? rule.default ?? 0;
  const te = m.blocks.find((b) => b.kind === "target") as Extract<Block, { kind: "target" }> | undefined;
  const has = (col: string) => {
    if (!te) return true;
    const i = te.cols.indexOf(col);
    return i < 0 || String(row[col]) in te.tables[i];
  };
  return {
    fare: raw,
    quote: raw + buffer,
    buffer,
    distBand: band,
    tlcDistanceOnly: m.tlc.start + m.tlc.per_mile * trip.dist,
    row,
    unseen: { pickupZone: !has("pu_zone_id"), dropoffZone: !has("do_zone_id"), pair: !has("zone_pair") },
  };
}
