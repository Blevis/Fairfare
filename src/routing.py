"""A deliberately simple "routing engine": straight-line distance between zone centroids,
scaled by a detour (circuity) factor learned on May.

    planned_miles = k[band] * straight_line_miles(pickup centroid, drop-off centroid)   (different zones)
    planned_miles = median May distance of trips that start and end in that zone       (same zone)

k[band] is the median of trip_distance / straight_line over May trips between different zones whose
straight line falls in that band: short hops detour relatively more, and long trips use bridges and
highways, so one global factor under-estimates long trips. Bands with < 200 May trips use the
global median k. Everything is fitted on May (train) only.
"""
import numpy as np
import pandas as pd

from .geo import FT_PER_MILE, zone_centroids


class StraightLineRouter:
    BAND_EDGES = (0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 12.0)   # straight-line miles; last band is open

    def __init__(self, min_straight_mi=0.25, min_same_zone_trips=20, min_band_trips=200):
        self.min_straight_mi = min_straight_mi            # ignore near-zero denominators when fitting k
        self.min_same_zone_trips = min_same_zone_trips
        self.min_band_trips = min_band_trips

    def band(self, s):
        return np.searchsorted(self.BAND_EDGES, np.asarray(s), side="right") - 1

    def straight_miles(self, pu, do):
        c = zone_centroids().set_index("LocationID")
        p = c.reindex(np.asarray(pu))
        q = c.reindex(np.asarray(do))
        return np.hypot(p.x_ft.to_numpy() - q.x_ft.to_numpy(), p.y_ft.to_numpy() - q.y_ft.to_numpy()) / FT_PER_MILE

    def fit(self, train: pd.DataFrame):
        s = self.straight_miles(train.PULocationID, train.DOLocationID)
        diff = (train.PULocationID.to_numpy() != train.DOLocationID.to_numpy()) & (s >= self.min_straight_mi)
        ratio = train.trip_distance.to_numpy()[diff] / s[diff]
        self.k_ = float(np.median(ratio))
        self.ratio_quantiles_ = {q: float(np.quantile(ratio, q)) for q in (0.1, 0.25, 0.5, 0.75, 0.9)}
        b = self.band(s[diff])
        self.k_band_ = [float(np.median(ratio[b == i])) if (b == i).sum() >= self.min_band_trips else self.k_
                        for i in range(len(self.BAND_EDGES))]
        self.n_band_ = [int((b == i).sum()) for i in range(len(self.BAND_EDGES))]
        same = train[train.PULocationID == train.DOLocationID]
        g = same.groupby("PULocationID").trip_distance.agg(["median", "size"])
        self.same_zone_ = {int(z): float(m) for z, (m, n) in g.iterrows() if n >= self.min_same_zone_trips}
        # no same-zone trips at all (tiny or synthetic data): fall back to the overall median distance
        self.same_zone_default_ = float(same.trip_distance.median()) if len(same) else float(train.trip_distance.median())
        self.n_fit_ = int(diff.sum())
        return self

    def predict(self, pu, do) -> np.ndarray:
        pu, do = np.asarray(pu), np.asarray(do)
        s = self.straight_miles(pu, do)
        est = np.asarray(self.k_band_)[np.clip(self.band(np.nan_to_num(s)), 0, None)] * s
        same = pu == do
        est[same] = [self.same_zone_.get(int(z), self.same_zone_default_) for z in pu[same]]
        # unknown zones (no centroid): fall back to the same-zone default rather than NaN
        est[~np.isfinite(est)] = self.same_zone_default_
        return est

    def apply(self, df: pd.DataFrame) -> pd.DataFrame:
        """Copy of df with trip_distance replaced by the booking-time estimate."""
        d = df.copy()
        d["trip_distance"] = self.predict(d.PULocationID, d.DOLocationID)
        return d
