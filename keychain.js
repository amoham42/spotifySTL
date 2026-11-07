// SpotifySTL: builds a 3D-printable keychain carrying a Spotify Code, in the browser.
//
// The code itself comes from Spotify's public "scannables" service as an SVG (bars + logo).
// Its shapes are extruded on top of a rounded base with a key-ring hole; both are generated
// here in millimetres with Z up, the way slicers expect, and exported as binary STL.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toSpotifyUri } from './spotify.js';

const DEFAULT_URI = 'spotify:track:3ylrCkU7BD4N7SNegCRRXY';
const MARGIN = 3;      // mm of base around the code
const HOLE_D = 4.5;    // key-ring hole diameter, mm
const OVERLAP = 0.05;  // the code sinks this far into the base so the two bodies fuse cleanly

const $ = (id) => document.getElementById(id);
const ui = {
  form: $('linkForm'), link: $('link'), message: $('message'), tip: $('tip'),
  length: $('length'), thickness: $('thickness'), relief: $('relief'),
  baseColor: $('baseColor'), codeColor: $('codeColor'),
  exportAll: $('exportAll'), exportParts: $('exportParts'),
};

// ---------- Spotify links ----------

async function fetchCodeSvg(uri) {
  const res = await fetch(`https://scannables.scdn.co/uri/plain/svg/FFFFFF/black/640/${uri}`);
  if (!res.ok) throw new Error(`Spotify returned ${res.status}`);
  const text = await res.text();
  if (!text.includes('<svg')) throw new Error('Spotify did not return a code');
  return text;
}

// ---------- geometry (millimetres, Z up) ----------

/** The SVG's dark shapes (bars + logo), skipping the white background, as y-up polygons. */
function codeShapes(svgText) {
  const data = new SVGLoader().parse(svgText);
  const shapes = [];
  for (const path of data.paths) {
    const fill = (path.userData?.style?.fill || '').toLowerCase();
    if (fill === 'none' || fill === '#ffffff' || fill === '#fff' || fill === 'white') continue;
    shapes.push(...SVGLoader.createShapes(path));
  }
  if (!shapes.length) throw new Error('the code had no shapes');
  return shapes;
}

function boundsOf(shapes) {
  const box = new THREE.Box2();
  for (const s of shapes) for (const p of s.getPoints(8)) box.expandByPoint(p);
  return box;
}

// Rebuilds a shape with a transform applied point by point. Flipping y with a negative scale
// on the mesh would turn the STL inside out; ExtrudeGeometry re-orients the new polygons itself.
function transformShape(shape, fn) {
  const out = new THREE.Shape(shape.getPoints(10).map(fn));
  out.holes = shape.holes.map((h) => new THREE.Path(h.getPoints(10).map(fn)));
  return out;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
  return s;
}

/** Base + code meshes for the given SVG and settings. */
function buildKeychain(svgText, { length, thickness, relief }, materials) {
  const shapes = codeShapes(svgText);
  const b = boundsOf(shapes);
  const svgW = b.max.x - b.min.x, svgH = b.max.y - b.min.y;

  const holeZone = HOLE_D + 2;  // hole plus a little wall before the code starts
  const codeW = length - 2 * MARGIN - holeZone;
  const scale = codeW / svgW;
  const codeH = svgH * scale;
  const height = codeH + 2 * MARGIN;
  const codeLeft = -length / 2 + MARGIN + holeZone;

  // base: rounded slab with the key-ring hole
  const base = roundedRect(length, height, Math.min(height / 2, 5));
  const hole = new THREE.Path();
  hole.absarc(-length / 2 + MARGIN + HOLE_D / 2, 0, HOLE_D / 2, 0, Math.PI * 2, true);
  base.holes.push(hole);
  const baseGeo = new THREE.ExtrudeGeometry(base, { depth: thickness, bevelEnabled: false, curveSegments: 24 });

  // code: SVG (y down) -> mm (y up), placed on top of the base
  const toMm = (p) => new THREE.Vector2(codeLeft + (p.x - b.min.x) * scale, codeH / 2 - (p.y - b.min.y) * scale);
  const codeGeos = shapes.map((s) => {
    const g = new THREE.ExtrudeGeometry(transformShape(s, toMm), { depth: relief + OVERLAP, bevelEnabled: false, curveSegments: 12 });
    g.translate(0, 0, thickness - OVERLAP);
    return g;
  });

  return {
    base: new THREE.Mesh(baseGeo, materials.base),
    code: codeGeos.map((g) => new THREE.Mesh(g, materials.code)),
    size: { length, height, depth: thickness + relief },
  };
}

// ---------- scene ----------

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
camera.position.set(0, 95, 75);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 40;
controls.maxDistance = 400;
controls.maxPolarAngle = Math.PI * 0.49;

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-40, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 });
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x303040, 0.4));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.28 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const materials = {
  base: new THREE.MeshStandardMaterial({ color: ui.baseColor.value, roughness: 0.55 }),
  code: new THREE.MeshStandardMaterial({ color: ui.codeColor.value, roughness: 0.45 }),
};

// the model is built Z-up (print orientation); the display group turns it to the viewer's Y-up
const display = new THREE.Group();
display.rotation.x = -Math.PI / 2;
scene.add(display);

let current = null;  // { base, code[], size }
let currentSvg = null;

function settings() {
  return { length: +ui.length.value, thickness: +ui.thickness.value, relief: +ui.relief.value };
}

function rebuild() {
  if (!currentSvg) return;
  if (current) {
    display.clear();
    current.base.geometry.dispose();
    current.code.forEach((m) => m.geometry.dispose());
  }
  const s = settings();
  current = buildKeychain(currentSvg, s, materials);
  for (const m of [current.base, ...current.code]) {
    m.castShadow = m.receiveShadow = true;
    display.add(m);
  }
  const { length, height, depth } = current.size;
  ui.tip.innerHTML =
    `${length.toFixed(0)} × ${height.toFixed(1)} × ${depth.toFixed(1)} mm. ` +
    `For two colours on one nozzle, <strong>change filament at Z = ${s.thickness.toFixed(1)} mm</strong>.`;
}

async function load(uri) {
  setMessage('Fetching the Spotify Code…');
  ui.exportAll.disabled = ui.exportParts.disabled = true;
  try {
    const first = !currentSvg;
    currentSvg = await fetchCodeSvg(uri);
    rebuild();
    if (first) fitCamera();
    setMessage(`Ready: ${uri.split(':')[1]} code`);
    history.replaceState(null, '', `#${uri}`);
  } catch (e) {
    setMessage(`Couldn't get that code (${e.message}). Check the link and try again.`, true);
  } finally {
    ui.exportAll.disabled = ui.exportParts.disabled = !current;
  }
}

function setMessage(text, isError = false) {
  ui.message.textContent = text;
  ui.message.classList.toggle('error', isError);
}

// ---------- export ----------

function download(meshes, filename) {
  const group = new THREE.Group();
  for (const m of meshes) group.add(new THREE.Mesh(m.geometry));  // model space: mm, Z up
  group.updateMatrixWorld(true);
  const data = new STLExporter().parse(group, { binary: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'model/stl' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

ui.exportAll.addEventListener('click', () => current && download([current.base, ...current.code], 'spotify-keychain.stl'));
ui.exportParts.addEventListener('click', () => {
  if (!current) return;
  download([current.base], 'spotify-keychain-base.stl');
  setTimeout(() => download(current.code, 'spotify-keychain-code.stl'), 300);
});

// ---------- controls ----------

ui.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const uri = toSpotifyUri(ui.link.value);
  if (!uri) {
    setMessage(
      ui.link.value.includes('spotify.link')
        ? 'Short spotify.link URLs can’t be read here: open it, then copy the full open.spotify.com link.'
        : 'That doesn’t look like a Spotify link. Use Share → Copy link in Spotify.',
      true,
    );
    return;
  }
  load(uri);
});

for (const [input, unit] of [[ui.length, ' mm'], [ui.thickness, ' mm'], [ui.relief, ' mm']]) {
  const out = $(`${input.id}Out`);
  const show = () => (out.textContent = (+input.value).toFixed(input.step.includes('.') ? 1 : 0) + unit);
  show();
  input.addEventListener('input', () => {
    show();
    rebuild();
  });
}
ui.baseColor.addEventListener('input', () => materials.base.color.set(ui.baseColor.value));
ui.codeColor.addEventListener('input', () => materials.code.color.set(ui.codeColor.value));

// keep the keychain centred in the part of the screen the panel doesn't cover
// back the camera off until the whole keychain fits the free part of the screen
function fitCamera() {
  const length = current ? current.size.length : 60;
  const panel = document.querySelector('.panel').getBoundingClientRect();
  const desktop = window.innerWidth > 640;
  const freeW = desktop ? window.innerWidth - panel.right : window.innerWidth;
  const freeH = desktop ? window.innerHeight : window.innerHeight - panel.height;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanH = tanV * (freeW / window.innerHeight);
  const dist = Math.max((length * 0.62) / tanH, (length * 0.35) / (tanV * (freeH / window.innerHeight)));
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance));
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const panel = document.querySelector('.panel').getBoundingClientRect();
  const desktop = w > 640;
  camera.setViewOffset(w, h, desktop ? -(panel.right / 2) : 0, desktop ? 0 : panel.height / 3, w, h);
  camera.updateProjectionMatrix();
  fitCamera();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// start with the link in the URL hash, if any (so a keychain can be shared), else a default
const fromHash = toSpotifyUri(decodeURIComponent(location.hash.slice(1)));
const start = fromHash || DEFAULT_URI;
ui.link.value = `https://open.spotify.com/${start.split(':')[1]}/${start.split(':')[2]}`;
load(start);
