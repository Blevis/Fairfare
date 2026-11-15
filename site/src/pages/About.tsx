import { PageHead, Section } from "../components/ui";
import { href } from "../lib/router";

export function About() {
  return (
    <>
      <PageHead eyebrow="About" title="A course project, done carefully"
        lede="Fairfare is Project 1, Task A (“The Fare”) of a machine-learning course: predict the NYC yellow-taxi fare at booking, and evaluate the prediction honestly." />

      <Section eyebrow="Objectives" title="What we set out to do">
        <div className="prose">
          <ul>
            <li>Predict the meter's <code>fare_amount</code> for a standard metered trip using only information available at booking.</li>
            <li>Beat a ladder of simple baselines (a median fare, a start + per-mile rule, a shallow tree) on held-out months.</li>
            <li>Turn the prediction into a usable decision: a quote the real fare stays under on 90% of trips.</li>
            <li>Keep the evaluation honest: out-of-time splits, learned steps fitted on May only, choices made on June, July scored once.</li>
          </ul>
        </div>
      </Section>

      <Section eyebrow="Scope" title="What Fairfare covers">
        <div className="grid g2">
          <div className="card"><h3>In scope</h3><ul className="small"><li>Yellow taxis, NYC taxi zones, May–July 2026 sample</li><li>Standard metered fare (TLC Rate #01), paid by card or cash</li><li>The meter fare only: <code>fare_amount</code></li></ul></div>
          <div className="card"><h3>Out of scope</h3><ul className="small"><li>Flex / app-priced trips, JFK flat fare, Newark and negotiated rates</li><li>Total trip cost: tolls, tips and surcharges</li><li>Other months, seasons or fare-rule changes</li></ul></div>
        </div>
      </Section>

      <Section eyebrow="Limitations" title="What to keep in mind">
        <div className="prose">
          <ul>
            <li><b>Planned vs measured distance.</b> The model was trained and evaluated on the odometer distance recorded after the trip. A booking app has only a routing estimate. The website's straight-line estimate raises the June error from $2.08 to $3.26 per trip; a real routing engine would sit in between (±10% distance error costs about 22 cents).</li>
            <li><b>Population defined after the fact.</b> Which trips count as "standard metered" is decided from fields recorded at the end of the trip (rate code, payment type). A deployed quote assumes the app already knows the trip will be metered.</li>
            <li><b>Time in traffic is unobservable.</b> The meter bills slow minutes, and the booking inputs can only anticipate them on average. Very slow trips are under-predicted.</li>
            <li><b>Three months, one city, one sample.</b> Seasonality, events and fare-rule changes beyond July 2026 are untested. Zones with few trips have noisy statistics.</li>
            <li><b>July was looked at twice.</b> An early skeleton notebook scored July once before anything was frozen. All final choices were made on June, and the final July score comes from a single locked run; the earlier look is disclosed in the repository.</li>
          </ul>
          <p>Full details: <a href={href("/methodology")}>Methodology</a>, the problem card <code>PROBLEM.md</code> and the model card <code>MODEL_CARD.md</code> in the repository.</p>
        </div>
      </Section>

      <Section eyebrow="Team" title="Contributors">
        <div className="grid g3">
          {["Blevis Allushi", "Geri Belba", "Leandra Latifi"].map((n) => <div className="card" key={n}><h3 style={{ margin: 0 }}>{n}</h3></div>)}
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>Data: NYC Taxi &amp; Limousine Commission trip records and taxi-zone files, via the course's data release. Fare rules: TLC passenger fare page (checked 15 November 2026).</p>
      </Section>
    </>
  );
}
