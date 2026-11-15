import { useMemo, type ReactNode } from "react";
import type { Zones } from "../lib/data";
import { Legend, useTip, useWidth } from "./charts";

/** NYC taxi-zone map (TLC shapefile, NY State Plane, simplified). Either a choropleth (`value`)
 *  or a picker (`onPick`), or both. Zones without data are drawn hatched-grey, never coloured. */
export function ZoneMap({ zones, value, color, tooltip, onPick, selected = [], legend, title, crop }: {
  zones: Zones;
  value?: (id: number) => number | undefined;
  color?: (v: number) => string;
  tooltip: (id: number) => ReactNode;
  onPick?: (id: number) => void;
  selected?: { id: number; color: string }[];
  legend?: { label: string; color: string }[];
  title: string;
  crop?: "manhattan";
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { tip, show, hide } = useTip();
  const [, , vw, vh] = zones.viewBox;
  // Manhattan-focused crop (in viewBox units); the full city otherwise.
  const vb = crop === "manhattan" ? [380, 120, 300, 420] : [0, 0, vw, vh];
  const maxH = 620;                                          // keep tall crops from taking over the page
  const mw = Math.min(w, Math.round((maxH * vb[2]) / vb[3]));
  const h = Math.round((mw * vb[3]) / vb[2]);
  const sel = useMemo(() => new Map(selected.map((s) => [s.id, s.color])), [selected]);
  const at = (e: React.MouseEvent) => {
    const r = (e.currentTarget.closest("figure") as HTMLElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <figure className="chart-wrap" ref={ref} style={{ margin: 0 }}>
      {legend && <Legend items={legend} />}
      <svg className={`zone-map${onPick ? " pick" : ""}`} width={mw} height={h} style={{ display: "block", margin: "0 auto" }} viewBox={vb.join(" ")} role="img" aria-label={title}>
        {zones.zones.filter((z) => z.path).map((z) => {
          const v = value?.(z.id);
          const fill = sel.get(z.id) ?? (v !== undefined && color ? color(v) : undefined);
          return (
            <path key={z.id} d={z.path} className={`${fill ? "" : "nodata"} ${sel.has(z.id) ? "sel" : ""}`} style={fill ? { fill } : undefined}
              vectorEffect="non-scaling-stroke"
              onMouseMove={(e) => { const [x, y] = at(e); show(x, y, tooltip(z.id)); }} onMouseLeave={hide}
              onClick={onPick ? () => onPick(z.id) : undefined} />
          );
        })}
      </svg>
      {tip}
    </figure>
  );
}
