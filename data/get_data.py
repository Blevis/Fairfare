"""Download the Project 1 data into data/raw/ and verify it. Run from the repository root:
    python data/get_data.py
Every file is checked against a SHA-256 recorded when the project was built, so a changed
release (or a truncated download) fails loudly instead of silently changing the results.
"""
import hashlib
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://github.com/evisp/ml-course-labs/releases/download/data-v2/"
FILES = {
    "yellow_tripdata_2026_sample.parquet": "9f6fadc8308f30f194e9980a170aceadb9e2114e50c1d5d0b574ab82a07c5af0",
    "taxi_zone_lookup.csv": "1a99e105092230f8620f301edcca7f80d3080642ff404d28ed957d3fa222c8ed",
    "taxi_zones.zip": "f6d711917bb4340f8f644d5366c51665489eb2d426dd1a4a55677721ae5adf17",
    "data_dictionary_trip_records_yellow.pdf": "b9e9f0ecfa6bd9cc847283379173fd764fe1ab76d2fa143329f541cb1f479993",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


raw = Path(__file__).resolve().parent / "raw"
raw.mkdir(parents=True, exist_ok=True)

bad = []
for name, expected in FILES.items():
    path = raw / name
    if not path.exists():
        print(f"downloading {name}")
        urllib.request.urlretrieve(BASE + name, path)
    if sha256(path) != expected:
        bad.append(name)
    else:
        print(f"verified    {name}")

if bad:
    sys.exit(f"CHECKSUM MISMATCH: {bad}. Delete these files and re-run; if it persists, the release changed.")

with zipfile.ZipFile(raw / "taxi_zones.zip") as zf:
    zf.extractall(raw)

print("ready:", sorted(p.name for p in raw.iterdir()))
