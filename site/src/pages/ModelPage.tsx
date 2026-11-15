import { HBars, LineChart } from "../components/charts";
import { DataTable, Loading, PageHead, Section } from "../components/ui";
import { LADDER_LABELS, useResults } from "../lib/data";
import { usd } from "../lib/format";

const FS = ["f0_distance", "f1_time", "f2_geo", "f3_airport", "f4_shape", "f5_zones", "f6_pair", "f7_time_x"];
const FS_DESC: Record<string, string> = {
  f0_distance: "distance only",
  f1_time: "+ hour, weekday",
  f2_geo: "+ boroughs, same borough / zone",
  f3_airport: "+ airport pickup / drop-off flags",
  f4_shape: "+ log distance, distance band",
  f5_zones: "+ pickup & drop-off zone (target-encoded)",
  f6_pair: "+ zone pair (target-encoded)",
  f7_time_x: "+ hour × weekend, distance × time band",
};
const MODEL_COLORS: Record<string, string> = { linear: "var(--base)", tree: "var(--div-neg)", hgb: "var(--model)" };
const MODEL_NAMES: Record<string, string> = { linear: "Linear regression", tree: "Decision tree (default)", hgb: "Gradient boosting (default)" };

export function ModelPage() {
  const { data: r, error } = useResults();
  if (!r) return <Loading error={error} />;
  const sel = r.gate2.june_selection_table;
  const ladder = r.gate3.june_ladder;
  const p = r.gate2.params;
  const treeBest = r.tree_grid[0];
  return (
    <>
      <PageHead eyebrow="Model" title="From a price list to gradient boosting"
        lede="Every candidate was trained on May and judged on June. Each step up from the simplest baseline had to earn its place on data it had not seen." />

      <Section eyebrow="Baselines" title="The ladder every model must beat" lede="June error (MAE, in dollars) of the reference rules, next to the final model.">
        <div className="card">
          <HBars title="June MAE for baselines and the final model" xLabel="June mean absolute error ($)" fmt={(v) => usd(v)}
            rows={Object.entries(ladder).map(([k, m]) => ({ label: LADDER_LABELS[k] ?? k, value: m.mae, highlight: k.startsWith("FINAL"), note: `bias ${usd(m.bias)}` }))} />
          <p className="small muted">The official meter rule ($3.00 + $3.50/mi) under-predicts by about {usd(ladder["2a rate rule (TLC $3 + $3.50/mi)"].bias)} per trip on average. That is the time charge, which distance alone cannot see. A straight line fitted on May absorbs it on average ($6.67 + $3.99/mi) but still misses by {usd(ladder["2b rate rule (fit on May)"].mae)} per trip.</p>
        </div>
      </Section>

      <Section eyebrow="Feature engineering" title="What each feature set added" lede="Feature sets are cumulative, so each point adds one group of features to the previous one. Losers are kept in the chart.">
        <div className="card">
          <LineChart title="June MAE by feature set and model family" xLabel="feature set (cumulative)" yLabel="June MAE" fmtY={(v) => `$${v.toFixed(2)}`}
            xTicks={FS.map((_, i) => i)} xFmt={(i) => FS[i]?.split("_")[0] ?? ""}
            series={["linear", "tree", "hgb"].map((m) => ({ name: MODEL_NAMES[m], color: MODEL_COLORS[m],
              points: FS.map((fs, i) => ({ x: i, y: r.ablation.find((a) => a.feature_set === fs && a.model === m)!.mae })) }))} />
          <div className="legend" style={{ marginTop: ".4rem" }}>{["linear", "tree", "hgb"].map((m) => <span key={m}><i style={{ background: MODEL_COLORS[m] }} />{MODEL_NAMES[m]}</span>)}</div>
          <DataTable rows={FS} caption="Default hyperparameters; trained on May, scored on June."
            cols={[
              { key: "fs", label: "Set", render: (fs) => <code>{fs}</code> },
              { key: "d", label: "Adds", render: (fs) => FS_DESC[fs] },
              ...["linear", "tree", "hgb"].map((m) => ({ key: m, label: m, render: (fs: string) => usd(r.ablation.find((a) => a.feature_set === fs && a.model === m)!.mae, 3) })),
            ]} />
          <p className="small muted">Boroughs and airport flags barely help, because 93% of pickups are in Manhattan. What helps is knowing the exact zones and the zone pair (encoded from May fares inside the pipeline) and letting the price per mile vary with the time of week.</p>
        </div>
      </Section>

      <Section eyebrow="Tuning on June" title="Plateaus, not peaks">
        <div className="grid g2">
          <div className="card">
            <h3>Decision tree</h3>
            <p className="small">{r.tree_grid.length} settings of depth × minimum leaf size. Best: depth {treeBest.depth}, leaf {treeBest.leaf}, MAE {usd(treeBest.mae, 3)}. Anything from depth 14 up is within a few cents.</p>
            <DataTable rows={r.tree_grid.slice(0, 5)} cols={[
              { key: "d", label: "depth", render: (x) => x.depth }, { key: "l", label: "min leaf", render: (x) => x.leaf },
              { key: "m", label: "June MAE", render: (x) => usd(x.mae, 3) }, { key: "r", label: "RMSE", render: (x) => usd(x.rmse, 3) }]} />
          </div>
          <div className="card">
            <h3>Gradient boosting</h3>
            <p className="small">{r.hgb_grid.length} settings (loss, learning rate, leaves, iterations, leaf size). Absolute-error loss wins: it targets the median, which is what MAE rewards. The top settings differ by about one cent, so the rule (fixed in advance) takes the <i>cheapest</i> setting within $0.01 of the best.</p>
            <DataTable rows={r.hgb_grid.slice(0, 6)} highlight={(x) => x.learning_rate === p.learning_rate && x.max_leaf_nodes === p.max_leaf_nodes && x.max_iter === p.max_iter && x.min_samples_leaf === p.min_samples_leaf && x.loss === p.loss}
              caption="Highlighted: chosen (if within the top 6)."
              cols={[
                { key: "lr", label: "lr", render: (x) => x.learning_rate }, { key: "lv", label: "leaves", render: (x) => x.max_leaf_nodes },
                { key: "it", label: "iters", render: (x) => x.max_iter }, { key: "ms", label: "min leaf", render: (x) => x.min_samples_leaf },
                { key: "m", label: "June MAE", render: (x) => usd(x.mae, 3) }]} />
          </div>
        </div>
      </Section>

      <Section eyebrow="Selection" title="Is the winner really better?" lede="The rule, fixed before the comparison ran: take the lowest June MAE unless its gain over the next simpler model has a 95% day-block bootstrap interval that includes zero.">
        <div className="grid g2">
          <DataTable rows={Object.entries(sel)} highlight={([k]) => k.startsWith("hgb")}
            cols={[{ key: "k", label: "Candidate (June)", render: ([k]) => k }, { key: "m", label: "MAE", render: ([, m]) => usd(m.mae, 3) },
              { key: "r", label: "RMSE", render: ([, m]) => usd(m.rmse, 3) }, { key: "b", label: "bias", render: ([, m]) => usd(m.bias, 3) }]} />
          <DataTable rows={Object.entries(r.gate2.june_bootstrap)} caption="Model minus comparison on June; negative = the boosted model is better. 2,000 resamples of whole days."
            cols={[{ key: "k", label: "Comparison", render: ([k]) => k.split(" vs ")[1] ? `vs ${k.split(" vs ")[1]}` : k },
              { key: "d", label: "Δ MAE", render: ([, v]) => usd(v.mae_diff.point, 3) },
              { key: "c", label: "95% CI", render: ([, v]) => `${usd(v.mae_diff.lo, 3)} to ${usd(v.mae_diff.hi, 3)}` }]} />
        </div>
        <p className="small muted" style={{ marginTop: ".8rem" }}>June was used for feature choice, tuning and this comparison, so these June numbers flatter the winner a little. The honest estimate is July, on the Results page.</p>
      </Section>

      <Section eyebrow="Architecture" title="The frozen pipeline">
        <div className="steps prose">
          <div><b>Booking view.</b> Keep only pickup time, pickup/drop-off zone IDs, their boroughs and distance.</div>
          <div><b>Stateless features.</b> Hour, weekday, weekend; borough and zone flags; airport flags; log distance and distance band; the zone pair; hour × weekend; distance split into 10 time-of-week columns, so each time band gets its own price per mile ({r.gate2.feature_set}).</div>
          <div><b>Learned encoders (fitted on May).</b> One-hot for hour, weekday, borough, distance band and hour × weekend. Target encoding for pickup zone, drop-off zone and zone pair, cross-fitted in 5 folds so the training rows never see their own fare.</div>
          <div><b>Gradient boosting.</b> scikit-learn <code>HistGradientBoostingRegressor</code>: loss = {String(p.loss)}, learning rate {String(p.learning_rate)}, {String(p.max_iter)} trees of up to {String(p.max_leaf_nodes)} leaves, at least {String(p.min_samples_leaf)} trips per leaf, seed 0.</div>
          <div><b>Quote rule (fitted on June).</b> Quote = prediction + a buffer for the trip's distance band, set at the 90th percentile of June's errors in that band.</div>
        </div>
      </Section>
    </>
  );
}
