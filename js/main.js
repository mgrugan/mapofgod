// Map of God — a cinematic 3D atlas of the real stars.
//
// Loads data/stars.b64 (base64 of packed float32: x,y,z, r,g,b, size per star),
// renders an interconnected, glowing point cloud, and lets you click/dive into
// any star to see a clean orbital "solar system" of worlds circling it.
//
// Built on three.js with UnrealBloom for the god-like glow.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Surface any error on screen instead of failing to a silent black void.
function showFatal(msg) {
  const el = document.getElementById("loading");
  if (!el) return;
  el.style.display = "flex";
  el.innerHTML =
    '<div style="max-width:520px;text-align:center;padding:24px;font-family:Rajdhani,sans-serif">' +
    '<div style="font-family:Orbitron,sans-serif;letter-spacing:3px;color:#ff8a8a;margin-bottom:12px">UNABLE TO CHART THE HEAVENS</div>' +
    '<div style="color:#9fb0d8;font-size:15px;line-height:1.6">' + msg + "</div></div>";
}
window.addEventListener("error", (e) =>
  showFatal((e.message || "Script error") + "<br><br>If you opened the file directly, run a local server instead — see the README.")
);
window.addEventListener("unhandledrejection", (e) =>
  showFatal("" + (e.reason && e.reason.message ? e.reason.message : e.reason))
);

const STRIDE = 7; // floats per star: x,y,z, r,g,b, size

const ui = {
  loading: document.getElementById("loading"),
  tooltip: document.getElementById("tooltip"),
  search: document.getElementById("search"),
  results: document.getElementById("results"),
  roTitle: document.getElementById("ro-title"),
  roCount: document.getElementById("ro-count"),
  roRows: document.getElementById("ro-rows"),
  backBtn: document.getElementById("backBtn"),
};

let scene, camera, renderer, controls, composer;
let points, web, sol;
let named = [];
let namedVec = [];
let starCount = 0;
let systems = []; // real exoplanet systems
let systemVecs = []; // {v, sys} for spatial matching

// in-memory copies of star attributes for picking / system building
let posArr, colArr, sizeArr;

let mode = "galaxy"; // 'galaxy' | 'system'
let systemGroup = null;
let savedView = null; // camera/target to restore when ascending

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// reticle that highlights the hovered star
let reticle;

init();

async function setupBloom() {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] =
      await Promise.all([
        import("three/addons/postprocessing/EffectComposer.js"),
        import("three/addons/postprocessing/RenderPass.js"),
        import("three/addons/postprocessing/UnrealBloomPass.js"),
        import("three/addons/postprocessing/OutputPass.js"),
      ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8,
        0.5,
        0.0
      )
    );
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn("Bloom unavailable, falling back to plain rendering:", err);
    composer = null;
  }
}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02030a);
  scene.fog = new THREE.FogExp2(0x02030a, 0.00028);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    30000
  );
  camera.position.set(0, 40, 160);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  // Post-processing (bloom) is a nice-to-have. Load it dynamically so that if
  // the add-on modules fail to load, the map still renders normally instead of
  // going black.
  await setupBloom();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 1.1;
  controls.minDistance = 2;
  controls.maxDistance = 9000;
  controls.autoRotate = true; // slow cinematic drift
  controls.autoRotateSpeed = 0.12;

  buildReticle();
  buildSol();

  window.addEventListener("resize", onResize);
  setupPicking();
  ui.search.addEventListener("input", onSearch);
  ui.backBtn.addEventListener("click", ascend);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode === "system") ascend();
  });

  try {
    await loadStars();
  } catch (err) {
    ui.loading.querySelector("span").textContent = "Failed to chart the heavens: " + err.message;
    console.error(err);
    return;
  }

  animate();
}

// --- the Sun, our anchor at the origin ------------------------------------

function buildSol() {
  sol = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff1c0 })
  );
  sol.add(core);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xfff0c0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  glow.scale.set(10, 10, 1);
  sol.add(glow);
  scene.add(sol);
}

// --- targeting reticle ----------------------------------------------------

function buildReticle() {
  reticle = new THREE.Group();
  reticle.visible = false;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.12, 48),
    new THREE.MeshBasicMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  );
  reticle.add(ring);

  // four tick marks
  const tickMat = new THREE.MeshBasicMaterial({
    color: 0x9be8ff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.4), tickMat);
    const a = (i / 4) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0);
    tick.rotation.z = a;
    reticle.add(tick);
  }
  reticle.renderOrder = 999;
  scene.add(reticle);
}

// --- load + build the galaxy ----------------------------------------------

async function loadStars() {
  const [b64Resp, metaResp, sysResp] = await Promise.all([
    fetch("data/stars.b64"),
    fetch("data/stars.json"),
    fetch("data/systems.json"),
  ]);
  if (!b64Resp.ok) throw new Error("stars.b64 " + b64Resp.status);
  if (!metaResp.ok) throw new Error("stars.json " + metaResp.status);

  const b64 = (await b64Resp.text()).trim();
  const meta = await metaResp.json();
  named = meta.named || [];
  namedVec = named.map((s) => ({ v: new THREE.Vector3(s.x, s.y, s.z), s }));

  // real exoplanet systems (optional — don't fail the map if missing)
  if (sysResp.ok) {
    const sjson = await sysResp.json();
    systems = sjson.systems || [];
    systemVecs = systems.map((s) => ({ v: new THREE.Vector3(s.x, s.y, s.z), sys: s }));
  }

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const data = new Float32Array(bytes.buffer);
  const n = data.length / STRIDE;
  starCount = n;

  posArr = new Float32Array(n * 3);
  colArr = new Float32Array(n * 3);
  sizeArr = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    posArr[i * 3] = data[o];
    posArr[i * 3 + 1] = data[o + 1];
    posArr[i * 3 + 2] = data[o + 2];
    colArr[i * 3] = data[o + 3];
    colArr[i * 3 + 1] = data[o + 4];
    colArr[i * 3 + 2] = data[o + 5];
    sizeArr[i] = data[o + 6];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
  geom.setAttribute("size", new THREE.BufferAttribute(sizeArr, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: makeStarTexture() },
      uScale: { value: window.innerHeight / 2 },
      uDim: { value: 1.0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (uScale / -mv.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 46.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uDim;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.04) discard;
        gl_FragColor = vec4(vColor, 1.0) * tex * uDim;
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  points = new THREE.Points(geom, material);
  scene.add(points);

  buildWeb();

  ui.loading.style.display = "none";
  window.__APP_READY = true;
  ui.roCount.textContent = n.toLocaleString();
}

// Connect the brightest stars to their nearest neighbours: a luminous web
// that makes the heavens feel interconnected.
function buildWeb() {
  const n = starCount;
  // pick the brightest ~700 stars by render size
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => sizeArr[b] - sizeArr[a]);
  const bright = idx.slice(0, Math.min(700, n));

  const brightPts = bright.map((i) => new THREE.Vector3(
    posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]
  ));

  const segPositions = [];
  const K = 2; // links per node
  const maxLink = 220; // parsecs — don't connect across the whole map
  for (let a = 0; a < brightPts.length; a++) {
    // find K nearest among the bright set
    const dists = [];
    for (let b = 0; b < brightPts.length; b++) {
      if (a === b) continue;
      const d = brightPts[a].distanceTo(brightPts[b]);
      if (d < maxLink) dists.push([d, b]);
    }
    dists.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < Math.min(K, dists.length); k++) {
      const b = dists[k][1];
      if (b > a) {
        segPositions.push(
          brightPts[a].x, brightPts[a].y, brightPts[a].z,
          brightPts[b].x, brightPts[b].y, brightPts[b].z
        );
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(segPositions, 3));
  const m = new THREE.LineBasicMaterial({
    color: 0x4a6cff,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  web = new THREE.LineSegments(g, m);
  scene.add(web);
}

// --- picking: hover + click ----------------------------------------------

function setupPicking() {
  const el = renderer.domElement;
  let downX = 0, downY = 0, downT = 0;

  el.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY; downT = performance.now();
  });
  el.addEventListener("pointerup", (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const dt = performance.now() - downT;
    if (moved < 6 && dt < 400) onClick(e);
  });
  el.addEventListener("pointermove", onHover);
}

function pickStar(e) {
  if (!points) return null;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const camDist = camera.position.distanceTo(controls.target);
  raycaster.params.Points.threshold = THREE.MathUtils.clamp(camDist * 0.012, 0.4, 22);
  const hits = raycaster.intersectObject(points, false);
  if (!hits.length) return null;
  const i = hits[0].index;
  const v = new THREE.Vector3(posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]);
  return { index: i, pos: v };
}

// For clicks: find the star whose line-of-sight is closest to the cursor, so a
// click always descends into *some* star (never a dead click on empty space).
function pickNearest(e) {
  if (!points) return null;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const o = raycaster.ray.origin;
  const d = raycaster.ray.direction;
  let best = -1, bestAng = Infinity, bestT = 0;
  const v = new THREE.Vector3();
  const closest = new THREE.Vector3();
  for (let i = 0; i < starCount; i++) {
    v.set(posArr[i * 3] - o.x, posArr[i * 3 + 1] - o.y, posArr[i * 3 + 2] - o.z);
    const t = v.dot(d);
    if (t <= 0) continue;
    closest.copy(d).multiplyScalar(t).add(o);
    const perp = Math.hypot(
      posArr[i * 3] - closest.x,
      posArr[i * 3 + 1] - closest.y,
      posArr[i * 3 + 2] - closest.z
    );
    const ang = perp / t; // angular miss — favours stars near the cursor
    if (ang < bestAng) { bestAng = ang; best = i; bestT = t; }
  }
  if (best < 0 || bestAng > 0.06) return null; // require a reasonably close aim
  return {
    index: best,
    pos: new THREE.Vector3(posArr[best * 3], posArr[best * 3 + 1], posArr[best * 3 + 2]),
  };
}

function nameFor(pos) {
  let best = null, bestD = 1.2;
  for (const nv of namedVec) {
    const d = nv.v.distanceTo(pos);
    if (d < bestD) { bestD = d; best = nv.s; }
  }
  return best;
}

function onHover(e) {
  if (mode === "system") {
    reticle.visible = false;
    hoverPlanet(e);
    return;
  }
  const hit = pickStar(e);
  if (!hit) { ui.tooltip.style.display = "none"; reticle.visible = false; return; }

  reticle.visible = true;
  reticle.position.copy(hit.pos);

  const nm = nameFor(hit.pos);
  ui.tooltip.style.display = "block";
  ui.tooltip.style.left = e.clientX + 16 + "px";
  ui.tooltip.style.top = e.clientY + 16 + "px";
  const dist = hit.pos.length();
  ui.tooltip.innerHTML = nm
    ? `<div class="name">${nm.name}</div><div class="sub">${nm.con || "—"} · ${dist.toFixed(1)} pc · click to descend</div>`
    : `<div class="name">Uncharted Star</div><div class="sub">${dist.toFixed(1)} pc from Sol · click to descend</div>`;
}

// In system view, name the planet under the cursor.
function hoverPlanet(e) {
  if (!systemGroup) { ui.tooltip.style.display = "none"; return; }
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  raycaster.params.Points.threshold = 1;
  const meshes = systemGroup.userData.planets.map((p) => p.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) { ui.tooltip.style.display = "none"; return; }
  const p = hits[0].object;
  ui.tooltip.style.display = "block";
  ui.tooltip.style.left = e.clientX + 16 + "px";
  ui.tooltip.style.top = e.clientY + 16 + "px";
  ui.tooltip.innerHTML =
    `<div class="name">${p.userData.name}</div>` +
    `<div class="sub">orbit ${p.userData.a.toFixed(2)} AU</div>`;
}

function onClick(e) {
  if (mode === "system") return;
  const hit = pickNearest(e);
  if (!hit) return;
  const nm = nameFor(hit.pos);
  descend(hit, nm);
}

// --- search ---------------------------------------------------------------

function onSearch() {
  const q = ui.search.value.trim().toLowerCase();
  ui.results.innerHTML = "";
  if (!q) return;

  // Real exoplanet systems first (these have confirmed planets to explore).
  systems
    .filter((s) => s.host.toLowerCase().includes(q))
    .slice(0, 10)
    .forEach((s) => {
      const li = document.createElement("div");
      li.className = "result";
      li.innerHTML =
        `<span>● ${s.host}</span><span class="con">${s.n} world${s.n > 1 ? "s" : ""}</span>`;
      li.addEventListener("click", () => {
        const pos = new THREE.Vector3(s.x, s.y, s.z);
        descend({ index: -1, pos }, null, s);
        ui.search.value = "";
        ui.results.innerHTML = "";
      });
      ui.results.appendChild(li);
    });

  // Then bright named stars.
  named
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 10)
    .forEach((s) => {
      const li = document.createElement("div");
      li.className = "result";
      li.innerHTML = `<span>${s.name}</span><span class="con">${s.con || ""}</span>`;
      li.addEventListener("click", () => {
        const pos = new THREE.Vector3(s.x, s.y, s.z);
        descend({ index: -1, pos }, s);
        ui.search.value = "";
        ui.results.innerHTML = "";
      });
      ui.results.appendChild(li);
    });
}

// --- descend into a star's system -----------------------------------------

// Find a real exoplanet system near a position (same parsec frame).
function realSystemFor(pos) {
  let best = null, bestD = 1.5;
  for (const sv of systemVecs) {
    const d = sv.v.distanceTo(pos);
    if (d < bestD) { bestD = d; best = sv.sys; }
  }
  return best;
}

function descend(hit, nm, forcedSys) {
  mode = "system";
  reticle.visible = false;
  ui.tooltip.style.display = "none";
  controls.autoRotate = false;

  savedView = {
    pos: camera.position.clone(),
    target: controls.target.clone(),
  };

  const realSys = forcedSys || realSystemFor(hit.pos);

  let color;
  if (realSys && realSys.teff) color = kelvinToColor(realSys.teff);
  else if (hit.index >= 0)
    color = new THREE.Color(colArr[hit.index * 3], colArr[hit.index * 3 + 1], colArr[hit.index * 3 + 2]);
  else color = new THREE.Color(0xfff1c0);

  systemGroup = buildSystem(hit.pos, color, realSys);
  scene.add(systemGroup);

  // dim the rest of the heavens so the system reads clearly
  if (points) points.material.uniforms.uDim.value = 0.22;
  if (web) web.material.opacity = 0.04;

  // frame the whole system: fly to a distance that fits its outer orbit
  const span = systemGroup.userData.span || 70;
  const offset = new THREE.Vector3(0, span * 0.5, span * 1.15);
  flyTo(hit.pos, hit.pos.clone().add(offset), () => {
    controls.minDistance = 4;
    controls.maxDistance = span * 6;
  });

  // readout
  const name = realSys ? realSys.host : nm ? nm.name : "Uncharted Star";
  const real = !!realSys;
  ui.roTitle.textContent = name + (name === "Sol" ? " — Our System" : " System");
  const planets = systemGroup.userData.planets.length;
  ui.roRows.innerHTML =
    `<div><span>Worlds</span><b>${planets}</b></div>` +
    `<div><span>Distance</span><b>${hit.pos.length().toFixed(1)} pc</b></div>` +
    `<div><span>Planets</span><b>${real ? "Real (confirmed)" : "Imagined"}</b></div>`;
  document.querySelector("#readout .label").textContent = real
    ? "Confirmed System"
    : "Stellar System";
  ui.backBtn.classList.remove("hidden");
}

function ascend() {
  if (mode !== "system") return;
  mode = "galaxy";
  ui.backBtn.classList.add("hidden");

  if (systemGroup) {
    flyTo(savedView.target, savedView.pos, () => {
      scene.remove(systemGroup);
      disposeGroup(systemGroup);
      systemGroup = null;
      controls.minDistance = 2;
      controls.maxDistance = 9000;
      controls.autoRotate = true;
    });
  }

  if (points) points.material.uniforms.uDim.value = 1.0;
  if (web) web.material.opacity = 0.16;

  ui.roTitle.textContent = "The Local Heavens";
  document.querySelector("#readout .label").textContent = "Domain";
  ui.roRows.innerHTML =
    `<div><span>Stars charted</span><b>${starCount.toLocaleString()}</b></div>` +
    `<div><span>Span</span><b>~2,000 parsecs</b></div>`;
}

// Build a star system. If `realSys` is given, render its real (confirmed)
// planets with their true relative ordering and sizes; otherwise generate a
// clean procedural system, deterministic per star location.
function buildSystem(pos, starColor, realSys) {
  const group = new THREE.Group();
  group.position.copy(pos);
  // gentle tilt so orbits read as 3D but stay clean circles
  group.rotation.x = -0.42;
  group.rotation.z = 0.12;

  const seed = Math.abs(
    Math.floor(pos.x * 73856093) ^
    Math.floor(pos.y * 19349663) ^
    Math.floor(pos.z * 83492791)
  );
  const rng = mulberry32(seed || 1);

  // central star
  const starR = 2.6;
  const star = new THREE.Mesh(
    new THREE.SphereGeometry(starR, 32, 32),
    new THREE.MeshBasicMaterial({ color: starColor })
  );
  group.add(star);
  const starGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: starColor,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  starGlow.scale.set(starR * 10, starR * 10, 1);
  group.add(starGlow);

  // Decide orbit radii (scene units). Real systems are rescaled per-system on a
  // log scale so wildly different real distances all read clearly.
  const innerR = starR + 9;
  const outerR = 78;
  let specs; // {dispR, dispSize, color, name, speedR}

  if (realSys && realSys.planets.length) {
    const ps = realSys.planets;
    const aMin = Math.log(ps[0].a);
    const aMax = Math.log(ps[ps.length - 1].a);
    const range = Math.max(1e-3, aMax - aMin);
    specs = ps.map((p, i) => {
      const f = ps.length === 1 ? 0.5 : (Math.log(p.a) - aMin) / range;
      const dispR = innerR + f * (outerR - innerR);
      const rjup = p.r || 0.18;
      const dispSize = THREE.MathUtils.clamp(0.7 + 2.0 * Math.sqrt(rjup), 0.7, 4.2);
      return {
        dispR,
        dispSize,
        color: planetColor(rjup, i),
        name: p.name,
        a: p.a,
        speedR: p.a, // real spacing drives relative speed (Kepler-ish)
        ringed: rjup > 0.6 && rng() > 0.5,
      };
    });
  } else {
    const n = 3 + Math.floor(rng() * 5); // 3..7
    specs = [];
    let r = innerR;
    for (let i = 0; i < n; i++) {
      r += (outerR - innerR) / (n + 1) * (0.6 + rng() * 0.9);
      const rjup = 0.1 + rng() * 1.4;
      specs.push({
        dispR: r,
        dispSize: THREE.MathUtils.clamp(0.7 + 2.0 * Math.sqrt(rjup), 0.7, 4.2),
        color: planetColor(rjup, i),
        name: "Unnamed world",
        a: r / 14,
        speedR: r / 14,
        ringed: rjup > 0.7 && rng() > 0.6,
      });
    }
  }

  // faint orbital-plane disc for orientation
  const grid = new THREE.Mesh(
    new THREE.RingGeometry(starR + 2, outerR + 6, 96, 1),
    new THREE.MeshBasicMaterial({
      color: 0x24407a, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  grid.rotation.x = Math.PI / 2;
  group.add(grid);

  const planets = [];
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    group.add(makeOrbitRing(sp.dispR, 0x5e7bdc, 0.34));

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(sp.dispSize, 22, 22),
      new THREE.MeshStandardMaterial({
        color: sp.color, emissive: sp.color, emissiveIntensity: 0.4,
        roughness: 0.7, metalness: 0.1,
      })
    );
    planet.userData.name = sp.name;
    planet.userData.a = sp.a;
    if (sp.ringed) {
      const pr = new THREE.Mesh(
        new THREE.RingGeometry(sp.dispSize * 1.5, sp.dispSize * 2.4, 32),
        new THREE.MeshBasicMaterial({
          color: sp.color, transparent: true, opacity: 0.5,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      pr.rotation.x = Math.PI / 2.3;
      planet.add(pr);
    }
    group.add(planet);

    planets.push({
      mesh: planet,
      radius: sp.dispR,
      angle: rng() * Math.PI * 2,
      speed: (0.9 / Math.pow(Math.max(sp.speedR, 0.02), 0.66)) * 0.18,
    });
  }

  const light = new THREE.PointLight(0xffffff, 2.4, 600, 1.1);
  group.add(light);
  group.add(new THREE.AmbientLight(0x2a3a60, 1.6));

  group.userData.planets = planets;
  group.userData.star = star;
  group.userData.span = outerR;
  return group;
}

// Colour a planet by its size class (rocky / neptune / gas giant) with variety.
function planetColor(rjup, i) {
  const rocky = [0x9fb7d0, 0xc8a27a, 0xb0938a, 0x8fb39a];
  const neptune = [0x6fb6ff, 0x7ad0e6, 0x8aa6ff];
  const giant = [0xffcf9a, 0xffb27a, 0xe8c79a, 0xd9a066];
  if (rjup < 0.35) return new THREE.Color(rocky[i % rocky.length]);
  if (rjup < 0.7) return new THREE.Color(neptune[i % neptune.length]);
  return new THREE.Color(giant[i % giant.length]);
}

// Approximate star colour from effective temperature (Kelvin).
function kelvinToColor(t) {
  const t100 = THREE.MathUtils.clamp(t, 1500, 40000) / 100;
  let r, g, b;
  if (t100 <= 66) { r = 255; g = 99.47 * Math.log(Math.max(t100, 1)) - 161.12; }
  else { r = 329.7 * Math.pow(t100 - 60, -0.1332); g = 288.12 * Math.pow(t100 - 60, -0.0755); }
  if (t100 >= 66) b = 255;
  else if (t100 <= 19) b = 0;
  else b = 138.52 * Math.log(t100 - 10) - 305.04;
  const c = (v) => THREE.MathUtils.clamp(v, 0, 255) / 255;
  return new THREE.Color(c(r), c(g), c(b));
}

function makeOrbitRing(radius, color, opacity) {
  const segs = 160;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Line(g, m);
}

// --- camera tween ---------------------------------------------------------

let tween = null;
function flyTo(target, camPos, onDone) {
  tween = {
    t0: performance.now(),
    dur: 1400,
    startTarget: controls.target.clone(),
    startCam: camera.position.clone(),
    endTarget: target.clone(),
    endCam: camPos.clone(),
    onDone,
  };
}

function updateTween() {
  if (!tween) return;
  const t = Math.min(1, (performance.now() - tween.t0) / tween.dur);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
  controls.target.lerpVectors(tween.startTarget, tween.endTarget, e);
  camera.position.lerpVectors(tween.startCam, tween.endCam, e);
  if (t >= 1) {
    const done = tween.onDone;
    tween = null;
    if (done) done();
  }
}

// --- loop -----------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  updateTween();

  // animate planets
  if (systemGroup) {
    for (const p of systemGroup.userData.planets) {
      p.angle += p.speed * dt;
      p.mesh.position.set(
        Math.cos(p.angle) * p.radius,
        0,
        Math.sin(p.angle) * p.radius
      );
    }
  }

  // keep reticle a constant screen size + give it a slow spin
  if (reticle.visible) {
    const s = camera.position.distanceTo(reticle.position) * 0.03;
    reticle.scale.setScalar(s);
    reticle.quaternion.copy(camera.quaternion);
    reticle.rotateZ(performance.now() * 0.0006);
  }

  // gentle web shimmer
  if (web && mode === "galaxy") {
    web.material.opacity = 0.13 + Math.sin(performance.now() * 0.0008) * 0.05;
  }

  controls.update();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  if (points) points.material.uniforms.uScale.value = window.innerHeight / 2;
}

// --- helpers --------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function makeStarTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.92)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function makeGlowTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,240,200,0.35)");
  g.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
