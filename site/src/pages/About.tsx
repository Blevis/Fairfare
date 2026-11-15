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
          <div className="card" style={{ borderTop: "4px solid var(--model)" }}>
            <h3 style={{ margin: 0 }}>Blevis Allushi</h3>
            <p className="eyebrow" style={{ margin: ".3rem 0 .6rem" }}>Project lead · protocol and pipeline</p>
            <p className="small" style={{ margin: 0 }}>The repository, the src/ package and the five-stage pipeline; the evaluation protocol (temporal split, pre-stated selection rules, single-use July lock); data acquisition, cleaning and the population definition; tuning and the single July run; the booking-time distance study; direction of this website; the report.</p>
          </div>
          <div className="card" style={{ borderTop: "4px solid var(--model)" }}>
            <h3 style={{ margin: 0 }}>Geri Belba</h3>
            <p className="eyebrow" style={{ margin: ".3rem 0 .6rem" }}>Features and leakage</p>
            <p className="small" style={{ margin: 0 }}>The May exploratory analysis (fare per mile by hour, weekday, borough and zone; airport trips) behind the time and zone features; the cumulative feature ladder and its June ablation, including the target-encoded zone pair and distance × time-of-week interactions; the leakage audit of every feature.</p>
          </div>
          <div className="card" style={{ borderTop: "4px solid var(--model)" }}>
            <h3 style={{ margin: 0 }}>Leandra Latifi</h3>
            <p className="eyebrow" style={{ margin: ".3rem 0 .6rem" }}>Evaluation and the quote</p>
            <p className="small" style={{ margin: 0 }}>The baseline ladder and slice analysis; the comparison of quote rules (additive, multiplicative, per distance band) with odd/even-day cross-fitting on June; the July coverage and failure-mode analysis (slow traffic, 20+ mi trips, airports); the model card.</p>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: "1rem" }}>Data: NYC Taxi &amp; Limousine Commission trip records and taxi-zone files, via the course's data release. Fare rules: TLC passenger fare page (checked 15 November 2026).</p>
      </Section>

      <Section eyebrow="Report" title="The full write-up">
        <p className="prose">The scientific report covers data, population, exploratory analysis, method, results with confidence intervals, the routing estimate and limitations. Every number in it is generated from the project's result files. <a href={`${import.meta.env.BASE_URL}fairfare_report.pdf`}>Open the report (PDF, 16 pages)</a></p>
      </Section>

      <Section eyebrow="Transparency" title="Use of generative AI">
        <div className="prose small">
          <p>Generative AI (Anthropic's Claude, through the Claude Code assistant) was used in this project. <b>This website</b> was generated with AI from our specifications, including the in-browser port of the model and its parity test. For the <b>analysis code</b>, AI worked from the pipeline the team had already written and helped extend it (additional feature sets and model options, quote-rule and distance-perturbation helpers, tests, the distance estimator, the data export). It also helped edit the notebook narratives and the Markdown documentation.</p>
          <p>Every methodological decision was made or explicitly approved by the team. Blevis Allushi reviewed all AI-produced code, ran every analysis and checked the published numbers against the executed outputs. All results come from code executed in the repository.</p>
        </div>
      </Section>
    </>
  );
}
