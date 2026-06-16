# 🌌 Map of the Universe

An interactive **3D map of nearby stars**, built from real astronomical data and
rendered in the browser with [three.js](https://threejs.org/). It's a plain
static website — open `index.html` and you can fly through ~25,000 real stars,
each placed at its true position in space and coloured by its real temperature.

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

- **Drag** — orbit the view
- **Scroll** — zoom in/out
- **Right-drag** — pan
- **Hover** a bright star — see its name
- **Search box** — type a name (Sirius, Vega, Betelgeuse…) and click to fly there

## Project layout

```
index.html              The website (UI, styling, three.js import map)
js/main.js              Scene setup, data loading, shaders, interaction
data/stars.b64          Packed star data (float32: x,y,z, r,g,b, size)
data/stars.json         Metadata + named bright stars (for labels/search)
scripts/process_stars.py  Rebuilds the data files from the raw HYG catalog
```

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
- **Labels & constellations**, time-based proper motion, and search by catalog ID.

## Data credit

Star data: **HYG Database v4.1** by David Nash / astronexus, compiled from the
Hipparcos, Yale Bright Star, and Gliese catalogs. Released under CC BY-SA.
