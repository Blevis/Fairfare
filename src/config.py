"""Single source of truth for paths, split, and the leakage blacklist."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
TRIPS_FILE = RAW / "yellow_tripdata_2026_sample.parquet"
ZONES_FILE = RAW / "taxi_zone_lookup.csv"

TARGET = "fare_amount"
YEAR = 2026
SPLIT_MONTH = {"train": 5, "val": 6, "test": 7}   # May / June / July

AIRPORT_ZONES = (1, 132, 138)   # Newark, JFK, LaGuardia
UNKNOWN_ZONES = (264, 265)

# Not knowable at booking (or the target itself). Features must never touch these.
# passenger_count is knowable-ish but excluded by team decision (see PROBLEM.md).
FORBIDDEN = {
    TARGET, "tpep_dropoff_datetime", "duration_min", "tip_amount", "total_amount",
    "tolls_amount", "extra", "mta_tax", "improvement_surcharge",
    "congestion_surcharge", "Airport_fee", "cbd_congestion_fee",
    "RatecodeID", "payment_type", "store_and_fwd_flag",
}

# >>> FREEZE AT GATE 2 (after NB03). NB04 reads these. <<<
FINAL_FEATURE_SET = "f4_shape"
FINAL_MODELS = ("linear", "tree")
