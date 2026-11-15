"""Taxi-zone geometry from the TLC shapefile (no GIS dependency).
Coordinates are NY State Plane Long Island (EPSG:2263), in US feet, so distances are plain
Euclidean distances: divide by 5 280 for miles."""
import struct
from functools import lru_cache

import numpy as np
import pandas as pd

from .config import RAW

SHP = RAW / "taxi_zones" / "taxi_zones.shp"
DBF = RAW / "taxi_zones" / "taxi_zones.dbf"
FT_PER_MILE = 5280.0


def read_dbf(path=DBF):
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


def read_shp(path=SHP):
    """Polygon shapefile -> list (one per record) of rings (N x 2 arrays)."""
    b, off, shapes = path.read_bytes(), 100, []
    while off < len(b):
        _, clen = struct.unpack(">ii", b[off:off + 8])
        rec = b[off + 8: off + 8 + clen * 2]
        off += 8 + clen * 2
        if struct.unpack("<i", rec[:4])[0] == 0:
            shapes.append([])
            continue
        nparts, npts = struct.unpack("<ii", rec[36:44])
        parts = list(struct.unpack(f"<{nparts}i", rec[44:44 + 4 * nparts])) + [npts]
        pts = np.frombuffer(rec[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts], dtype="<f8").reshape(-1, 2)
        shapes.append([pts[parts[k]:parts[k + 1]] for k in range(nparts)])
    return shapes


def polygon_centroid(rings):
    """Area-weighted centroid of a (multi)polygon. Shapefile holes have the opposite winding, so
    their signed area subtracts automatically."""
    A = cx = cy = 0.0
    for r in rings:
        x, y = r[:, 0], r[:, 1]
        cross = x[:-1] * y[1:] - x[1:] * y[:-1]
        a = cross.sum() / 2
        A += a
        cx += ((x[:-1] + x[1:]) * cross).sum() / 6
        cy += ((y[:-1] + y[1:]) * cross).sum() / 6
    return cx / A, cy / A, abs(A)


@lru_cache(maxsize=1)
def zone_centroids() -> pd.DataFrame:
    """One row per LocationID: centroid (x_ft, y_ft) and area in square miles. Zones that appear
    in several shapefile records (e.g. 56, 103) are merged area-weighted."""
    rows = []
    for shp, rec in zip(read_shp(), read_dbf()):
        if not shp:
            continue
        x, y, area = polygon_centroid(shp)
        rows.append((int(float(rec["LocationID"])), x, y, area))
    d = pd.DataFrame(rows, columns=["LocationID", "x", "y", "area"])
    g = d.assign(xw=d.x * d.area, yw=d.y * d.area).groupby("LocationID")[["xw", "yw", "area"]].sum()
    return pd.DataFrame({"x_ft": g.xw / g.area, "y_ft": g.yw / g.area,
                         "area_sq_mi": g.area / FT_PER_MILE ** 2}).reset_index()
