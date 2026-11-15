import numpy as np
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, TargetEncoder
from sklearn.tree import DecisionTreeRegressor
from .config import BOOKING_INPUTS, SEED
from .features import CATEGORICAL, FEATURE_SETS, TARGET_ENCODED, add_features, assert_no_leak

MODELS = {
    "linear": lambda **kw: LinearRegression(**kw),
    "tree": lambda **kw: DecisionTreeRegressor(**{"max_depth": 8, "min_samples_leaf": 200, "random_state": SEED, **kw}),
    "tree2": lambda **kw: DecisionTreeRegressor(**{"max_depth": 2, "random_state": SEED, **kw}),   # ladder rung 3
    "hgb": lambda **kw: HistGradientBoostingRegressor(**{"max_iter": 300, "learning_rate": 0.1, "max_leaf_nodes": 31,
                                                          "early_stopping": False, "random_state": SEED, **kw}),
}


def make_model(name, **params):
    return MODELS[name](**params)


def booking_features(df):
    """The pipeline's only view of a trip: the BOOKING_INPUTS columns, then stateless features.
    Selecting the columns first makes it impossible for a feature to read a post-trip field."""
    return add_features(df[list(BOOKING_INPUTS)])


def make_preprocessor(cols):
    te = [c for c in cols if c in TARGET_ENCODED]
    cats = [c for c in cols if c in CATEGORICAL]
    nums = [c for c in cols if c not in CATEGORICAL and c not in TARGET_ENCODED]
    steps = [("num", "passthrough", nums), ("cat", OneHotEncoder(handle_unknown="ignore"), cats)]
    if te:   # cross-fitted on the training data inside Pipeline.fit (sklearn TargetEncoder)
        steps.append(("te", TargetEncoder(target_type="continuous", cv=KFold(5, shuffle=True, random_state=SEED)), te))
    return ColumnTransformer(steps, sparse_threshold=0)


def make_pipeline(model, feature_set: str) -> Pipeline:
    """cleaned DataFrame -> features (stateless) -> encoders (fitted on train) -> model."""
    cols = FEATURE_SETS[feature_set]
    assert_no_leak(cols)
    return Pipeline([("features", FunctionTransformer(booking_features)),
                     ("prep", make_preprocessor(cols)),
                     ("model", model)])


class MedianBaseline(DummyRegressor):
    """Ladder rung 1: the May median fare for every trip."""
    def __init__(self):
        super().__init__(strategy="median")

    def fit(self, X, y):
        return super().fit(np.zeros((len(y), 1)), y)

    def predict(self, X):
        return super().predict(np.zeros((len(X), 1)))


class RateRule(BaseEstimator, RegressorMixin):
    """Ladder rung 2: fare = start + per_mile * trip_distance.
    Give constants from the official TLC fares page, or leave None to fit them on May."""
    def __init__(self, start=None, per_mile=None):
        self.start = start
        self.per_mile = per_mile

    def fit(self, X, y):
        slope, icpt = np.polyfit(X["trip_distance"].to_numpy(), np.asarray(y), 1)
        self.start_ = icpt if self.start is None else self.start
        self.per_mile_ = slope if self.per_mile is None else self.per_mile
        return self

    def predict(self, X):
        return self.start_ + self.per_mile_ * X["trip_distance"].to_numpy()


# Official TLC standard rate (Rate #01), checked 2026-11-15 on
# https://www.nyc.gov/site/tlc/passengers/taxi-fare.page : $3.00 initial charge,
# $0.70 per 1/5 mile above 12 mph (= $3.50 / mile) or per minute in slow traffic.
TLC_START, TLC_PER_MILE = 3.00, 3.50
