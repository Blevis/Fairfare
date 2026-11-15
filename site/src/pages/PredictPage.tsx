import { Predictor } from "../components/Predictor";
import { PageHead } from "../components/ui";
import { href } from "../lib/router";

export function PredictPage() {
  return (
    <>
      <PageHead eyebrow="Fare predictor" title="What will the meter say?"
        lede={<>Choose the zones and the pickup time. The route length is estimated from the straight line between the zones; you can type your own instead. The trained model runs in your browser and returns the expected meter fare plus the quote an app would show. The quote is set so the real fare stays at or under it on 90% of trips. <a href={href("/methodology")}>How it was built →</a></>} />
      <div className="wrap"><Predictor /></div>
      <div className="wrap" style={{ marginTop: "2rem" }}>
        <div className="card prose small">
          <h3>What this demo is, and isn't</h3>
          <ul>
            <li><b>Real model, real inference.</b> The site loads the frozen gradient-boosting model (trees, encoders and buffer table exported from the Python pipeline) and evaluates it in TypeScript. No server or precomputed answers are involved.</li>
            <li><b>Scope:</b> standard metered (Rate #01) yellow-taxi trips paid by card or cash. Flex/app-priced, flat-rate and negotiated fares were excluded from training.</li>
            <li><b>The distance is estimated, unless you type one.</b> The model was trained on the odometer distance recorded after each trip. Here it gets a straight-line estimate: the distance between zone centres × a detour factor learned from May trips of similar length (1.17–1.79). On June data the estimate was off by about half a mile on average, and the average fare error rose from $2.08 to $3.26. The quote uses wider buffers in this mode to keep 90% coverage. A distance typed from a maps app is closer to what the model was trained on.</li>
            <li><b>Trained on May 2026.</b> Fare rules, traffic and seasons change. Treat results for other periods as illustrations.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
