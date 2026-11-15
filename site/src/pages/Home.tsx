import { Predictor } from "../components/Predictor";
import { Section, Stat } from "../components/ui";
import { FINAL, useResults } from "../lib/data";
import { href } from "../lib/router";
import { int, pct, signedUsd, usd } from "../lib/format";

export function Home() {
  const { data: r } = useResults();
  const j = r?.july, m = j?.july_metrics[FINAL];
  return (
    <>
      <div className="wrap hero">
        <div className="fade-in">
          <img className="car" src={`${import.meta.env.BASE_URL}car.png`} alt="" width={380} height={230} />
          <div className="eyebrow">NYC yellow taxis · predicted at booking</div>
          <h1>What will the meter say, <em>before the ride starts?</em></h1>
          <p className="lede">Fairfare predicts a standard metered yellow-taxi fare in New York from what an app knows at booking: the pickup time, the two taxi zones, and the planned route length. It then turns that prediction into a quote the real fare stays under on nine trips out of ten.</p>
          <div className="cta">
            <a className="btn" href={href("/predict")}>Try the predictor</a>
            <a className="btn ghost" href={href("/results")}>See the July results</a>
            <a className="btn ghost" href={href("/methodology")}>How it works</a>
          </div>
        </div>
        <div className="fade-in"><Predictor compact /></div>
      </div>

      <Section eyebrow="Key findings" title="Tested once, on a month it never saw"
        lede={m && j ? <>Trained on May 2026, tuned on June, then scored once on {int(m.n)} July trips. Brackets are 95% day-block bootstrap intervals.</> : "Loading results…"}>
        {m && j && (
          <>
            <div className="grid g4">
              <Stat k="Average error (MAE)" v={usd(m.mae)} s={<>{usd(j.july_vs_median_bootstrap.mae_model.lo)} to {usd(j.july_vs_median_bootstrap.mae_model.hi)}</>} />
              <Stat k="vs best simple rule" v={signedUsd(j.july_vs_rate_rule_bootstrap.mae_diff.point)} s={<>per trip, vs a start + per-mile line fitted on May ({signedUsd(j.july_vs_rate_rule_bootstrap.mae_diff.lo)} to {signedUsd(j.july_vs_rate_rule_bootstrap.mae_diff.hi)})</>} />
              <Stat k="Quote coverage" v={pct(j.july_quote.coverage)} s={<>fare ≤ quote, target 90%; average cushion {usd(j.july_quote.mean_cushion)}</>} />
              <Stat k="Mean signed error" v={signedUsd(m.bias)} s="actual − predicted, July" />
            </div>
            <div className="grid g3" style={{ marginTop: "1.5rem" }}>
              <div className="card"><h3>Distance is most of the answer</h3><p className="small">A straight line on distance explains 88% of fare variance in May. The rest is mostly the time the meter bills in slow traffic, which no booking input observes directly.</p></div>
              <div className="card"><h3>Where you go matters more than the borough</h3><p className="small">93% of pickups are in Manhattan. The biggest gains came from encoding the exact pickup/drop-off zones and the zone pair from May fares, inside the pipeline so no test information leaks.</p></div>
              <div className="card"><h3>One buffer doesn't fit all</h3><p className="small">Errors grow with distance, so the quote adds a buffer per distance band. It is chosen on June and checked on July, overall and by time, place and trip type.</p></div>
            </div>
          </>
        )}
      </Section>

      <Section eyebrow="Explore" title="The project, in four parts">
        <div className="grid g4">
          {[
            ["/methodology", "Methodology", "Data, population, the booking-time rule, leakage locks and the May → June → July protocol."],
            ["/model", "Model", "Baselines, feature ablation, tuning plateaus and the June selection rule."],
            ["/results", "Results", "July MAE, RMSE, bias, confidence intervals, quote coverage and slices."],
            ["/analytics", "Analytics", "Zone maps, hourly error, calibration and the error distribution."],
          ].map(([p, t, d]) => (
            <a key={p} href={href(p as "/model")} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h3>{t} →</h3><p className="small muted" style={{ margin: 0 }}>{d}</p>
            </a>
          ))}
        </div>
      </Section>
    </>
  );
}
