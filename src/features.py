"""Row-wise (stateless) feature derivation + whitelist guard. Anything LEARNED (encoders, scalers,
target encoding) must live inside the sklearn Pipeline in models.py so it is fitted on May only."""
import numpy as np
import pandas as pd
from .config import AIRPORT_ZONES, FORBIDDEN

DIST_BINS = [0, 1, 2, 5, 10, 20, np.inf]
DIST_LABELS = ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"]
HOUR_BINS = [-1, 5, 9, 15, 19, 23]
HOUR_LABELS = ["night 0-5", "am 6-9", "midday 10-15", "pm 16-19", "eve 20-23"]

_BASE = ["trip_distance"]
_TIME = ["hour", "dow"]
_GEO = ["pickup_borough", "dropoff_borough", "same_borough", "same_zone"]
_AIR = ["pu_airport", "do_airport"]
_SHAPE = ["log_distance", "dist_band"]
_ZONE = ["pu_zone_id", "do_zone_id"]                    # target-encoded inside the pipeline
_PAIR = ["zone_pair"]                                   # target-encoded inside the pipeline
# Per-mile price that varies by time of week (slow traffic is billed by the minute).
_TIMEX = ["hour_wk"] + [f"dist_x_{w}_{b}" for w in ("wd", "we") for b in range(len(HOUR_LABELS))]

# Cumulative, so the ablation table reads as "what did each addition do on June".
FEATURE_SETS = {
    "f0_distance": _BASE,
    "f1_time": _BASE + _TIME,
    "f2_geo": _BASE + _TIME + _GEO,
    "f3_airport": _BASE + _TIME + _GEO + _AIR,
    "f4_shape": _BASE + _TIME + _GEO + _AIR + _SHAPE,
    "f5_zones": _BASE + _TIME + _GEO + _AIR + _SHAPE + _ZONE,
    "f6_pair": _BASE + _TIME + _GEO + _AIR + _SHAPE + _ZONE + _PAIR,
    "f7_time_x": _BASE + _TIME + _GEO + _AIR + _SHAPE + _ZONE + _PAIR + _TIMEX,
}
CATEGORICAL = {"hour", "dow", "pickup_borough", "dropoff_borough", "dist_band", "hour_wk"}
TARGET_ENCODED = {"pu_zone_id", "do_zone_id", "zone_pair"}


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    ts = d["tpep_pickup_datetime"]
    d["hour"] = ts.dt.hour
    d["dow"] = ts.dt.dayofweek
    d["pu_airport"] = d.PULocationID.isin(AIRPORT_ZONES).astype(int)
    d["do_airport"] = d.DOLocationID.isin(AIRPORT_ZONES).astype(int)
    d["airport_trip"] = ((d.pu_airport + d.do_airport) > 0).astype(int)
    d["same_zone"] = (d.PULocationID == d.DOLocationID).astype(int)
    d["pickup_borough"] = d["pickup_borough"].fillna("Unknown")
    d["dropoff_borough"] = d["dropoff_borough"].fillna("Unknown")
    d["same_borough"] = (d.pickup_borough == d.dropoff_borough).astype(int)
    d["log_distance"] = np.log1p(d.trip_distance)
    d["dist_band"] = pd.cut(d.trip_distance, DIST_BINS, labels=DIST_LABELS)
    # zone identities as strings so the encoders treat them as categories, never as numbers
    d["pu_zone_id"] = d.PULocationID.astype(str)
    d["do_zone_id"] = d.DOLocationID.astype(str)
    d["zone_pair"] = d.pu_zone_id + "_" + d.do_zone_id
    weekend = d.dow >= 5
    d["weekend"] = weekend.astype(int)
    d["hour_wk"] = np.where(weekend, "we_", "wd_") + d.hour.astype(str).str.zfill(2)
    band = pd.cut(d.hour, HOUR_BINS, labels=False)
    d["hour_band"] = pd.cut(d.hour, HOUR_BINS, labels=HOUR_LABELS)
    for w, mask in (("wd", ~weekend), ("we", weekend)):
        for b in range(len(HOUR_LABELS)):
            d[f"dist_x_{w}_{b}"] = d.trip_distance * (mask & (band == b))
    return d


def assert_no_leak(cols):
    bad = set(cols) & FORBIDDEN
    if bad:
        raise ValueError(f"Features use information not available at booking: {sorted(bad)}")
