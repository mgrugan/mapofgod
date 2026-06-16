# 🌌 Map of God

A cinematic, interconnected **3D atlas of the real stars**, built from real
astronomical data and rendered in the browser with
[three.js](https://threejs.org/) + bloom post-processing. It's a plain static
website — open `index.html` and you fly through ~25,000 real stars, woven into a
glowing cosmic web, then **click any star to descend into it** and watch its
worlds circle it on clean orbital rings.

## What you're looking at

Every point is a real star from the **HYG database** (a merge of the Hipparcos,
Yale Bright Star, and Gliese catalogs). For each star we use:

- **x, y, z** — its true position in space, in *parsecs* (1 pc ≈ 3.26 light-years).
  These come from the star's sky position plus its measured **distance** (from
  parallax). Distance is the ingredient that turns a flat sky into a 3D map.
- **B-V colour index** → converted to an approximate real colour (hot blue-white
  stars vs. cool orange-red ones).
- **Apparent magnitude** → how bright it looks, used to size each point.

The Sun sits at the origin (the small golden glow). The map currently covers
stars within ~2,000 parsecs — the Sun's neighbourhood in the Milky Way.

## Run it

It's a static site, so any web server works:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000
```

(You need a server rather than opening the file directly, because the page
fetches `data/stars.b64` — browsers block `fetch` from `file://`.)

## Controls

- **Drag** — orbit the heavens (the view also drifts slowly on its own)
- **Scroll** — draw near / pull back
- **Right-drag** — pan
- **Hover** any star — a targeting reticle locks on and shows its name & distance
- **Click** any star — *dive in*: the camera flies down to the star. If it has
  **real confirmed planets**, they appear on clean circular orbits; otherwise you
  just see the star (we don't invent worlds).
- **Zoom / drag back out** — the system dissolves on its own and you return to the
  star field, exactly where the star sits in space. The **Ascend** button (or
  **Esc**) flies you smoothly back to where you started.
- **Search box** — find real planet systems (TRAPPIST-1, Kepler-90, Sol), bright
  named stars, or famous giant stars (UY Scuti, Betelgeuse) and click to fly there.

### Real planets only

Planets shown when you dive in are **real, confirmed exoplanets** from the Open
Exoplanet Catalogue (plus our own Solar System), placed on their true relative
orbits and sizes. Stars with no known planets are shown alone — nothing is made up.

### Notable & giant stars

The biggest known stars (Stephenson 2-18, UY Scuti, VY Canis Majoris, …) are too
distant and faint for the HYG parallax catalog, so they're added as a small
curated layer (`data/notable.json`). Their **directions are accurate**, but their
**distances and sizes are genuinely uncertain** in real astronomy — a `*` in the
readout marks the uncertain ones.

## Is the data real? (validation)

Yes — and you can check it:

```bash
python3 scripts/validate_stars.py
```

This compares the catalog's distance and brightness for ~17 well-known stars
against independent published values (SIMBAD/Hipparcos-Gaia) and confirms the 3D
placement maths. All pass within tolerance; Deneb deliberately shows a large gap,
illustrating that some supergiant distances are genuinely uncertain.

**Two different meanings of "size":**
- **Visible size** in the map = a star's *apparent brightness* (apparent
  magnitude) — how bright it looks from Earth. This is real catalog data.
- **Physical size** (a star's radius) is *not* how normal stars are drawn — real
  stars are point-like at these distances. For the curated giants we list the real
  radius in the readout and enlarge them only illustratively (clearly not to scale
  with the distances between stars).

Star distances themselves come from **parallax** (Hipparcos/Gaia) — the gold
standard for 3D stellar positions.

## Project layout

```
index.html                   The website (UI, styling, three.js import map)
js/main.js                   Scene, data loading, shaders, web, dive, systems
data/stars.b64               Packed star data (float32: x,y,z, r,g,b, size)
data/stars.json              Metadata + named bright stars (for labels/search)
data/systems.json            Real exoplanet systems + Sol (host position + planets)
data/notable.json            Curated notable/giant stars (beyond the HYG catalog)
scripts/process_stars.py     Rebuilds the star data from the raw HYG catalog
scripts/process_exoplanets.py  Rebuilds systems.json from the exoplanet catalogue
scripts/notable_stars.py     Rebuilds notable.json (curated giant stars)
scripts/validate_stars.py    Checks the data against authoritative references
.github/workflows/deploy-pages.yml  Auto-publishes the site to GitHub Pages
```

## Deploying as a website (GitHub Pages)

A workflow is included. In the repo, go to **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Push to the default branch and the map is
published at your Pages URL — no server to run, and it works on any device.

## Regenerating the data

The committed `data/` files are ready to use. To rebuild them from scratch:

```bash
# 1. download the raw catalog (~34 MB, git-ignored)
curl -L -o scripts/hygdata_v41.csv \
  https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv

# 2. process it into the compact binary the website loads
python3 scripts/process_stars.py
```

Tune `MAX_DIST_PC` and `MAX_MAG` at the top of the script to include more (or
fewer) stars.

## Deploying as a website

Because it's fully static, you can host it for free on **GitHub Pages**, Netlify,
Vercel, or any static host — just publish the repository root.

## Where this can go next

This maps the *stars* of our local galaxy. The same technique scales outward:

- **Galaxies** — pull redshifts from NASA/IPAC **NED** or **SDSS** and convert
  redshift → distance to map the cosmic web of galaxies and voids.
- **The Milky Way's shape** — add a billion-star layer from ESA **Gaia**.
- **Real worlds** — replace the procedural systems with confirmed planets from the
  **NASA Exoplanet Archive** for stars that have them.
- **Labels & constellations**, time-based proper motion, and search by catalog ID.

## Data credit

Star data: **HYG Database v4.1** by David Nash / astronexus, compiled from the
Hipparcos, Yale Bright Star, and Gliese catalogs. Released under CC BY-SA.
