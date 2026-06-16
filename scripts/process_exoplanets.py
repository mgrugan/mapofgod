#!/usr/bin/env python3
"""
Process the Open Exoplanet Catalogue into per-system data for the web map.

Input : scripts/open_exoplanet_catalogue.csv
Output: data/systems.json

Each system groups the confirmed planets of one host star, with the host's 3D
position in the same parsec/equatorial frame as the HYG star catalog, so the
website can place a real planetary system exactly where its star sits in the map.

Planet orbits use the real semi-major axis (AU); planet sizes use the real radius
(Jupiter radii). The website rescales these per-system for a clean, readable view.

Run:  python3 scripts/process_exoplanets.py
"""

import csv
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "open_exoplanet_catalogue.csv")
OUT = os.path.join(ROOT, "data", "systems.json")


def parse_ra_hours(s):
    # "19 19 43.4040" hours-minutes-seconds -> degrees
    p = s.strip().split()
    if len(p) < 3:
        return None
    h, m, sec = float(p[0]), float(p[1]), float(p[2])
    return (h + m / 60 + sec / 3600) * 15.0


def parse_dec_deg(s):
    # "+40 05 51.8400" deg-arcmin-arcsec -> degrees
    s = s.strip()
    if not s:
        return None
    sign = -1.0 if s[0] == "-" else 1.0
    p = s.lstrip("+-").split()
    if len(p) < 3:
        return None
    d, m, sec = float(p[0]), float(p[1]), float(p[2])
    return sign * (d + m / 60 + sec / 3600)


def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def host_of(name):
    # strip trailing planet designation: "Kepler-90 h" -> "Kepler-90"
    return re.sub(r"\s+[a-zA-Z]{1,2}$", "", name.strip())


def main():
    systems = {}

    with open(SRC, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip()
            a = fnum(row.get("semimajoraxis"))
            if not name or a is None or a <= 0:
                continue  # need a real orbit to draw

            host = host_of(name)
            ra = parse_ra_hours(row.get("system_rightascension") or "")
            dec = parse_dec_deg(row.get("system_declination") or "")
            dist = fnum(row.get("system_distance"))
            if ra is None or dec is None or dist is None or dist <= 0:
                continue

            r = fnum(row.get("radius"))            # Jupiter radii
            teff = fnum(row.get("hoststar_temperature"))

            sys = systems.get(host)
            if sys is None:
                rar = math.radians(ra)
                decr = math.radians(dec)
                x = dist * math.cos(decr) * math.cos(rar)
                y = dist * math.cos(decr) * math.sin(rar)
                z = dist * math.sin(decr)
                sys = {
                    "host": host,
                    "x": round(x, 3), "y": round(y, 3), "z": round(z, 3),
                    "dist": round(dist, 2),
                    "teff": round(teff) if teff else None,
                    "planets": [],
                }
                systems[host] = sys

            sys["planets"].append({
                "name": name,
                "a": round(a, 4),
                "r": round(r, 3) if r else None,
            })

    # Add our own Solar System (real values), anchored at the Sun (origin).
    # radius in Jupiter radii, a in AU.
    sol = {
        "host": "Sol",
        "x": 0.0, "y": 0.0, "z": 0.0, "dist": 0.0, "teff": 5772,
        "planets": [
            {"name": "Mercury", "a": 0.387, "r": 0.0349},
            {"name": "Venus", "a": 0.723, "r": 0.0866},
            {"name": "Earth", "a": 1.000, "r": 0.0892},
            {"name": "Mars", "a": 1.524, "r": 0.0475},
            {"name": "Jupiter", "a": 5.203, "r": 1.000},
            {"name": "Saturn", "a": 9.537, "r": 0.843},
            {"name": "Uranus", "a": 19.19, "r": 0.358},
            {"name": "Neptune", "a": 30.07, "r": 0.346},
        ],
    }

    out = [sol] + sorted(
        systems.values(), key=lambda s: (-len(s["planets"]), s["host"])
    )
    for s in out:
        s["planets"].sort(key=lambda p: p["a"])
        s["n"] = len(s["planets"])

    meta = {
        "units": {"a": "AU", "r": "Rjup"},
        "count": len(out),
        "planetCount": sum(s["n"] for s in out),
        "source": "Open Exoplanet Catalogue + Sol",
        "systems": out,
    }
    with open(OUT, "w") as f:
        json.dump(meta, f)

    multi = sum(1 for s in out if s["n"] >= 2)
    print(f"Wrote {len(out)} systems ({meta['planetCount']} planets, "
          f"{multi} multi-planet) to {OUT}")
    print("Richest systems:")
    for s in sorted(out, key=lambda s: -s["n"])[:6]:
        print(f"  {s['host']:>16}  {s['n']} planets")


if __name__ == "__main__":
    main()
