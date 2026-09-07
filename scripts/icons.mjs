// Generates the favicon and app icons from src/app/icon.svg:
//   public/icons/icon-{16,32,192,512}.png  — transparent corners (favicons, manifest "any")
//   public/icons/maskable-512.png          — full dark background (Android adaptive icon)
//   public/icons/icon-180.png              — Apple touch icon (opaque; iOS masks it)
//   public/favicon.ico                     — 16 + 32 for Safari and older browsers
// Quick Look renders SVG on white, so white pixels are made transparent afterwards
// (the icon itself contains no white).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "icons");
const work = path.join(root, "public", ".icons-work");
const svg = readFileSync(path.join(root, "src", "app", "icon.svg"), "utf8");

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

function render(name, markup, size) {
  const source = path.join(work, `${name}.svg`);
  writeFileSync(source, markup);
  execFileSync("qlmanage", ["-t", "-s", String(size), "-o", work, source], { stdio: "ignore" });
  return path.join(work, `${name}.svg.png`);
}

function keyOutWhite(file) {
  const png = PNG.sync.read(readFileSync(file));
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (r > 235 && g > 235 && b > 235) png.data[i + 3] = 0;
  }
  writeFileSync(file, PNG.sync.write(png));
}

function resize(source, size, target) {
  execFileSync("sips", ["-z", String(size), String(size), source, "--out", target], { stdio: "ignore" });
}

// Transparent-corner master at 1024, then the sizes.
const plain = render("icon", svg, 1024);
keyOutWhite(plain);
for (const size of [16, 32, 192, 512]) resize(plain, size, path.join(out, `icon-${size}.png`));

// Apple touch icon: opaque, iOS applies its own rounded mask.
resize(render("apple", svg.replace('viewBox="0 0 64 64">', 'viewBox="0 0 64 64"><rect width="64" height="64" fill="#0f2f2b"/>'), 1024), 180, path.join(out, "icon-180.png"));

// Maskable: the artwork must sit inside the centre 80% of a fully painted square.
const maskable = svg.replace('viewBox="0 0 64 64">', 'viewBox="-10 -10 84 84"><rect x="-10" y="-10" width="84" height="84" fill="#0f2f2b"/>');
resize(render("maskable", maskable, 1024), 512, path.join(out, "maskable-512.png"));

// favicon.ico: ICO container holding the 16 and 32 px PNGs.
const pngs = [16, 32].map((size) => readFileSync(path.join(out, `icon-${size}.png`)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const entries = pngs.map((png, index) => {
  const entry = Buffer.alloc(16);
  const size = [16, 32][index];
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});
writeFileSync(path.join(root, "public", "favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
rmSync(work, { recursive: true, force: true });
console.log("Icons written to public/icons and public/favicon.ico");
