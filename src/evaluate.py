import numpy as np
import pandas as pd
from datetime import datetime
from .config import PROCESSED


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


def slice_table(df, y, p, by, buffer=None, min_n=1) -> pd.DataFrame:
    """Errors by slice column `by`. Always look at n: a bad slice with n=40 is a footnote, not a finding."""
    d = pd.DataFrame({"y": np.asarray(y, float), "p": np.asarray(p, float), "k": df[by].reset_index(drop=True)})
    d["res"] = d.y - d.p
    d["abs"] = d.res.abs()
    d["sq"] = d.res ** 2
    if buffer is not None:
        d["cov"] = (d.y <= d.p + buffer).astype(float)
    g = d.groupby("k", observed=True)
    out = g.agg(n=("y", "size"), mae=("abs", "mean"), rmse=("sq", lambda s: float(np.sqrt(s.mean()))), bias=("res", "mean"))
    if buffer is not None:
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


# ---- July is scored once ----
LOCK = PROCESSED / ".test_scored"


def lock_test(force=False):
    """Call right before touching July. Raises if July was already scored (delete the file only
    if you are still before the final run, and say so in the README)."""
    PROCESSED.mkdir(parents=True, exist_ok=True)
    if LOCK.exists() and not force:
        raise RuntimeError(f"July already scored ({LOCK.read_text()}). Scoring it again defeats the test set.")
    LOCK.write_text(datetime.now().isoformat(timespec="seconds"))
