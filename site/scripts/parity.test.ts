// Proves the browser model reproduces scikit-learn: 2 000 June trips, Python vs TypeScript.
// Run: npm run test:parity   (after `python site/scripts/export_data.py`)
import { readFileSync } from "node:fs";
import { predict, type ModelJSON } from "../src/lib/model.ts";

const dir = new URL("../public/data/", import.meta.url);
const model: ModelJSON = JSON.parse(readFileSync(new URL("model.json", dir), "utf8"));
const zones: { zones: { id: number; borough: string }[] } = JSON.parse(readFileSync(new URL("zones.json", dir), "utf8"));
const parity: { trips: { pickup: string; pu: number; do: number; dist: number; pred: number }[] } =
  JSON.parse(readFileSync(new URL("parity.json", dir), "utf8"));
const borough = new Map(zones.zones.map((z) => [z.id, z.borough]));

let worst = 0;
for (const t of parity.trips) {
  const p = predict(model, { pickup: t.pickup, pu: t.pu, do: t.do, dist: t.dist,
    pickupBorough: borough.get(t.pu) ?? "Unknown", dropoffBorough: borough.get(t.do) ?? "Unknown" });
  worst = Math.max(worst, Math.abs(p.fare - t.pred));
}
const TOL = 1e-9;
console.log(`parity: ${parity.trips.length} June trips, max |TS - Python| = ${worst.toExponential(2)} (tolerance ${TOL})`);
if (!(worst <= TOL)) {
  console.error("FAIL: browser inference does not match scikit-learn");
  process.exit(1);
}
console.log("PASS");
