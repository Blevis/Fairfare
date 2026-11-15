import { useMemo, useState } from "react";
import { useModel, useResults, useZones, type Zones } from "../lib/data";
import { estimateDistance, predict, type ModelJSON } from "../lib/model";
import { pct, usd } from "../lib/format";
import { ZoneMap } from "./ZoneMap";

const EXCLUDED = new Set([264, 265]); // unknown zones: outside the population
const MAX_DIST = 24.85; // May 99.9% distance cap (src/clean.py)

// Example trips (the distance comes from the straight-line estimate, like any other trip).
const PRESETS = [
  { label: "Times Sq → Financial District", pu: 230, do: 87, when: "2026-07-15T08:30" },
  { label: "Upper East Side → Midtown, Friday evening", pu: 237, do: 161, when: "2026-07-17T18:00" },
  { label: "Midtown East → LaGuardia, Sunday", pu: 162, do: 138, when: "2026-07-19T11:00" },
];

function scopeWarnings(z: Map<number, { borough: string; zone: string }>, pu: number, dz: number, dist: number): string[] {
  const out: string[] = [];
  const b = (id: number) => z.get(id)?.borough;
  if ((pu === 132 && b(dz) === "Manhattan") || (dz === 132 && b(pu) === "Manhattan"))
    out.push("JFK ↔ Manhattan is a flat $70 fare (TLC Rate #02). Those trips were outside the training population, so this estimate does not apply.");
  if (pu === 1 || dz === 1) out.push("Newark trips are billed under Rate #03 (meter + $20 surcharge). Most were excluded from the population, so treat this estimate with caution.");
  if (dist > MAX_DIST) out.push(`Distances above ${MAX_DIST} mi were removed as outliers (May 99.9% cap), so the model has not seen trips this long.`);
  return out;
}

export function Predictor({ compact = false }: { compact?: boolean }) {
  const { data: model, error: me } = useModel();
  const { data: zones, error: ze } = useZones();
  if (me || ze) return <p className="warn-note">Could not load the model files: {me ?? ze}</p>;
  if (!model || !zones) return <div className="card loading" aria-busy="true">Loading the model (about 1 MB compressed; it runs entirely in your browser)…</div>;
  return <PredictorForm model={model} zones={zones} compact={compact} />;
}

function PredictorForm({ model, zones, compact }: { model: ModelJSON; zones: Zones; compact: boolean }) {
  const { data: res } = useResults();
  const [pu, setPu] = useState(230);
  const [dz, setDz] = useState(87);
  const [manualDist, setManualDist] = useState<number | null>(null);   // null = use the straight-line estimate
  const [when, setWhen] = useState("2026-07-15T08:30");
  const [picking, setPicking] = useState<"pu" | "do">("pu");

  const zmap = useMemo(() => new Map(zones.zones.map((z) => [z.id, z])), [zones]);
  const byBorough = useMemo(() => {
    const g = new Map<string, { id: number; zone: string }[]>();
    for (const z of zones.zones) {
      if (EXCLUDED.has(z.id)) continue;
      const list = g.get(z.borough) ?? [];
      list.push({ id: z.id, zone: z.zone });
      g.set(z.borough, list);
    }
    for (const l of g.values()) l.sort((a, b) => a.zone.localeCompare(b.zone));
    return [...g.entries()].sort((a, b) => (a[0] === "Manhattan" ? -1 : b[0] === "Manhattan" ? 1 : a[0].localeCompare(b[0])));
  }, [zones]);

  const est = estimateDistance(model.routing, pu, dz);
  const estimated = manualDist === null;
  const dist = manualDist ?? est.miles;
  const valid = dist > 0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when);
  const p = valid ? predict(model, { pickup: when, pu, do: dz, dist, pickupBorough: zmap.get(pu)?.borough ?? "Unknown", dropoffBorough: zmap.get(dz)?.borough ?? "Unknown" }, estimated ? "estimated" : "entered") : null;
  const cost = res?.routing.june_model_cost;
  const juneMae = (k: string) => cost?.find((c) => c.setting === k)?.mae;
  const warnings = scopeWarnings(zmap, pu, dz, dist);
  const bandRow = p && res?.july.july_slices.dist_band?.find((r) => String(r.dist_band) === p.distBand);

  const zoneSelect = (id: string, label: string, value: number, set: (v: number) => void) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => set(Number(e.target.value))}>
        {byBorough.map(([b, list]) => (
          <optgroup key={b} label={b}>{list.map((z) => <option key={z.id} value={z.id}>{z.zone}</option>)}</optgroup>
        ))}
      </select>
    </div>
  );

  return (
    <div className={compact ? "" : "grid g2"} style={{ alignItems: "start" }}>
      <form className="card" onSubmit={(e) => e.preventDefault()} aria-label="Trip details">
        <h3>Trip at booking</h3>
        <p className="small muted">Only what an app knows before the ride: when, where, and the planned route length.</p>
        <div className="form-grid">
          {zoneSelect("pu", "Pickup zone", pu, setPu)}
          {zoneSelect("do", "Drop-off zone", dz, setDz)}
          <div className="field">
            <label htmlFor="when">Pickup date &amp; time (NYC)</label>
            <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="dist">Planned distance (miles) <span className="pill">{estimated ? "estimated" : "entered"}</span></label>
            <input id="dist" type="number" min={0.1} max={40} step={0.1} value={estimated ? Number(dist.toFixed(2)) : dist} onChange={(e) => setManualDist(Number(e.target.value))} />
          </div>
          <div className="field span2">
            <input type="range" min={0.1} max={25} step={0.1} value={Math.min(dist, 25)} onChange={(e) => setManualDist(Number(e.target.value))} aria-label="Planned distance slider" />
            {estimated ? (
              <span className="hint">{est.straight !== undefined
                ? <>Estimated: {est.straight.toFixed(2)} mi straight line between the zone centres × detour factor {est.k!.toFixed(2)} (learned from May trips of that length). If you have a route distance from a maps app, type it in instead.</>
                : <>Same-zone trip: the median distance of May trips that start and end in this zone.</>}</span>
            ) : (
              <span className="hint">Using your distance. <button type="button" className="btn ghost" style={{ padding: ".15rem .5rem", fontSize: ".78rem" }} onClick={() => setManualDist(null)}>Use the straight-line estimate ({est.miles.toFixed(1)} mi)</button></span>
            )}
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: ".9rem", marginBottom: 0 }}>
          <span className="small muted">Examples:</span>
          {PRESETS.map((x) => (
            <button key={x.label} type="button" className="btn ghost" style={{ padding: ".3rem .6rem", fontSize: ".8rem" }}
              onClick={() => { setPu(x.pu); setDz(x.do); setManualDist(null); setWhen(x.when); }}>{x.label}</button>
          ))}
        </div>
      </form>

      <div className="card" aria-live="polite">
        <h3>Estimate</h3>
        {!p ? <p className="warn-note">Enter a distance above 0 and a valid date/time.</p> : (
          <>
            <div className="quote-box" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <div className="stat">
                <span className="k">Predicted meter fare</span>
                <span className="big num">{usd(p.fare)}</span>
                <span className="s">model's central estimate of <code>fare_amount</code></span>
              </div>
              <div className="stat">
                <span className="k">Quote shown to rider</span>
                <span className="big num quote">{usd(p.quote)}</span>
                <span className="s">prediction + {usd(p.buffer)} buffer for the {p.distBand} mi band</span>
              </div>
            </div>
            <ul className="small" style={{ paddingLeft: "1.1rem", marginTop: "1rem" }}>
              {estimated ? (
                <li>The distance is an estimate, so the quote uses wider buffers, calibrated on June for estimated distances. In cross-fitted June checks the real fare stayed at or under the quote on {res ? pct(res.routing.june_crossfit_quote_estimated.coverage) : "90%"} of trips. Without the real route the model is less accurate (June average error {juneMae("frozen model, estimated distance") !== undefined ? usd(juneMae("frozen model, estimated distance")!) : "…"} vs {juneMae("frozen model, odometer distance") !== undefined ? usd(juneMae("frozen model, odometer distance")!) : "…"} with the real distance). Not tested on July.</li>
              ) : (
                <li>The quote is set so that, on June data, the real meter fare stayed at or under it for {pct(model.buffer_q, 0)} of trips{bandRow ? <> (on July, {pct(Number(bandRow.coverage))} of {Number(bandRow.n).toLocaleString("en-US")} trips in this distance band; typical miss {usd(Number(bandRow.mae))})</> : null}. This assumes your distance is as accurate as a taxi's odometer.</li>
              )}
              <li>The official meter's distance part alone would be {usd(p.tlcDistanceOnly)} ($3.00 + $3.50/mi). The difference is mostly the expected time charge for slow traffic at this place and hour.</li>
              <li>Not included: surcharges (MTA, congestion, rush hour, overnight, airport), tolls and tip. These are billed outside <code>fare_amount</code>.</li>
            </ul>
            {(p.unseen.pair || p.unseen.pickupZone || p.unseen.dropoffZone) && (
              <p className="note small">{p.unseen.pickupZone || p.unseen.dropoffZone ? "One of these zones" : "This zone pair"} never appeared in the May training data, so the model falls back to the overall May average for it. Expect a larger error.</p>
            )}
            {warnings.map((w) => <p key={w} className="warn-note">{w}</p>)}
            <p className="small muted" style={{ marginBottom: 0 }}>Computed in your browser by an exact port of the trained model ({model.trees.length} boosted trees, trained on May 2026). It matches the Python model to within 10⁻⁹ dollars on 2,000 June trips.</p>
          </>
        )}
      </div>

      {!compact && (
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Or pick zones on the map</h3>
            <div className="seg" role="group" aria-label="Map click sets">
              <button type="button" aria-pressed={picking === "pu"} onClick={() => setPicking("pu")}>Set pickup</button>
              <button type="button" aria-pressed={picking === "do"} onClick={() => setPicking("do")}>Set drop-off</button>
            </div>
            <span className="small muted">Pickup: <b>{zmap.get(pu)?.zone}</b> · Drop-off: <b>{zmap.get(dz)?.zone}</b></span>
          </div>
          <ZoneMap zones={zones} title="Map of NYC taxi zones for choosing pickup and drop-off"
            selected={[{ id: pu, color: "var(--model)" }, { id: dz, color: "var(--div-neg)" }]}
            legend={[{ label: "pickup", color: "var(--model)" }, { label: "drop-off", color: "var(--div-neg)" }]}
            tooltip={(id) => <>{zmap.get(id)?.zone}<br /><span style={{ opacity: .75 }}>{zmap.get(id)?.borough} · zone {id}</span></>}
            onPick={(id) => { if (EXCLUDED.has(id)) return; if (picking === "pu") { setPu(id); setPicking("do"); } else setDz(id); }} />
          <p className="small muted" style={{ marginTop: ".5rem" }}>The distance is estimated from the straight line between the two zone centres. Type a route distance above to override it.</p>
        </div>
      )}
    </div>
  );
}
