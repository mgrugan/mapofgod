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
- **Click** any star — *descend* into its system: the camera flies in and a clean
  orbital solar system of worlds appears, circling the star
- **Ascend** button (or **Esc**) — return to the full map of the heavens
- **Search box** — type a name (Sirius, Vega, Rigel…) and click to dive straight in

### About the solar systems

We don't yet have confirmed planets for most stars, so each system is generated
*procedurally but deterministically* from the star's own position — the same star
always yields the same worlds. It's an artistic, futuristic impression of "every
star a sun with worlds", not a catalog of real exoplanets. Real exoplanet data
(NASA Exoplanet Archive) is a natural next step — see below.

## Project layout

```
index.html                   The website (UI, styling, three.js import map)
js/main.js                   Scene, data loading, shaders, web, dive, systems
data/stars.b64               Packed star data (float32: x,y,z, r,g,b, size)
data/stars.json              Metadata + named bright stars (for labels/search)
data/systems.json            Real exoplanet systems + Sol (host position + planets)
scripts/process_stars.py     Rebuilds the star data from the raw HYG catalog
scripts/process_exoplanets.py  Rebuilds systems.json from the exoplanet catalogue
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
