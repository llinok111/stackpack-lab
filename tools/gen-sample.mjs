// Deterministic corpus generator. Same command twice => byte-identical files.
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { mulberry32 } from "../src/core.mjs";

function instance(seed, container, targets) {
  const rnd = mulberry32(seed);
  const boxes = [];
  for (const t of targets) {
    for (let k = 0; k < t.n; k++) {
      const w = 1 + Math.floor(rnd() * t.max);
      const h = 1 + Math.floor(rnd() * t.max);
      const d = 1 + Math.floor(rnd() * t.max);
      boxes.push({ w, h, d });
    }
  }
  // Shuffle deterministically so the id order carries no size signal.
  for (let i = boxes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
  }
  return { container, boxes };
}

const corpus = [];
for (let i = 0; i < 60; i++) {
  const seed = 20261119 + i * 7919;
  const rnd = mulberry32(seed);
  const span = 14 + (i % 5) * 2;          // 14..22
  const height = 12 + (i % 4) * 3;        // 12..21
  const parts = 24 + Math.floor(rnd() * 17); // 24..40
  const tall = 3 + (i % 6);
  const boxes = [];
  let vol = 0;
  const cap = span * span * height;
  const target = cap * (0.76 + rnd() * 0.10);
  while (boxes.length < parts || vol < target) {
    const w = 1 + Math.floor(rnd() * Math.min(7, span));
    const h = 1 + Math.floor(rnd() * Math.min(7, height));
    const d = 1 + Math.floor(rnd() * Math.min(7, span));
    boxes.push({ w, h, d });
    vol += w * h * d;
  }
  for (let k = 0; k < tall; k++) {
    const b = { w: 1 + (k % 2), h: 5 + Math.floor(rnd() * 6), d: 1 + ((k + 1) % 2) };
    boxes.push(b);
    vol += b.w * b.h * b.d;
  }
  // Hard capacity guard: keep total volume <= 68% so every box can physically fit.
  while (vol > cap * 0.88 && boxes.length > 8) {
    const j = Math.floor(rnd() * boxes.length);
    const b = boxes.splice(j, 1)[0];
    vol -= b.w * b.h * b.d;
  }
  corpus.push({ id: i, seed, container: { w: span, h: span, d: height }, boxes });
}

const bench = instance(991337, { w: 24, h: 24, d: 24 }, [
  { n: 70, max: 7 }, { n: 40, max: 5 }, { n: 20, max: 9 },
]);

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const enc = (o) => JSON.stringify(o, null, 0) + "\n";
writeFileSync(new URL("../data/corpus.json", import.meta.url), enc({ instances: corpus }));
writeFileSync(new URL("../data/bench-instance.json", import.meta.url), enc(bench));
const sha = createHash("sha256").update(enc({ instances: corpus })).digest("hex");
writeFileSync(new URL("../data/corpus.sha256", import.meta.url), sha + "\n");
console.log(`corpus: ${corpus.length} instances, ${corpus.reduce((n, c) => n + c.boxes.length, 0)} boxes, sha256 ${sha.slice(0, 16)}…`);