// Generates the iPhone startup (splash) images for the home-screen app:
// public/splash/<w>x<h>@<dpr>.png, one per device size Safari knows about.
// Android builds its splash from the manifest by itself.
// Usage: node scripts/splash.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "splash");
const work = path.join(root, "public", ".splash-work");

// CSS points × device pixel ratio, portrait. Covers iPhone 8 through 16 Pro Max.
export const sizes = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [375, 667, 2],
];

// Drawn on a square canvas with everything centred, then cropped to the
// device size: Quick Look pads non-square SVGs unpredictably, squares it does not.
function svg(width, height) {
  const side = Math.max(width, height);
  const mark = Math.round(Math.min(width, height) * 0.3);
  const x = (side - mark) / 2;
  const y = side / 2 - mark * 0.75;
  const s = mark / 64;
  const font = Math.round(mark * 0.22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">
  <rect width="${side}" height="${side}" fill="#0b0b0d"/>
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect width="64" height="64" rx="14" fill="#0f2f2b"/>
    <path d="M20 44 L32 16 L44 44" fill="none" stroke="#2dd4bf" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25 36 H39" stroke="#2dd4bf" stroke-width="5" stroke-linecap="round"/>
  </g>
  <text x="${side / 2}" y="${y + mark + font * 1.6}" text-anchor="middle" font-family="-apple-system, Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${font}" font-weight="600" fill="#ececef" letter-spacing="-0.02em">DevLaunch</text>
</svg>`;
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });
for (const [w, h, dpr] of sizes) {
  const width = w * dpr;
  const height = h * dpr;
  const name = `${w}x${h}@${dpr}`;
  const source = path.join(work, `${name}.svg`);
  writeFileSync(source, svg(width, height));
  execFileSync("qlmanage", ["-t", "-s", String(Math.max(width, height)), "-o", work, source], { stdio: "ignore" });
  const rendered = readdirSync(work).find((file) => file === `${name}.svg.png`);
  if (!rendered) throw new Error(`Could not render ${name}`);
  const target = path.join(out, `${name}.png`);
  renameSync(path.join(work, rendered), target);
  // Quick Look renders a square canvas; crop it back to the device size (the artwork is centred).
  execFileSync("sips", ["-c", String(height), String(width), target], { stdio: "ignore" });
}
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${sizes.length} splash images to public/splash`);
