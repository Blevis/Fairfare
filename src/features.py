"""Row-wise (stateless) feature derivation + whitelist guard. Anything LEARNED (encoders, scalers,
target encoding) must live inside the sklearn Pipeline in models.py so it is fitted on May only."""
import numpy as np
import pandas as pd
from .config import AIRPORT_ZONES, FORBIDDEN

DIST_BINS = [0, 1, 2, 5, 10, 20, np.inf]
DIST_LABELS = ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"]

_BASE = ["trip_distance"]
_TIME = ["hour", "dow"]
_GEO = ["pickup_borough", "dropoff_borough", "same_borough", "same_zone"]
_AIR = ["pu_airport", "do_airport"]
_SHAPE = ["log_distance", "dist_band"]

# Cumulative, so the ablation table reads as "what did each addition do on June".
FEATURE_SETS = {
    "f0_distance": _BASE,
    "f1_time": _BASE + _TIME,
    "f2_geo": _BASE + _TIME + _GEO,
    "f3_airport": _BASE + _TIME + _GEO + _AIR,
    "f4_shape": _BASE + _TIME + _GEO + _AIR + _SHAPE,
}
CATEGORICAL = {"hour", "dow", "pickup_borough", "dropoff_borough", "dist_band"}


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
    return d


def assert_no_leak(cols):
    bad = set(cols) & FORBIDDEN
    if bad:
        raise ValueError(f"Features use information not available at booking: {sorted(bad)}")
