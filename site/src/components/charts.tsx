import { useEffect, useRef, useState, type ReactNode } from "react";

/* Small, dependency-free SVG charts. Every chart is responsive (ResizeObserver), labelled,
   and shows n in its tooltips where the data has it. */

export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export const lin = (d0: number, d1: number, r0: number, r1: number) => (x: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);

export function ticks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

interface Tip { x: number; y: number; html: ReactNode }
export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const el = tip ? <div className="tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.html}</div> : null;
  return { tip: el, show: (x: number, y: number, html: ReactNode) => setTip({ x, y, html }), hide: () => setTip(null) };
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}

/* ---------------- horizontal bars with optional CI whiskers ---------------- */
export interface BarRow { label: string; value: number; lo?: number; hi?: number; highlight?: boolean; note?: string }
export function HBars({ rows, fmt, xLabel, title, minX = 0 }: { rows: BarRow[]; fmt: (v: number) => string; xLabel: string; title: string; minX?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const labelW = Math.min(230, w * 0.42), rowH = 34, top = 8, bottom = 36, right = 56;
  const h = top + rows.length * rowH + bottom;
  const max = Math.max(...rows.map((r) => r.hi ?? r.value)) * 1.05;
  const x = lin(minX, max, labelW, w - right);
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      <svg className="chart" width={w} height={h} role="img" aria-label={title}>
        <g className="grid">{ticks(minX, max).map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={top} y2={h - bottom} />)}</g>
        {rows.map((r, i) => {
          const y = top + i * rowH;
          return (
            <g key={r.label} tabIndex={0} onFocus={() => show(x(r.value), y + 6, `${r.label}: ${fmt(r.value)}`)} onBlur={hide}
              onMouseMove={() => show(x(r.value), y + 6, <>{r.label}<br />{fmt(r.value)}{r.lo !== undefined && <> · 95% CI {fmt(r.lo)} to {fmt(r.hi!)}</>}{r.note && <><br />{r.note}</>}</>)} onMouseLeave={hide}>
              <text x={labelW - 10} y={y + rowH / 2 + 4} textAnchor="end" className="label" style={{ fontWeight: r.highlight ? 700 : 400 }}>{r.label}</text>
              <rect x={x(minX)} y={y + 7} width={Math.max(1, x(r.value) - x(minX))} height={rowH - 14} rx={3}
                fill={r.highlight ? "var(--model)" : "var(--base)"} opacity={r.highlight ? 1 : 0.75} />
              {r.lo !== undefined && r.hi !== undefined && (
                <g stroke="var(--ink)" strokeWidth={1.4}>
                  <line x1={x(r.lo)} x2={x(r.hi)} y1={y + rowH / 2} y2={y + rowH / 2} />
                  <line x1={x(r.lo)} x2={x(r.lo)} y1={y + rowH / 2 - 5} y2={y + rowH / 2 + 5} />
                  <line x1={x(r.hi)} x2={x(r.hi)} y1={y + rowH / 2 - 5} y2={y + rowH / 2 + 5} />
                </g>
              )}
              <text x={x(r.hi ?? r.value) + 6} y={y + rowH / 2 + 4} className="label num">{fmt(r.value)}</text>
            </g>
          );
        })}
        <g className="axis">{ticks(minX, max).map((t) => <text key={t} x={x(t)} y={h - bottom + 16} textAnchor="middle">{fmt(t).replace(/\.0+$/, "")}</text>)}</g>
        <text x={(labelW + w - right) / 2} y={h - 4} textAnchor="middle">{xLabel}</text>
      </svg>
      {tip}
    </figure>
  );
}

/* ---------------- line chart ---------------- */
export interface Series { name: string; color: string; points: { x: number; y: number; n?: number }[]; dash?: string }
export function LineChart({ series, title, xLabel, yLabel, fmtY, xTicks, xFmt = String, refY, height = 280, yDomain }: {
  series: Series[]; title: string; xLabel: string; yLabel: string; fmtY: (v: number) => string; xTicks?: number[];
  xFmt?: (v: number) => string; refY?: { y: number; label: string }; height?: number; yDomain?: [number, number];
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const m = { l: 56, r: 16, t: 14, b: 44 };
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).concat(refY ? [refY.y] : []);
  const [y0, y1] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  const pad = (y1 - y0) * 0.08 || 1;
  const x = lin(Math.min(...xs), Math.max(...xs), m.l, w - m.r);
  const y = lin(yDomain ? y0 : y0 - pad, yDomain ? y1 : y1 + pad, height - m.b, m.t);
  const yt = ticks(yDomain ? y0 : y0 - pad, yDomain ? y1 : y1 + pad, 5);
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      <svg className="chart" width={w} height={height} role="img" aria-label={title}>
        <g className="grid">{yt.map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {yt.map((t) => <text key={t} x={m.l - 8} y={y(t) + 4} textAnchor="end">{fmtY(t)}</text>)}
          {(xTicks ?? ticks(Math.min(...xs), Math.max(...xs), 8)).map((t) => <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle">{xFmt(t)}</text>)}
        </g>
        <text x={(m.l + w - m.r) / 2} y={height - 6} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(13 ${(height - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {refY && <g><line x1={m.l} x2={w - m.r} y1={y(refY.y)} y2={y(refY.y)} stroke="var(--ink-3)" strokeDasharray="5 4" />
          <text x={w - m.r} y={y(refY.y) - 6} textAnchor="end">{refY.label}</text></g>}
        {series.map((s) => (
          <g key={s.name}>
            <path d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`).join("")} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dash} />
            {s.points.map((p) => (
              <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r={3.4} fill={s.color} tabIndex={0}
                onMouseMove={() => show(x(p.x), y(p.y), <>{s.name} · {xFmt(p.x)}<br />{fmtY(p.y)}{p.n !== undefined && <> · n = {p.n.toLocaleString("en-US")}</>}</>)}
                onFocus={() => show(x(p.x), y(p.y), `${s.name} ${xFmt(p.x)}: ${fmtY(p.y)}`)} onMouseLeave={hide} onBlur={hide} />
            ))}
          </g>
        ))}
      </svg>
      {tip}
    </figure>
  );
}

/* ---------------- histogram ---------------- */
export function Histogram({ edges, counts, title, xLabel, refX, fmtX = String, height = 260 }: {
  edges: number[]; counts: number[]; title: string; xLabel: string; refX?: number; fmtX?: (v: number) => string; height?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const m = { l: 56, r: 12, t: 10, b: 44 };
  const total = counts.reduce((a, b) => a + b, 0);
  const x = lin(edges[0], edges[edges.length - 1], m.l, w - m.r);
  const max = Math.max(...counts);
  const y = lin(0, max, height - m.b, m.t);
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      <svg className="chart" width={w} height={height} role="img" aria-label={title}>
        <g className="grid">{ticks(0, max, 4).map((t) => <line key={t} x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />)}</g>
        {counts.map((c, i) => (
          <rect key={i} x={x(edges[i]) + 0.5} y={y(c)} width={Math.max(0.5, x(edges[i + 1]) - x(edges[i]) - 1)} height={y(0) - y(c)}
            fill="var(--model)" opacity={0.85}
            onMouseMove={() => show(x((edges[i] + edges[i + 1]) / 2), y(c), <>{fmtX(edges[i])} to {fmtX(edges[i + 1])}<br />n = {c.toLocaleString("en-US")} ({((100 * c) / total).toFixed(1)}%)</>)}
            onMouseLeave={hide} />
        ))}
        {refX !== undefined && <line x1={x(refX)} x2={x(refX)} y1={m.t} y2={height - m.b} stroke="var(--ink)" strokeDasharray="4 3" />}
        <g className="axis">
          {ticks(0, max, 4).map((t) => <text key={t} x={m.l - 8} y={y(t) + 4} textAnchor="end">{t.toLocaleString("en-US")}</text>)}
          {ticks(edges[0], edges[edges.length - 1], 8).map((t) => <text key={t} x={x(t)} y={height - m.b + 16} textAnchor="middle">{fmtX(t)}</text>)}
        </g>
        <text x={(m.l + w - m.r) / 2} y={height - 6} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(13 ${(height - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle">trips</text>
      </svg>
      {tip}
    </figure>
  );
}

/* ---------------- 2-D density heatmap (log colour) ---------------- */
const SEQ = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)"];
export function Heatmap({ xEdges, yEdges, counts, title, xLabel, yLabel, fmtX = String, fmtY = String, diagonal, line }: {
  xEdges: number[]; yEdges: number[]; counts: number[][]; title: string; xLabel: string; yLabel: string;
  fmtX?: (v: number) => string; fmtY?: (v: number) => string; diagonal?: boolean; line?: { x0: number; y0: number; x1: number; y1: number; label: string };
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const m = { l: 56, r: 12, t: 10, b: 44 };
  const h = Math.min(440, Math.max(280, w * 0.62));
  const x = lin(xEdges[0], xEdges[xEdges.length - 1], m.l, w - m.r);
  const y = lin(yEdges[0], yEdges[yEdges.length - 1], h - m.b, m.t);
  const max = Math.log10(Math.max(1, ...counts.flat()) + 1);
  const color = (c: number) => SEQ[Math.min(4, Math.floor((Math.log10(c + 1) / max) * 4.999))];
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      <svg className="chart" width={w} height={h} role="img" aria-label={title}>
        {counts.map((row, i) => row.map((c, j) => c > 0 && (
          <rect key={`${i}-${j}`} x={x(xEdges[i])} y={y(yEdges[j + 1])} width={x(xEdges[i + 1]) - x(xEdges[i]) + 0.4} height={y(yEdges[j]) - y(yEdges[j + 1]) + 0.4}
            fill={color(c)} onMouseMove={() => show(x((xEdges[i] + xEdges[i + 1]) / 2), y(yEdges[j + 1]),
              <>{xLabel}: {fmtX(xEdges[i])}–{fmtX(xEdges[i + 1])}<br />{yLabel}: {fmtY(yEdges[j])}–{fmtY(yEdges[j + 1])}<br />n = {c.toLocaleString("en-US")}</>)} onMouseLeave={hide} />
        )))}
        {diagonal && <line x1={x(xEdges[0])} y1={y(yEdges[0])} x2={x(xEdges[xEdges.length - 1])} y2={y(yEdges[yEdges.length - 1])} stroke="var(--ink)" strokeDasharray="5 4" />}
        {line && <g><line x1={x(line.x0)} y1={y(line.y0)} x2={x(line.x1)} y2={y(line.y1)} stroke="var(--warn)" strokeWidth={2} />
          <text x={x(line.x1) - 4} y={y(line.y1) + 16} textAnchor="end" style={{ fill: "var(--warn)" }}>{line.label}</text></g>}
        <g className="axis">
          {ticks(yEdges[0], yEdges[yEdges.length - 1], 5).map((t) => <text key={t} x={m.l - 8} y={y(t) + 4} textAnchor="end">{fmtY(t)}</text>)}
          {ticks(xEdges[0], xEdges[xEdges.length - 1], 6).map((t) => <text key={t} x={x(t)} y={h - m.b + 16} textAnchor="middle">{fmtX(t)}</text>)}
        </g>
        <text x={(m.l + w - m.r) / 2} y={h - 6} textAnchor="middle">{xLabel}</text>
        <text transform={`translate(13 ${(h - m.b + m.t) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      </svg>
      <Legend items={[{ label: "fewer trips", color: SEQ[0] }, { label: "", color: SEQ[2] }, { label: "more trips (log scale)", color: SEQ[4] }]} />
      {tip}
    </figure>
  );
}

/* ---------------- coverage dot plot (with n) ---------------- */
export function CoverageDots({ rows, target, title }: { rows: { label: string; n: number; coverage: number }[]; target: number; title: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const labelW = Math.min(170, w * 0.36), rowH = 30, top = 6, bottom = 34, right = 70;
  const h = top + rows.length * rowH + bottom;
  const lo = Math.min(0.6, ...rows.map((r) => r.coverage)) - 0.02;
  const x = lin(lo, 1, labelW, w - right);
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      <svg className="chart" width={w} height={h} role="img" aria-label={title}>
        <g className="grid">{ticks(lo, 1, 5).map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={top} y2={h - bottom} />)}</g>
        <line x1={x(target)} x2={x(target)} y1={top} y2={h - bottom} stroke="var(--ink)" strokeDasharray="5 4" />
        <text x={x(target)} y={h - bottom + 28} textAnchor="middle">target {Math.round(target * 100)}%</text>
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const ok = r.coverage >= target - 0.02;
          return (
            <g key={r.label} onMouseMove={() => show(x(r.coverage), y, <>{r.label}<br />coverage {(r.coverage * 100).toFixed(1)}% · n = {r.n.toLocaleString("en-US")}</>)} onMouseLeave={hide}>
              <text x={labelW - 10} y={y + 4} textAnchor="end" className="label">{r.label}</text>
              <line x1={x(target)} x2={x(r.coverage)} y1={y} y2={y} stroke={ok ? "var(--good)" : "var(--warn)"} strokeWidth={2} />
              <circle cx={x(r.coverage)} cy={y} r={Math.min(9, 3 + Math.sqrt(r.n) / 40)} fill={ok ? "var(--good)" : "var(--warn)"} />
              <text x={w - right + 8} y={y + 4} className="num">{(r.coverage * 100).toFixed(1)}%</text>
            </g>
          );
        })}
        <g className="axis">{ticks(lo, 1, 5).map((t) => <text key={t} x={x(t)} y={h - bottom + 14} textAnchor="middle">{Math.round(t * 100)}%</text>)}</g>
      </svg>
      {tip}
    </figure>
  );
}
