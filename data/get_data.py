import pandas as pd

trips = pd.read_parquet("data/raw/yellow_tripdata_2026_sample.parquet")
zones = pd.read_csv("data/raw/taxi_zone_lookup.csv")

pickup_zones = zones.rename(columns={"LocationID": "PULocationID", "Borough": "pickup_borough", "Zone": "pickup_zone"})
trips = trips.merge(pickup_zones[["PULocationID", "pickup_borough", "pickup_zone"]], on="PULocationID", how="left")