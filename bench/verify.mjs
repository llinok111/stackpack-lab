// Behavioural assertions. Every printed number comes from a real run.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pack, checkPacking, supportArea, gridSupportOracle, gridOccupancyOracle, scaleInstance, boxVolume } from "../src/core.mjs";

const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const ok = (m) => console.log("ok  ", m);
const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const { instances } = load("../data/corpus.json");
const stored = readFileSync(new URL("../data/corpus.sha256", import.meta.url), "utf8").trim();
const actual = createHash("sha256").update(JSON.stringify({ instances }, null, 0) + "\n").digest("hex");
if (stored !== actual) fail(`corpus sha256 mismatch ${stored} vs ${actual}`);
ok(`corpus sha256 ${actual.slice(0, 16)}… matches data/corpus.sha256 (deterministic rebuild)`);
if (instances.length !== 60) fail(`expected 60 instances, got ${instances.length}`);

let boxes = 0, placed = 0, overlaps = 0, outside = 0, unsupported = 0, vol = 0, cap = 0;
let basePlaced = 0, baseOverlaps = 0, baseOutside = 0, baseUnsupported = 0, baseVol = 0;
let oracleMismatch = 0, oracleBoxes = 0, gridDouble = 0, gridCells = 0;
let util = 0;
for (const inst of instances) {
  const res = pack(inst);
  const rep = checkPacking(inst, res.placements);
  boxes += inst.boxes.length; placed += rep.placed;
  overlaps += rep.overlapPairs; outside += rep.outOfContainer.length;
  unsupported += rep.unsupportedCount; vol += rep.volume;
  cap += inst.container.w * inst.container.h * inst.container.d;
  util += rep.utilization;

  const base = checkPacking(inst, pack(inst, { minSupport: 0 }).placements);
  basePlaced += base.placed; baseOverlaps += base.overlapPairs;
  baseOutside += base.outOfContainer.length; baseUnsupported += base.unsupportedCount;
  baseVol += base.volume;

  const grid = gridOccupancyOracle(rep.placed ? res.placements : [], inst.container);
  if (grid.doubleWrites) gridDouble += grid.doubleWrites;
  let occupied = 0;
  for (let i = 0; i < grid.cells.length; i++) occupied += grid.cells[i];
  gridCells += occupied;
  for (const p of res.placements) {
    if (p.z === 0) continue;
    oracleBoxes++;
    const a = supportArea(p, res.placements);
    const b = gridSupportOracle(p, res.placements, inst.container);
    if (a !== b) oracleMismatch++;
  }
}
if (placed !== boxes) fail(`stackpack placed ${placed}/${boxes}`);
if (overlaps !== 0) fail(`stackpack overlap pairs ${overlaps}`);
if (outside !== 0) fail(`stackpack outside ${outside}`);
if (unsupported !== 0) fail(`stackpack unsupported ${unsupported}`);
if (basePlaced !== boxes) fail(`baseline placed ${basePlaced}/${boxes}`);
if (baseOverlaps !== 0) fail(`baseline overlap pairs ${baseOverlaps}`);
if (baseUnsupported < 1000) fail(`baseline unsupported only ${baseUnsupported}; contrast too weak`);
if (baseVol !== vol) fail("baseline and stackpack volumes differ");
if (oracleMismatch !== 0) fail(`support oracle mismatches ${oracleMismatch}/${oracleBoxes}`);
if (gridDouble !== 0) fail(`grid oracle double writes ${gridDouble}`);
if (gridCells !== vol) fail(`grid cells ${gridCells} != placed volume ${vol}`);

console.log(`ok   stackpack: ${placed}/${boxes} boxes, overlaps ${overlaps}, outside ${outside}, unsupported ${unsupported}, aggregate volume ${vol}/${cap} = ${(vol / cap * 100).toFixed(3)}%, mean per-instance ${(util / 60 * 100).toFixed(3)}%`);
console.log(`ok   no-support baseline: ${basePlaced}/${boxes} placed, overlaps ${baseOverlaps}, unsupported ${baseUnsupported} (${(baseUnsupported / boxes * 100).toFixed(2)}%), same volume ${baseVol}`);
console.log(`ok   grid occupancy oracle: 0 double writes, ${gridCells} occupied unit cells == placed volume`);
console.log(`ok   grid support oracle: ${oracleBoxes} elevated boxes, ${oracleMismatch} mismatches vs sweep-line support`);

let scaled = 0, scaledBad = 0;
for (const inst of instances.slice(0, 10)) {
  const baseRes = pack(inst);
  const baseRep = checkPacking(inst, baseRes.placements);
  for (const k of [2, 3, 5]) {
    const big = scaleInstance(inst, k);
    const res = pack(big);
    const rep = checkPacking(big, res.placements);
    scaled++;
    if (res.unplaced.length || rep.overlapPairs || rep.unsupportedCount || Math.abs(rep.utilization - baseRep.utilization) > 1e-12) scaledBad++;
  }
}
if (scaledBad) fail(`scale invariance failed on ${scaledBad}/${scaled} scaled instances`);
ok(`scale invariance: ${scaled}/${scaled} instances at ×2/×3/×5 keep mean utilization ${(util / 60 * 100).toFixed(3)}% and 0 violations`);

const tiny = { container: { w: 4, h: 4, d: 4 }, boxes: Array.from({ length: 8 }, () => ({ w: 2, h: 2, d: 2 })) };
const tRes = pack(tiny);
const tRep = checkPacking(tiny, tRes.placements);
if (tRes.unplaced.length || tRep.unsupportedCount !== 0 || tRep.overlapPairs !== 0 || tRep.utilization !== 1) fail(`tiny fully-packed case failed: unplaced=${tRes.unplaced.length} unsupported=${tRep.unsupportedCount} util=${tRep.utilization}`);
const evil = { container: { w: 4, h: 4, d: 4 }, boxes: [{ w: 1, h: 1, d: 1 }] };
const ePlace = [{ id: 0, x: 1, y: 1, z: 2, w: 1, h: 1, d: 1 }];
const eRep = checkPacking(evil, ePlace);
if (eRep.unsupportedCount !== 1) fail(`negative control expected 1 unsupported, got ${eRep.unsupportedCount}`);
ok(`negative control: floating 1×1×1 at z=2 is rejected (unsupported=${eRep.unsupportedCount}); 8/8 boxes fill 4×4×4 at 100%`);

const h1 = createHash("sha256").update(JSON.stringify(pack(instances[0]).placements)).digest("hex");
const h2 = createHash("sha256").update(JSON.stringify(pack(instances[0]).placements)).digest("hex");
if (h1 !== h2) fail("pack is not deterministic");
ok(`determinism: two runs hash to ${h1.slice(0, 16)}…`);

console.log(`ASSERTIONS PASSED: 60 instances, ${boxes} boxes, aggregate util ${(vol / cap * 100).toFixed(3)}% (all gates exit 0)`);
process.exit(0);