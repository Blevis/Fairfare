"""Single source of truth for paths, split, and the leakage blacklist."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RESULTS = ROOT / "results"
TRIPS_FILE = RAW / "yellow_tripdata_2026_sample.parquet"
ZONES_FILE = RAW / "taxi_zone_lookup.csv"

TARGET = "fare_amount"
YEAR = 2026
SPLIT_MONTH = {"train": 5, "val": 6, "test": 7}   # May / June / July
SEED = 0

AIRPORT_ZONES = (1, 132, 138)   # Newark, JFK, LaGuardia
UNKNOWN_ZONES = (264, 265)

# Not knowable at booking (or the target itself). Features must never touch these.
# passenger_count: knowable-ish but excluded by team decision (see PROBLEM.md).
# request_source: only filled for flex (app-dispatched) trips, which are outside the population.
FORBIDDEN = {
    TARGET, "tpep_dropoff_datetime", "duration_min", "tip_amount", "total_amount",
    "tolls_amount", "extra", "mta_tax", "improvement_surcharge",
    "congestion_surcharge", "Airport_fee", "cbd_congestion_fee",
    "RatecodeID", "payment_type", "store_and_fwd_flag",
    "passenger_count", "request_source", "VendorID",
}

# The ONLY raw columns the model pipeline is allowed to read (enforced in models.make_pipeline).
BOOKING_INPUTS = ("tpep_pickup_datetime", "PULocationID", "DOLocationID", "trip_distance",
                  "pickup_borough", "dropoff_borough")

# >>> FREEZE AT GATE 2 (after NB03). NB04 reads these. <<<
# Chosen in NB03 (2026-11-15): lowest June MAE; the gain over the best simpler model has a day-block
# CI that excludes 0; params = cheapest config within $0.01 of the best on the (flat) June grid.
FINAL_FEATURE_SET = "f7_time_x"
FINAL_MODEL = "hgb"
FINAL_PARAMS = {"loss": "absolute_error", "learning_rate": 0.1, "max_leaf_nodes": 127,
                "max_iter": 300, "min_samples_leaf": 100}

# >>> FREEZE AT GATE 3 (NB04 section 3, before July). <<<
BUFFER_Q = 0.90            # target share of trips with actual fare <= quote
BUFFER_RULE = "by_dist_band"   # "additive" | "multiplicative" | "by_dist_band"; chosen in NB04 by
                               # June odd/even-day cross-fitting (smallest worst-slice coverage gap)
