#!/usr/bin/env python3
"""
Curated "notable stars" — famous giants/hypergiants and luminous stars that are
beyond the reach of the HYG parallax catalog (too distant or too faint), so they
never appear in stars.b64. We add them as a small, clearly-labelled layer.

Output: data/notable.json

IMPORTANT / honesty note
------------------------
Sky directions (RA/Dec) for these stars are well established. Their *distances*
and *radii*, however, are genuinely uncertain in the scientific literature —
especially for red hypergiants like Stephenson 2-18, UY Scuti and VY CMa, where
published distances can disagree by a factor of two. Values below are
representative literature figures, not precision measurements; entries flagged
"uncertain" should be read as "best-estimate, debated".

Coordinates are converted to the same equatorial cartesian parsec frame as the
HYG catalog:  x = d·cos(dec)·cos(ra),  y = d·cos(dec)·sin(ra),  z = d·sin(dec).
"""

import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "notable.json")

# name, ra_deg, dec_deg, dist_pc, radius_rsun, app_mag, type, uncertain, note
STARS = [
    ("Stephenson 2-18", 279.760, -6.086, 5800, 2150, None, "Red supergiant", True,
     "Often cited as the largest known star — but its distance and size are heavily disputed."),
    ("UY Scuti", 276.902, -12.466, 1700, 1700, 9.0, "Red supergiant", True,
     "Long held as a record-holder for radius; Gaia data suggest the distance is uncertain."),
    ("VY Canis Majoris", 110.743, -25.768, 1170, 1420, 7.9, "Red hypergiant", True,
     "One of the largest and most luminous stars known, shedding huge amounts of mass."),
    ("WOH G64", 73.794, -68.342, 49600, 1540, 18.5, "Red supergiant (LMC)", True,
     "A vast red supergiant in the Large Magellanic Cloud — another galaxy."),
    ("Mu Cephei", 325.877, 58.780, 1000, 1260, 4.08, "Red supergiant", True,
     "Herschel's 'Garnet Star', one of the reddest naked-eye stars."),
    ("VV Cephei A", 329.163, 63.626, 1500, 1050, 5.0, "Red supergiant", True,
     "Eclipsing binary; the supergiant is among the largest stars known."),
    ("Betelgeuse", 88.793, 7.407, 168, 764, 0.42, "Red supergiant", False,
     "Shoulder of Orion; a nearby supergiant expected to go supernova."),
    ("Antares", 247.352, -26.432, 170, 680, 1.06, "Red supergiant", False,
     "Heart of Scorpius; a red supergiant rivalling Betelgeuse."),
    ("Pistol Star", 266.564, -28.834, 7600, 306, None, "Luminous blue variable", True,
     "Near the galactic centre; one of the most luminous stars in the Milky Way."),
    ("Eta Carinae", 161.265, -59.685, 2300, 240, 4.5, "Luminous blue variable", True,
     "A violently unstable, ~5-million-solar-luminosity system."),
    ("R136a1", 84.677, -69.101, 49600, 39, 12.8, "Wolf-Rayet (LMC)", True,
     "The most MASSIVE known star (~196 M☉) — massive, not largest. In the LMC."),
    ("Deneb", 310.358, 45.280, 802, 203, 1.25, "Blue-white supergiant", True,
     "Tail of Cygnus; intrinsically one of the most luminous nearby stars."),
    ("Rigel", 78.634, -8.202, 264, 78, 0.13, "Blue supergiant", False,
     "Foot of Orion; a brilliant blue supergiant."),
]


def main():
    out = []
    for name, ra, dec, dist, rsun, mag, typ, unc, note in STARS:
        rar = math.radians(ra)
        decr = math.radians(dec)
        x = dist * math.cos(decr) * math.cos(rar)
        y = dist * math.cos(decr) * math.sin(rar)
        z = dist * math.sin(decr)
        out.append({
            "name": name,
            "ra": ra, "dec": dec,
            "dist": dist,
            "x": round(x, 2), "y": round(y, 2), "z": round(z, 2),
            "radiusRsun": rsun,
            "mag": mag,
            "type": typ,
            "uncertain": unc,
            "note": note,
        })

    meta = {
        "note": "Curated notable/giant stars beyond the HYG catalog. RA/Dec are "
                "well known; distances and radii are uncertain literature estimates.",
        "count": len(out),
        "stars": out,
    }
    with open(OUT, "w") as f:
        json.dump(meta, f, indent=0)
    print(f"Wrote {len(out)} notable stars to {OUT}")


if __name__ == "__main__":
    main()
