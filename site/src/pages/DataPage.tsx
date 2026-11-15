import { useState } from "react";
import { BoxPlot, GridHeat, Histogram } from "../components/charts";
import { DataTable, Loading, PageHead, Section, Stat } from "../components/ui";
import { useResults, type QRow, type RankRow, type Stat5, type TripRow } from "../lib/data";
import { int, pct, usd } from "../lib/format";

const MEASURE: Record<string, { label: string; fmt: (v: number) => string }> = {
  fare_amount: { label: "Fare", fmt: (v) => usd(v) },
  trip_distance: { label: "Distance (mi)", fmt: (v) => v.toFixed(2) },
  duration_min: { label: "Duration (min)", fmt: (v) => v.toFixed(1) },
  fare_per_mile: { label: "Fare per mile", fmt: (v) => usd(v) },
  speed_mph: { label: "Average speed (mph)", fmt: (v) => v.toFixed(1) },
};
const GROUPS: { key: string; label: string; order?: string[] }[] = [
  { key: "dist_band", label: "Distance", order: ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"] },
  { key: "hour_band", label: "Time of day", order: ["night 0-5", "am 6-9", "midday 10-15", "pm 16-19", "eve 20-23"] },
  { key: "day_type", label: "Weekday / weekend" },
  { key: "airport", label: "Airport trips" },
  { key: "pickup_borough", label: "Pickup borough" },
];
const RANKS = [
  { key: "pickup_zone_median_fare", label: "Pickup zones · fare", what: "zone" },
  { key: "pickup_zone_median_fare_per_mile", label: "Pickup zones · per mile", what: "zone" },
  { key: "zone_pair_median_fare", label: "Routes · fare", what: "route" },
  { key: "zone_pair_median_fare_per_mile", label: "Routes · per mile", what: "route" },
] as const;

const statCols = [
  { key: "m", label: "", render: (r: Stat5) => MEASURE[r.measure]?.label ?? r.measure },
  ...(["mean", "std", "min", "q1", "median", "q3", "max"] as const).map((k) => ({
    key: k, label: { mean: "mean", std: "std. dev.", min: "min", q1: "Q1 (25%)", median: "median", q3: "Q3 (75%)", max: "max" }[k],
    render: (r: Stat5) => (MEASURE[r.measure]?.fmt ?? ((v: number) => v.toFixed(2)))(r[k]),
  })),
];
const rankCols = (what: "zone" | "route") => [
  { key: "z", label: what === "zone" ? "Pickup zone" : "Route", render: (r: RankRow) => (what === "zone" ? r.zone : r.route) },
  { key: "n", label: "trips", render: (r: RankRow) => int(r.n) },
  { key: "mf", label: "median fare", render: (r: RankRow) => usd(r.median_fare) },
  { key: "mean", label: "mean fare", render: (r: RankRow) => usd(r.mean_fare) },
  { key: "d", label: "median mi", render: (r: RankRow) => r.median_distance.toFixed(1) },
  { key: "t", label: "median min", render: (r: RankRow) => r.median_duration.toFixed(0) },
  { key: "s", label: "median mph", render: (r: RankRow) => r.median_speed.toFixed(1) },
  { key: "f", label: "$ / mile", render: (r: RankRow) => usd(r.median_fare_per_mile) },
];
const tripCols = [
  { key: "p", label: "Pickup", render: (r: TripRow) => r.pickup },
  { key: "r", label: "Route", render: (r: TripRow) => r.route },
  { key: "d", label: "mi", render: (r: TripRow) => r.trip_distance.toFixed(2) },
  { key: "t", label: "min", render: (r: TripRow) => r.duration_min.toFixed(1) },
  { key: "s", label: "mph", render: (r: TripRow) => r.speed_mph.toFixed(1) },
  { key: "f", label: "fare", render: (r: TripRow) => usd(r.fare_amount) },
  { key: "fm", label: "$ / mile", render: (r: TripRow) => usd(r.fare_per_mile) },
];

export function DataPage() {
  const { data: r, error } = useResults();
  const [group, setGroup] = useState("dist_band");
  const [measure, setMeasure] = useState<"fare" | "fare_per_mile">("fare");
  const [rank, setRank] = useState<(typeof RANKS)[number]["key"]>("pickup_zone_median_fare");
  if (!r) return <Loading error={error} />;
  const e = r.eda;
  const fare = e.summary_may.find((s) => s.measure === "fare_amount")!;
  const dist = e.summary_may.find((s) => s.measure === "trip_distance")!;
  const speed = e.summary_may.find((s) => s.measure === "speed_mph")!;
  const g = GROUPS.find((x) => x.key === group)!;
  const rows: QRow[] = e.quartiles[group][measure];
  const ordered = g.order ? g.order.map((o) => rows.find((x) => String(x[group]) === o)).filter(Boolean) as QRow[] : [...rows].sort((a, b) => b.n - a.n);
  const rk = RANKS.find((x) => x.key === rank)!;
  const ranking = e.rankings[rank];
  const fpm = rank.endsWith("per_mile");
  return (
    <>
      <PageHead eyebrow="Data · May 2026 training trips" title="What a taxi ride in New York costs"
        lede={<>Descriptive statistics of the {int(fare.count)} cleaned May trips the model learned from: standard metered fares, card or cash. Duration and speed are measured after the trip, so they explain fares here but are never model inputs.</>} />

      <div className="wrap grid g4">
        <Stat k="Median fare" v={usd(fare.median)} s={<>half of trips cost less; mean {usd(fare.mean)}</>} />
        <Stat k="Middle half of fares" v={<>{usd(fare.q1, 2)}–{usd(fare.q3, 2)}</>} s="Q1 to Q3 (25th to 75th percentile)" />
        <Stat k="Median distance" v={`${dist.median.toFixed(1)} mi`} s={<>mean {dist.mean.toFixed(2)} mi; Q3 {dist.q3.toFixed(1)} mi</>} />
        <Stat k="Trips under 6 mph" v={pct(e.slow_share)} s={<>median {usd(e.slow_median_fpm)}/mi vs {usd(e.median_fpm)}/mi overall; median speed {speed.median.toFixed(1)} mph</>} />
      </div>

      <Section eyebrow="Summary" title="Means, medians and quartiles"
        lede={`The mean fare is ${usd(fare.mean - fare.median)} above the median: most rides are short and cheap, and a long tail of airport and cross-borough trips pulls the average up.`}>
        <div className="card">
          <DataTable rows={e.summary_may} cols={statCols} caption={`May 2026, cleaned, n = ${int(fare.count)}. Fares are capped at May's 99.9th percentile ($96.80) by the cleaning.`} />
        </div>
        <div className="card" style={{ marginTop: "1.25rem" }}>
          <h3>Distribution of fares</h3>
          <Histogram title="Histogram of May fares" height={320} edges={e.fare_hist.edges} counts={e.fare_hist.counts} xLabel="fare ($, $2 bins)" fmtX={(v) => `$${v}`}
            markers={[{ x: fare.q1, label: `Q1 ${usd(fare.q1)}` }, { x: fare.median, label: `median ${usd(fare.median)}` }, { x: fare.mean, label: `mean ${usd(fare.mean)}` }, { x: fare.q3, label: `Q3 ${usd(fare.q3)}` }]} />
          <p className="small muted">Right-skewed: Q1 &lt; median &lt; mean &lt; Q3. The meter's minimum is $3.00 ({e.n_minimum_fare} May trips paid exactly that).</p>
        </div>
      </Section>

      <Section eyebrow="Quartiles" title="Who pays what" lede="Each box holds the middle half of trips; the line is the median, the red dot the mean, the whiskers the 10th and 90th percentiles. Hover for the numbers.">
        <div className="card">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Group by">{GROUPS.map((x) => <button key={x.key} aria-pressed={group === x.key} onClick={() => setGroup(x.key)}>{x.label}</button>)}</div>
            <div className="seg" role="group" aria-label="Measure"><button aria-pressed={measure === "fare"} onClick={() => setMeasure("fare")}>fare</button><button aria-pressed={measure === "fare_per_mile"} onClick={() => setMeasure("fare_per_mile")}>fare per mile</button></div>
          </div>
          <BoxPlot title={`${measure} by ${g.label}`} fmt={(v) => usd(v)} xLabel={measure === "fare" ? "fare ($)" : "fare per mile ($)"}
            rows={ordered.map((x) => ({ label: String(x[group]), n: x.n, p10: x.p10, q1: x.q1, median: x.median, q3: x.q3, p90: x.p90, mean: x.mean }))} />
        </div>
        <div className="grid g3" style={{ marginTop: "1.25rem" }}>
          <div className="card small"><h3>Distance sets the price</h3><p>Median fare rises from about $7 under a mile to about $84 above 20 miles. Within one distance band the middle half of fares is fairly tight.</p></div>
          <div className="card small"><h3>Midday miles cost more</h3><p>The median fare <i>per mile</i> is about 40% higher at midday than at night. Slow traffic is billed by the minute. The fare per trip barely changes, because night trips are longer.</p></div>
          <div className="card small"><h3>Airports: dear trips, cheap miles</h3><p>Airport trips cost about $44 at the median, but only about $4.40 per mile: long highway runs above 12 mph are billed almost purely by distance.</p></div>
        </div>
      </Section>

      <Section eyebrow="Extremes" title="The most expensive and the cheapest" lede="Ranked by the median, so a few odd trips cannot drive a ranking. Pickup zones need at least 200 May trips, routes at least 50.">
        <div className="card">
          <div className="toolbar"><div className="seg" role="group" aria-label="Ranking">{RANKS.map((x) => <button key={x.key} aria-pressed={rank === x.key} onClick={() => setRank(x.key)}>{x.label}</button>)}</div></div>
          <div className="grid g2">
            <div><h3>Most expensive {fpm ? "per mile" : ""}</h3><DataTable rows={ranking.most} cols={rankCols(rk.what)} /></div>
            <div><h3>Cheapest {fpm ? "per mile" : ""}</h3><DataTable rows={ranking.least} cols={rankCols(rk.what)} /></div>
          </div>
        </div>
        <div className="grid g2" style={{ marginTop: "1.25rem" }}>
          <div className="card small">
            <h3>Why the expensive ones are expensive</h3>
            <ul>
              <li><b>Airports.</b> LaGuardia, JFK and neighbouring East Elmhurst pickups have the highest median fares (about $42–44). Their trips are long (median 9–10 mi).</li>
              <li><b>Long, slow cross-borough routes.</b> JFK → Williamsburg or Greenpoint (about $65, ~16 mi, ~46 min) and LaGuardia → the Financial District (about $55) combine distance with bridges, tunnels and Manhattan traffic.</li>
              <li><b>The southern tip of Manhattan.</b> The Financial District, World Trade Center, Battery Park City and Seaport (about $19–21 median): from there almost every destination is far.</li>
              <li><b>Per mile: Midtown.</b> Short hops in and around Times Square and Midtown Center run at 4–5 mph, so the per-minute charge dominates and a mile costs up to about $15.70. On very short trips the $3 start is also a big share.</li>
            </ul>
          </div>
          <div className="card small">
            <h3>Why the cheap ones are cheap</h3>
            <ul>
              <li><b>Short trips in dense neighbourhoods.</b> The Upper East Side, Yorkville, Lenox Hill and the Upper West Side have the lowest median fares (about $10.70–11.40), because typical rides there are short (1.2–1.6 mi). A mile there still costs $7.60–8.90.</li>
              <li><b>Same-zone hops.</b> A half-mile, three-minute ride inside Yorkville costs about $5.10.</li>
              <li><b>Per mile: fast highway trips.</b> JFK → Flushing Meadows (≈ $3.90/mi at 34 mph) and the airport-to-airport run are billed almost only by distance, close to the official $3.50 per mile.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section eyebrow="Single trips" title="The ten dearest and ten cheapest rides (May, cleaned)">
        <div className="card"><h3>Most expensive</h3><DataTable rows={e.top_trips} cols={tripCols} caption="All sit just under the $96.80 cap set by the cleaning: 12–25 mile runs to Staten Island, the Bronx and deep Brooklyn, some fast, some stuck in traffic for well over an hour." /></div>
        <div className="card" style={{ marginTop: "1.25rem" }}><h3>Cheapest</h3><DataTable rows={e.cheapest_trips} cols={tripCols} caption="The $3.00 minimum: rides of about a minute and almost no distance, likely cancelled or restarted just after the meter started." /></div>
      </Section>

      <Section eyebrow="Timing" title="When is a mile most expensive?" lede="Median fare per mile for 1–5 mile trips in May, by weekday and pickup hour. Hover for the trip count behind each cell.">
        <div className="card">
          <GridHeat title="Median fare per mile by weekday and hour" values={e.fpm_dow_hour.median} counts={e.fpm_dow_hour.n} rowLabels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} fmt={(v) => usd(v)} />
          <p className="small muted">Every weekday peaks between 11:00 and 17:00, when the streets are slowest. Nights and early mornings are cheapest. Weekend afternoons are cheaper than weekday afternoons.</p>
        </div>
      </Section>

      <Section eyebrow="Before cleaning" title="Where the $100+ fares went" lede={`${int(e.raw_over_100.n)} raw May trips (${pct(e.raw_over_100.share, 2)}) cost more than $100; ${e.raw_over_100.kept} of them remain after cleaning. They belong to other pricing regimes, not to the standard meter.`}>
        <DataTable rows={e.raw_over_100.by_kind} cols={[
          { key: "k", label: "Pricing regime", render: (x) => x.kind }, { key: "n", label: "trips", render: (x) => int(x.n) },
          { key: "f", label: "median fare", render: (x) => usd(x.median_fare) }, { key: "d", label: "median mi", render: (x) => x.median_distance.toFixed(1) }]}
          caption="'standard meter' trips over $100 were removed by the 99.9% caps (median 27 mi: mostly beyond the city)." />
      </Section>

      <Section eyebrow="Months" title="May, June and July side by side" lede="Fare and distance distributions per month (descriptive only; computed after the final evaluation).">
        <DataTable rows={e.months} cols={statCols.map((c, i) => i === 0 ? { ...c, render: (r: Stat5) => r.measure.replace("fare_amount", "fare").replace("trip_distance", "distance (mi)").replace("fare_per_mile", "fare per mile") } : {
          ...c, render: (r: Stat5) => (r.measure.includes("distance") ? (v: number) => v.toFixed(2) : (v: number) => usd(v))(r[c.key as keyof Stat5] as number),
        })} caption="The months are very similar. July is slightly cheaper per mile for slightly longer trips, consistent with faster summer traffic." />
      </Section>
    </>
  );
}
