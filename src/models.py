import numpy as np
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder
from sklearn.tree import DecisionTreeRegressor
from .features import CATEGORICAL, FEATURE_SETS, add_features, assert_no_leak

MODELS = {
    "linear": lambda: LinearRegression(),
    "tree": lambda: DecisionTreeRegressor(max_depth=8, min_samples_leaf=200, random_state=0),  # tune on JUNE
    "tree2": lambda: DecisionTreeRegressor(max_depth=2, random_state=0),                        # ladder rung 3
}


def make_preprocessor(cols):
    cats = [c for c in cols if c in CATEGORICAL]
    nums = [c for c in cols if c not in CATEGORICAL]
    return ColumnTransformer(
        [("num", "passthrough", nums), ("cat", OneHotEncoder(handle_unknown="ignore"), cats)],
        sparse_threshold=0)


def make_pipeline(model, feature_set: str) -> Pipeline:
    """cleaned DataFrame -> features (stateless) -> encoders (fitted on train) -> model."""
    cols = FEATURE_SETS[feature_set]
    assert_no_leak(cols)
    return Pipeline([("features", FunctionTransformer(add_features)),
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
