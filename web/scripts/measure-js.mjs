import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const html = readFileSync("out/index.html", "utf8");
const files = [...new Set(html.match(/\/_next\/static\/[^"']+\.js/g) || [])];
let raw = 0;
let gz = 0;
for (const f of files) {
  const p = "out" + f;
  if (!existsSync(p)) {
    console.log("missing", p);
    continue;
  }
  const b = readFileSync(p);
  const g = gzipSync(b, { level: 9 });
  raw += b.length;
  gz += g.length;
  console.log(`${(g.length / 1024).toFixed(1)} KB gz  ${f}`);
}
const landing = readFileSync("out/landing.js");
const landingGz = gzipSync(landing, { level: 9 });
console.log(
  `${(landingGz.length / 1024).toFixed(1)} KB gz  /landing.js`,
);
gz += landingGz.length;
raw += landing.length;
console.log(
  `PAGE JS TOTAL raw ${(raw / 1024).toFixed(1)} KB / gz ${(gz / 1024).toFixed(1)} KB`,
);
