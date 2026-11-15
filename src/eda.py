"""Descriptive statistics for the exploration notebook (NB05) and the website's Data page."""
import numpy as np
import pandas as pd

from .config import TARGET

STATS = ["count", "mean", "std", "min", "q1", "median", "q3", "max"]


def with_trip_measures(df: pd.DataFrame) -> pd.DataFrame:
    """Adds duration (min), fare per mile and average speed (mph). These are AFTER-the-trip
    quantities: fine for describing fares, never used as model features."""
    d = df.copy()
    d["duration_min"] = (d.tpep_dropoff_datetime - d.tpep_pickup_datetime).dt.total_seconds() / 60
    d["fare_per_mile"] = d[TARGET] / d.trip_distance
    d["speed_mph"] = d.trip_distance / (d.duration_min / 60)
    return d


def describe(s: pd.Series) -> dict:
    s = pd.Series(s).dropna()
    q = s.quantile([0.25, 0.5, 0.75])
    return dict(count=int(s.size), mean=float(s.mean()), std=float(s.std()), min=float(s.min()),
                q1=float(q[0.25]), median=float(q[0.5]), q3=float(q[0.75]), max=float(s.max()))


def describe_table(df: pd.DataFrame, cols) -> pd.DataFrame:
    return pd.DataFrame({c: describe(df[c]) for c in cols}).T[STATS]


def quartiles_by(df: pd.DataFrame, by: str, col: str = TARGET, min_n: int = 1) -> pd.DataFrame:
    """Five-number summary + mean of `col` per group (box-plot data), with n."""
    g = df.groupby(by, observed=True)[col]
    out = pd.DataFrame({"n": g.size(), "mean": g.mean(), "p10": g.quantile(0.1), "q1": g.quantile(0.25),
                        "median": g.median(), "q3": g.quantile(0.75), "p90": g.quantile(0.9)})
    out.index.name = by
    return out[out.n >= min_n]


def ranked_groups(df: pd.DataFrame, keys, min_n: int, sort: str = "median_fare", top: int = 10):
    """Most and least expensive groups (zones / zone pairs) with what explains them:
    distance, duration, speed, fare per mile. Medians, so a few odd trips cannot drive the ranking."""
    g = df.groupby(keys)
    t = pd.DataFrame({"n": g.size(), "median_fare": g[TARGET].median(), "mean_fare": g[TARGET].mean(),
                      "median_distance": g.trip_distance.median(), "median_duration": g.duration_min.median(),
                      "median_speed": g.speed_mph.median(), "median_fare_per_mile": g.fare_per_mile.median()})
    t = t[t.n >= min_n].sort_values(sort)
    return t.tail(top)[::-1], t.head(top)


def histogram(s: pd.Series, edges) -> dict:
    counts, _ = np.histogram(np.clip(s, edges[0], edges[-1] - 1e-9), edges)
    return {"edges": list(map(float, edges)), "counts": counts.astype(int).tolist()}
