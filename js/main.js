// Map of the Universe — 3D star map built from the real HYG star catalog.
// Loads data/stars.bin (packed float32: x,y,z,r,g,b,size per star) and renders
// an interactive, fly-through point cloud with three.js.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const STRIDE = 7; // floats per star: x,y,z, r,g,b, size

const ui = {
  loading: document.getElementById("loading"),
  count: document.getElementById("count"),
  tooltip: document.getElementById("tooltip"),
  search: document.getElementById("search"),
  results: document.getElementById("results"),
  hud: document.getElementById("hud"),
};

let scene, camera, renderer, controls, points;
let named = [];
let meta = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

init();

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000005);
  scene.fog = new THREE.FogExp2(0x000005, 0.00035);

  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.01,
    20000
  );
  camera.position.set(0, 30, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.2;
  controls.maxDistance = 6000;

  addReferenceMarkers();

  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  ui.search.addEventListener("input", onSearch);

  try {
    await loadStars();
  } catch (err) {
    ui.loading.textContent = "Failed to load star data: " + err.message;
    console.error(err);
    return;
  }

  animate();
}

// A small Sol marker at the origin so you always know where home is.
function addReferenceMarkers() {
  const sol = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0 })
  );
  scene.add(sol);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xfff3c0,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  );
  glow.scale.set(8, 8, 1);
  scene.add(glow);
}

async function loadStars() {
  const [b64Resp, metaResp] = await Promise.all([
    fetch("data/stars.b64"),
    fetch("data/stars.json"),
  ]);
  if (!b64Resp.ok) throw new Error("stars.b64 " + b64Resp.status);
  if (!metaResp.ok) throw new Error("stars.json " + metaResp.status);

  // Star records ship as base64 text; decode back to a Float32Array.
  const b64 = (await b64Resp.text()).trim();
  meta = await metaResp.json();
  named = meta.named || [];

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const data = new Float32Array(bytes.buffer);
  const n = data.length / STRIDE;

  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    positions[i * 3] = data[o];
    positions[i * 3 + 1] = data[o + 1];
    positions[i * 3 + 2] = data[o + 2];
    colors[i * 3] = data[o + 3];
    colors[i * 3 + 1] = data[o + 4];
    colors[i * 3 + 2] = data[o + 5];
    sizes[i] = data[o + 6];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: makeStarTexture() },
      uScale: { value: window.innerHeight / 2 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (uScale / -mv.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 40.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.05) discard;
        gl_FragColor = vec4(vColor, 1.0) * tex;
      }
    `,
    transparent: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  points = new THREE.Points(geom, material);
  scene.add(points);

  ui.loading.style.display = "none";
  ui.count.textContent = n.toLocaleString();
  ui.hud.style.display = "block";
}

function onSearch() {
  const q = ui.search.value.trim().toLowerCase();
  ui.results.innerHTML = "";
  if (!q) return;
  const matches = named
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, 12);
  for (const s of matches) {
    const li = document.createElement("div");
    li.className = "result";
    li.textContent = `${s.name}  ·  ${s.con || "—"}  ·  mag ${s.mag}`;
    li.addEventListener("click", () => flyTo(s));
    ui.results.appendChild(li);
  }
}

function flyTo(star) {
  const target = new THREE.Vector3(star.x, star.y, star.z);
  const dir = new THREE.Vector3()
    .subVectors(camera.position, controls.target)
    .normalize();
  const camPos = target.clone().addScaledVector(dir, 25);

  const startTarget = controls.target.clone();
  const startCam = camera.position.clone();
  const t0 = performance.now();
  const dur = 1200;

  function step(now) {
    const t = Math.min(1, (now - t0) / dur);
    const e = t * t * (3 - 2 * t); // smoothstep
    controls.target.lerpVectors(startTarget, target, e);
    camera.position.lerpVectors(startCam, camPos, e);
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  ui.tooltip.style.display = "block";
  ui.tooltip.innerHTML = `<strong>${star.name}</strong><br>${
    star.con || ""
  }<br>apparent mag ${star.mag}`;
  ui.tooltip.style.left = "50%";
  ui.tooltip.style.top = "70%";
}

function onPointerMove(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (!named.length) return;
  raycaster.setFromCamera(pointer, camera);
  // Find the nearest named star to the cursor ray.
  let best = null;
  let bestDist = Infinity;
  const ray = raycaster.ray;
  for (const s of named) {
    const p = new THREE.Vector3(s.x, s.y, s.z);
    const d = ray.distanceToPoint(p);
    const camDist = camera.position.distanceTo(p);
    const threshold = camDist * 0.03 + 1.5;
    if (d < threshold && camDist < bestDist) {
      best = s;
      bestDist = camDist;
    }
  }
  if (best) {
    ui.tooltip.style.display = "block";
    ui.tooltip.style.left = e.clientX + 14 + "px";
    ui.tooltip.style.top = e.clientY + 14 + "px";
    ui.tooltip.innerHTML = `<strong>${best.name}</strong><br>${
      best.con || ""
    }<br>apparent mag ${best.mag}`;
  } else {
    ui.tooltip.style.display = "none";
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (points) points.material.uniforms.uScale.value = window.innerHeight / 2;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// --- texture helpers -------------------------------------------------------

function makeStarTexture() {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeGlowTexture() {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.8)");
  g.addColorStop(0.4, "rgba(255,240,190,0.25)");
  g.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
