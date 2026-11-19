import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { pack, checkPacking } from "./src/core.mjs";

const view = document.getElementById("view");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x16202c, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(1, 2.4, 1.8);
scene.add(key);

const group = new THREE.Group();
scene.add(group);

const palette = {
  ok: 0x38d996, bad: 0xff5470, box: 0x4aa3ff,
};

let corpus = null;
let nodeMedian = null;
let current = 0;
let baseline = false;

function disposeGroup() {
  for (const child of group.children) {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }
  group.clear();
}

function addBox(p, color, opacity = 1) {
  const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.08,
    transparent: opacity < 1, opacity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2);
  group.add(mesh);
}

function frame(container) {
  const c = new THREE.Vector3(container.w / 2, container.h / 2, container.d / 2);
  const span = Math.max(container.w, container.h, container.d);
  camera.position.set(c.x + span * 1.35, c.y + span * 1.05, c.z + span * 1.65);
  camera.near = span / 100;
  camera.far = span * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(c);
  controls.update();
}

function build(inst) {
  disposeGroup();
  const t0 = performance.now();
  const res = pack(inst, { minSupport: baseline ? 0 : 0.5 });
  const rep = checkPacking(inst, res.placements);
  const ms = performance.now() - t0;

  const floating = new Set(rep.unsupported.map((u) => u.id));
  for (const p of res.placements) addBox(p, floating.has(p.id) ? palette.bad : palette.ok);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(inst.container.w, inst.container.h, inst.container.d)),
    new THREE.LineBasicMaterial({ color: 0x6c8bb0 })
  );
  edges.position.set(inst.container.w / 2, inst.container.h / 2, inst.container.d / 2);
  group.add(edges);

  document.getElementById("placed").textContent = `${rep.placed}/${inst.boxes.length}`;
  document.getElementById("util").textContent = `${(rep.utilization * 100).toFixed(2)}%`;
  const unsup = document.getElementById("unsup");
  unsup.textContent = String(rep.unsupportedCount);
  unsup.className = rep.unsupportedCount ? "bad" : "ok";
  document.getElementById("over").textContent = String(rep.overlapPairs);
  document.getElementById("ms").textContent = ms.toFixed(1);
  document.getElementById("node").textContent = nodeMedian == null ? "–" : nodeMedian.toFixed(1);

  return rep;
}

function renderCase(i) {
  current = i;
  document.getElementById("caseOut").textContent = String(i);
  frame(corpus.instances[i].container);
  build(corpus.instances[i]);
}

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

async function boot() {
  corpus = await (await fetch("./data/corpus.json")).json();
  try {
    const bench = await (await fetch("./bench/result.json")).json();
    nodeMedian = bench.certifiedPack?.median ?? null;
  } catch { nodeMedian = null; }
  resize();
  renderCase(0);
  addEventListener("resize", resize);
  document.getElementById("case").addEventListener("input", (e) => renderCase(Number(e.target.value)));
  document.getElementById("toggle").addEventListener("click", (e) => {
    baseline = !baseline;
    e.currentTarget.setAttribute("aria-pressed", String(baseline));
    e.currentTarget.textContent = baseline ? "baseline: ignore support (ON)" : "baseline: ignore support";
    build(corpus.instances[current]);
  });
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

boot();