// stackpack-lab core — pure ES module, no three.js, no DOM, no I/O.
// Integer orthogonal boxes; every claim is checkable by exact integer predicates.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const boxVolume = (b) => b.w * b.h * b.d;

export function overlaps(a, b) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h &&
    a.z < b.z + b.d && b.z < a.z + a.d
  );
}

export function insideContainer(b, c) {
  return b.x >= 0 && b.y >= 0 && b.z >= 0 &&
    b.x + b.w <= c.w && b.y + b.h <= c.h && b.z + b.d <= c.d;
}

// Exact union area of axis-aligned integer rectangles via x-sweep.
export function rectUnionArea(rects) {
  if (!rects.length) return 0;
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (x0 === x1) continue;
    const spans = [];
    for (const r of rects) if (r.x0 <= x0 && r.x1 >= x1) spans.push([r.y0, r.y1]);
    if (!spans.length) continue;
    spans.sort((a, b) => a[0] - b[0]);
    let covered = 0, cy0 = spans[0][0], cy1 = spans[0][1];
    for (let k = 1; k < spans.length; k++) {
      if (spans[k][0] <= cy1) cy1 = Math.max(cy1, spans[k][1]);
      else { covered += cy1 - cy0; cy0 = spans[k][0]; cy1 = spans[k][1]; }
    }
    covered += cy1 - cy0;
    area += (x1 - x0) * covered;
  }
  return area;
}

// Area of the bottom face of `box` that rests on a top face at exactly box.z.
export function supportArea(box, placed) {
  if (box.z === 0) return box.w * box.d;
  const rects = [];
  for (const p of placed) {
    if (p.id === box.id) continue;
    if (p.z + p.d !== box.z) continue;
    const x0 = Math.max(box.x, p.x), x1 = Math.min(box.x + box.w, p.x + p.w);
    const y0 = Math.max(box.y, p.y), y1 = Math.min(box.y + box.h, p.y + p.h);
    if (x1 > x0 && y1 > y0) rects.push({ x0, x1, y0, y1 });
  }
  return rectUnionArea(rects);
}

export const supportRatio = (box, placed) => supportArea(box, placed) / (box.w * box.d);

// Exact audit. Every returned count is recomputable from the placement list alone.
export function checkPacking(instance, placements, opts = {}) {
  const minSupport = opts.minSupport ?? 0.5;
  const c = instance.container;
  const byId = new Map(instance.boxes.map((b, i) => [i, b]));
  const seen = new Set();
  const out = { placed: 0, duplicateIds: [], unknownIds: [], outOfContainer: [], overlaps: [], unsupported: [], volume: 0, utilization: 0 };
  const ps = [];
  for (const p of placements) {
    if (seen.has(p.id)) { out.duplicateIds.push(p.id); continue; }
    seen.add(p.id);
    if (!byId.has(p.id)) { out.unknownIds.push(p.id); continue; }
    ps.push(p);
    out.placed++;
    out.volume += boxVolume(p);
    if (!insideContainer(p, c)) out.outOfContainer.push(p.id);
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (overlaps(ps[i], ps[j])) out.overlaps.push([ps[i].id, ps[j].id]);
    }
  }
  for (const p of ps) {
    if (p.z === 0) continue;
    const ratio = supportRatio(p, ps);
    if (ratio + 1e-12 < minSupport) out.unsupported.push({ id: p.id, ratio });
  }
  out.utilization = out.volume / (c.w * c.h * c.d);
  out.overlapPairs = out.overlaps.length;
  out.unsupportedCount = out.unsupported.length;
  out.allPlaced = out.placed === instance.boxes.length;
  return out;
}

function orientations(b) {
  const p = [[b.w, b.h, b.d], [b.w, b.d, b.h], [b.h, b.w, b.d], [b.h, b.d, b.w], [b.d, b.w, b.h], [b.d, b.h, b.w]];
  const seen = new Set(), out = [];
  for (const [w, h, d] of p) {
    const k = `${w},${h},${d}`;
    if (!seen.has(k)) { seen.add(k); out.push({ w, h, d }); }
  }
  // Prefer large footprint, then low height: better support and lower centre of mass.
  out.sort((a, b2) => b2.w * b2.d - a.w * a.d || a.h - b2.h);
  return out;
}

function candidatePoints(container, placed) {
  const pts = [];
  for (let x = 0; x < container.w; x += 1) {
    for (let y = 0; y < container.h; y += 2) pts.push({ x, y, z: 0 });
  }
  for (const p of placed) {
    const xs = [p.x, p.x + p.w], ys = [p.y, p.y + p.h], zs = [p.z + p.d];
    for (const x of xs) for (const y of ys) for (const z of zs) pts.push({ x, y, z });
    pts.push({ x: p.x + p.w, y: p.y, z: p.z });
    pts.push({ x: p.x, y: p.y + p.h, z: p.z });
  }
  const seen = new Set(), out = [];
  for (const q of pts) {
    if (q.x < 0 || q.y < 0 || q.z < 0 || q.x >= container.w || q.y >= container.h || q.z >= container.d) continue;
    const k = `${q.x},${q.y},${q.z}`;
    if (!seen.has(k)) { seen.add(k); out.push(q); }
  }
  out.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  return out;
}

// Greedy extreme-point packing with support constraint.
export function pack(instance, opts = {}) {
  const minSupport = opts.minSupport ?? 0.5;
  const c = instance.container;
  const order = instance.boxes
    .map((b, i) => ({ ...b, id: i }))
    .sort((a, b) => boxVolume(b) - boxVolume(a) || Math.max(b.w, b.h, b.d) - Math.max(a.w, a.h, a.d) || a.id - b.id);
  const placements = [];
  const unplaced = [];
  for (const box of order) {
    const points = candidatePoints(c, placements);
    let best = null;
    for (const q of points) {
      for (const o of orientations(box)) {
        if (q.x + o.w > c.w || q.y + o.h > c.h || q.z + o.d > c.d) continue;
        const cand = { id: box.id, x: q.x, y: q.y, z: q.z, w: o.w, h: o.h, d: o.d };
        let hit = false;
        for (const p of placements) if (overlaps(cand, p)) { hit = true; break; }
        if (hit) continue;
        const sa = supportArea(cand, placements);
        const ratio = cand.z === 0 ? 1 : sa / (cand.w * cand.d);
        if (ratio + 1e-12 < minSupport) continue;
        cand.ratio = ratio;
        const score = [cand.z, -(cand.w * cand.d), -sa, cand.y, cand.x];
        if (!best || cmp(score, best.score) < 0) best = { cand, score };
        break; // orientations already sorted; first fitting orientation is the best one for this point
      }
    }
    if (best) placements.push(best.cand); else unplaced.push(box.id);
  }
  return { placements, unplaced };
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Guillotine shelf baseline: fill rows along x, then y, then layer up in z.
export function shelfBaseline(instance) {
  const c = instance.container;
  const order = instance.boxes.map((b, i) => ({ ...b, id: i }))
    .sort((a, b) => b.h - a.h || b.w - a.w || a.id - b.id);
  const placements = [], unplaced = [];
  let z = 0, layerH = 0, y = 0, x = 0, rowH = 0;
  for (const b of order) {
    let placed = false;
    for (const o of orientations(b)) {
      if (x + o.w > c.w) { x = 0; y += rowH; rowH = 0; }
      if (y + o.h > c.h) { y = 0; x = 0; z += layerH; layerH = 0; }
      if (z + o.d > c.d) continue;
      placements.push({ id: b.id, x, y, z, w: o.w, h: o.h, d: o.d });
      x += o.w; rowH = Math.max(rowH, o.h); layerH = Math.max(layerH, o.d);
      placed = true; break;
    }
    if (!placed) unplaced.push(b.id);
  }
  return { placements, unplaced };
}

// Unit-grid occupancy oracle: independent of the sweep-line support code.
export function gridOccupancyOracle(placements, container) {
  const W = container.w, H = container.h, D = container.d;
  const cells = new Uint8Array(W * H * D);
  let doubleWrites = 0;
  const idx = (x, y, z) => (z * H + y) * W + x;
  for (const p of placements) {
    for (let z = p.z; z < p.z + p.d; z++) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) continue;
      const k = idx(x, y, z);
      if (cells[k]) doubleWrites++;
      cells[k] = 1;
    }
  }
  return { cells, doubleWrites };
}

export function gridSupportOracle(box, placements, container) {
  const W = container.w, H = container.h;
  // Bit k set <=> some top face at height k covers this unit column.
  const tops = new Uint32Array(W * H);
  for (const p of placements) {
    if (p.id === box.id) continue;
    if (p.z + p.d > 30) throw new Error("gridSupportOracle: top above 30 unsupported by bitmask");
    const bit = 1 << (p.z + p.d);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      tops[y * W + x] |= bit;
    }
  }
  let supported = 0;
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    if (tops[y * W + x] & (1 << box.z)) supported++;
  }
  return supported;
}

export function scaleInstance(instance, k) {
  return {
    container: { w: instance.container.w * k, h: instance.container.h * k, d: instance.container.d * k },
    boxes: instance.boxes.map((b) => ({ w: b.w * k, h: b.h * k, d: b.d * k })),
  };
}