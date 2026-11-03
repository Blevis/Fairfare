import pandas as pd
from .config import TRIPS_FILE, ZONES_FILE, YEAR, SPLIT_MONTH


def load_raw() -> pd.DataFrame:
    """Raw trips + pickup/dropoff borough and zone names. No rows are dropped."""
    trips = pd.read_parquet(TRIPS_FILE)
    zones = pd.read_csv(ZONES_FILE)
    for pre, col in (("pickup", "PULocationID"), ("dropoff", "DOLocationID")):
        z = zones.rename(columns={"LocationID": col, "Borough": f"{pre}_borough", "Zone": f"{pre}_zone"})
        trips = trips.merge(z[[col, f"{pre}_borough", f"{pre}_zone"]], on=col, how="left")
    return trips


def split_by_month(df: pd.DataFrame):
    """May -> train, June -> val, July -> test, by pickup time.
    Returns (dict of raw splits, number of rows with pickup outside May-July 2026)."""
    ts = df["tpep_pickup_datetime"]
    in_range = ts.dt.year.eq(YEAR) & ts.dt.month.isin(list(SPLIT_MONTH.values()))
    out = {name: df[in_range & ts.dt.month.eq(m)].copy() for name, m in SPLIT_MONTH.items()}
    return out, int((~in_range).sum())
