// SpotifySTL: builds a 3D-printable keychain carrying a Spotify Code, in the browser.
//
// The code itself comes from Spotify's public "scannables" service as an SVG (bars + logo).
// Its shapes are extruded inside a rimmed tray with a key-ring hole at one end; both are
// generated here in millimetres with Z up, the way slicers expect, and exported as binary STL.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toSpotifyUri } from './spotify.js';

const DEFAULT_URI = 'spotify:track:3ylrCkU7BD4N7SNegCRRXY';
// Base proportions, in mm, measured from the original keychain model.
const RIM = 1;            // width of the raised rim, and of the ring around the hole
const PAD_X = 2.8;        // tray floor left clear at each end of the code
const PAD_Y = 2.3;        // tray floor left clear above and below the code
const HOLE_WALL = 1.5;    // material between the key-ring hole and the long edges
const HOLE_OFFSET = 0.5;  // the hole sits this far in from the centre of the rounded end
const OVERLAP = 0.05;     // stacked bodies sink this far into the one below so they fuse cleanly

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

/** A slot outline (a rectangle with semicircular ends), centred on the origin. */
function stadium(length, width) {
  const r = width / 2, x = length / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-x, -r);
  s.lineTo(x, -r);
  s.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2);
  s.lineTo(-x, r);
  s.absarc(-x, 0, r, Math.PI / 2, 1.5 * Math.PI);
  return s;
}

function circle(cx, r) {
  const p = new THREE.Path();
  p.absarc(cx, 0, r, 0, Math.PI * 2, true);
  return p;
}

/**
 * Base + code meshes for the given SVG and settings.
 *
 * The base is the original keychain: a tray with a raised rim, a large key-ring hole at one
 * rounded end with a raised ring around it, and the code standing on the tray floor so that its
 * top is flush with the rim. At 72 mm it has the original's proportions: 15 mm wide, a 12 mm hole.
 */
function buildKeychain(svgText, { length, thickness, relief }, materials) {
  const shapes = codeShapes(svgText);
  const b = boundsOf(shapes);
  const svgW = b.max.x - b.min.x, svgH = b.max.y - b.min.y;

  // The width follows the code's height, and the hole end is as long as the keychain is wide,
  // so the scale has to satisfy: length = width + PAD_X + code + PAD_X + RIM.
  const scale = (length - 2 * (PAD_Y + RIM) - 2 * PAD_X - RIM) / (svgW + svgH);
  const codeH = svgH * scale;
  const width = codeH + 2 * (PAD_Y + RIM);
  const R = width / 2;
  const left = -length / 2, right = length / 2;

  const holeX = left + R + HOLE_OFFSET;
  const holeR = R - HOLE_WALL;
  const ringR = holeR + RIM;   // outer radius of the raised ring around the hole
  const innerR = R - RIM;      // half-width of the tray

  // floor: the full outline, from the bed up to the base thickness
  const floor = stadium(length, width);
  floor.holes.push(circle(holeX, holeR));
  const floorGeo = new THREE.ExtrudeGeometry(floor, { depth: thickness, bevelEnabled: false, curveSegments: 32 });

  // rim and ring: the same outline with the tray cut out of it, as tall as the code.
  // The tray runs from the ring's arc to the inside of the far rounded end.
  const wall = stadium(length, width);
  const trayX = holeX + Math.sqrt(ringR * ringR - innerR * innerR);  // where the ring meets the long walls
  const a = Math.asin(innerR / ringR);
  const tray = new THREE.Path();
  tray.moveTo(trayX, -innerR);
  tray.lineTo(right - R, -innerR);
  tray.absarc(right - R, 0, innerR, -Math.PI / 2, Math.PI / 2);
  tray.lineTo(trayX, innerR);
  tray.absarc(holeX, 0, ringR, a, -a, true);
  wall.holes.push(circle(holeX, holeR), tray);
  const wallGeo = new THREE.ExtrudeGeometry(wall, { depth: relief + OVERLAP, bevelEnabled: false, curveSegments: 32 });
  wallGeo.translate(0, 0, thickness - OVERLAP);

  const baseGeo = mergeGeometries([floorGeo, wallGeo]);
  floorGeo.dispose();
  wallGeo.dispose();

  // code: SVG (y down) -> mm (y up), standing on the tray floor
  const codeLeft = holeX + ringR + PAD_X;
  const toMm = (p) => new THREE.Vector2(codeLeft + (p.x - b.min.x) * scale, codeH / 2 - (p.y - b.min.y) * scale);
  const codeGeos = shapes.map((s) => {
    const g = new THREE.ExtrudeGeometry(transformShape(s, toMm), { depth: relief + OVERLAP, bevelEnabled: false, curveSegments: 12 });
    g.translate(0, 0, thickness - OVERLAP);
    return g;
  });

  return {
    base: new THREE.Mesh(baseGeo, materials.base),
    code: codeGeos.map((g) => new THREE.Mesh(g, materials.code)),
    size: { length, height: width, depth: thickness + relief },
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
    `For two colours on one nozzle, <strong>change filament at Z = ${s.thickness.toFixed(1)} mm</strong>; ` +
    `the rim then prints in the code colour too.`;
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
  const length = current ? current.size.length : 72;
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
