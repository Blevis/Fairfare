"""Export the website's data from the real project artifacts.  Run from the repository root:

    python site/scripts/export_data.py

Writes site/public/data/*.json:
  model.json    the frozen pipeline (refit on May, exactly as in NB04) in a browser-readable form:
                feature order, one-hot categories, target-encoder tables, every HGB tree, quote rule
  parity.json   2 000 June trips + the Python predictions, used by `npm run test:parity` to prove the
                TypeScript inference reproduces scikit-learn (June only; July is never scored here)
  zones.json    taxi zones (id, borough, name) + simplified outlines as SVG paths
  results.json  every number the site shows, copied from results/*.json|csv (NB03 / NB04 outputs)
  eda.json      May (training) aggregates for the analytics page

Nothing here re-scores July: July numbers come only from results/july_*.json written by NB04's
single locked run.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from src.clean import build_datasets  # noqa: E402
from src.config import (AIRPORT_ZONES, BUFFER_Q, BUFFER_RULE, FINAL_FEATURE_SET, FINAL_MODEL,  # noqa: E402
                        FINAL_PARAMS, RAW, RESULTS, TARGET, ZONES_FILE)
from src.features import DIST_BINS, DIST_LABELS, FEATURE_SETS, HOUR_BINS, add_features  # noqa: E402
from src.models import TLC_PER_MILE, TLC_START, make_model, make_pipeline  # noqa: E402

OUT = ROOT / "site" / "public" / "data"


def dump(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    print(f"wrote {name:13s} {(OUT / name).stat().st_size / 1e3:9.1f} kB")


def load_json(name):
    return json.loads((RESULTS / name).read_text())


# ------------------------------------------------------------------ model
def export_model(train, val):
    pipe = make_pipeline(make_model(FINAL_MODEL, **FINAL_PARAMS), FINAL_FEATURE_SET).fit(train, train[TARGET])
    prep, hgb = pipe.named_steps["prep"], pipe.named_steps["model"]
    blocks = []
    for name, trans, cols in prep.transformers_:
        if name == "num":
            blocks.append({"kind": "num", "cols": list(cols)})
        elif name == "cat":
            blocks.append({"kind": "onehot", "cols": list(cols),
                           "categories": [[str(c) for c in cats] for cats in trans.categories_]})
        elif name == "te":
            blocks.append({"kind": "target", "cols": list(cols), "default": float(trans.target_mean_),
                           "tables": [dict(zip(map(str, cats), map(float, enc)))
                                      for cats, enc in zip(trans.categories_, trans.encodings_)]})
    n_in = sum(len(b["cols"]) if b["kind"] != "onehot" else sum(map(len, b["categories"])) for b in blocks)
    assert n_in == hgb.n_features_in_, (n_in, hgb.n_features_in_)
    trees = []
    for (pred,) in hgb._predictors:
        nd = pred.nodes
        assert not nd["is_categorical"].any()
        trees.append({"f": nd["feature_idx"].astype(int).tolist(), "t": nd["num_threshold"].astype(float).tolist(),
                      "l": np.where(nd["is_leaf"], -1, nd["left"].astype(np.int64)).tolist(), "r": nd["right"].astype(int).tolist(),
                      "v": nd["value"].astype(float).tolist()})
    gate3 = load_json("gate3_freeze.json")
    model = {
        "model": FINAL_MODEL, "feature_set": FINAL_FEATURE_SET, "params": FINAL_PARAMS,
        "features": FEATURE_SETS[FINAL_FEATURE_SET], "blocks": blocks,
        "baseline": float(np.ravel(hgb._baseline_prediction)[0]), "trees": trees,
        "dist_bins": [b if np.isfinite(b) else None for b in DIST_BINS], "dist_labels": DIST_LABELS,
        "hour_bins": HOUR_BINS, "airport_zones": list(AIRPORT_ZONES),
        "quote_rule": gate3["quote_rule"], "buffer_q": BUFFER_Q, "buffer_rule": BUFFER_RULE,
        "tlc": {"start": TLC_START, "per_mile": TLC_PER_MILE},
        "trained_on": "May 2026 cleaned trips (n = %d)" % len(train),
    }
    dump("model.json", model)

    # parity sample: June trips (never July)
    sample = val.sample(2000, random_state=0)
    p = pipe.predict(sample)
    dump("parity.json", {"trips": [
        {"pickup": t.tpep_pickup_datetime.strftime("%Y-%m-%dT%H:%M:%S"), "pu": int(t.PULocationID), "do": int(t.DOLocationID),
         "dist": float(t.trip_distance), "pred": float(pp)} for t, pp in zip(sample.itertuples(), p)]})
    return pipe


# ------------------------------------------------------------------ zones (minimal shapefile reader, no new deps)
def read_dbf(path):
    b = path.read_bytes()
    n, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, off = [], 32
    while b[off] != 0x0D:
        name = b[off:off + 11].split(b"\0")[0].decode()
        fields.append((name, b[off + 16]))
        off += 32
    rows = []
    for i in range(n):
        rec, pos, row = b[hlen + i * rlen: hlen + (i + 1) * rlen], 1, {}
        for name, ln in fields:
            row[name] = rec[pos:pos + ln].decode("latin-1").strip()
            pos += ln
        rows.append(row)
    return rows


def read_shp(path):
    b, off, shapes = path.read_bytes(), 100, []
    while off < len(b):
        _, clen = struct.unpack(">ii", b[off:off + 8])
        rec = b[off + 8: off + 8 + clen * 2]
        off += 8 + clen * 2
        if struct.unpack("<i", rec[:4])[0] == 0:
            shapes.append([]); continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        pts = np.frombuffer(rec[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts], dtype="<f8").reshape(-1, 2)
        shapes.append([pts[parts[k]:parts[k + 1]] for k in range(nparts)])
    return shapes


def simplify(ring, tol):
    """Douglas-Peucker on one ring (projected feet)."""
    if len(ring) < 4:
        return ring
    keep = np.zeros(len(ring), bool); keep[[0, -1]] = True
    stack = [(0, len(ring) - 1)]
    while stack:
        a, z = stack.pop()
        if z <= a + 1:
            continue
        seg = ring[z] - ring[a]
        v = ring[a + 1:z] - ring[a]
        L = np.hypot(*seg)   # closed ring: first == last, so use the distance to that point instead
        d = np.abs(seg[0] * v[:, 1] - seg[1] * v[:, 0]) / L if L > 0 else np.hypot(v[:, 0], v[:, 1])
        k = int(np.argmax(d))
        if d[k] > tol:
            keep[a + 1 + k] = True
            stack += [(a, a + 1 + k), (a + 1 + k, z)]
    return ring[keep]


def export_zones():
    lookup = pd.read_csv(ZONES_FILE)
    shapes, rows = read_shp(RAW / "taxi_zones" / "taxi_zones.shp"), read_dbf(RAW / "taxi_zones" / "taxi_zones.dbf")
    allpts = np.vstack([r for s in shapes for r in s])
    x0, y1 = allpts[:, 0].min(), allpts[:, 1].max()
    scale = 1000 / (allpts[:, 0].max() - x0)          # 1000 px wide viewBox, NY State Plane feet
    paths = {}
    for shp, row in zip(shapes, rows):
        loc = int(float(row["LocationID"]))
        d = []
        for ring in shp:
            r = simplify(ring, 35)
            if len(r) < 4:
                continue
            xy = np.column_stack([(r[:, 0] - x0) * scale, (y1 - r[:, 1]) * scale]).round(1)
            d.append("M" + "L".join(f"{x:g},{y:g}" for x, y in xy) + "Z")
        paths[loc] = paths.get(loc, "") + "".join(d)
    height = (y1 - allpts[:, 1].min()) * scale
    zones = [{"id": int(r.LocationID), "borough": str(r.Borough), "zone": str(r.Zone), "service": str(r.service_zone),
              "path": paths.get(int(r.LocationID), "")} for r in lookup.itertuples()]
    dump("zones.json", {"viewBox": [0, 0, 1000, round(float(height), 1)], "zones": zones})


# ------------------------------------------------------------------ results + EDA
def export_results(D):
    g2, g3 = load_json("gate2_freeze.json"), load_json("gate3_freeze.json")
    jf, ja = load_json("july_final.json"), load_json("july_analytics.json")
    logs = {k: v.to_dict(orient="records") for k, v in D["logs"].items()}
    dump("results.json", {
        "gate2": g2, "gate3": g3, "july": jf, "july_analytics": ja,
        "ablation": pd.read_csv(RESULTS / "june_ablation.csv").to_dict(orient="records"),
        "tree_grid": pd.read_csv(RESULTS / "june_tree_grid.csv").to_dict(orient="records"),
        "hgb_grid": pd.read_csv(RESULTS / "june_hgb_grid.csv").to_dict(orient="records"),
        "cleaning": {"logs": logs, "n_raw": D["n_raw"], "params": D["params"], "n_out_of_range": D["n_out_of_range"],
                     "n_clean": {k: len(D[k]) for k in ("train", "val", "test")}},
    })


def export_eda(train):
    f = add_features(train)
    f["fpm"] = f[TARGET] / f.trip_distance
    edges_d, edges_f = np.arange(0, 25.5, 0.5), np.arange(0, 98, 2)
    h, _, _ = np.histogram2d(f.trip_distance, f[TARGET], bins=[edges_d, edges_f])
    fpm = (f.groupby(["dist_band", "hour"], observed=True)["fpm"].agg(["median", "size"]).round(3)
           .reset_index().astype({"dist_band": str}).to_dict(orient="records"))
    dump("eda.json", {"n": len(f), "fare_vs_distance": {"dist_edges": edges_d.tolist(), "fare_edges": edges_f.tolist(), "counts": h.astype(int).tolist()},
                      "fpm_by_band_hour": fpm})


if __name__ == "__main__":
    D = build_datasets()
    export_model(D["train"], D["val"])
    export_zones()
    export_results(D)
    export_eda(D["train"])
