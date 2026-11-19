# stackpack-lab

**Support-certified 3D container packing.** On 60 deterministic instances (4,555 integer boxes) the packer places **4,555/4,555 boxes with 0 overlaps, 0 boxes outside the container and 0 floating boxes**; the same search with the support gate disabled places the same volume (83.79% of total container capacity) but leaves **1,750/4,555 boxes (38.42%) resting on nothing**. Every number is an exact integer predicate, not a sampled estimate.

Upstream: none

## What it is

A greedy extreme-point container packer for axis-aligned integer boxes, plus an exact auditor. A placement is accepted only if it is inside the container, does not overlap any placed box, and (for `z > 0`) has at least 50% of its bottom face on a top face at exactly that height. Rotation is limited to the six axis permutations. The audit recomputes overlaps, containment, support ratio (sweep-line union area) and volume from the placement list alone.

The browser build runs the **same** `src/core.mjs` as node: change the instance or toggle the no-support baseline and the on-screen counts are recomputed live, not copied from the benchmark.

## Run it

```bash
node tools/gen-sample.mjs && node bench/verify.mjs    # regenerate corpus, run all assertions (exit 0)
node bench/bench.mjs                                 # timing, writes bench/result.json
python3 -m http.server 4173                           # open http://localhost:4173
```

No install, no `node_modules`. Node 24. The viewer loads three.js 0.169.0 from a pinned CDN importmap.

## Evidence (`bench/result.json`, real run)

| metric | certified packer | no-support baseline |
|---|---|---|
| boxes placed | 4,555 / 4,555 | 4,555 / 4,555 |
| overlap pairs | 0 | 0 |
| outside container | 0 | 0 |
| floating boxes | **0** | **1,750 (38.42%)** |
| volume utilisation (aggregate) | 83.79% | 83.79% |

- Aggregate utilization is `275,385 / 328,680 = 83.785%`; the mean of the 60 per-instance ratios is 84.049%.
- Independent occupancy oracle: 0 double-written unit cells; 275,385 occupied cells == placed volume.
- Independent support oracle (per-cell top-height bitmask): 3,568 elevated boxes, **0 mismatches** against the sweep-line area code.
- Scale ×2 / ×3 / ×5: 30/30 instances keep the same utilisation and 0 violations.
- Negative control: a 1×1×1 box floated at z=2 is reported as unsupported; 8× (2×2×2) boxes exactly fill a 4×4×4 container at 100%.
- Timing (130-box instance, 7 samples after warmup): cold 242.621 ms, median **192.895 ms**, p95 200.450 ms, RSD 1.60%. No sample was removed. Baseline median 163.507 ms; the difference is the support check.
- Audit of the 130-box placement: median 0.277 ms.

## Known limitations

- **Orthogonal integer boxes only.** Six axis-permutation orientations; no arbitrary rotations, no non-box geometry.
- **50% support is a proxy, not rigid-body physics.** A 50%-supported box can still tip; there is no centre-of-mass, friction or collision-response test.
- Support requires a top face at exactly the box's bottom height. A box resting on two boxes with a 1-unit height difference is rejected even when it would be geometrically possible.
- Greedy volume-descending order; no optimality or completeness claim. On these 60 instances every box fits, so utilisation equals the corpus volume ratio rather than a packing-quality score.
- The corpus is synthetic and deterministic, not a real container-loading workload.
- Scale invariance is checked at exact integer factors ×2/×3/×5; arbitrary floats are not supported.
- The browser reports the same counts but its wall-clock timing is not compared with node.

## 本轮创新

Support is enforced **during construction** by an exact per-placement gate rather than checked and removed afterwards, and the resulting zero-floating packings are shipped with a second, structurally different oracle (per-cell top-height bitmask vs sweep-line rectangle union). This makes the no-support baseline's blind spot explicit and quantified: identical 83.79% aggregate volume utilisation, but 1,750 physically unsupported boxes — a failure mode that a utilisation-only packer reports as a perfect result. The browser recomputes the same counts from the same module, so the displayed certificate is the node certificate.

MIT © 2026 llinok111