import { CoverageDots, HBars } from "../components/charts";
import { DataTable, Loading, PageHead, Section, Stat } from "../components/ui";
import { FINAL, LADDER_LABELS, MEDIAN, RULE, useResults, type SliceRow } from "../lib/data";
import { int, pct, signedUsd, usd } from "../lib/format";

const SLICE_TITLE: Record<string, string> = {
  dist_band: "Distance band (mi)", hour_band: "Time of day", airport_trip: "Airport trip", pickup_borough: "Pickup borough",
  rush_manhattan: "Weekday rush hour (16–19) from Manhattan", speed_band: "Actual average speed (mph, analysis only)",
};
const sliceLabel = (by: string, r: SliceRow) => {
  const v = String(r[by]);
  if (by === "airport_trip" || by === "rush_manhattan") return v === "1" ? "yes" : "no";
  if (by === "speed_band") return v.replace(/[(\]]/g, "").replace(", ", "–");
  return v;
};

export function Results() {
  const { data: r, error } = useResults();
  if (!r) return <Loading error={error} />;
  const j = r.july, m = j.july_metrics[FINAL];
  const vm = j.july_vs_median_bootstrap, vr = j.july_vs_rate_rule_bootstrap;
  const juneM = r.gate3.june_ladder[FINAL];
  const rule = r.gate3.quote_rule;
  const bands = ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"];
  return (
    <>
      <PageHead eyebrow={`Final evaluation · July 2026 · scored ${j.scored_at.replace("T", " ")}`} title="How it did on a month it never saw"
        lede={<>The model and quote rule were frozen on June, then scored once on {int(m.n)} July trips. Intervals are 95% day-block bootstrap intervals (2,000 resamples of whole days).</>} />

      <div className="wrap grid g4">
        <Stat k="Mean absolute error" v={usd(m.mae)} s={<>95% CI {usd(vm.mae_model.lo)} to {usd(vm.mae_model.hi)}</>} />
        <Stat k="Root mean squared error" v={usd(m.rmse)} s={<>95% CI {usd(vm.rmse_model.lo)} to {usd(vm.rmse_model.hi)}</>} />
        <Stat k="Mean signed error" v={signedUsd(m.bias)} s="actual − predicted; positive = model predicts low" />
        <Stat k="Quote coverage" v={pct(j.july_quote.coverage)} s={<>target {pct(rule.q, 0)}; average cushion {usd(j.july_quote.mean_cushion)}</>} />
      </div>

      <Section eyebrow="Against the baselines" title="Better than every reference, with room to spare">
        <div className="card">
          <HBars title="July MAE of every model" xLabel="July mean absolute error ($)" fmt={(v) => usd(v)}
            rows={Object.entries(j.july_metrics).map(([k, x]) => ({ label: LADDER_LABELS[k] ?? k, value: x.mae, highlight: k === FINAL,
              lo: k === FINAL ? vm.mae_model.lo : k === MEDIAN ? vm.mae_baseline.lo : k === RULE ? vr.mae_baseline.lo : undefined,
              hi: k === FINAL ? vm.mae_model.hi : k === MEDIAN ? vm.mae_baseline.hi : k === RULE ? vr.mae_baseline.hi : undefined,
              note: `RMSE ${usd(x.rmse)} · bias ${signedUsd(x.bias)}` }))} />
        </div>
        <div className="table-scroll" style={{ marginTop: "1rem" }}>
          <table className="data">
            <caption>Paired differences on July (Fairfare minus baseline). Negative = Fairfare is better. Bootstrap over whole days.</caption>
            <thead><tr><th scope="col">Comparison</th><th scope="col">Δ MAE</th><th scope="col">95% CI</th><th scope="col">Δ RMSE</th><th scope="col">95% CI</th></tr></thead>
            <tbody>
              {[["vs May median fare", vm], ["vs rate rule fitted on May", vr]].map(([label, b]) => {
                const x = b as typeof vm;
                return <tr key={label as string}><td>{label as string}</td><td>{signedUsd(x.mae_diff.point)}</td><td>{signedUsd(x.mae_diff.lo)} to {signedUsd(x.mae_diff.hi)}</td>
                  <td>{signedUsd(x.rmse_diff.point)}</td><td>{signedUsd(x.rmse_diff.lo)} to {signedUsd(x.rmse_diff.hi)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">June MAE of the same frozen model: {usd(juneM.mae)} (bias {signedUsd(juneM.bias)}). June helped choose the model, so it is slightly optimistic; July is the honest number.</p>
      </Section>

      <Section eyebrow="The decision" title="Quote = prediction + a buffer per distance band"
        lede={`The buffer for each distance band is the ${Math.round(rule.q * 100)}th percentile of June's errors in that band. Longer trips get a bigger cushion because their errors are larger.`}>
        <div className="grid g2">
          <DataTable rows={bands.filter((b) => b in rule.b)} caption={`Bands with fewer than 200 June trips fall back to the overall buffer (${usd(rule.default)}).`}
            cols={[{ key: "b", label: "Distance band (mi)", render: (b) => b }, { key: "v", label: "Buffer added", render: (b) => usd(rule.b[b]) },
              { key: "c", label: "July coverage", render: (b) => { const s = j.july_slices.dist_band.find((x) => String(x.dist_band) === b); return s ? pct(s.coverage) : "–"; } },
              { key: "n", label: "July n", render: (b) => { const s = j.july_slices.dist_band.find((x) => String(x.dist_band) === b); return s ? int(s.n) : "–"; } }]} />
          <div className="card small">
            <h3>Coverage and its price</h3>
            <table className="data">
              <thead><tr><th scope="col"></th><th scope="col">June (chosen)</th><th scope="col">July (test)</th></tr></thead>
              <tbody>
                <tr><td>Share of trips with fare ≤ quote</td><td>{pct(r.gate3.june_quote.coverage)}</td><td>{pct(j.july_quote.coverage)}</td></tr>
                <tr><td>Average quote − fare</td><td>{usd(r.gate3.june_quote.mean_cushion)}</td><td>{usd(j.july_quote.mean_cushion)}</td></tr>
                <tr><td>Average amount quoted above the fare (0 when the fare exceeds the quote)</td><td>{usd(r.gate3.june_quote.mean_overquote)}</td><td>{usd(j.july_quote.mean_overquote)}</td></tr>
                <tr><td>Average shortfall when the fare exceeds the quote</td><td>{usd(r.gate3.june_quote.mean_shortfall_when_under)}</td><td>{usd(j.july_quote.mean_shortfall_when_under)}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: ".8rem" }}>Three quote rules were compared on June with odd/even-day cross-fitting: one global buffer, a multiplicative factor, and a buffer per distance band. The per-band buffer gave the most even coverage across slices (worst slice off target by {pct(r.gate3.june_rule_comparison.by_dist_band.worst_gap)} vs {pct(r.gate3.june_rule_comparison.additive.worst_gap)} for one global buffer) and the smallest average cushion.</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Slices" title="Where it does well, and where it doesn't" lede="Every slice shows its trip count. A bad number on a few dozen trips is a footnote, not a finding.">
        <div className="grid g2">
          {["dist_band", "hour_band", "airport_trip", "pickup_borough"].map((by) => (
            <div className="card" key={by}>
              <h3>{SLICE_TITLE[by]}: quote coverage</h3>
              <CoverageDots title={`July quote coverage by ${SLICE_TITLE[by]}`} target={rule.q}
                rows={j.july_slices[by].map((s) => ({ label: `${sliceLabel(by, s)} (n=${int(s.n)})`, n: s.n, coverage: s.coverage }))} />
              <DataTable rows={j.july_slices[by]} cols={[
                { key: "k", label: SLICE_TITLE[by].split(" (")[0], render: (s) => sliceLabel(by, s) }, { key: "n", label: "n", render: (s) => int(s.n) },
                { key: "m", label: "MAE", render: (s) => usd(s.mae) }, { key: "b", label: "bias", render: (s) => signedUsd(s.bias) }]} />
            </div>
          ))}
        </div>
        {j.july_slices.speed_band && (
          <div className="card" style={{ marginTop: "1.25rem" }}>
            <h3>Why: the time charge it cannot see</h3>
            <p className="small">Grouping July trips by their <i>actual</i> average speed (known only after the trip, so never a feature) shows where the errors come from. The meter bills by the minute below 12 mph, so very slow trips cost more than any booking-time input can explain.</p>
            <DataTable rows={j.july_slices.speed_band} cols={[
              { key: "k", label: "speed (mph)", render: (s) => sliceLabel("speed_band", s) }, { key: "n", label: "n", render: (s) => int(s.n) },
              { key: "m", label: "MAE", render: (s) => usd(s.mae) }, { key: "b", label: "bias", render: (s) => signedUsd(s.bias) }, { key: "c", label: "coverage", render: (s) => pct(s.coverage) }]} />
          </div>
        )}
      </Section>

      <Section eyebrow="Robustness" title="If the planned distance is off" lede="On June, the trained model was given distances with random multiplicative noise (log-normal, mean one), to mimic a routing estimate that differs from the real route.">
        <DataTable rows={r.gate3.june_distance_noise} caption="June data; the model is unchanged and only its distance input is perturbed (seeded)."
          cols={[{ key: "s", label: "distance error (sd)", render: (x) => x.noise_sd === 0 ? "none" : `±${Math.round(x.noise_sd * 100)}%` },
            { key: "m", label: "MAE", render: (x) => usd(x.mae) }, { key: "r", label: "RMSE", render: (x) => usd(x.rmse) }, { key: "c", label: "quote coverage", render: (x) => pct(x.coverage) }]} />
      </Section>
    </>
  );
}
