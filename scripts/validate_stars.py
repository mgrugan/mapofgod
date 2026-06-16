#!/usr/bin/env python3
"""
Validate the star data against independent, authoritative reference values.

This is how we check the map is telling the truth. The HYG catalog derives each
star's distance from its measured parallax (Hipparcos / Gaia). Here we compare
HYG's distance and apparent magnitude for a set of well-known stars against
published reference values, and flag anything that disagrees beyond tolerance.

It also reproduces the cartesian conversion (x,y,z from RA/Dec/distance) for a
few stars to confirm the 3D placement maths used to build the map.

Run:  python3 scripts/validate_stars.py
"""

import csv
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "hygdata_v41.csv")

# Reference values from standard sources (SIMBAD / Hipparcos-Gaia literature).
# dist in parsecs, mag = apparent visual magnitude.
# tol_pct = allowed distance disagreement (looser for stars with genuinely
# uncertain parallaxes, e.g. distant supergiants like Deneb).
REFERENCE = [
    # name,            dist_pc, app_mag, tol_pct
    ("Sirius",            2.64,  -1.46,  5),
    ("Rigil Kentaurus",  1.34,  -0.01,  8),   # Alpha Centauri A
    ("Procyon",          3.51,   0.34,  5),
    ("Altair",           5.13,   0.76,  5),
    ("Vega",             7.68,   0.03,  5),
    ("Fomalhaut",        7.70,   1.16,  6),
    ("Pollux",          10.34,   1.14,  6),
    ("Arcturus",        11.26,  -0.05,  6),
    ("Capella",         13.12,   0.08,  8),
    ("Aldebaran",       20.43,   0.86,  8),
    ("Regulus",         24.31,   1.40, 10),
    ("Achernar",        42.75,   0.46, 10),
    ("Spica",           76.6,    0.98, 15),
    ("Polaris",        132.6,    1.98, 20),
    ("Betelgeuse",     168.0,    0.42, 35),   # distance notoriously uncertain
    ("Rigel",          264.0,    0.13, 20),
    ("Deneb",          802.0,    1.25, 50),   # very uncertain parallax
]


def load():
    rows = {}
    with open(SRC, newline="") as f:
        for r in csv.DictReader(f):
            name = (r.get("proper") or "").strip()
            if name:
                rows[name] = r
    return rows


def main():
    rows = load()
    print(f"{'STAR':<18}{'HYG dist':>10}{'ref':>9}{'Δ%':>7}{'HYG mag':>9}{'ref':>7}   result")
    print("-" * 74)
    passed = total = 0
    for name, rdist, rmag, tol in REFERENCE:
        total += 1
        row = rows.get(name)
        if not row:
            print(f"{name:<18}{'— not in catalog —':>40}")
            continue
        d = float(row["dist"])
        m = float(row["mag"])
        dpct = abs(d - rdist) / rdist * 100
        ok_d = dpct <= tol
        ok_m = abs(m - rmag) <= 0.25
        ok = ok_d and ok_m
        passed += ok
        print(f"{name:<18}{d:>9.2f}{rdist:>9.2f}{dpct:>6.1f}%{m:>9.2f}{rmag:>7.2f}   "
              f"{'PASS' if ok else 'CHECK'}")

    print("-" * 74)
    print(f"{passed}/{total} stars within tolerance on distance + magnitude.")

    # Confirm the cartesian placement maths on Sirius.
    s = rows.get("Sirius")
    if s:
        d = float(s["dist"])
        ra = float(s["rarad"]); dec = float(s["decrad"])
        x = d * math.cos(dec) * math.cos(ra)
        y = d * math.cos(dec) * math.sin(ra)
        z = d * math.sin(dec)
        print("\nPlacement check (Sirius):")
        print(f"  computed x,y,z = ({x:.3f}, {y:.3f}, {z:.3f})")
        print(f"  catalog  x,y,z = ({float(s['x']):.3f}, {float(s['y']):.3f}, {float(s['z']):.3f})")


if __name__ == "__main__":
    main()
