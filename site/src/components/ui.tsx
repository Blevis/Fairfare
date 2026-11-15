import type { ReactNode } from "react";

export function Stat({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) {
  return (
    <div className="card stat">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {s && <span className="s">{s}</span>}
    </div>
  );
}

export function Section({ eyebrow, title, children, lede, id }: { eyebrow?: string; title: string; children?: ReactNode; lede?: ReactNode; id?: string }) {
  return (
    <section className="block fade-in" aria-labelledby={id ? `${id}-h` : undefined}>
      <div className="wrap">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </section>
  );
}

export interface Col<T> { key: string; label: string; render: (r: T) => ReactNode }
export function DataTable<T>({ rows, cols, caption, highlight }: { rows: T[]; cols: Col<T>[]; caption?: string; highlight?: (r: T) => boolean }) {
  return (
    <div className="table-scroll">
      <table className="data">
        {caption && <caption>{caption}</caption>}
        <thead><tr>{cols.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={highlight?.(r) ? "hl" : undefined}>{cols.map((c) => <td key={c.key}>{c.render(r)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHead({ eyebrow, title, lede }: { eyebrow: string; title: string; lede: ReactNode }) {
  return (
    <div className="wrap page-head fade-in">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  );
}

export const Loading = ({ error }: { error?: string }) =>
  error ? <div className="wrap"><p className="warn-note">Could not load data: {error}</p></div> : <div className="wrap loading" aria-busy="true">Loading…</div>;
