import json
import numpy as np
import pandas as pd
from datetime import datetime
from .config import PROCESSED, RESULTS, SEED


def metrics(y, p) -> dict:
    y, p = np.asarray(y, float), np.asarray(p, float)
    e = y - p
    return dict(n=len(y), mae=float(np.abs(e).mean()), rmse=float(np.sqrt((e ** 2).mean())), bias=float(e.mean()))


def bootstrap_vs_baseline(y, p_model, p_base, groups=None, n_boot=1000, seed=0, alpha=0.05) -> pd.DataFrame:
    """Percentile bootstrap of MAE/RMSE for model, baseline, and model-minus-baseline.
    groups=None resamples trips; pass pickup date to resample whole days (trips within a day are
    correlated, so day-blocks give honest, wider intervals)."""
    y, pm, pb = (np.asarray(a, float) for a in (y, p_model, p_base))
    em, eb = y - pm, y - pb
    codes = np.arange(len(y)) if groups is None else pd.factorize(np.asarray(groups))[0]
    S = (pd.DataFrame({"g": codes, "n": 1, "am": np.abs(em), "sm": em ** 2, "ab": np.abs(eb), "sb": eb ** 2})
         .groupby("g").sum().to_numpy())                      # columns: n, am, sm, ab, sb
    G = len(S)
    rng = np.random.default_rng(seed)

    def stats(t):
        n = t[0]
        mm, mb = t[1] / n, t[3] / n
        rm, rb = np.sqrt(t[2] / n), np.sqrt(t[4] / n)
        return np.array([mm, mb, mm - mb, rm, rb, rm - rb])

    point = stats(S.sum(0))
    boots = np.array([stats(rng.multinomial(G, np.full(G, 1 / G)) @ S) for _ in range(n_boot)])
    names = ["mae_model", "mae_baseline", "mae_diff", "rmse_model", "rmse_baseline", "rmse_diff"]
    lo, hi = np.quantile(boots, [alpha / 2, 1 - alpha / 2], axis=0)
    return pd.DataFrame({"point": point, "lo": lo, "hi": hi}, index=names)


def slice_table(df, y, p, by, buffer=None, min_n=1, quote=None) -> pd.DataFrame:
    """Errors by slice column `by`. Always look at n: a bad slice with n=40 is a footnote, not a finding.
    Coverage is reported for an additive `buffer`, or for any per-trip `quote` array.
    bias = mean(actual - predicted): negative means the model over-predicts."""
    d = pd.DataFrame({"y": np.asarray(y, float), "p": np.asarray(p, float), "k": df[by].reset_index(drop=True)})
    d["res"] = d.y - d.p
    d["abs"] = d.res.abs()
    d["sq"] = d.res ** 2
    if buffer is not None:
        quote = d.p + buffer
    if quote is not None:
        d["cov"] = (d.y <= np.asarray(quote, float)).astype(float)
    g = d.groupby("k", observed=True)
    out = g.agg(n=("y", "size"), mae=("abs", "mean"), rmse=("sq", lambda s: float(np.sqrt(s.mean()))), bias=("res", "mean"))
    if quote is not None:
        out["coverage"] = g["cov"].mean()
    out.index.name = by
    return out[out.n >= min_n]


# ---- the decision: quote = prediction + buffer, want P(actual <= quote) >= q ----
def buffer_for_coverage(y, p, q=0.9) -> float:
    """Additive buffer = q-quantile of residuals (actual - predicted). Choose on JUNE, check on July."""
    return float(np.quantile(np.asarray(y, float) - np.asarray(p, float), q))


def coverage(y, p, buffer) -> float:
    return float((np.asarray(y, float) <= np.asarray(p, float) + buffer).mean())


def relative_buffer(y, p, q=0.9, floor=3.0) -> float:
    """Multiplicative buffer k: quote = max(p, floor) * k."""
    return float(np.quantile(np.asarray(y, float) / np.maximum(np.asarray(p, float), floor), q))


def coverage_rel(y, p, k, floor=3.0) -> float:
    return float((np.asarray(y, float) <= np.maximum(np.asarray(p, float), floor) * k).mean())


def fit_quote_rule(kind, y, p, q=0.9, slices=None, floor=3.0, min_n=200) -> dict:
    """Fit a quote rule on JUNE residuals. kind: 'additive' | 'multiplicative' | 'by_dist_band'.
    For 'by_dist_band' pass slices (the dist_band per trip); slices with < min_n trips use the
    global additive buffer."""
    y, p = np.asarray(y, float), np.asarray(p, float)
    if kind == "additive":
        return {"kind": kind, "q": q, "b": buffer_for_coverage(y, p, q)}
    if kind == "multiplicative":
        return {"kind": kind, "q": q, "k": relative_buffer(y, p, q, floor), "floor": floor}
    if kind == "by_dist_band":
        s = pd.Series(np.asarray(slices, dtype=object))
        default = buffer_for_coverage(y, p, q)
        b = {str(k): (float(np.quantile(y[idx] - p[idx], q)) if len(idx) >= min_n else default)
             for k, idx in s.groupby(s).indices.items()}
        return {"kind": kind, "q": q, "b": b, "default": default}
    raise ValueError(kind)


def apply_quote_rule(rule, p, slices=None) -> np.ndarray:
    p = np.asarray(p, float)
    if rule["kind"] == "additive":
        return p + rule["b"]
    if rule["kind"] == "multiplicative":
        return np.maximum(p, rule["floor"]) * rule["k"]
    s = np.asarray(slices, dtype=object).astype(str)
    return p + np.array([rule["b"].get(k, rule["default"]) for k in s])


def quote_report(y, quote) -> dict:
    """Coverage and the price of it: mean over-quote across all trips (quote - actual, clipped at 0)
    and mean of quote - actual (the customer's average 'cushion')."""
    y, quote = np.asarray(y, float), np.asarray(quote, float)
    return dict(n=len(y), coverage=float((y <= quote).mean()),
                mean_overquote=float(np.clip(quote - y, 0, None).mean()),
                mean_cushion=float((quote - y).mean()),
                mean_shortfall_when_under=float((y - quote)[y > quote].mean()) if (y > quote).any() else 0.0)


def perturb_distance(df, rel_sd, seed=SEED):
    """Planned-vs-measured distance sensitivity: multiply trip_distance by mean-one log-normal noise
    with log-sd rel_sd (0.1 ~ +/-10%). Applied to the scoring data only - the model stays as trained."""
    if rel_sd == 0:
        return df
    rng = np.random.default_rng(seed)
    d = df.copy()
    d["trip_distance"] = d.trip_distance * np.exp(rng.normal(-rel_sd ** 2 / 2, rel_sd, len(d)))
    return d


def save_results(obj, name):
    """Write a JSON result file under results/ (committed, so the documented numbers are traceable)."""
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / name
    path.write_text(json.dumps(obj, indent=2, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    return path


# ---- July is scored once ----
LOCK = PROCESSED / ".test_scored"


def lock_test(force=False):
    """Call right before touching July. Raises if July was already scored (delete the file only
    if you are still before the final run, and say so in the README)."""
    PROCESSED.mkdir(parents=True, exist_ok=True)
    if LOCK.exists() and not force:
        raise RuntimeError(f"July already scored ({LOCK.read_text()}). Scoring it again defeats the test set.")
    LOCK.write_text(datetime.now().isoformat(timespec="seconds"))
