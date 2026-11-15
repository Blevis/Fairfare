"""Protocol tests on SYNTHETIC data (no download needed). Run:  python -m tests   (or pytest).
They check the rules the results depend on: no leakage, May-only fitting, July locked."""
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from src import evaluate
from src.clean import build_datasets, clean
from src.config import BOOKING_INPUTS, FORBIDDEN, TARGET
from src.evaluate import apply_quote_rule, bootstrap_vs_baseline, fit_quote_rule, metrics, perturb_distance
from src.features import FEATURE_SETS, add_features, assert_no_leak
from src.models import MODELS, MedianBaseline, RateRule, make_model, make_pipeline


def synthetic_raw(n_per_month=1500, seed=0):
    """Trips that look like the real schema: fare = 3 + 3.5*miles + slow-traffic time + noise."""
    rng = np.random.default_rng(seed)
    parts = []
    for month in (5, 6, 7):
        n = n_per_month
        start = pd.Timestamp(2026, month, 1)
        pick = start + pd.to_timedelta(rng.uniform(0, 28 * 86400, n), unit="s")
        dist = np.round(rng.gamma(1.5, 2.0, n) + 0.05, 2)
        minutes = dist * rng.uniform(2.5, 6, n) + 2
        pu = rng.integers(1, 266, n)
        do = rng.integers(1, 266, n)
        fare = np.round(3 + 3.5 * dist + 0.2 * minutes + rng.normal(0, 1, n), 1)
        parts.append(pd.DataFrame({
            "VendorID": 2, "tpep_pickup_datetime": pick,
            "tpep_dropoff_datetime": pick + pd.to_timedelta(minutes, unit="m"),
            "passenger_count": 1.0, "trip_distance": dist,
            "RatecodeID": rng.choice([1.0, 1.0, 1.0, 2.0], n), "store_and_fwd_flag": "N",
            "PULocationID": pu, "DOLocationID": do, "payment_type": rng.choice([0, 1, 1, 2, 4], n),
            "fare_amount": fare, "extra": 0.0, "mta_tax": 0.5, "tip_amount": 0.0, "tolls_amount": 0.0,
            "improvement_surcharge": 1.0, "total_amount": fare + 1.5, "congestion_surcharge": 2.5,
            "Airport_fee": 0.0, "cbd_congestion_fee": 0.75, "request_source": None,
            "pickup_borough": rng.choice(["Manhattan", "Queens", "Brooklyn"], n),
            "pickup_zone": "z", "dropoff_borough": rng.choice(["Manhattan", "Queens"], n), "dropoff_zone": "z",
        }))
    return pd.concat(parts, ignore_index=True)


RAW = synthetic_raw()
D = build_datasets(RAW)


def test_every_feature_set_respects_blacklist():
    for cols in FEATURE_SETS.values():
        assert_no_leak(cols)
    try:
        assert_no_leak(["trip_distance", "tip_amount"])
    except ValueError:
        pass
    else:
        raise AssertionError("assert_no_leak did not catch tip_amount")


def test_booking_inputs_are_not_forbidden():
    assert not set(BOOKING_INPUTS) & FORBIDDEN


def test_pipeline_ignores_forbidden_columns():
    """Scrambling every post-trip column must not change a single prediction."""
    train, val = D["train"], D["val"]
    pipe = make_pipeline(make_model("hgb", max_iter=20), "f7_time_x").fit(train, train[TARGET])
    scrambled = val.copy()
    rng = np.random.default_rng(1)
    for c in FORBIDDEN & set(val.columns):
        scrambled[c] = rng.permutation(scrambled[c].to_numpy())
    np.testing.assert_array_equal(pipe.predict(val), pipe.predict(scrambled))


def test_caps_are_fitted_on_may_only():
    _, _, params_may = clean(D_raw_month(5))
    assert D["params"] == params_may
    # val/test cleaned with May's caps, never their own
    assert D["val"].trip_distance.max() <= params_may["dist_cap"]
    assert D["test"][TARGET].max() <= params_may["fare_cap"]


def D_raw_month(m):
    return RAW[RAW.tpep_pickup_datetime.dt.month == m]


def test_split_is_by_pickup_month():
    for name, m in (("train", 5), ("val", 6), ("test", 7)):
        assert D[name].tpep_pickup_datetime.dt.month.eq(m).all()


def test_target_encoder_is_fitted_on_train_only():
    """Changing June's fares must not change June's predictions (encoder fitted on May only)."""
    train, val = D["train"], D["val"]
    pipe = make_pipeline(make_model("linear"), "f6_pair").fit(train, train[TARGET])
    v2 = val.copy()
    v2[TARGET] = v2[TARGET] * 10
    np.testing.assert_array_equal(pipe.predict(val), pipe.predict(v2))


def test_all_models_and_sets_fit_and_predict():
    train, val = D["train"], D["val"]
    for fs in FEATURE_SETS:
        for name in ("linear", "tree", "hgb"):
            kw = {"max_iter": 10} if name == "hgb" else {}
            p = make_pipeline(make_model(name, **kw), fs).fit(train, train[TARGET]).predict(val)
            assert np.isfinite(p).all() and len(p) == len(val)


def test_baselines():
    train = D["train"]
    assert np.allclose(MedianBaseline().fit(train, train[TARGET]).predict(train), train[TARGET].median())
    rr = RateRule(start=3.0, per_mile=3.5).fit(train, train[TARGET])
    assert np.allclose(rr.predict(train), 3 + 3.5 * train.trip_distance)


def test_seeded_models_are_reproducible():
    train, val = D["train"], D["val"]
    a = make_pipeline(make_model("hgb", max_iter=20), "f6_pair").fit(train, train[TARGET]).predict(val)
    b = make_pipeline(make_model("hgb", max_iter=20), "f6_pair").fit(train, train[TARGET]).predict(val)
    np.testing.assert_array_equal(a, b)


def test_quote_rules_hit_target_coverage_on_fit_data():
    rng = np.random.default_rng(0)
    p = rng.uniform(5, 50, 5000)
    y = p + rng.normal(0, 3, 5000)
    bands = pd.cut(p, [0, 10, 20, 100]).astype(str)
    for kind in ("additive", "multiplicative", "by_dist_band"):
        rule = fit_quote_rule(kind, y, p, 0.9, slices=bands)
        cov = (y <= apply_quote_rule(rule, p, bands)).mean()
        assert abs(cov - 0.9) < 0.01, (kind, cov)


def test_bootstrap_contains_point_and_metrics():
    rng = np.random.default_rng(0)
    y = rng.normal(20, 5, 3000)
    pm, pb = y + rng.normal(0, 1, 3000), y + rng.normal(0, 3, 3000)
    days = np.repeat(np.arange(30), 100)
    t = bootstrap_vs_baseline(y, pm, pb, groups=days, n_boot=200)
    assert (t.lo <= t.point).all() and (t.point <= t.hi).all()
    assert t.loc["mae_diff", "hi"] < 0
    m = metrics([1, 2, 3], [1, 2, 5])
    assert m["mae"] == 2 / 3 and m["bias"] == -2 / 3


def test_perturb_distance_is_seeded_and_mean_one():
    d = pd.DataFrame({"trip_distance": np.full(200_000, 2.0)})
    a, b = perturb_distance(d, 0.1), perturb_distance(d, 0.1)
    np.testing.assert_array_equal(a.trip_distance, b.trip_distance)
    assert abs(a.trip_distance.mean() - 2.0) < 0.01
    assert perturb_distance(d, 0) is d


def test_lock_test_allows_exactly_one_call():
    real_lock, real_proc = evaluate.LOCK, evaluate.PROCESSED
    with tempfile.TemporaryDirectory() as tmp:
        evaluate.PROCESSED = Path(tmp)
        evaluate.LOCK = Path(tmp) / ".test_scored"
        try:
            evaluate.lock_test()
            try:
                evaluate.lock_test()
            except RuntimeError:
                pass
            else:
                raise AssertionError("second July scoring was not blocked")
        finally:
            evaluate.LOCK, evaluate.PROCESSED = real_lock, real_proc
    assert evaluate.LOCK == real_lock


def test_router_is_fitted_on_train_only_and_ignores_fares():
    """The distance estimate uses only zones; refitting on the same May trips with scrambled fares
    or post-trip columns changes nothing, and June never enters the fit."""
    from src.routing import StraightLineRouter
    train = D["train"]
    if not (Path(__file__).resolve().parents[1] / "data" / "raw" / "taxi_zones" / "taxi_zones.shp").exists():
        return   # zone shapefile not downloaded: nothing to test
    a = StraightLineRouter().fit(train)
    t2 = train.copy()
    t2[TARGET] = t2[TARGET].sample(frac=1, random_state=1).to_numpy()
    b = StraightLineRouter().fit(t2)
    assert a.k_band_ == b.k_band_ and a.same_zone_ == b.same_zone_
    est = a.predict(D["val"].PULocationID, D["val"].DOLocationID)
    assert np.isfinite(est).all() and (est > 0).all()


def test_router_same_zone_and_scaling():
    from src.routing import StraightLineRouter
    if not (Path(__file__).resolve().parents[1] / "data" / "raw" / "taxi_zones" / "taxi_zones.shp").exists():
        return
    r = StraightLineRouter().fit(D["train"])
    s = r.straight_miles([161], [132])[0]
    assert 10 < s < 20                                  # Midtown Center -> JFK, straight line
    k = r.k_band_[r.band(s)]
    assert abs(r.predict([161], [132])[0] - k * s) < 1e-12
    assert r.predict([161], [161])[0] == r.same_zone_.get(161, r.same_zone_default_)
