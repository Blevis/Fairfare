import { useMemo, useState } from "react";
import { Heatmap, Histogram, LineChart } from "../components/charts";
import { ZoneMap } from "../components/ZoneMap";
import { Loading, PageHead, Section } from "../components/ui";
import { useResults, useZones, type AggRow } from "../lib/data";
import { int, pct, signedUsd, usd } from "../lib/format";

type Metric = "mae" | "bias" | "coverage" | "n";
const METRICS: { key: Metric; label: string }[] = [
  { key: "mae", label: "Mean abs. error" }, { key: "bias", label: "Bias" }, { key: "coverage", label: "Quote coverage" }, { key: "n", label: "Trips" },
];
const SEQ = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)"];

function colorFor(metric: Metric, values: number[]) {
  if (metric === "bias") {           // diverging, symmetric around 0
    const m = Math.max(...values.map(Math.abs)) || 1;
    return (v: number) => `color-mix(in srgb, ${v < 0 ? "var(--div-neg)" : "var(--div-pos)"} ${Math.round(15 + 85 * Math.min(1, Math.abs(v) / m))}%, var(--paper-2))`;
  }
  if (metric === "coverage") {       // diverging around the 90% target
    return (v: number) => `color-mix(in srgb, ${v < 0.9 ? "var(--div-pos)" : "var(--good)"} ${Math.round(15 + 85 * Math.min(1, Math.abs(v - 0.9) / 0.15))}%, var(--paper-2))`;
  }
  const sorted = [...values].sort((a, b) => a - b);  // quintiles for skewed metrics
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => sorted[Math.floor(p * (sorted.length - 1))]);
  return (v: number) => SEQ[q.filter((t) => v > t).length];
}

export function Analytics() {
  const { data: r, error } = useResults();
  const { data: zones } = useZones();
  const [metric, setMetric] = useState<Metric>("mae");
  const [side, setSide] = useState<"pu" | "do">("pu");
  const [minN, setMinN] = useState(50);
  const [crop, setCrop] = useState<"manhattan" | undefined>("manhattan");

  const rows = useMemo(() => {
    if (!r) return new Map<number, AggRow>();
    const list = side === "pu" ? r.july_analytics.by_pickup_zone : r.july_analytics.by_dropoff_zone;
    return new Map(list.map((x) => [Number(side === "pu" ? x.pu : x.do), x]));
  }, [r, side]);
  if (!r) return <Loading error={error} />;
  const a = r.july_analytics;
  const shown = [...rows.values()].filter((x) => x.n >= minN);
  const color = colorFor(metric, shown.map((x) => x[metric]));
  const zname = new Map(zones?.zones.map((z) => [z.id, z]) ?? []);
  const hourSeries = (key: "mae" | "bias" | "coverage") => [0, 1].map((we) => ({
    name: we ? "weekend" : "weekday", color: we ? "var(--div-neg)" : "var(--model)",
    points: a.by_hour_weekend.filter((x) => x.weekend === we).map((x) => ({ x: x.hour, y: x[key], n: x.n })),
  }));
  return (
    <>
      <PageHead eyebrow="Analytics · July 2026 test month" title="Where the errors are"
        lede={<>All charts on this page use the {int(a.n)} July test trips, aggregated during the single locked evaluation run. Each view shows its sample sizes. Hover or focus a mark for details.</>} />

      <Section eyebrow="Geography" title="Error by taxi zone">
        <div className="card">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Metric">{METRICS.map((m) => <button key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}</div>
            <div className="seg" role="group" aria-label="Zone side"><button aria-pressed={side === "pu"} onClick={() => setSide("pu")}>by pickup</button><button aria-pressed={side === "do"} onClick={() => setSide("do")}>by drop-off</button></div>
            <div className="seg" role="group" aria-label="Map extent"><button aria-pressed={crop === "manhattan"} onClick={() => setCrop("manhattan")}>Manhattan</button><button aria-pressed={!crop} onClick={() => setCrop(undefined)}>All NYC</button></div>
            <label className="small" style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>min trips
              <select value={minN} onChange={(e) => setMinN(Number(e.target.value))} style={{ width: "auto", minHeight: 0, padding: ".25rem .4rem" }}>{[1, 30, 50, 100, 500].map((n) => <option key={n}>{n}</option>)}</select></label>
          </div>
          {zones ? <ZoneMap zones={zones} crop={crop} title={`July ${metric} by ${side === "pu" ? "pickup" : "drop-off"} zone`}
            value={(id) => { const x = rows.get(id); return x && x.n >= minN ? x[metric] : undefined; }} color={color}
            tooltip={(id) => { const x = rows.get(id); const z = zname.get(id); return <>{z?.zone} <span style={{ opacity: .7 }}>({z?.borough})</span><br />{x ? <>n = {int(x.n)} · MAE {usd(x.mae)} · bias {signedUsd(x.bias)}<br />coverage {pct(x.coverage)} · mean fare {usd(x.mean_fare)}{x.n < minN && <><br /><i>below the minimum-trips filter</i></>}</> : "no July trips"}</>; }} />
            : <p className="loading">Loading map…</p>}
          <p className="small muted" style={{ marginTop: ".5rem" }}>
            {metric === "bias" ? "Blue = the model predicts too high; red = too low. " : metric === "coverage" ? "Green = at or above the 90% target; red = below. " : "Colour = quintile among the zones shown. "}
            Grey zones have fewer than {minN} July trips ({shown.length} of {rows.size} zones shown). Zones with few trips are noisy: compare them with care.</p>
        </div>
      </Section>

      <Section eyebrow="Time" title="Error by pickup hour">
        <div className="grid g2">
          <div className="card"><h3>Mean absolute error</h3>
            <LineChart title="July MAE by hour, weekday vs weekend" series={hourSeries("mae")} xLabel="pickup hour" yLabel="MAE" fmtY={(v) => `$${v.toFixed(2)}`} xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 23]} /></div>
          <div className="card"><h3>Bias (actual − predicted)</h3>
            <LineChart title="July bias by hour, weekday vs weekend" series={hourSeries("bias")} xLabel="pickup hour" yLabel="bias" fmtY={(v) => `$${v.toFixed(2)}`} refY={{ y: 0, label: "no bias" }} xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 23]} /></div>
          <div className="card" style={{ gridColumn: "1 / -1" }}><h3>Quote coverage</h3>
            <LineChart title="July quote coverage by hour" series={hourSeries("coverage")} xLabel="pickup hour" yLabel="coverage" fmtY={(v) => `${Math.round(v * 100)}%`} refY={{ y: 0.9, label: "target 90%" }} xTicks={[0, 3, 6, 9, 12, 15, 18, 21, 23]} height={240} />
            <div className="legend"><span><i style={{ background: "var(--model)" }} />weekday</span><span><i style={{ background: "var(--div-neg)" }} />weekend</span></div>
            <p className="small muted">One per-band buffer is too generous at night and too tight at midday, when slow traffic adds time charges the booking inputs can only partly anticipate.</p></div>
        </div>
      </Section>

      <Section eyebrow="Calibration" title="Predicted vs actual">
        <div className="grid g2">
          <div className="card"><h3>Every July trip, binned</h3>
            <Heatmap xEdges={a.pred_vs_actual.edges} yEdges={a.pred_vs_actual.edges} counts={a.pred_vs_actual.counts} diagonal
              title="Density of actual against predicted fare, July" xLabel="predicted fare" yLabel="actual fare" fmtX={(v) => `$${v}`} fmtY={(v) => `$${v}`} />
            <p className="small muted">Dashed line: perfect prediction. Values are clipped at $100.</p></div>
          <div className="card"><h3>By decile of the prediction</h3>
            <LineChart title="Mean and median actual fare per prediction decile" xLabel="mean predicted fare in decile" yLabel="actual fare" fmtY={(v) => `$${v.toFixed(0)}`} xFmt={(v) => `$${v.toFixed(0)}`}
              series={[{ name: "mean actual", color: "var(--model)", points: a.calibration_deciles.map((d) => ({ x: d.mean_pred, y: d.mean_actual, n: d.n })) },
                { name: "median actual", color: "var(--div-neg)", dash: "5 4", points: a.calibration_deciles.map((d) => ({ x: d.mean_pred, y: d.median_actual, n: d.n })) }]} />
            <p className="small muted">The model is trained with absolute-error loss, so it targets the <i>median</i> fare. The mean actual sits slightly above the prediction because fares have a long right tail (slow trips).</p></div>
        </div>
      </Section>

      <Section eyebrow="Error distribution" title="How big are the misses?">
        <div className="card">
          <Histogram title="Histogram of July residuals" edges={a.residual_hist.edges} counts={a.residual_hist.counts} xLabel="actual − predicted fare ($), clipped to −$20…$30" refX={0} fmtX={(v) => `$${v}`} />
          <p className="small muted">Most errors are within a few dollars. The right tail is long: some trips cost far more than predicted (traffic, detours, waiting), which is why the quote needs a buffer.</p>
        </div>
      </Section>
    </>
  );
}
