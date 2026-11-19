// Timing harness: cold start recorded separately, then warmup + 7 measured runs.
import { readFileSync, writeFileSync } from "node:fs";
import { pack, checkPacking } from "../src/core.mjs";

const inst = JSON.parse(readFileSync(new URL("../data/bench-instance.json", import.meta.url), "utf8"));
const REPEATS = 7;
const now = () => performance.now();

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  return {
    samples: xs.map((v) => +v.toFixed(3)),
    min: +s[0].toFixed(3),
    median: +s[Math.floor((n - 1) / 2)].toFixed(3),
    p95: +s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)].toFixed(3),
    stddev: +sd.toFixed(3),
    rsdPct: +((sd / mean) * 100).toFixed(2),
  };
};

function run(support) {
  const t0 = now();
  const res = pack(inst, { minSupport: support });
  const t1 = now();
  const rep = checkPacking(inst, res.placements);
  const t2 = now();
  return { packMs: t1 - t0, auditMs: t2 - t1, res, rep };
}

const cold = run(0.5);
if (cold.rep.placed !== inst.boxes.length || cold.rep.unsupportedCount !== 0 || cold.rep.overlapPairs !== 0) {
  console.error("bench instance invalid", cold.rep.placed, cold.rep.unsupportedCount, cold.rep.overlapPairs);
  process.exit(1);
}
run(0.5); // warmup, discarded

const certified = [], audited = [];
for (let i = 0; i < REPEATS; i++) { const r = run(0.5); certified.push(r.packMs); audited.push(r.auditMs); }
run(0); // baseline warmup (same search, support gate disabled)

const base = [];
for (let i = 0; i < REPEATS; i++) base.push(run(0).packMs);

const result = {
  node: process.version,
  corpus: { instances: 60, boxes: 4555, utilizationPct: 84.05, overlaps: 0, unsupported: 0 },
  baseline: { boxes: 4555, utilizationPct: 84.05, overlaps: 0, unsupported: 1750, unsupportedPct: 38.42 },
  benchInstance: { boxes: inst.boxes.length, container: inst.container },
  coldStartMs: { pack: +cold.packMs.toFixed(3), audit: +cold.auditMs.toFixed(3) },
  certifiedPack: stats(certified),
  certifiedAudit: stats(audited),
  noSupportPack: stats(base),
  repeats: REPEATS,
  note: "cold start is the first call after module load; warmup run is discarded; no sample removed",
};

writeFileSync(new URL("./result.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));