import { Heatmap, LineChart } from "../components/charts";
import { DataTable, Loading, PageHead, Section } from "../components/ui";
import { useEda, useResults, type LogRow } from "../lib/data";
import { int, usd } from "../lib/format";

const STEP_LABEL: Record<string, string> = {
  unknown_zones: "Unknown or missing zone (264/265)",
  flex_fare: "Flex fare (app-priced, payment type 0)",
  payment_not_card_cash: "Not paid by card or cash",
  non_standard_rate: "Non-standard rate code (JFK flat, Newark, negotiated, unknown)",
  fare_not_positive: "Fare ≤ $0",
  distance_not_positive: "Distance ≤ 0",
  impossible_duration: "Duration < 1 min or > 3 h (validity check only)",
  above_caps: "Above May 99.9% caps",
};

export function Methodology() {
  const { data: r, error } = useResults();
  const { data: eda } = useEda();
  if (!r) return <Loading error={error} />;
  const c = r.cleaning;
  const may = c.logs.train;
  const months = ["train", "val", "test"] as const;
  return (
    <>
      <PageHead eyebrow="Methodology" title="Pricing a trip before it happens"
        lede="The hard part of this project is not the model. It is making sure the model only learns from what a booking app could actually know, and that every claim is tested on months the model never saw." />

      <Section eyebrow="Data" title="Source and target">
        <div className="grid g2">
          <div className="prose">
            <p><b>Source:</b> a {int(c.n_raw.train + c.n_raw.val + c.n_raw.test)}-trip sample of the NYC Taxi &amp; Limousine Commission (TLC) yellow-taxi trip records for May–July 2026 (about 200,000 trips per month), plus the TLC taxi-zone lookup and zone shapefile. The files are downloaded by <code>data/get_data.py</code> and checked against SHA-256 checksums.</p>
            <p><b>Target:</b> <code>fare_amount</code>, the time-and-distance meter fare. It excludes tips, tolls and the fixed surcharges, which are recorded in separate columns.</p>
            <p><b>The meter (TLC Rate #01):</b> $3.00 start, then $0.70 per ⅕ mile above 12 mph, or $0.70 per minute in slow traffic. The time part is why distance alone can't fully determine the fare.</p>
          </div>
          <div className="card">
            <h3>Fare vs distance (May, cleaned)</h3>
            {eda ? <Heatmap xEdges={eda.fare_vs_distance.dist_edges} yEdges={eda.fare_vs_distance.fare_edges} counts={eda.fare_vs_distance.counts}
              title="Density of fare against trip distance in May" xLabel="trip distance (mi)" yLabel="fare" fmtY={(v) => `$${v}`}
              line={{ x0: 0, y0: 3, x1: 24, y1: 3 + 3.5 * 24, label: "meter distance charge only" }} /> : <p className="loading">Loading…</p>}
            <p className="small muted">n = {eda ? int(eda.n) : "…"} trips. Most trips sit above the red line, which is the distance charge alone. The gap is the time charge.</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Prediction moment" title="Only what is known at booking">
        <div className="grid g2">
          <div className="card">
            <h3>Allowed</h3>
            <ul className="small"><li>pickup time (hour, weekday)</li><li>pickup and drop-off zone, their boroughs, airport flags, the zone pair</li><li><code>trip_distance</code>, used as the planned route length</li></ul>
          </div>
          <div className="card">
            <h3>Forbidden</h3>
            <ul className="small"><li>drop-off time, duration, speed</li><li>tip, total, tolls, every surcharge column</li><li><code>RatecodeID</code>, <code>payment_type</code> (set at the end of the trip)</li><li><code>passenger_count</code>, <code>VendorID</code>, <code>request_source</code> (excluded by decision)</li></ul>
          </div>
        </div>
        <p className="note" style={{ marginTop: "1rem" }}><b>Key assumption:</b> <code>trip_distance</code> in the data is the odometer reading after the trip. We treat it as a stand-in for the routing estimate an app would have, so the July results are optimistic by the routing error. The predictor estimates the distance as the straight line between zone centres × a detour factor learned on May. The Results page shows what that costs on June, and how quickly accuracy falls when distance is noisy.</p>
      </Section>

      <Section eyebrow="Leakage prevention" title="Two locks and a test">
        <div className="steps prose">
          <div><b>A blacklist.</b> Every post-trip column is listed in <code>FORBIDDEN</code>. Any feature set naming one is rejected before training.</div>
          <div><b>A whitelist the pipeline enforces.</b> The model pipeline is handed only six raw columns (pickup time, the two zone IDs, their boroughs, distance) before any feature is computed. A feature can't be built from a post-trip column even by accident.</div>
          <div><b>A test that tries to cheat.</b> <code>tests/test_protocol.py</code> scrambles every forbidden column and checks that no prediction changes. Other tests check that encoders and caps are fitted on May only and that July can be scored only once.</div>
        </div>
      </Section>

      <Section eyebrow="Population" title="Which trips the model prices" lede={`Rules applied in order to May (the share is of all May trips). June and July go through the same rules with May's caps (distance ${c.params.dist_cap.toFixed(2)} mi, fare ${usd(c.params.fare_cap)}).`}>
        <DataTable<LogRow> rows={may} caption={`May: ${int(c.n_raw.train)} trips in, ${int(c.n_clean.train)} kept (${((100 * c.n_clean.train) / c.n_raw.train).toFixed(1)}%).`}
          cols={[
            { key: "s", label: "Rule", render: (x) => STEP_LABEL[x.step] ?? x.step },
            { key: "r", label: "Removed", render: (x) => int(x.removed) },
            { key: "p", label: "% of May", render: (x) => `${x.pct_of_input.toFixed(2)}%` },
            { key: "k", label: "Remaining", render: (x) => int(x.remaining) },
          ]} />
        <div className="grid g2" style={{ marginTop: "1.5rem" }}>
          <div className="prose small">
            <h3>Why flex fares are excluded</h3>
            <p>About a quarter of trips have payment type 0, the TLC "flex fare" code. In the same distance band they cost far more per mile (under 1 mile, a median of $17.46/mi vs $10.94/mi for metered trips), and from June on they are the only trips with an app-dispatch <code>request_source</code>. They are priced upfront by an app, which is not the process this model predicts.</p>
            <h3>Does the cleaning drift between months?</h3>
            <p>Mostly no. Two steps move: flex trips grow over the summer, and the "non-standard rate" share jumps because one vendor recorded rate code 99 ("unknown") on 3.4% of May trips, 0.02% of June trips and 1.5% of July trips. That is a recording artefact, not a change in pricing.</p>
          </div>
          <div className="table-scroll">
            <table className="data">
              <caption>Share of each month removed by each rule.</caption>
              <thead><tr><th scope="col">Rule</th><th scope="col">May</th><th scope="col">June</th><th scope="col">July</th></tr></thead>
              <tbody>{may.map((row, i) => (
                <tr key={row.step}><td>{STEP_LABEL[row.step]?.split(" (")[0] ?? row.step}</td>
                  {months.map((m) => <td key={m}>{c.logs[m][i].pct_of_input.toFixed(2)}%</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section eyebrow="Validation" title="Out of time, one month at a time">
        <div className="timeline">
          <div className="tr"><div className="t">May → train</div><p className="small">{int(c.n_clean.train)} trips. Every learned quantity (caps, encoders, trees) is fitted here only.</p></div>
          <div className="va"><div className="t">June → choose</div><p className="small">{int(c.n_clean.val)} trips. Feature sets, hyperparameters, model choice and the quote buffer are all decided here.</p></div>
          <div className="te"><div className="t">July → test once</div><p className="small">{int(c.n_clean.test)} trips. Scored once with the frozen configuration; a lock file blocks a second run.</p></div>
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>Uncertainty is estimated with a day-block bootstrap: whole days are resampled 2,000 times, because trips on the same day share weather, traffic and events. Resampling single trips would give intervals that are too narrow.</p>
        <p className="warn-note small"><b>Disclosure:</b> an early skeleton notebook scored July once on 2026-11-01, before any model or buffer had been frozen. The final model was selected on June only, the July lock was reset with the project owner's approval, and July was then scored once with the frozen configuration. Both runs are recorded in the repository.</p>
      </Section>

      {eda && (
        <Section eyebrow="Exploration (May)" title="A mile costs more at midday">
          <div className="card">
            <LineChart title="Median fare per mile by pickup hour, per distance band (May)" xLabel="pickup hour" yLabel="median $ per mile" fmtY={(v) => `$${v.toFixed(2)}`}
              xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 23]}
              series={["1-2", "2-5", "5-10"].map((b, i) => ({ name: `${b} mi`, color: ["var(--seq-4)", "var(--model)", "var(--base)"][i],
                points: eda.fpm_by_band_hour.filter((r) => r.dist_band === b).map((r) => ({ x: r.hour, y: r.median, n: r.size })) }))} />
            <p className="small muted">Within the same distance band, a mile at 2 pm costs much more than a mile at 5 am. That is the time charge for slow traffic. The rush-hour and overnight surcharges are not part of <code>fare_amount</code>, so they are not the cause.</p>
          </div>
        </Section>
      )}
    </>
  );
}
