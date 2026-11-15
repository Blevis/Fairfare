// Post-build check: every asset referenced by dist/index.html resolves under the base path,
// the data files exist and parse, and every in-app "#/route" link in the bundle is a real route.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const base = process.env.BASE_PATH ?? "/Fairfare/";
const html = readFileSync(join(dist, "index.html"), "utf8");
const errors = [];

for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^https?:/.test(ref)) continue;
  if (!ref.startsWith(base) && !ref.startsWith("./")) errors.push(`asset outside base path ${base}: ${ref}`);
  const rel = ref.startsWith(base) ? ref.slice(base.length) : ref.slice(2);
  if (!existsSync(join(dist, rel))) errors.push(`missing file for ${ref}`);
}

if (!existsSync(join(dist, "fairfare_report.pdf"))) errors.push("missing fairfare_report.pdf");
for (const f of ["model.json", "zones.json", "results.json", "eda.json"]) {
  const p = join(dist, "data", f);
  if (!existsSync(p)) { errors.push(`missing data/${f}`); continue; }
  try { JSON.parse(readFileSync(p, "utf8")); } catch (e) { errors.push(`data/${f} is not valid JSON: ${e.message}`); }
}

const js = readdirSync(join(dist, "assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(dist, "assets", f), "utf8")).join("\n");
// routes: ROUTES entries (path:`/x`); links: href("/x") calls, minified to f(`/x`). Quotes may be " or `.
const routes = new Set([...js.matchAll(/path:["`](\/[a-z]*)["`]/g)].map((m) => m[1]));
const links = new Set([...js.matchAll(/[A-Za-z_$][\w$]*\(["`](\/[a-z]*)["`]\)/g)].map((m) => m[1]));
for (const l of links) if (!routes.has(l)) errors.push(`link to unknown route #${l}`);
if (routes.size < 8) errors.push(`expected 8 routes, found ${[...routes].join(", ")}`);

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`dist OK: base ${base}, ${routes.size} routes, ${links.size} distinct route links, data files present`);
