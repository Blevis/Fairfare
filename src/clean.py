"""Cleaning. Fixed rules apply to every month; data-derived thresholds are fitted on May ONLY
and passed to June/July. Every step is logged (rows removed, % of input) for the findings table.

All DECISIONS below are defaults - confirm or change them after the NB02 audit, and mirror
them in PROBLEM.md."""
import pandas as pd
from .config import TARGET, UNKNOWN_ZONES
from .data import load_raw, split_by_month

DEFAULTS = dict(
    drop_flex=True,           # payment_type 0: app-priced, no rate code (~25% of rows)
    drop_bad_payment=True,    # keep card (1) and cash (2); drop no-charge/dispute/unknown/voided
    standard_rate_only=True,  # RatecodeID == 1 (JFK flat, Newark, negotiated... are other regimes)
    min_duration_min=1.0,     # corrupt-record check ONLY; duration is never a feature
    max_duration_min=180.0,
    cap_quantile=0.999,       # upper caps on distance & fare, learned on May
)


def clean(df, params=None, cfg=None):
    """Return (clean_df, log_df, params). Pass params=None for TRAIN only; reuse them for val/test."""
    cfg = {**DEFAULTS, **(cfg or {})}
    n0 = len(df)
    log = []
    d = df.copy()
    d["_dur"] = (d["tpep_dropoff_datetime"] - d["tpep_pickup_datetime"]).dt.total_seconds() / 60

    def step(d, keep, name, why):
        out = d.loc[keep]
        removed = len(d) - len(out)
        log.append(dict(step=name, removed=removed, pct_of_input=round(100 * removed / n0, 3),
                        remaining=len(out), why=why))
        return out

    d = step(d, ~d.PULocationID.isin(UNKNOWN_ZONES) & ~d.DOLocationID.isin(UNKNOWN_ZONES)
             & d.PULocationID.notna() & d.DOLocationID.notna(),
             "unknown_zones", "zones 264/265 or missing: no usable location")
    if cfg["drop_flex"]:
        d = step(d, d.payment_type.ne(0), "flex_fare", "app-priced, not the meter's time+distance fare (verify in NB02)")
    if cfg["drop_bad_payment"]:
        d = step(d, d.payment_type.isin([1, 2]), "payment_not_card_cash", "no-charge/dispute/unknown/voided are not real fares")
    if cfg["standard_rate_only"]:
        d = step(d, d.RatecodeID.eq(1), "non_standard_rate", "flat/negotiated fares follow different rules")
    d = step(d, d[TARGET] > 0, "fare_not_positive", "zero/negative fare is not a fare (population definition)")
    d = step(d, d.trip_distance > 0, "distance_not_positive", "zero distance: no planned route")
    d = step(d, d._dur.between(cfg["min_duration_min"], cfg["max_duration_min"]),
             "impossible_duration", "corrupt timestamps; used as a validity check only")

    if params is None:   # TRAIN ONLY
        q = cfg["cap_quantile"]
        params = {"dist_cap": float(d.trip_distance.quantile(q)), "fare_cap": float(d[TARGET].quantile(q))}
    d = step(d, (d.trip_distance <= params["dist_cap"]) & (d[TARGET] <= params["fare_cap"]),
             "above_caps", f"above May {cfg['cap_quantile']} quantile caps {params}")

    d = d.drop(columns="_dur").reset_index(drop=True)
    return d, pd.DataFrame(log), params


def build_datasets(raw=None, cfg=None):
    """Raw -> split by month -> clean (params fitted on May). Returns a dict."""
    raw = load_raw() if raw is None else raw
    splits, n_out = split_by_month(raw)
    train, log_tr, params = clean(splits["train"], None, cfg)
    val, log_va, _ = clean(splits["val"], params, cfg)
    test, log_te, _ = clean(splits["test"], params, cfg)
    return dict(train=train, val=val, test=test, params=params, n_out_of_range=n_out,
                logs={"train": log_tr, "val": log_va, "test": log_te},
                n_raw={k: len(v) for k, v in splits.items()})
