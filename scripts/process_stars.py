#!/usr/bin/env python3
"""
Process the HYG star database into a compact binary file for the web map.

Input : scripts/hygdata_v41.csv  (the HYG v4.1 catalog from astronexus/HYG-Database)
Output: data/stars.b64           (base64 of packed little-endian Float32 records)
        data/stars.json          (metadata + named bright stars for labels)

The star records are base64 text (not raw binary) so the data file is a plain
ASCII asset that hosts and tooling handle cleanly; the browser decodes it back
to a Float32Array at load time.

Each star in stars.bin is 7 little-endian float32 values:
    x, y, z   -> position in parsecs (galactic-ish equatorial cartesian)
    r, g, b   -> colour in 0..1, derived from the B-V colour index
    size      -> a render size hint derived from apparent magnitude

Run:  python3 scripts/process_stars.py
"""

import csv
import json
import struct
import math
import base64
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "hygdata_v41.csv")
OUT_B64 = os.path.join(ROOT, "data", "stars.b64")
OUT_JSON = os.path.join(ROOT, "data", "stars.json")

# Keep stars out to this distance (parsecs). The HYG catalog gets sparse and
# unreliable far out; ~2000 pc still gives a rich, recognisable local map.
MAX_DIST_PC = 2000.0
# Drop the very faintest entries to keep the file small and the view clean.
MAX_MAG = 7.5


def bv_to_rgb(bv):
    """Approximate sRGB colour (0..1) for a star with B-V colour index `bv`.

    Based on the common black-body / colour-temperature approximation. Blue for
    hot stars (negative B-V), red for cool stars (high B-V).
    """
    if bv is None:
        bv = 0.0
    bv = max(-0.4, min(2.0, bv))

    # B-V -> approximate temperature (Ballesteros 2012)
    t = 4600.0 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62))

    # temperature -> RGB (Tanner Helland style approximation)
    t100 = t / 100.0
    if t100 <= 66:
        r = 255.0
        g = 99.4708025861 * math.log(max(t100, 1.0)) - 161.1195681661
    else:
        r = 329.698727446 * ((t100 - 60) ** -0.1332047592)
        g = 288.1221695283 * ((t100 - 60) ** -0.0755148492)

    if t100 >= 66:
        b = 255.0
    elif t100 <= 19:
        b = 0.0
    else:
        b = 138.5177312231 * math.log(t100 - 10) - 305.0447927307

    def clamp(v):
        return max(0.0, min(255.0, v)) / 255.0

    return clamp(r), clamp(g), clamp(b)


def mag_to_size(mag):
    """Brighter stars (lower magnitude) render larger."""
    # mag ranges roughly -1.5 (Sirius) .. 7.5 here
    s = (7.0 - mag) * 0.35 + 0.6
    return max(0.5, min(6.0, s))


def main():
    records = bytearray()
    count = 0
    named = []

    with open(SRC, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                x = float(row["x"])
                y = float(row["y"])
                z = float(row["z"])
                dist = float(row["dist"])
                mag = float(row["mag"])
            except (ValueError, KeyError):
                continue

            if dist <= 0 or dist > MAX_DIST_PC:
                continue
            if mag > MAX_MAG:
                continue

            try:
                bv = float(row["ci"]) if row.get("ci") not in (None, "") else 0.0
            except ValueError:
                bv = 0.0

            r, g, b = bv_to_rgb(bv)
            size = mag_to_size(mag)

            records += struct.pack("<7f", x, y, z, r, g, b, size)
            count += 1

            name = (row.get("proper") or "").strip()
            if name and mag < 3.5:
                named.append({
                    "name": name,
                    "x": round(x, 3), "y": round(y, 3), "z": round(z, 3),
                    "mag": round(mag, 2),
                    "con": (row.get("con") or "").strip(),
                })

    with open(OUT_B64, "w") as f:
        f.write(base64.b64encode(bytes(records)).decode("ascii"))

    named.sort(key=lambda s: s["mag"])
    meta = {
        "count": count,
        "stride": 7,           # floats per star
        "bytesPerStar": 28,    # 7 * 4
        "maxDistPc": MAX_DIST_PC,
        "maxMag": MAX_MAG,
        "units": "parsec",
        "named": named,
        "source": "HYG-Database v4.1 (astronexus) — Hipparcos/Yale/Gliese merge",
    }
    with open(OUT_JSON, "w") as f:
        json.dump(meta, f)

    print(f"Wrote {count} stars to {OUT_B64} ({len(records)} raw bytes)")
    print(f"Wrote metadata + {len(named)} named stars to {OUT_JSON}")


if __name__ == "__main__":
    main()
